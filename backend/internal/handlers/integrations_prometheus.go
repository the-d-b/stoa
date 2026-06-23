package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type PrometheusTarget struct {
	Job        string `json:"job"`
	Instance   string `json:"instance"`
	Health     string `json:"health"` // "up", "down", "unknown"
	LastScrape string `json:"lastScrape"`
	LastError  string `json:"lastError"`
}

type PrometheusJobSummary struct {
	Job   string `json:"job"`
	Up    int    `json:"up"`
	Total int    `json:"total"`
}

type PrometheusAlert struct {
	Name        string            `json:"name"`
	State       string            `json:"state"` // "firing", "pending"
	Labels      map[string]string `json:"labels"`
	Summary     string            `json:"summary"`
	Description string            `json:"description"`
	ActiveAt    string            `json:"activeAt"`
	Severity    string            `json:"severity"` // from labels["severity"]
}

type PrometheusMetric struct {
	Label     string    `json:"label"`
	Query     string    `json:"query"`
	Value     string    `json:"value"`
	Unit      string    `json:"unit"`
	Sparkline []float64 `json:"sparkline"` // up to 30 points; nil if unavailable
	Error     string    `json:"error,omitempty"`
}

type PrometheusPanelData struct {
	UIURL         string                 `json:"uiUrl"`
	IntegrationID string                 `json:"integrationId"`
	Version       string                 `json:"version"`
	Targets       []PrometheusTarget     `json:"targets"`
	TotalTargets  int                    `json:"totalTargets"`
	UpTargets     int                    `json:"upTargets"`
	DownTargets   int                    `json:"downTargets"`
	Jobs          []PrometheusJobSummary `json:"jobs"`
	Alerts        []PrometheusAlert      `json:"alerts"`
	FiringAlerts  int                    `json:"firingAlerts"`
	PendingAlerts int                    `json:"pendingAlerts"`
	Metrics       []PrometheusMetric     `json:"metrics"`
}

type prometheusMetricCfg struct {
	Label string `json:"label"`
	Query string `json:"query"`
	Unit  string `json:"unit"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func prometheusGet(baseURL, apiKey, path string, params url.Values, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	fullURL := strings.TrimRight(baseURL, "/") + path
	if len(params) > 0 {
		fullURL += "?" + params.Encode()
	}
	req, err := http.NewRequest("GET", fullURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if apiKey != "" {
		if idx := strings.Index(apiKey, ":"); idx > 0 {
			req.SetBasicAuth(apiKey[:idx], apiKey[idx+1:])
		} else {
			req.Header.Set("Authorization", "Bearer "+apiKey)
		}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed: check credentials")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Prometheus", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Value formatter ───────────────────────────────────────────────────────────

func fmtPromValue(s string) string {
	f, err := strconv.ParseFloat(s, 64)
	if err != nil || math.IsNaN(f) || math.IsInf(f, 0) {
		return s
	}
	if f == math.Trunc(f) && math.Abs(f) < 1e15 {
		return strconv.FormatInt(int64(f), 10)
	}
	abs := math.Abs(f)
	if abs >= 100 {
		return strconv.FormatFloat(f, 'f', 1, 64)
	}
	if abs >= 10 {
		return strconv.FormatFloat(f, 'f', 2, 64)
	}
	if abs >= 1 {
		return strconv.FormatFloat(f, 'f', 3, 64)
	}
	return strconv.FormatFloat(f, 'g', 4, 64)
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchPrometheusPanelData(db *sql.DB, config map[string]interface{}) (*PrometheusPanelData, error) {
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

	out := &PrometheusPanelData{
		UIURL:         uiURL,
		IntegrationID: integrationID,
		Targets:       []PrometheusTarget{},
		Jobs:          []PrometheusJobSummary{},
		Alerts:        []PrometheusAlert{},
		Metrics:       []PrometheusMetric{},
	}

	// ── Build info (soft: older versions may not have this) ───────────────────
	if body, err := prometheusGet(baseURL, apiKey, "/api/v1/status/buildinfo", nil, skipTLS); err == nil {
		var r struct {
			Data struct {
				Version string `json:"version"`
			} `json:"data"`
		}
		if json.Unmarshal(body, &r) == nil {
			out.Version = r.Data.Version
		}
	}

	// ── Targets ───────────────────────────────────────────────────────────────
	if body, err := prometheusGet(baseURL, apiKey, "/api/v1/targets", url.Values{"state": {"active"}}, skipTLS); err != nil {
		return nil, fmt.Errorf("targets: %w", err)
	} else {
		var r struct {
			Data struct {
				ActiveTargets []struct {
					Labels     map[string]string `json:"labels"`
					Health     string            `json:"health"`
					LastScrape string            `json:"lastScrape"`
					LastError  string            `json:"lastError"`
				} `json:"activeTargets"`
			} `json:"data"`
		}
		if json.Unmarshal(body, &r) == nil {
			jobMap := map[string]*PrometheusJobSummary{}
			for _, t := range r.Data.ActiveTargets {
				job := t.Labels["job"]
				instance := t.Labels["instance"]
				tgt := PrometheusTarget{
					Job:        job,
					Instance:   instance,
					Health:     t.Health,
					LastScrape: t.LastScrape,
					LastError:  t.LastError,
				}
				out.Targets = append(out.Targets, tgt)
				out.TotalTargets++
				if t.Health == "up" {
					out.UpTargets++
				} else {
					out.DownTargets++
				}
				if _, ok := jobMap[job]; !ok {
					jobMap[job] = &PrometheusJobSummary{Job: job}
				}
				jobMap[job].Total++
				if t.Health == "up" {
					jobMap[job].Up++
				}
			}
			for _, js := range jobMap {
				out.Jobs = append(out.Jobs, *js)
			}
			sort.Slice(out.Jobs, func(i, j int) bool {
				// Down jobs first, then alphabetical
				if (out.Jobs[i].Up < out.Jobs[i].Total) != (out.Jobs[j].Up < out.Jobs[j].Total) {
					return out.Jobs[i].Up < out.Jobs[i].Total
				}
				return out.Jobs[i].Job < out.Jobs[j].Job
			})
			sort.Slice(out.Targets, func(i, j int) bool {
				if out.Targets[i].Health != out.Targets[j].Health {
					return out.Targets[i].Health == "down"
				}
				return out.Targets[i].Job+out.Targets[i].Instance < out.Targets[j].Job+out.Targets[j].Instance
			})
		}
	}

	// ── Alerts ────────────────────────────────────────────────────────────────
	if body, err := prometheusGet(baseURL, apiKey, "/api/v1/alerts", nil, skipTLS); err == nil {
		var r struct {
			Data struct {
				Alerts []struct {
					Labels      map[string]string `json:"labels"`
					Annotations map[string]string `json:"annotations"`
					State       string            `json:"state"`
					ActiveAt    string            `json:"activeAt"`
				} `json:"alerts"`
			} `json:"data"`
		}
		if json.Unmarshal(body, &r) == nil {
			for _, a := range r.Data.Alerts {
				if a.State != "firing" && a.State != "pending" {
					continue
				}
				alert := PrometheusAlert{
					Name:        a.Labels["alertname"],
					State:       a.State,
					Labels:      a.Labels,
					Summary:     a.Annotations["summary"],
					Description: a.Annotations["description"],
					ActiveAt:    a.ActiveAt,
					Severity:    a.Labels["severity"],
				}
				out.Alerts = append(out.Alerts, alert)
				if a.State == "firing" {
					out.FiringAlerts++
				} else {
					out.PendingAlerts++
				}
			}
			// Firing before pending; within each, alphabetical by name
			sort.Slice(out.Alerts, func(i, j int) bool {
				if out.Alerts[i].State != out.Alerts[j].State {
					return out.Alerts[i].State == "firing"
				}
				return out.Alerts[i].Name < out.Alerts[j].Name
			})
		}
	}

	// ── Custom metrics — read from integration config, not panel config ──────
	var metricCfgs []prometheusMetricCfg
	if cfgJSON, cfgErr := readIntegrationConfig(db, integrationID); cfgErr == nil && cfgJSON != "{}" {
		var igCfg struct {
			Metrics []prometheusMetricCfg `json:"metrics"`
		}
		json.Unmarshal([]byte(cfgJSON), &igCfg)
		metricCfgs = igCfg.Metrics
	}

	now := time.Now()
	for _, mc := range metricCfgs {
		if mc.Query == "" {
			continue
		}
		metric := PrometheusMetric{Label: mc.Label, Query: mc.Query, Unit: mc.Unit}

		// Instant value
		instParams := url.Values{"query": {mc.Query}}
		if body, err := prometheusGet(baseURL, apiKey, "/api/v1/query", instParams, skipTLS); err != nil {
			metric.Error = err.Error()
		} else {
			var r struct {
				Status string `json:"status"`
				Data   struct {
					ResultType string          `json:"resultType"`
					Result     json.RawMessage `json:"result"`
				} `json:"data"`
				Error string `json:"error"`
			}
			if json.Unmarshal(body, &r) == nil && r.Status == "success" {
				switch r.Data.ResultType {
				case "vector":
					var vecs []struct {
						Value [2]json.RawMessage `json:"value"`
					}
					if json.Unmarshal(r.Data.Result, &vecs) == nil && len(vecs) > 0 {
						var vs string
						json.Unmarshal(vecs[0].Value[1], &vs)
						metric.Value = fmtPromValue(vs)
					}
				case "scalar":
					var pair [2]json.RawMessage
					if json.Unmarshal(r.Data.Result, &pair) == nil {
						var vs string
						json.Unmarshal(pair[1], &vs)
						metric.Value = fmtPromValue(vs)
					}
				}
			} else if r.Error != "" {
				metric.Error = r.Error
			}
		}

		// Sparkline: last 60 minutes, 30 steps (2-minute resolution)
		step := "120"
		end := now.Unix()
		start := now.Add(-60 * time.Minute).Unix()
		rangeParams := url.Values{
			"query": {mc.Query},
			"start": {strconv.FormatInt(start, 10)},
			"end":   {strconv.FormatInt(end, 10)},
			"step":  {step},
		}
		if body, err := prometheusGet(baseURL, apiKey, "/api/v1/query_range", rangeParams, skipTLS); err == nil {
			var r struct {
				Status string `json:"status"`
				Data   struct {
					ResultType string `json:"resultType"`
					Result     []struct {
						Values [][2]json.RawMessage `json:"values"`
					} `json:"result"`
				} `json:"data"`
			}
			if json.Unmarshal(body, &r) == nil && r.Status == "success" && len(r.Data.Result) > 0 {
				// If multiple series, sum across them per timestamp
				if len(r.Data.Result) == 1 {
					for _, pair := range r.Data.Result[0].Values {
						var vs string
						json.Unmarshal(pair[1], &vs)
						f, err := strconv.ParseFloat(vs, 64)
						if err != nil || math.IsNaN(f) || math.IsInf(f, 0) {
							f = 0
						}
						metric.Sparkline = append(metric.Sparkline, f)
					}
				} else {
					// Sum multiple series: collect values by index
					maxLen := 0
					for _, res := range r.Data.Result {
						if len(res.Values) > maxLen {
							maxLen = len(res.Values)
						}
					}
					sums := make([]float64, maxLen)
					for _, res := range r.Data.Result {
						for i, pair := range res.Values {
							var vs string
							json.Unmarshal(pair[1], &vs)
							f, err := strconv.ParseFloat(vs, 64)
							if err == nil && !math.IsNaN(f) && !math.IsInf(f, 0) {
								sums[i] += f
							}
						}
					}
					metric.Sparkline = sums
				}
			}
		}

		out.Metrics = append(out.Metrics, metric)
	}

	return out, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testPrometheusConnection(baseURL, apiKey string, skipTLS bool) error {
	body, err := prometheusGet(baseURL, apiKey, "/api/v1/query", url.Values{"query": {"up"}}, skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		Status string `json:"status"`
		Error  string `json:"error"`
	}
	if json.Unmarshal(body, &r) != nil {
		return fmt.Errorf("unexpected response from Prometheus")
	}
	if r.Status != "success" {
		if r.Error != "" {
			return fmt.Errorf("Prometheus: %s", r.Error)
		}
		return fmt.Errorf("Prometheus returned status: %s", r.Status)
	}
	return nil
}
