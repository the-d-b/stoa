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
	UIURL           string              `json:"uiUrl"`
	LoginsTotal     int                 `json:"loginsTotal"`
	LoginsToday     int                 `json:"loginsToday"`
	FailuresTotal   int                 `json:"failuresTotal"`
	FailuresToday   int                 `json:"failuresToday"`
	ActiveSessions  int                 `json:"activeSessions"`
	RecentFailures  []AuthentikFailure  `json:"recentFailures"`
}

type AuthentikFailure struct {
	Username  string `json:"username"`
	ClientIP  string `json:"clientIp"`
	CreatedAt string `json:"createdAt"`
}

func fetchAuthentikPanelData(db *sql.DB, config map[string]interface{}) (*AuthentikPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &AuthentikPanelData{UIURL: uiURL}

	// Date filter for "today" — last 24 hours
	since := time.Now().UTC().Add(-24 * time.Hour).Format(time.RFC3339)

	type result struct {
		key  string
		body []byte
		err  error
	}

	endpoints := map[string]string{
		"logins_total":    "/api/v3/events/events/?action=login&page_size=1",
		"logins_today":    "/api/v3/events/events/?action=login&page_size=1&created__gte=" + since,
		"failures_total":  "/api/v3/events/events/?action=login_failed&page_size=1",
		"failures_today":  "/api/v3/events/events/?action=login_failed&page_size=1&created__gte=" + since,
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

	// Parse pagination counts
	type paginatedResp struct {
		Pagination struct {
			Count int `json:"count"`
		} `json:"pagination"`
		Results []struct {
			User struct {
				Username string `json:"username"`
			} `json:"user"`
			Context struct {
				Username string `json:"username"` // for login_failed, username is in context
			} `json:"context"`
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

	data.LoginsTotal    = parseCount("logins_total")
	data.LoginsToday    = parseCount("logins_today")
	data.FailuresTotal  = parseCount("failures_total")
	data.FailuresToday  = parseCount("failures_today")
	data.ActiveSessions = parseCount("sessions")

	// Parse recent failures detail
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
