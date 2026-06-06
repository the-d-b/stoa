package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type GrafanaDatasource struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	URL      string `json:"url"`
	Health   string `json:"health"` // "ok", "error", "unknown"
	Message  string `json:"message"`
	ReadOnly bool   `json:"readOnly"`
}

type GrafanaAlert struct {
	Name     string            `json:"name"`
	Severity string            `json:"severity"`
	Labels   map[string]string `json:"labels"`
	Summary  string            `json:"summary"`
	ActiveAt string            `json:"activeAt"`
}

type GrafanaPanelData struct {
	UIURL          string              `json:"uiUrl"`
	IntegrationID  string              `json:"integrationId"`
	Version        string              `json:"version"`
	Database       string              `json:"database"`
	OrgName        string              `json:"orgName"`
	Datasources    []GrafanaDatasource `json:"datasources"`
	TotalDS        int                 `json:"totalDs"`
	HealthyDS      int                 `json:"healthyDs"`
	UnhealthyDS    int                 `json:"unhealthyDs"`
	Alerts         []GrafanaAlert      `json:"alerts"`
	FiringAlerts   int                 `json:"firingAlerts"`
	DashboardCount int                 `json:"dashboardCount"`
	UserCount      int                 `json:"userCount"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func grafanaGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	fullURL := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", fullURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed: check API key/token")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Grafana", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchGrafanaPanelData(db *sql.DB, config map[string]interface{}) (*GrafanaPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("integrationId required")
	}
	baseURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if uiURL == "" {
		uiURL = baseURL
	}

	out := &GrafanaPanelData{UIURL: uiURL, IntegrationID: integrationID}

	// ── Health / version ──────────────────────────────────────────────────────
	if body, err := grafanaGet(baseURL, apiKey, "/api/health", skipTLS); err == nil {
		var r struct {
			Version  string `json:"version"`
			Database string `json:"database"`
		}
		if json.Unmarshal(body, &r) == nil {
			out.Version = r.Version
			out.Database = r.Database
		}
	}

	// ── Org name ──────────────────────────────────────────────────────────────
	if body, err := grafanaGet(baseURL, apiKey, "/api/org", skipTLS); err == nil {
		var r struct{ Name string `json:"name"` }
		if json.Unmarshal(body, &r) == nil {
			out.OrgName = r.Name
		}
	}

	// ── Admin stats (soft: requires Admin role) ───────────────────────────────
	if body, err := grafanaGet(baseURL, apiKey, "/api/admin/stats", skipTLS); err == nil {
		var r struct {
			Dashboards int `json:"dashboards"`
			Users      int `json:"users"`
		}
		if json.Unmarshal(body, &r) == nil {
			out.DashboardCount = r.Dashboards
			out.UserCount = r.Users
		}
	}

	// ── Datasources ───────────────────────────────────────────────────────────
	if body, err := grafanaGet(baseURL, apiKey, "/api/datasources", skipTLS); err == nil {
		var rawDS []struct {
			ID       int    `json:"id"`
			Name     string `json:"name"`
			Type     string `json:"type"`
			URL      string `json:"url"`
			ReadOnly bool   `json:"readOnly"`
		}
		if json.Unmarshal(body, &rawDS) == nil {
			out.TotalDS = len(rawDS)
			for _, d := range rawDS {
				ds := GrafanaDatasource{
					ID:       d.ID,
					Name:     d.Name,
					Type:     d.Type,
					URL:      d.URL,
					ReadOnly: d.ReadOnly,
					Health:   "unknown",
				}
				// Per-datasource health check (Grafana 8.3+; soft failure for older)
				healthPath := fmt.Sprintf("/api/datasources/%d/health", d.ID)
				if hBody, hErr := grafanaGet(baseURL, apiKey, healthPath, skipTLS); hErr == nil {
					var hr struct {
						Status  string `json:"status"`
						Message string `json:"message"`
					}
					if json.Unmarshal(hBody, &hr) == nil {
						if strings.ToLower(hr.Status) == "ok" {
							ds.Health = "ok"
							out.HealthyDS++
						} else {
							ds.Health = "error"
							ds.Message = hr.Message
							out.UnhealthyDS++
						}
					}
				}
				out.Datasources = append(out.Datasources, ds)
			}
			// Sort: errors first, then unknown, then alphabetical
			sort.Slice(out.Datasources, func(i, j int) bool {
				rank := func(h string) int {
					switch h {
					case "error":   return 0
					case "unknown": return 1
					default:        return 2
					}
				}
				ri, rj := rank(out.Datasources[i].Health), rank(out.Datasources[j].Health)
				if ri != rj {
					return ri < rj
				}
				return out.Datasources[i].Name < out.Datasources[j].Name
			})
		}
	}

	// ── Active alerts (Grafana Alertmanager v2 API) ───────────────────────────
	alertPath := "/api/alertmanager/grafana/api/v2/alerts?active=true&silenced=false&inhibited=false"
	if body, err := grafanaGet(baseURL, apiKey, alertPath, skipTLS); err == nil {
		var rawAlerts []struct {
			Labels      map[string]string `json:"labels"`
			Annotations map[string]string `json:"annotations"`
			StartsAt    string            `json:"startsAt"`
		}
		if json.Unmarshal(body, &rawAlerts) == nil {
			sevOrder := func(s string) int {
				switch strings.ToLower(s) {
				case "critical": return 0
				case "error":   return 1
				case "warning": return 2
				case "info":    return 3
				default:        return 4
				}
			}
			for _, a := range rawAlerts {
				alert := GrafanaAlert{
					Name:     a.Labels["alertname"],
					Severity: a.Labels["severity"],
					Labels:   a.Labels,
					Summary:  a.Annotations["summary"],
					ActiveAt: a.StartsAt,
				}
				out.Alerts = append(out.Alerts, alert)
				out.FiringAlerts++
			}
			sort.Slice(out.Alerts, func(i, j int) bool {
				si, sj := sevOrder(out.Alerts[i].Severity), sevOrder(out.Alerts[j].Severity)
				if si != sj {
					return si < sj
				}
				return out.Alerts[i].Name < out.Alerts[j].Name
			})
		}
	}

	return out, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testGrafanaConnection(baseURL, apiKey string, skipTLS bool) error {
	body, err := grafanaGet(baseURL, apiKey, "/api/health", skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		Database string `json:"database"`
	}
	if json.Unmarshal(body, &r) != nil {
		return fmt.Errorf("unexpected response from Grafana")
	}
	// Verify credentials by hitting an authenticated endpoint
	if apiKey != "" {
		if _, err := grafanaGet(baseURL, apiKey, "/api/org", skipTLS); err != nil {
			return fmt.Errorf("connectivity ok but credentials rejected: %w", err)
		}
	}
	return nil
}
