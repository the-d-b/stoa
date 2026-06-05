package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type AdGuardDomain struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type AdGuardClient struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type AdGuardFilter struct {
	Name       string `json:"name"`
	RulesCount int    `json:"rulesCount"`
	Enabled    bool   `json:"enabled"`
}

type AdGuardUpstream struct {
	Name    string  `json:"name"`
	Queries int     `json:"queries"`
	AvgMs   float64 `json:"avgMs"` // average response time in milliseconds
}

type AdGuardPanelData struct {
	UIURL             string            `json:"uiUrl"`
	IntegrationID     string            `json:"integrationId"`
	Version           string            `json:"version"`
	ProtectionEnabled bool              `json:"protectionEnabled"`
	TotalQueries      int               `json:"totalQueries"`
	BlockedQueries    int               `json:"blockedQueries"`
	SafeBrowsing      int               `json:"safeBrowsing"`
	SafeSearch        int               `json:"safeSearch"`
	Parental          int               `json:"parental"`
	PercentBlocked    float64           `json:"percentBlocked"`
	AvgProcessingMS   float64           `json:"avgProcessingMs"`
	OverTimeTotal     []int             `json:"overTimeTotal"`
	OverTimeBlocked   []int             `json:"overTimeBlocked"`
	TopBlocked        []AdGuardDomain   `json:"topBlocked"`
	TopQueried        []AdGuardDomain   `json:"topQueried"`
	TopClients        []AdGuardClient   `json:"topClients"`
	Upstreams         []AdGuardUpstream `json:"upstreams"`
	TotalFilterRules  int               `json:"totalFilterRules"`
	ActiveFilters     int               `json:"activeFilters"`
	Filters           []AdGuardFilter   `json:"filters"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func agGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	url := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	if apiKey != "" {
		username, password, _ := strings.Cut(apiKey, ":")
		req.SetBasicAuth(username, password)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed: check username:password")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from AdGuard Home", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── JSON value helpers ────────────────────────────────────────────────────────

func agInt(v interface{}) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	}
	return 0
}

func agFloat(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case int64:
		return float64(n)
	}
	return 0
}

func agInts(v interface{}) []int {
	arr, ok := v.([]interface{})
	if !ok {
		return nil
	}
	result := make([]int, len(arr))
	for i, x := range arr {
		result[i] = agInt(x)
	}
	return result
}

// AdGuard top-list entries are []map[string]N — one key (name) per element.
func agTopDomains(v interface{}) []AdGuardDomain {
	arr, ok := v.([]interface{})
	if !ok {
		return nil
	}
	out := make([]AdGuardDomain, 0, len(arr))
	for _, item := range arr {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		for k, val := range m {
			out = append(out, AdGuardDomain{Name: k, Count: agInt(val)})
		}
	}
	return out
}

func agTopClients(v interface{}) []AdGuardClient {
	arr, ok := v.([]interface{})
	if !ok {
		return nil
	}
	out := make([]AdGuardClient, 0, len(arr))
	for _, item := range arr {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		for k, val := range m {
			out = append(out, AdGuardClient{Name: k, Count: agInt(val)})
		}
	}
	return out
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchAdGuardPanelData(db *sql.DB, config map[string]interface{}) (*AdGuardPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("integrationId required")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if uiURL == "" {
		uiURL = apiURL
	}

	// GET /control/status — version + protection state
	statusBody, err := agGet(apiURL, apiKey, "/control/status", skipTLS)
	if err != nil {
		return nil, fmt.Errorf("status: %w", err)
	}
	var status struct {
		Version           string `json:"version"`
		ProtectionEnabled bool   `json:"protection_enabled"`
	}
	json.Unmarshal(statusBody, &status)

	// GET /control/stats — all query statistics + time series + top lists
	statsBody, err := agGet(apiURL, apiKey, "/control/stats", skipTLS)
	if err != nil {
		return nil, fmt.Errorf("stats: %w", err)
	}
	var stats map[string]interface{}
	if err := json.Unmarshal(statsBody, &stats); err != nil {
		return nil, fmt.Errorf("parse stats: %w", err)
	}

	// GET /control/filtering/status — active blocklists with rule counts
	filterBody, err := agGet(apiURL, apiKey, "/control/filtering/status", skipTLS)
	if err != nil {
		return nil, fmt.Errorf("filtering: %w", err)
	}
	var filterStatus struct {
		Filters []struct {
			Name       string `json:"name"`
			RulesCount int    `json:"rules_count"`
			Enabled    bool   `json:"enabled"`
		} `json:"filters"`
	}
	json.Unmarshal(filterBody, &filterStatus)

	// Core counters
	totalQueries := agInt(stats["num_dns_queries"])
	blockedQueries := agInt(stats["num_blocked_filtering"])
	safeBrowsing := agInt(stats["num_replaced_safebrowsing"])
	safeSearch := agInt(stats["num_replaced_safesearch"])
	parental := agInt(stats["num_replaced_parental"])
	avgSec := agFloat(stats["avg_processing_time"])

	var percentBlocked float64
	if totalQueries > 0 {
		percentBlocked = float64(blockedQueries) / float64(totalQueries) * 100.0
	}

	// Build upstream list: merge response counts with avg response times
	responseCounts := map[string]int{}
	if arr, ok := stats["top_upstreams_responses"].([]interface{}); ok {
		for _, item := range arr {
			if m, ok := item.(map[string]interface{}); ok {
				for k, v := range m {
					responseCounts[k] = agInt(v)
				}
			}
		}
	}
	upstreams := []AdGuardUpstream{}
	if arr, ok := stats["top_upstreams_avg_response_time"].([]interface{}); ok {
		for _, item := range arr {
			if m, ok := item.(map[string]interface{}); ok {
				for k, v := range m {
					upstreams = append(upstreams, AdGuardUpstream{
						Name:    k,
						Queries: responseCounts[k],
						AvgMs:   agFloat(v) * 1000.0,
					})
					delete(responseCounts, k)
				}
			}
		}
	}
	// Any upstream that has response counts but no timing data
	for k, v := range responseCounts {
		upstreams = append(upstreams, AdGuardUpstream{Name: k, Queries: v})
	}

	// Build filter list; sum active rule counts
	filters := make([]AdGuardFilter, 0, len(filterStatus.Filters))
	totalFilterRules := 0
	activeFilters := 0
	for _, f := range filterStatus.Filters {
		filters = append(filters, AdGuardFilter{
			Name:       f.Name,
			RulesCount: f.RulesCount,
			Enabled:    f.Enabled,
		})
		if f.Enabled {
			totalFilterRules += f.RulesCount
			activeFilters++
		}
	}

	return &AdGuardPanelData{
		UIURL:             uiURL,
		IntegrationID:     integrationID,
		Version:           status.Version,
		ProtectionEnabled: status.ProtectionEnabled,
		TotalQueries:      totalQueries,
		BlockedQueries:    blockedQueries,
		SafeBrowsing:      safeBrowsing,
		SafeSearch:        safeSearch,
		Parental:          parental,
		PercentBlocked:    percentBlocked,
		AvgProcessingMS:   avgSec * 1000.0,
		OverTimeTotal:     agInts(stats["dns_queries"]),
		OverTimeBlocked:   agInts(stats["blocked_filtering"]),
		TopBlocked:        agTopDomains(stats["top_blocked_domains"]),
		TopQueried:        agTopDomains(stats["top_queried_domains"]),
		TopClients:        agTopClients(stats["top_clients"]),
		Upstreams:         upstreams,
		TotalFilterRules:  totalFilterRules,
		ActiveFilters:     activeFilters,
		Filters:           filters,
	}, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testAdGuardConnection(apiURL, apiKey string, skipTLS bool) error {
	body, err := agGet(apiURL, apiKey, "/control/status", skipTLS)
	if err != nil {
		return err
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(body, &resp); err != nil || resp["version"] == nil {
		return fmt.Errorf("unexpected response from AdGuard Home")
	}
	return nil
}
