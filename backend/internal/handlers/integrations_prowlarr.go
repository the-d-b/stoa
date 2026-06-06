package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type ProwlarrIndexer struct {
	ID            int    `json:"id"`
	Name          string `json:"name"`
	Enable        bool   `json:"enable"`
	Protocol      string `json:"protocol"`      // "torrent", "usenet"
	Privacy       string `json:"privacy"`       // "public", "semiPrivate", "private"
	Health        string `json:"health"`        // "ok", "degraded", "blocked", "disabled"
	DisabledTill  string `json:"disabledTill"`  // ISO timestamp if auto-blocked
	Queries       int    `json:"queries"`
	Grabs         int    `json:"grabs"`
	FailedQueries int    `json:"failedQueries"`
	AvgResponseMs int    `json:"avgResponseMs"`
}

type ProwlarrApp struct {
	ID             int    `json:"id"`
	Name           string `json:"name"`
	Implementation string `json:"implementation"`
	SyncLevel      string `json:"syncLevel"`
	Enable         bool   `json:"enable"`
}

type ProwlarrHealthIssue struct {
	Source  string `json:"source"`
	Type    string `json:"type"` // "ok", "notice", "warning", "error"
	Message string `json:"message"`
}

type ProwlarrPanelData struct {
	UIURL              string                `json:"uiUrl"`
	IntegrationID      string                `json:"integrationId"`
	Version            string                `json:"version"`
	TotalIndexers      int                   `json:"totalIndexers"`
	EnabledIndexers    int                   `json:"enabledIndexers"`
	FailingIndexers    int                   `json:"failingIndexers"`
	TorrentIndexers    int                   `json:"torrentIndexers"`
	UsenetIndexers     int                   `json:"usenetIndexers"`
	TotalQueries       int                   `json:"totalQueries"`
	TotalGrabs         int                   `json:"totalGrabs"`
	TotalFailedQueries int                   `json:"totalFailedQueries"`
	Indexers           []ProwlarrIndexer     `json:"indexers"`
	Apps               []ProwlarrApp         `json:"apps"`
	HealthIssues       []ProwlarrHealthIssue `json:"healthIssues"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func prowlarrGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	fullURL := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", fullURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Api-Key", apiKey)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed: check API key")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Prowlarr", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchProwlarrPanelData(db *sql.DB, config map[string]interface{}) (*ProwlarrPanelData, error) {
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

	out := &ProwlarrPanelData{UIURL: uiURL, IntegrationID: integrationID}

	// ── System status ─────────────────────────────────────────────────────────
	if body, err := prowlarrGet(baseURL, apiKey, "/api/v1/system/status", skipTLS); err == nil {
		var r struct {
			Version string `json:"version"`
		}
		if json.Unmarshal(body, &r) == nil {
			out.Version = r.Version
		}
	}

	// ── Health issues ─────────────────────────────────────────────────────────
	if body, err := prowlarrGet(baseURL, apiKey, "/api/v1/health", skipTLS); err == nil {
		var raw []struct {
			Source  string `json:"source"`
			Type    string `json:"type"`
			Message string `json:"message"`
		}
		if json.Unmarshal(body, &raw) == nil {
			for _, h := range raw {
				if h.Type == "ok" {
					continue
				}
				out.HealthIssues = append(out.HealthIssues, ProwlarrHealthIssue{
					Source:  h.Source,
					Type:    h.Type,
					Message: h.Message,
				})
			}
		}
	}

	// ── Indexer stats (lookup table by ID) ────────────────────────────────────
	type statEntry struct {
		Queries       int
		Grabs         int
		FailedQueries int
		AvgResponseMs int
	}
	statsMap := map[int]statEntry{}
	if body, err := prowlarrGet(baseURL, apiKey, "/api/v1/indexerstats", skipTLS); err == nil {
		var r struct {
			Indexers []struct {
				IndexerID           int `json:"indexerId"`
				AverageResponseTime int `json:"averageResponseTime"`
				NumberOfQueries     int `json:"numberOfQueries"`
				NumberOfGrabs       int `json:"numberOfGrabs"`
				NumberOfFailedQueries int `json:"numberOfFailedQueries"`
			} `json:"indexers"`
		}
		if json.Unmarshal(body, &r) == nil {
			for _, s := range r.Indexers {
				statsMap[s.IndexerID] = statEntry{
					Queries:       s.NumberOfQueries,
					Grabs:         s.NumberOfGrabs,
					FailedQueries: s.NumberOfFailedQueries,
					AvgResponseMs: s.AverageResponseTime,
				}
			}
		}
	}

	// ── Indexers ──────────────────────────────────────────────────────────────
	if body, err := prowlarrGet(baseURL, apiKey, "/api/v1/indexer", skipTLS); err != nil {
		return nil, fmt.Errorf("indexers: %w", err)
	} else {
		var raw []struct {
			ID       int    `json:"id"`
			Name     string `json:"name"`
			Enable   bool   `json:"enable"`
			Protocol string `json:"protocol"`
			Privacy  string `json:"privacy"`
			Status   *struct {
				DisabledTill    *string `json:"disabledTill"`
				MostRecentFailure *string `json:"mostRecentFailure"`
			} `json:"status"`
		}
		if json.Unmarshal(body, &raw) == nil {
			now := time.Now()
			for _, r := range raw {
				idx := ProwlarrIndexer{
					ID:       r.ID,
					Name:     r.Name,
					Enable:   r.Enable,
					Protocol: r.Protocol,
					Privacy:  r.Privacy,
				}

				// Merge stats
				if s, ok := statsMap[r.ID]; ok {
					idx.Queries = s.Queries
					idx.Grabs = s.Grabs
					idx.FailedQueries = s.FailedQueries
					idx.AvgResponseMs = s.AvgResponseMs
					out.TotalQueries += s.Queries
					out.TotalGrabs += s.Grabs
					out.TotalFailedQueries += s.FailedQueries
				}

				// Determine health
				if !r.Enable {
					idx.Health = "disabled"
				} else if r.Status != nil && r.Status.DisabledTill != nil {
					// Parse to check if still in the future
					if t, err := time.Parse(time.RFC3339, *r.Status.DisabledTill); err == nil && t.After(now) {
						idx.Health = "blocked"
						idx.DisabledTill = *r.Status.DisabledTill
						out.FailingIndexers++
					} else {
						idx.Health = "ok"
					}
				} else if r.Status != nil && r.Status.MostRecentFailure != nil {
					idx.Health = "degraded"
					out.FailingIndexers++
				} else {
					idx.Health = "ok"
				}

				out.TotalIndexers++
				if r.Enable {
					out.EnabledIndexers++
				}
				switch strings.ToLower(r.Protocol) {
				case "torrent":
					out.TorrentIndexers++
				case "usenet":
					out.UsenetIndexers++
				}

				out.Indexers = append(out.Indexers, idx)
			}

			// Sort: blocked → degraded → ok → disabled; then alphabetical
			healthRank := func(h string) int {
				switch h {
				case "blocked":  return 0
				case "degraded": return 1
				case "ok":       return 2
				default:         return 3
				}
			}
			sort.Slice(out.Indexers, func(i, j int) bool {
				ri, rj := healthRank(out.Indexers[i].Health), healthRank(out.Indexers[j].Health)
				if ri != rj {
					return ri < rj
				}
				return out.Indexers[i].Name < out.Indexers[j].Name
			})
		}
	}

	// ── Applications ──────────────────────────────────────────────────────────
	if body, err := prowlarrGet(baseURL, apiKey, "/api/v1/application", skipTLS); err == nil {
		var raw []struct {
			ID             int    `json:"id"`
			Name           string `json:"name"`
			Implementation string `json:"implementation"`
			SyncLevel      string `json:"syncLevel"`
			Enable         bool   `json:"enable"`
		}
		if json.Unmarshal(body, &raw) == nil {
			for _, a := range raw {
				out.Apps = append(out.Apps, ProwlarrApp{
					ID:             a.ID,
					Name:           a.Name,
					Implementation: a.Implementation,
					SyncLevel:      a.SyncLevel,
					Enable:         a.Enable,
				})
			}
			sort.Slice(out.Apps, func(i, j int) bool {
				return out.Apps[i].Name < out.Apps[j].Name
			})
		}
	}

	return out, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testProwlarrConnection(baseURL, apiKey string, skipTLS bool) error {
	body, err := prowlarrGet(baseURL, apiKey, "/api/v1/system/status", skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		Version string `json:"version"`
	}
	if json.Unmarshal(body, &r) != nil || r.Version == "" {
		return fmt.Errorf("unexpected response from Prowlarr")
	}
	return nil
}
