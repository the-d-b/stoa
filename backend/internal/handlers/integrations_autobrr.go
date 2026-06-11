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

type AutobrrIRCNetwork struct {
	ID                int    `json:"id"`
	Name              string `json:"name"`
	Server            string `json:"server"`
	Nick              string `json:"nick"`
	Connected         bool   `json:"connected"`
	ConnectedSince    string `json:"connectedSince"`
	MonitoredChannels int    `json:"monitoredChannels"`
}

type AutobrrRelease struct {
	ID         int    `json:"id"`
	Name       string `json:"name"`
	Indexer    string `json:"indexer"`
	Filter     string `json:"filter"`
	Status     string `json:"status"`     // "grabbed", "rejected", "push_error", "filtered"
	Action     string `json:"action"`     // download client / *arr name
	Rejection  string `json:"rejection"`  // first rejection reason
	Timestamp  string `json:"timestamp"`
}

type AutobrrPanelData struct {
	UIURL             string              `json:"uiUrl"`
	IntegrationID     string              `json:"integrationId"`
	TotalCount        int                 `json:"totalCount"`
	GrabbedCount      int                 `json:"grabbedCount"`
	FilteredCount     int                 `json:"filteredCount"`
	RejectedCount     int                 `json:"rejectedCount"`
	PushErrorCount    int                 `json:"pushErrorCount"`
	IRCNetworks       []AutobrrIRCNetwork `json:"ircNetworks"`
	TotalNetworks     int                 `json:"totalNetworks"`
	ConnectedNetworks int                 `json:"connectedNetworks"`
	ActiveFilters     int                 `json:"activeFilters"`
	Releases          []AutobrrRelease    `json:"releases"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func autobrrGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	fullURL := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", fullURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if apiKey != "" {
		req.Header.Set("X-API-Token", apiKey)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed: check API token")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from autobrr", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchAutobrrrPanelData(db *sql.DB, config map[string]interface{}) (*AutobrrPanelData, error) {
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

	out := &AutobrrPanelData{UIURL: uiURL, IntegrationID: integrationID}

	// ── Release stats ─────────────────────────────────────────────────────────
	if body, err := autobrrGet(baseURL, apiKey, "/api/release/stats", skipTLS); err != nil {
		return nil, fmt.Errorf("stats: %w", err)
	} else {
		var r struct {
			TotalCount          int `json:"total_count"`
			FilteredCount       int `json:"filtered_count"`
			FilterRejectedCount int `json:"filter_rejected_count"`
			PushApprovedCount   int `json:"push_approved_count"`
			PushRejectedCount   int `json:"push_rejected_count"`
			PushErrorCount      int `json:"push_error_count"`
		}
		if json.Unmarshal(body, &r) == nil {
			out.TotalCount = r.TotalCount
			out.GrabbedCount = r.PushApprovedCount
			out.FilteredCount = r.FilteredCount
			out.RejectedCount = r.FilterRejectedCount + r.PushRejectedCount
			out.PushErrorCount = r.PushErrorCount
		}
	}

	// ── IRC networks ──────────────────────────────────────────────────────────
	if body, err := autobrrGet(baseURL, apiKey, "/api/irc", skipTLS); err == nil {
		var rawNets []struct {
			ID             int    `json:"id"`
			Name           string `json:"name"`
			Server         string `json:"server"`
			Nick           string `json:"nick"`
			Connected      bool   `json:"connected"`
			ConnectedSince string `json:"connected_since"`
			Channels       []struct {
				Name       string `json:"name"`
				Monitoring bool   `json:"monitoring"`
			} `json:"channels"`
		}
		if json.Unmarshal(body, &rawNets) == nil {
			for _, n := range rawNets {
				monitored := 0
				for _, ch := range n.Channels {
					if ch.Monitoring {
						monitored++
					}
				}
				net := AutobrrIRCNetwork{
					ID:                n.ID,
					Name:              n.Name,
					Server:            n.Server,
					Nick:              n.Nick,
					Connected:         n.Connected,
					ConnectedSince:    n.ConnectedSince,
					MonitoredChannels: monitored,
				}
				out.IRCNetworks = append(out.IRCNetworks, net)
				out.TotalNetworks++
				if n.Connected {
					out.ConnectedNetworks++
				}
			}
			// Disconnected networks first
			sort.Slice(out.IRCNetworks, func(i, j int) bool {
				if out.IRCNetworks[i].Connected != out.IRCNetworks[j].Connected {
					return !out.IRCNetworks[i].Connected
				}
				return out.IRCNetworks[i].Name < out.IRCNetworks[j].Name
			})
		}
	}

	// ── Active filter count ───────────────────────────────────────────────────
	if body, err := autobrrGet(baseURL, apiKey, "/api/filters", skipTLS); err == nil {
		var rawFilters []struct {
			Enabled bool `json:"enabled"`
		}
		if json.Unmarshal(body, &rawFilters) == nil {
			for _, f := range rawFilters {
				if f.Enabled {
					out.ActiveFilters++
				}
			}
		}
	}

	// ── Recent releases ───────────────────────────────────────────────────────
	if body, err := autobrrGet(baseURL, apiKey, "/api/release?limit=50", skipTLS); err == nil {
		// autobrr may return {"data":[...],"count":N} or a bare array
		type rawRelease struct {
			ID           int             `json:"id"`
			TorrentName  string          `json:"name"`
			FilterStatus string          `json:"filter_status"`
			Rejections   []string        `json:"rejections"`
			Indexer      json.RawMessage `json:"indexer"`
			Filter       json.RawMessage `json:"filter"`
			Timestamp    string          `json:"timestamp"`
			ActionStatus []struct {
				Status     string   `json:"status"`
				Action     string   `json:"action"`
				Type       string   `json:"type"`
				Rejections []string `json:"rejections"`
			} `json:"action_status"`
		}
		var rawList []rawRelease
		// Try wrapped format first
		var wrapped struct {
			Data []rawRelease `json:"data"`
		}
		if json.Unmarshal(body, &wrapped) == nil && wrapped.Data != nil {
			rawList = wrapped.Data
		} else {
			json.Unmarshal(body, &rawList)
		}

		for _, r := range rawList {
			rel := AutobrrRelease{
				ID:        r.ID,
				Name:      r.TorrentName,
				Timestamp: r.Timestamp,
			}

			// Indexer: may be object or string
			if len(r.Indexer) > 0 && r.Indexer[0] == '{' {
				var obj struct{ Name string `json:"name"` }
				if json.Unmarshal(r.Indexer, &obj) == nil {
					rel.Indexer = obj.Name
				}
			} else {
				json.Unmarshal(r.Indexer, &rel.Indexer)
			}

			// Filter: may be object or string
			if len(r.Filter) > 0 && r.Filter[0] == '{' {
				var obj struct{ Name string `json:"name"` }
				if json.Unmarshal(r.Filter, &obj) == nil {
					rel.Filter = obj.Name
				}
			} else {
				json.Unmarshal(r.Filter, &rel.Filter)
			}

			// Determine overall status
			if r.FilterStatus == "FILTER_REJECTED" {
				rel.Status = "filtered"
				if len(r.Rejections) > 0 {
					rel.Rejection = r.Rejections[0]
				}
			} else {
				// Check action statuses
				rel.Status = "pending"
				for _, a := range r.ActionStatus {
					rel.Action = a.Action
					switch a.Status {
					case "PUSH_APPROVED":
						rel.Status = "grabbed"
					case "PUSH_REJECTED":
						if rel.Status != "grabbed" {
							rel.Status = "push_rejected"
							if len(a.Rejections) > 0 {
								rel.Rejection = a.Rejections[0]
							}
						}
					case "PUSH_ERROR":
						if rel.Status != "grabbed" {
							rel.Status = "push_error"
						}
					}
				}
			}

			out.Releases = append(out.Releases, rel)
		}
	}

	return out, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testAutobrrrConnection(baseURL, apiKey string, skipTLS bool) error {
	body, err := autobrrGet(baseURL, apiKey, "/api/release/stats", skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		TotalCount int `json:"total_count"`
	}
	if json.Unmarshal(body, &r) != nil {
		return fmt.Errorf("unexpected response from autobrr")
	}
	return nil
}
