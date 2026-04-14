package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ── Uptime Kuma types ─────────────────────────────────────────────────────────

type KumaPanelData struct {
	UIURL      string        `json:"uiUrl"`
	Monitors   []KumaMonitor `json:"monitors"`
	UpCount    int           `json:"upCount"`
	DownCount  int           `json:"downCount"`
	PauseCount int           `json:"pauseCount"`
}

type KumaMonitor struct {
	Name   string  `json:"name"`
	Status int     `json:"status"` // 0=down, 1=up, 2=pending, 3=maintenance
	Uptime float64 `json:"uptime"` // 24h uptime percentage
	URL    string  `json:"url"`
}

func fetchKumaPanelData(db *sql.DB, config map[string]interface{}) (*KumaPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &KumaPanelData{UIURL: uiURL}

	// Kuma status page API — works without auth for public status pages
	// For private instances with API key auth
	body, err := kumaGet(apiURL, apiKey, "/api/status-page/heartbeat/default", skipTLS)
	if err != nil {
		// Try the metrics endpoint as fallback
		body, err = kumaGet(apiURL, apiKey, "/metrics", skipTLS)
		if err != nil {
			return nil, fmt.Errorf("failed to connect to Uptime Kuma: %v", err)
		}
		// Parse prometheus metrics
		data.Monitors = parseKumaMetrics(string(body))
	} else {
		// Parse heartbeat JSON
		var hb struct {
			HeartbeatList map[string][]struct {
				Status int `json:"status"`
			} `json:"heartbeatList"`
			UptimeList map[string]float64 `json:"uptimeList"`
		}
		if json.Unmarshal(body, &hb) == nil {
			for name, beats := range hb.HeartbeatList {
				status := 0
				if len(beats) > 0 {
					status = beats[len(beats)-1].Status
				}
				uptime := hb.UptimeList[name+"_24"]
				data.Monitors = append(data.Monitors, KumaMonitor{
					Name:   name,
					Status: status,
					Uptime: uptime * 100,
				})
			}
		}
	}

	// Also try the dedicated monitor list endpoint (works with API key)
	if len(data.Monitors) == 0 {
		if monBody, merr := kumaGet(apiURL, apiKey, "/api/status-page/default", skipTLS); merr == nil {
			var sp struct {
				PublicGroupList []struct {
					MonitorList []struct {
						Name            string  `json:"name"`
						SendURL         int     `json:"sendUrl"`
						URL             string  `json:"url"`
					} `json:"monitorList"`
				} `json:"publicGroupList"`
			}
			if json.Unmarshal(monBody, &sp) == nil {
				for _, g := range sp.PublicGroupList {
					for _, m := range g.MonitorList {
						data.Monitors = append(data.Monitors, KumaMonitor{
							Name: m.Name,
							URL:  m.URL,
						})
					}
				}
			}
		}
	}

	// Tally counts
	for _, m := range data.Monitors {
		switch m.Status {
		case 1:
			data.UpCount++
		case 0:
			data.DownCount++
		default:
			data.PauseCount++
		}
	}

	return data, nil
}

func parseKumaMetrics(body string) []KumaMonitor {
	var monitors []KumaMonitor
	seen := map[string]bool{}
	for _, line := range strings.Split(body, "\n") {
		if strings.HasPrefix(line, "monitor_status{") {
			// monitor_status{monitor_name="My Site",monitor_url="https://..."} 1
			name := extractLabel(line, "monitor_name")
			url := extractLabel(line, "monitor_url")
			status := 0
			if strings.HasSuffix(strings.TrimSpace(line), "1") {
				status = 1
			}
			if name != "" && !seen[name] {
				seen[name] = true
				monitors = append(monitors, KumaMonitor{Name: name, Status: status, URL: url})
			}
		}
	}
	return monitors
}

func extractLabel(line, key string) string {
	search := key + `="`
	start := strings.Index(line, search)
	if start < 0 {
		return ""
	}
	start += len(search)
	end := strings.Index(line[start:], `"`)
	if end < 0 {
		return ""
	}
	return line[start : start+end]
}

func kumaGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	url := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Uptime Kuma", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func testKumaConnection(apiURL, apiKey string, skipTLS bool) error {
	_, err := kumaGet(apiURL, apiKey, "/api/status-page/default", skipTLS)
	if err != nil {
		// Try metrics endpoint
		_, err = kumaGet(apiURL, apiKey, "/metrics", skipTLS)
	}
	return err
}
