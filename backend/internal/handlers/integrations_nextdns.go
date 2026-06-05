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

type NextDNSDomain struct {
	Name    string `json:"name"`
	Queries int    `json:"queries"`
	Blocked int    `json:"blocked"`
}

type NextDNSClient struct {
	Name    string `json:"name"`
	Queries int    `json:"queries"`
	Blocked int    `json:"blocked"`
}

type NextDNSReason struct {
	Name    string `json:"name"`
	Queries int    `json:"queries"`
}

type NextDNSPanelData struct {
	UIURL          string          `json:"uiUrl"`
	IntegrationID  string          `json:"integrationId"`
	ProfileName    string          `json:"profileName"`
	TotalQueries   int             `json:"totalQueries"`
	BlockedQueries int             `json:"blockedQueries"`
	AllowedQueries int             `json:"allowedQueries"`
	PercentBlocked float64         `json:"percentBlocked"`
	EncryptedPct   float64         `json:"encryptedPct"`   // 0-100
	IPv6Pct        float64         `json:"ipv6Pct"`        // 0-100
	OverTimeTotal  []int           `json:"overTimeTotal"`
	OverTimeBlocked []int          `json:"overTimeBlocked"`
	TopDomains     []NextDNSDomain `json:"topDomains"`
	TopBlocked     []NextDNSDomain `json:"topBlocked"`
	TopClients     []NextDNSClient `json:"topClients"`
	Reasons        []NextDNSReason `json:"reasons"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

// ndGet requests profileURL+path with X-Api-Key auth and returns raw body.
// profileURL is the full profile URL, e.g. https://api.nextdns.io/profiles/abc123.
func ndGet(profileURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	url := strings.TrimRight(profileURL, "/") + path
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	if apiKey != "" {
		req.Header.Set("X-Api-Key", apiKey)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case 401, 403:
		return nil, fmt.Errorf("authentication failed: check API key")
	case 404:
		return nil, fmt.Errorf("profile not found: verify profile ID in the URL field")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from NextDNS", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ndDataMap unwraps {"data": {...}} and returns the inner map.
func ndDataMap(body []byte) map[string]interface{} {
	var w struct {
		Data json.RawMessage `json:"data"`
	}
	if json.Unmarshal(body, &w) != nil {
		return nil
	}
	var m map[string]interface{}
	json.Unmarshal(w.Data, &m)
	return m
}

// ndDataArray unwraps {"data": [...]} and returns the inner slice.
func ndDataArray(body []byte) []interface{} {
	var w struct {
		Data json.RawMessage `json:"data"`
	}
	if json.Unmarshal(body, &w) != nil {
		return nil
	}
	var arr []interface{}
	json.Unmarshal(w.Data, &arr)
	return arr
}

func ndIntVal(v interface{}) int {
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

func ndFloatVal(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	}
	return 0
}

// ndParseList converts a []interface{} of {name, queries, blocked} items
// into a typed slice. Handles missing blocked field gracefully.
func ndParseList(arr []interface{}) []struct {
	Name    string
	Queries int
	Blocked int
} {
	out := make([]struct {
		Name    string
		Queries int
		Blocked int
	}, 0, len(arr))
	for _, item := range arr {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		name, _ := m["name"].(string)
		if name == "" {
			continue
		}
		out = append(out, struct {
			Name    string
			Queries int
			Blocked int
		}{
			Name:    name,
			Queries: ndIntVal(m["queries"]),
			Blocked: ndIntVal(m["blocked"]),
		})
	}
	return out
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchNextDNSPanelData(db *sql.DB, config map[string]interface{}) (*NextDNSPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("integrationId required")
	}
	// profileURL is the full profile URL: https://api.nextdns.io/profiles/{id}
	profileURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if uiURL == "" {
		uiURL = "https://my.nextdns.io"
	}

	now := time.Now()
	from := now.Add(-24 * time.Hour).Unix()
	to := now.Unix()
	timeQ := fmt.Sprintf("from=%d&to=%d", from, to)

	// ── Profile name ────────────────────────────────────────────────────────
	profileName := ""
	if profileBody, err := ndGet(profileURL, apiKey, "", skipTLS); err == nil {
		if m := ndDataMap(profileBody); m != nil {
			profileName, _ = m["name"].(string)
		}
	}

	// ── Status / aggregate counters ─────────────────────────────────────────
	statusBody, err := ndGet(profileURL, apiKey, "/analytics/status?"+timeQ, skipTLS)
	if err != nil {
		return nil, fmt.Errorf("analytics/status: %w", err)
	}
	statusData := ndDataMap(statusBody)

	totalQueries := ndIntVal(statusData["all_queries"])
	blockedQueries := ndIntVal(statusData["blocked_queries"])
	allowedQueries := ndIntVal(statusData["allowed_queries"])
	encryptedRatio := ndFloatVal(statusData["encrypted_queries_ratio"])
	ipv6Ratio := ndFloatVal(statusData["ipv6_queries_ratio"])
	blockedRatio := ndFloatVal(statusData["blocked_queries_ratio"])

	// Derive percent blocked; prefer the ratio field if available
	var percentBlocked float64
	if blockedRatio > 0 {
		percentBlocked = blockedRatio * 100
	} else if totalQueries > 0 {
		percentBlocked = float64(blockedQueries) / float64(totalQueries) * 100
	}

	// ── Time series (hourly buckets over last 24h) ───────────────────────────
	// Append ;series to get time-bucketed data at 1-hour (3600s) intervals.
	seriesPath := fmt.Sprintf("/analytics/status;series?%s&interval=3600", timeQ)
	var overTimeTotal, overTimeBlocked []int
	if seriesBody, err := ndGet(profileURL, apiKey, seriesPath, skipTLS); err == nil {
		for _, item := range ndDataArray(seriesBody) {
			m, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			// Field names may be all_queries (status) or queries (generic list)
			total := ndIntVal(m["all_queries"])
			if total == 0 {
				total = ndIntVal(m["queries"])
			}
			blocked := ndIntVal(m["blocked_queries"])
			if blocked == 0 {
				blocked = ndIntVal(m["blocked"])
			}
			overTimeTotal = append(overTimeTotal, total)
			overTimeBlocked = append(overTimeBlocked, blocked)
		}
	}

	// ── Top domains ──────────────────────────────────────────────────────────
	var topDomains, topBlocked []NextDNSDomain
	if domainsBody, err := ndGet(profileURL, apiKey,
		fmt.Sprintf("/analytics/domains?%s&limit=20", timeQ), skipTLS); err == nil {
		items := ndParseList(ndDataArray(domainsBody))
		for _, d := range items {
			topDomains = append(topDomains, NextDNSDomain{
				Name: d.Name, Queries: d.Queries, Blocked: d.Blocked,
			})
		}
		// Derive top blocked: filter items where blocked > 0, sort descending
		withBlocked := make([]NextDNSDomain, 0)
		for _, d := range topDomains {
			if d.Blocked > 0 {
				withBlocked = append(withBlocked, d)
			}
		}
		sort.Slice(withBlocked, func(i, j int) bool {
			return withBlocked[i].Blocked > withBlocked[j].Blocked
		})
		if len(withBlocked) > 10 {
			withBlocked = withBlocked[:10]
		}
		topBlocked = withBlocked
	}

	// ── Top clients ──────────────────────────────────────────────────────────
	var topClients []NextDNSClient
	if ipsBody, err := ndGet(profileURL, apiKey,
		fmt.Sprintf("/analytics/ips?%s&limit=20", timeQ), skipTLS); err == nil {
		for _, d := range ndParseList(ndDataArray(ipsBody)) {
			topClients = append(topClients, NextDNSClient{
				Name: d.Name, Queries: d.Queries, Blocked: d.Blocked,
			})
		}
	}

	// ── Block reasons ────────────────────────────────────────────────────────
	var reasons []NextDNSReason
	if reasonsBody, err := ndGet(profileURL, apiKey,
		fmt.Sprintf("/analytics/reasons?%s&limit=20", timeQ), skipTLS); err == nil {
		for _, d := range ndParseList(ndDataArray(reasonsBody)) {
			reasons = append(reasons, NextDNSReason{Name: d.Name, Queries: d.Queries})
		}
	}

	return &NextDNSPanelData{
		UIURL:           uiURL,
		IntegrationID:   integrationID,
		ProfileName:     profileName,
		TotalQueries:    totalQueries,
		BlockedQueries:  blockedQueries,
		AllowedQueries:  allowedQueries,
		PercentBlocked:  percentBlocked,
		EncryptedPct:    encryptedRatio * 100,
		IPv6Pct:         ipv6Ratio * 100,
		OverTimeTotal:   overTimeTotal,
		OverTimeBlocked: overTimeBlocked,
		TopDomains:      topDomains,
		TopBlocked:      topBlocked,
		TopClients:      topClients,
		Reasons:         reasons,
	}, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testNextDNSConnection(profileURL, apiKey string, skipTLS bool) error {
	body, err := ndGet(profileURL, apiKey, "", skipTLS)
	if err != nil {
		return err
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(body, &resp); err != nil || resp["data"] == nil {
		return fmt.Errorf("unexpected response from NextDNS")
	}
	return nil
}
