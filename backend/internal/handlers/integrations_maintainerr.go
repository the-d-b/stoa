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
	ID              int    `json:"id"`
	Title           string `json:"title"`
	Type            int    `json:"type"` // 1=movie 2=show 3=season 4=episode
	IsActive        bool   `json:"isActive"`
	DeleteAfterDays int    `json:"deleteAfterDays"`
	ArrAction       int    `json:"arrAction"` // 0=delete 1=unmonitor+delete 2=unmonitor
	MediaCount      int    `json:"mediaCount"`
}

type MaintainerrPanelData struct {
	Collections      []MaintainerrCollection `json:"collections"`
	ActiveCount      int                     `json:"activeCount"`
	TotalMediaCount  int                     `json:"totalMediaCount"`
	ReclaimableBytes int64                   `json:"reclaimableBytes"`
	ItemsHandled     int                     `json:"itemsHandled"`
	BytesHandled     int64                   `json:"bytesHandled"`
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

func fetchMaintainerrPanelData(_ *sql.DB, config map[string]interface{}) (*MaintainerrPanelData, error) {
	baseURL, _ := config["baseURL"].(string)
	apiKey, _ := config["apiKey"].(string)
	skipTLS, _ := config["skipTLSVerify"].(bool)
	if baseURL == "" {
		return nil, fmt.Errorf("maintainerr: baseURL not configured")
	}

	out := &MaintainerrPanelData{Collections: []MaintainerrCollection{}}

	// Collections — each includes its queued media array
	if b, err := maintainerrGet(baseURL, apiKey, "/api/collections", skipTLS); err == nil {
		var cols []struct {
			ID              int    `json:"id"`
			Title           string `json:"title"`
			Type            int    `json:"type"`
			IsActive        bool   `json:"isActive"`
			DeleteAfterDays int    `json:"deleteAfterDays"`
			ArrAction       int    `json:"arrAction"`
			Media           []struct {
				ID int `json:"id"`
			} `json:"media"`
		}
		if json.Unmarshal(b, &cols) == nil {
			for _, c := range cols {
				mc := len(c.Media)
				out.TotalMediaCount += mc
				if c.IsActive {
					out.ActiveCount++
				}
				out.Collections = append(out.Collections, MaintainerrCollection{
					ID:              c.ID,
					Title:           c.Title,
					Type:            c.Type,
					IsActive:        c.IsActive,
					DeleteAfterDays: c.DeleteAfterDays,
					ArrAction:       c.ArrAction,
					MediaCount:      mc,
				})
			}
		}
	}

	// Storage metrics — best-effort (added in later Maintainerr versions)
	if b, err := maintainerrGet(baseURL, apiKey, "/api/storage-metrics", skipTLS); err == nil {
		var sm struct {
			CleanupTotals struct {
				ItemsHandled int   `json:"itemsHandled"`
				BytesHandled int64 `json:"bytesHandled"`
			} `json:"cleanupTotals"`
			CollectionSummary struct {
				MovieSizeBytes  int64 `json:"movieSizeBytes"`
				ShowSizeBytes   int64 `json:"showSizeBytes"`
				SeasonSizeBytes int64 `json:"seasonSizeBytes"`
				EpSizeBytes     int64 `json:"episodeSizeBytes"`
			} `json:"collectionSummary"`
		}
		if json.Unmarshal(b, &sm) == nil {
			out.ItemsHandled = sm.CleanupTotals.ItemsHandled
			out.BytesHandled = sm.CleanupTotals.BytesHandled
			out.ReclaimableBytes = sm.CollectionSummary.MovieSizeBytes +
				sm.CollectionSummary.ShowSizeBytes +
				sm.CollectionSummary.SeasonSizeBytes +
				sm.CollectionSummary.EpSizeBytes
		}
	}

	return out, nil
}
