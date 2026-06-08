package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type WgerWeightEntry struct {
	Date   string  `json:"date"`
	Weight float64 `json:"weight"`
}

type WgerSession struct {
	Date       string `json:"date"`
	Impression string `json:"impression"`
	Notes      string `json:"notes"`
}

type WgerPanelData struct {
	UIURL          string            `json:"uiUrl"`
	TotalWorkouts  int               `json:"totalWorkouts"`
	WeightEntries  []WgerWeightEntry `json:"weightEntries"`
	RecentSessions []WgerSession     `json:"recentSessions"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func wgerGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Token "+apiKey)
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("wger: HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Test ──────────────────────────────────────────────────────────────────────

func testWgerConnection(apiURL, apiKey string, skipTLS bool) error {
	_, err := wgerGet(apiURL, apiKey, "/api/v2/userprofile/?format=json", skipTLS)
	return err
}

// ── Main fetch ────────────────────────────────────────────────────────────────

func fetchWgerPanelData(_ *sql.DB, config map[string]interface{}) (*WgerPanelData, error) {
	baseURL, _ := config["baseURL"].(string)
	apiKey, _ := config["apiKey"].(string)
	uiURL, _ := config["uiUrl"].(string)
	skipTLS, _ := config["skipTLSVerify"].(bool)
	if baseURL == "" {
		return nil, fmt.Errorf("wger: baseURL not configured")
	}

	out := &WgerPanelData{
		UIURL:          uiURL,
		WeightEntries:  []WgerWeightEntry{},
		RecentSessions: []WgerSession{},
	}

	get := func(path string) ([]byte, error) {
		return wgerGet(baseURL, apiKey, path, skipTLS)
	}

	// Recent workout sessions — pagination `count` gives total
	if b, err := get("/api/v2/workoutsession/?format=json&ordering=-date&limit=5"); err == nil {
		var resp struct {
			Count   int `json:"count"`
			Results []struct {
				Date       string `json:"date"`
				Impression string `json:"impression"`
				Notes      string `json:"notes"`
			} `json:"results"`
		}
		if json.Unmarshal(b, &resp) == nil {
			out.TotalWorkouts = resp.Count
			for _, s := range resp.Results {
				out.RecentSessions = append(out.RecentSessions, WgerSession{
					Date:       s.Date,
					Impression: s.Impression,
					Notes:      s.Notes,
				})
			}
		}
	} else {
		log.Printf("[wger] workoutsession error: %v", err)
	}

	// Recent weight entries for trend (newest-first, last 10)
	if b, err := get("/api/v2/weightentry/?format=json&ordering=-date&limit=10"); err == nil {
		var resp struct {
			Results []struct {
				Date   string  `json:"date"`
				Weight float64 `json:"weight"`
			} `json:"results"`
		}
		if json.Unmarshal(b, &resp) == nil {
			for _, e := range resp.Results {
				out.WeightEntries = append(out.WeightEntries, WgerWeightEntry{
					Date:   e.Date,
					Weight: e.Weight,
				})
			}
		}
	} else {
		log.Printf("[wger] weightentry error: %v", err)
	}

	return out, nil
}
