package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ── Authentik types ───────────────────────────────────────────────────────────

type AuthentikPanelData struct {
	UIURL          string             `json:"uiUrl"`
	Days           int                `json:"days"`
	Logins         int                `json:"logins"`
	Failures       int                `json:"failures"`
	ActiveSessions int                `json:"activeSessions"`
	RecentFailures []AuthentikFailure `json:"recentFailures"`
}

type AuthentikFailure struct {
	Username  string `json:"username"`
	ClientIP  string `json:"clientIp"`
	CreatedAt string `json:"createdAt"`
}

const authentikInfinityDays = 36500

func fetchAuthentikPanelData(db *sql.DB, config map[string]interface{}) (*AuthentikPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}

	days := 7
	if d, ok := config["days"].(float64); ok && d > 0 {
		days = int(d)
	}
	data := &AuthentikPanelData{UIURL: uiURL, Days: days}
	infinite := days >= authentikInfinityDays

	if infinite {
		// For all-time: use pagination count from list endpoint (returns total regardless of date)
		// and fetch recent failures without time filtering
		endpoints := map[string]string{
			"logins":          "/api/v3/events/events/?action=login&page_size=1",
			"failures":        "/api/v3/events/events/?action=login_failed&page_size=1",
			"failures_recent": "/api/v3/events/events/?action=login_failed&page_size=10&ordering=-created",
			"sessions":        "/api/v3/core/authenticated_sessions/?page_size=1",
		}

		results := make(map[string][]byte, len(endpoints))
		var mu sync.Mutex
		var wg sync.WaitGroup
		for key, path := range endpoints {
			wg.Add(1)
			go func(k, p string) {
				defer wg.Done()
				body, ferr := authentikGet(apiURL, apiKey, p, skipTLS)
				if ferr != nil {
					return
				}
				mu.Lock()
				results[k] = body
				mu.Unlock()
			}(key, path)
		}
		wg.Wait()

		type paginatedResp struct {
			Pagination struct {
				Count int `json:"count"`
			} `json:"pagination"`
			Results []struct {
				User    struct{ Username string `json:"username"` } `json:"user"`
				Context struct{ Username string `json:"username"` } `json:"context"`
				ClientIP  string `json:"client_ip"`
				CreatedAt string `json:"created"`
			} `json:"results"`
		}
		parseCount := func(key string) int {
			if body, ok := results[key]; ok {
				var r paginatedResp
				if json.Unmarshal(body, &r) == nil {
					return r.Pagination.Count
				}
			}
			return 0
		}
		data.Logins         = parseCount("logins")
		data.Failures       = parseCount("failures")
		data.ActiveSessions = parseCount("sessions")

		if body, ok := results["failures_recent"]; ok {
			var r paginatedResp
			if json.Unmarshal(body, &r) == nil {
				for _, item := range r.Results {
					username := item.Context.Username
					if username == "" {
						username = item.User.Username
					}
					data.RecentFailures = append(data.RecentFailures, AuthentikFailure{
						Username:  username,
						ClientIP:  item.ClientIP,
						CreatedAt: item.CreatedAt,
					})
				}
			}
		}
		return data, nil
	}

	// For windowed ranges: use volume endpoint and sum buckets within window
	cutoff := time.Now().UTC().Add(-time.Duration(days) * 24 * time.Hour)

	endpoints := map[string]string{
		"logins_vol":      "/api/v3/events/events/volume/?action=login",
		"failures_vol":    "/api/v3/events/events/volume/?action=login_failed",
		"failures_recent": "/api/v3/events/events/?action=login_failed&page_size=20&ordering=-created",
		"sessions":        "/api/v3/core/authenticated_sessions/?page_size=1",
	}

	results := make(map[string][]byte, len(endpoints))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for key, path := range endpoints {
		wg.Add(1)
		go func(k, p string) {
			defer wg.Done()
			body, ferr := authentikGet(apiURL, apiKey, p, skipTLS)
			if ferr != nil {
				return
			}
			mu.Lock()
			results[k] = body
			mu.Unlock()
		}(key, path)
	}
	wg.Wait()

	type volumeEntry struct {
		Time  string `json:"time"`
		Count int    `json:"count"`
	}
	sumVolume := func(key string) int {
		body, ok := results[key]
		if !ok {
			return 0
		}
		var entries []volumeEntry
		if json.Unmarshal(body, &entries) != nil {
			return 0
		}
		total := 0
		for _, e := range entries {
			t, err := time.Parse("2006-01-02T15:04:05", e.Time)
			if err != nil {
				t, err = time.Parse(time.RFC3339, e.Time)
			}
			if err == nil && t.After(cutoff) {
				total += e.Count
			}
		}
		return total
	}

	data.Logins   = sumVolume("logins_vol")
	data.Failures = sumVolume("failures_vol")

	if body, ok := results["sessions"]; ok {
		var r struct {
			Pagination struct {
				Count int `json:"count"`
			} `json:"pagination"`
		}
		if json.Unmarshal(body, &r) == nil {
			data.ActiveSessions = r.Pagination.Count
		}
	}

	if body, ok := results["failures_recent"]; ok {
		var r struct {
			Results []struct {
				User    struct{ Username string `json:"username"` } `json:"user"`
				Context struct{ Username string `json:"username"` } `json:"context"`
				ClientIP  string `json:"client_ip"`
				CreatedAt string `json:"created"`
			} `json:"results"`
		}
		if json.Unmarshal(body, &r) == nil {
			for _, item := range r.Results {
				t, err := time.Parse(time.RFC3339Nano, item.CreatedAt)
				if err != nil {
					t, err = time.Parse(time.RFC3339, item.CreatedAt)
				}
				if err != nil || t.Before(cutoff) {
					continue
				}
				username := item.Context.Username
				if username == "" {
					username = item.User.Username
				}
				data.RecentFailures = append(data.RecentFailures, AuthentikFailure{
					Username:  username,
					ClientIP:  item.ClientIP,
					CreatedAt: item.CreatedAt,
				})
			}
		}
	}

	return data, nil
}

func authentikGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	url := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "application/json")
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Authentik", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func testAuthentikConnection(apiURL, apiKey string, skipTLS bool) error {
	body, err := authentikGet(apiURL, apiKey, "/api/v3/core/users/?page_size=1", skipTLS)
	if err != nil {
		return err
	}
	var resp map[string]interface{}
	if json.Unmarshal(body, &resp) != nil {
		return fmt.Errorf("unexpected response from Authentik")
	}
	return nil
}
