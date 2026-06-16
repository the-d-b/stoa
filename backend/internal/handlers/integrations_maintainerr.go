package handlers

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type MaintainerrCollection struct {
	ID              int      `json:"id"`
	Title           string   `json:"title"`
	Type            string   `json:"type"` // "movie", "show", "season", "episode"
	IsActive        bool     `json:"isActive"`
	DeleteAfterDays int      `json:"deleteAfterDays"`
	ArrAction       int      `json:"arrAction"` // 0=delete 1=unmonitor+delete 2=unmonitor
	MediaCount      int      `json:"mediaCount"`
	TotalSizeBytes  int64    `json:"totalSizeBytes"`
	Posters         []string `json:"posters"` // image_path values from media items
}

type MaintainerrPanelData struct {
	Collections     []MaintainerrCollection `json:"collections"`
	ActiveCount     int                     `json:"activeCount"`
	TotalMediaCount int                     `json:"totalMediaCount"`
	ReclaimableBytes int64                  `json:"reclaimableBytes"`
	ItemsHandled    int                     `json:"itemsHandled"`
	BytesHandled    int64                   `json:"bytesHandled"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func maintainerrGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	if strings.Contains(apiKey, ":") {
		enc := base64.StdEncoding.EncodeToString([]byte(apiKey))
		req.Header.Set("Authorization", "Basic "+enc)
	} else if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("maintainerr: HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Connection test ───────────────────────────────────────────────────────────

func testMaintainerrConnection(baseURL, apiKey string, skipTLS bool) error {
	b, err := maintainerrGet(baseURL, apiKey, "/api/health", skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		Status string `json:"status"`
	}
	if json.Unmarshal(b, &r) != nil || r.Status == "" {
		return fmt.Errorf("maintainerr: unexpected health response")
	}
	return nil
}

// ── Panel data ────────────────────────────────────────────────────────────────

func fetchMaintainerrPanelData(db *sql.DB, config map[string]interface{}) (*MaintainerrPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("maintainerr: no integration configured")
	}
	baseURL, _, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if baseURL == "" {
		return nil, fmt.Errorf("maintainerr: baseURL not configured")
	}

	out := &MaintainerrPanelData{Collections: []MaintainerrCollection{}}

	// Collections — metadata (counts, sizes, active state)
	if b, err := maintainerrGet(baseURL, apiKey, "/api/collections", skipTLS); err == nil {
		var cols []struct {
			ID              int   `json:"id"`
			Title           string `json:"title"`
			Type            string `json:"type"`
			IsActive        bool   `json:"isActive"`
			DeleteAfterDays int    `json:"deleteAfterDays"`
			ArrAction       int    `json:"arrAction"`
			MediaCount      int    `json:"mediaCount"`
			TotalSizeBytes  int64  `json:"totalSizeBytes"`
		}
		if json.Unmarshal(b, &cols) == nil {
			for _, c := range cols {
				out.TotalMediaCount += c.MediaCount
				out.ReclaimableBytes += c.TotalSizeBytes
				if c.IsActive {
					out.ActiveCount++
				}

				// Fetch posters via content endpoint — image_path is populated here
				// for all media types (movies and shows), unlike the collections list
				posters := []string{}
				path := fmt.Sprintf("/api/collections/media/%d/content/1?size=25&sort=deleteSoonest&sortOrder=asc", c.ID)
				if cb, cerr := maintainerrGet(baseURL, apiKey, path, skipTLS); cerr == nil {
					var content struct {
						Items []struct {
							ImagePath string `json:"image_path"`
						} `json:"items"`
					}
					if json.Unmarshal(cb, &content) == nil {
						for _, m := range content.Items {
							if m.ImagePath != "" {
								posters = append(posters, m.ImagePath)
							}
						}
					}
				}

				out.Collections = append(out.Collections, MaintainerrCollection{
					ID:              c.ID,
					Title:           c.Title,
					Type:            c.Type,
					IsActive:        c.IsActive,
					DeleteAfterDays: c.DeleteAfterDays,
					ArrAction:       c.ArrAction,
					MediaCount:      c.MediaCount,
					TotalSizeBytes:  c.TotalSizeBytes,
					Posters:         posters,
				})
			}
		}
	}

	// Lifetime cleanup stats — best-effort
	if b, err := maintainerrGet(baseURL, apiKey, "/api/storage-metrics", skipTLS); err == nil {
		var sm struct {
			CleanupTotals struct {
				ItemsHandled int   `json:"itemsHandled"`
				BytesHandled int64 `json:"bytesHandled"`
			} `json:"cleanupTotals"`
		}
		if json.Unmarshal(b, &sm) == nil {
			out.ItemsHandled = sm.CleanupTotals.ItemsHandled
			out.BytesHandled = sm.CleanupTotals.BytesHandled
		}
	}

	return out, nil
}
