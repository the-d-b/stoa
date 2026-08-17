package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type PiHoleDomain struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type PiHoleClient struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type PiHoleUpstream struct {
	Name    string  `json:"name"`
	Percent float64 `json:"percent"`
}

// PiHoleList is one configured adlist (block or allow). v6 only — there's no
// v5 equivalent wired up, so this is always empty on a v5 integration.
type PiHoleList struct {
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
	Type    string `json:"type"` // "block" or "allow"
	Count   int    `json:"count"`
}

type PiHolePanelData struct {
	UIURL           string  `json:"uiUrl"`
	IntegrationID   string  `json:"integrationId"`
	Version         string  `json:"version"` // "v5" or "v6"
	TotalQueries    int     `json:"totalQueries"`
	BlockedQueries  int     `json:"blockedQueries"`
	PercentBlocked  float64 `json:"percentBlocked"`
	UniqueClients   int     `json:"uniqueClients"`
	UniqueDomains   int     `json:"uniqueDomains"`
	GravityDomains  int     `json:"gravityDomains"`
	GravityUpdated  int64   `json:"gravityUpdated"` // unix timestamp; 0 for v5
	BlockingEnabled bool    `json:"blockingEnabled"`
	// Last 24h (or selected range) in 10-minute buckets
	OverTimeTotal   []int            `json:"overTimeTotal"`
	OverTimeBlocked []int            `json:"overTimeBlocked"`
	TopPermitted    []PiHoleDomain   `json:"topPermitted"`
	TopBlocked      []PiHoleDomain   `json:"topBlocked"`
	TopClients      []PiHoleClient   `json:"topClients"`
	Upstreams       []PiHoleUpstream `json:"upstreams"`
	Lists           []PiHoleList     `json:"lists"`
}

// ── Session cache (v6) ────────────────────────────────────────────────────────

type phSession struct {
	SID       string
	ExpiresAt time.Time
}

var (
	phSessionsMu sync.Mutex
	phSessions   = map[string]*phSession{} // integID → session
)

// ── Version cache ─────────────────────────────────────────────────────────────

var (
	phVerCacheMu sync.Mutex
	phVerCache   = map[string]string{} // integID → "v5" or "v6"
)

// ── Version detection ─────────────────────────────────────────────────────────

// phDetectVersion probes GET /api/info/version. Confirmed live that some
// Pi-hole v6 builds require auth on this endpoint (401, not a bare 200) —
// the endpoint's mere existence is what signals v6, since v5 has no /api
// namespace at all and 404s here. So treat anything other than 404 (or a
// failed request) as v6, not just a literal 200.
// Returns "v6" if the endpoint exists (any non-404 response), else "v5".
func phDetectVersion(integID, baseURL string, skipTLS bool) string {
	phVerCacheMu.Lock()
	if v, ok := phVerCache[integID]; ok {
		phVerCacheMu.Unlock()
		return v
	}
	phVerCacheMu.Unlock()

	v := "v5"
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+"/api/info/version", nil)
	if err == nil {
		resp, err2 := httpClient(skipTLS).Do(req)
		if err2 == nil {
			resp.Body.Close()
			if resp.StatusCode != http.StatusNotFound {
				v = "v6"
			}
		}
	}

	phVerCacheMu.Lock()
	phVerCache[integID] = v
	phVerCacheMu.Unlock()
	return v
}

// ── v6 auth ───────────────────────────────────────────────────────────────────

func phV6Login(baseURL, password string, skipTLS bool) (string, time.Time, error) {
	u := strings.TrimRight(baseURL, "/") + "/api/auth"
	body, _ := json.Marshal(map[string]string{"password": password})
	req, err := http.NewRequest("POST", u, bytes.NewReader(body))
	if err != nil {
		return "", time.Time{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return "", time.Time{}, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", time.Time{}, fmt.Errorf("auth failed (HTTP %d) — check password or app password", resp.StatusCode)
	}
	var result struct {
		Session struct {
			SID      string `json:"sid"`
			Validity int    `json:"validity"` // seconds
		} `json:"session"`
	}
	if err := json.Unmarshal(raw, &result); err != nil || result.Session.SID == "" {
		return "", time.Time{}, fmt.Errorf("auth response missing session ID")
	}
	validity := time.Duration(result.Session.Validity) * time.Second
	if validity <= 60*time.Second {
		validity = 30 * time.Minute
	}
	return result.Session.SID, time.Now().Add(validity - 60*time.Second), nil
}

func phV6GetSID(integID, baseURL, password string, skipTLS bool) (string, error) {
	phSessionsMu.Lock()
	sess := phSessions[integID]
	phSessionsMu.Unlock()
	if sess != nil && time.Now().Before(sess.ExpiresAt) {
		return sess.SID, nil
	}
	sid, exp, err := phV6Login(baseURL, password, skipTLS)
	if err != nil {
		return "", err
	}
	phSessionsMu.Lock()
	phSessions[integID] = &phSession{SID: sid, ExpiresAt: exp}
	phSessionsMu.Unlock()
	return sid, nil
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

func phV6Get(integID, baseURL, password, path string, skipTLS bool) ([]byte, error) {
	sid, err := phV6GetSID(integID, baseURL, password, skipTLS)
	if err != nil {
		return nil, err
	}
	u := strings.TrimRight(baseURL, "/") + path
	do := func(token string) (*http.Response, error) {
		req, err := http.NewRequest("GET", u, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("X-FTL-SID", token)
		return httpClient(skipTLS).Do(req)
	}
	resp, err := do(sid)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		// Session expired — clear and re-auth once
		phSessionsMu.Lock()
		delete(phSessions, integID)
		phSessionsMu.Unlock()
		sid2, err2 := phV6GetSID(integID, baseURL, password, skipTLS)
		if err2 != nil {
			return nil, fmt.Errorf("re-auth: %w", err2)
		}
		resp2, err2 := do(sid2)
		if err2 != nil {
			return nil, err2
		}
		defer resp2.Body.Close()
		if resp2.StatusCode != 200 {
			return nil, fmt.Errorf("HTTP %d from %s", resp2.StatusCode, path)
		}
		return io.ReadAll(resp2.Body)
	}
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("HTTP %d from %s: %s", resp.StatusCode, path, string(b))
	}
	return io.ReadAll(resp.Body)
}

func phV5Get(baseURL, token, path string, skipTLS bool) ([]byte, error) {
	u := strings.TrimRight(baseURL, "/") + path
	if token != "" {
		if strings.Contains(u, "?") {
			u += "&auth=" + token
		} else {
			u += "?auth=" + token
		}
	}
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return nil, err
	}
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(b))
	}
	return io.ReadAll(resp.Body)
}

// ── v6 data fetchers ──────────────────────────────────────────────────────────

type piholeSummary struct {
	total, blocked, clients, domains, gravity int
	pctBlocked                                float64
	gravityUpdated                            int64
	blockingEnabled                           bool
}

func phV6Summary(integID, baseURL, pass string, skipTLS bool) (piholeSummary, error) {
	raw, err := phV6Get(integID, baseURL, pass, "/api/stats/summary", skipTLS)
	if err != nil {
		return piholeSummary{}, err
	}
	var r struct {
		Queries struct {
			Total          int     `json:"total"`
			Blocked        int     `json:"blocked"`
			PercentBlocked float64 `json:"percent_blocked"`
			UniqueDomains  int     `json:"unique_domains"`
		} `json:"queries"`
		Clients struct {
			Active int `json:"active"`
		} `json:"clients"`
		Gravity struct {
			DomainsBeingBlocked int   `json:"domains_being_blocked"`
			LastUpdate          int64 `json:"last_update"`
		} `json:"gravity"`
	}
	if err := json.Unmarshal(raw, &r); err != nil {
		return piholeSummary{}, err
	}
	return piholeSummary{
		total:          r.Queries.Total,
		blocked:        r.Queries.Blocked,
		pctBlocked:     r.Queries.PercentBlocked,
		clients:        r.Clients.Active,
		domains:        r.Queries.UniqueDomains,
		gravity:        r.Gravity.DomainsBeingBlocked,
		gravityUpdated: r.Gravity.LastUpdate,
	}, nil
}

func phV6Blocking(integID, baseURL, pass string, skipTLS bool) bool {
	raw, err := phV6Get(integID, baseURL, pass, "/api/dns/blocking", skipTLS)
	if err != nil {
		return true // assume enabled on error
	}
	var r struct {
		Blocking string `json:"blocking"`
	}
	if err := json.Unmarshal(raw, &r); err != nil {
		return true
	}
	return r.Blocking != "disabled"
}

// phV6OverTime fetches 10-minute-bucketed query history. Confirmed live that
// the v5-era /api/stats/overTimeData10mins path 404s — v6 moved this to a
// bare /api/history (no /stats/ prefix, no query params needed; it already
// returns the full day by default).
// days <= 1 uses the bare /api/history call with no params — the one
// confirmed-working shape (defaults to the last 24h). Wider ranges append
// from/until, which is UNCONFIRMED — the environment this was built against
// had less than a day of retained history to test a wider window against.
func phV6OverTime(integID, baseURL, pass string, skipTLS bool, days float64) ([]int, []int) {
	path := "/api/history"
	if days > 1 {
		from, until := phRangeFromDays(days)
		path = fmt.Sprintf("/api/history?from=%d&until=%d", from, until)
	}
	raw, err := phV6Get(integID, baseURL, pass, path, skipTLS)
	if err != nil {
		logErrorf("PIHOLE", "overtime error: %v", err)
		return nil, nil
	}
	var r struct {
		History []struct {
			Timestamp int64 `json:"timestamp"`
			Total     int   `json:"total"`
			Blocked   int   `json:"blocked"`
		} `json:"history"`
	}
	if err := json.Unmarshal(raw, &r); err != nil {
		logErrorf("PIHOLE", "overtime: unexpected response: %s", strings.TrimSpace(string(raw)))
		return nil, nil
	}
	if len(r.History) == 0 {
		logErrorf("PIHOLE", "overtime: parsed OK but 0 history entries, raw response: %s", strings.TrimSpace(string(raw)))
	}
	totals := make([]int, len(r.History))
	blocked := make([]int, len(r.History))
	for i, h := range r.History {
		totals[i] = h.Total
		blocked[i] = h.Blocked
	}
	return totals, blocked
}

// phV6TopDomains fetches top permitted or top blocked domains from v6.
// The old separate top_items/top_ad_items endpoints 404 live — confirmed
// FTL's own OpenAPI spec merged these into one endpoint with a `blocked`
// param instead (the spec's URL prefix didn't match this server's confirmed
// /api/stats/database/ naming, so the exact path here is a best-informed
// guess, not directly confirmed live — if this still 404s, the logging
// below will show it plainly rather than failing silently).
func phV6TopDomains(integID, baseURL, pass string, blocked bool, skipTLS bool, days float64) []PiHoleDomain {
	from, until := phRangeFromDays(days)
	path := fmt.Sprintf("/api/stats/database/top_domains?count=10&blocked=%t&from=%d&until=%d", blocked, from, until)
	raw, err := phV6Get(integID, baseURL, pass, path, skipTLS)
	if err != nil {
		logErrorf("PIHOLE", "top domains (blocked=%t) error: %v", blocked, err)
		return nil
	}
	// Format 1: {"queries": {"top_queries": {"domain": N}}} or top_ads
	var r1 struct {
		Queries struct {
			TopQueries map[string]int `json:"top_queries"`
			TopAds     map[string]int `json:"top_ads"`
		} `json:"queries"`
	}
	if json.Unmarshal(raw, &r1) == nil {
		if len(r1.Queries.TopQueries) > 0 {
			return phMapToDomains(r1.Queries.TopQueries)
		}
		if len(r1.Queries.TopAds) > 0 {
			return phMapToDomains(r1.Queries.TopAds)
		}
	}
	// Format 2: {"items": [{"domain": "...", "count": N}]}
	var r2 struct {
		Items []struct {
			Domain string `json:"domain"`
			Count  int    `json:"count"`
		} `json:"items"`
	}
	if json.Unmarshal(raw, &r2) == nil && len(r2.Items) > 0 {
		out := make([]PiHoleDomain, 0, len(r2.Items))
		for _, item := range r2.Items {
			out = append(out, PiHoleDomain{Name: item.Domain, Count: item.Count})
		}
		return out
	}
	// Format 3: {"domains": [{"domain": "...", "count": N}], "total_queries": N}
	var r3 struct {
		Domains []struct {
			Domain string `json:"domain"`
			Count  int    `json:"count"`
		} `json:"domains"`
	}
	if json.Unmarshal(raw, &r3) == nil && len(r3.Domains) > 0 {
		out := make([]PiHoleDomain, 0, len(r3.Domains))
		for _, item := range r3.Domains {
			out = append(out, PiHoleDomain{Name: item.Domain, Count: item.Count})
		}
		return out
	}
	logErrorf("PIHOLE", "top domains (blocked=%t): no known response shape matched, raw response: %s", blocked, strings.TrimSpace(string(raw)))
	return nil
}

// ph24hRange returns a (from, until) unix-seconds pair covering the last 24h —
// confirmed live that Pi-hole v6's /database/ endpoints 400 with "You need to
// specify both from and until" unless both are supplied (unix seconds, per
// FTL's own OpenAPI spec); the non-database endpoints (e.g. /api/stats/upstreams)
// don't need this and work on whatever window Pi-hole itself is tracking.
// days <= 0 defaults to 1 (the original 24h behavior, still the default
// with no picker selection). NOTE: whether the underlying endpoints actually
// return more than ~24h of data for days > 1 is unconfirmed — the test
// environment this was built against didn't have enough retained history to
// verify a wider window actually returns more buckets.
func phRangeFromDays(days float64) (int64, int64) {
	if days <= 0 {
		days = 1
	}
	now := time.Now().Unix()
	return now - int64(days*86400), now
}

func phV6TopClients(integID, baseURL, pass string, skipTLS bool, days float64) []PiHoleClient {
	from, until := phRangeFromDays(days)
	path := fmt.Sprintf("/api/stats/database/top_clients?count=10&from=%d&until=%d", from, until)
	raw, err := phV6Get(integID, baseURL, pass, path, skipTLS)
	if err != nil {
		logErrorf("PIHOLE", "top clients error: %v", err)
		return nil
	}
	// Confirmed live shape: a flat array under "clients" with ip/name/count —
	// name is often empty (no reverse-DNS/DHCP hostname known), fall back to ip.
	var r struct {
		Clients []struct {
			IP    string `json:"ip"`
			Name  string `json:"name"`
			Count int    `json:"count"`
		} `json:"clients"`
	}
	if json.Unmarshal(raw, &r) == nil && len(r.Clients) > 0 {
		out := make([]PiHoleClient, 0, len(r.Clients))
		for _, c := range r.Clients {
			name := c.Name
			if name == "" {
				name = c.IP
			}
			out = append(out, PiHoleClient{Name: name, Count: c.Count})
		}
		return out
	}
	logErrorf("PIHOLE", "top clients: unexpected response: %s", strings.TrimSpace(string(raw)))
	return nil
}

func phV6Upstreams(integID, baseURL, pass string, skipTLS bool) []PiHoleUpstream {
	raw, err := phV6Get(integID, baseURL, pass, "/api/stats/upstreams", skipTLS)
	if err != nil {
		logErrorf("PIHOLE", "upstreams error: %v", err)
		return nil
	}
	// Confirmed live shape: a flat array of {ip, name, port, count, statistics},
	// plus a top-level total_queries — no explicit percentage field, so it's
	// derived from count/total_queries. Includes pseudo-sources ("blocklist",
	// "cache") alongside real upstream DNS servers, matching what Pi-hole's
	// own dashboard shows as "where queries were answered from."
	var r struct {
		Upstreams []struct {
			IP    string `json:"ip"`
			Name  string `json:"name"`
			Count int    `json:"count"`
		} `json:"upstreams"`
		TotalQueries int `json:"total_queries"`
	}
	if json.Unmarshal(raw, &r) == nil && len(r.Upstreams) > 0 && r.TotalQueries > 0 {
		out := make([]PiHoleUpstream, 0, len(r.Upstreams))
		for _, u := range r.Upstreams {
			label := u.Name
			if u.IP != "" && u.IP != u.Name {
				label = fmt.Sprintf("%s (%s)", u.Name, u.IP)
			}
			out = append(out, PiHoleUpstream{
				Name:    label,
				Percent: float64(u.Count) / float64(r.TotalQueries) * 100,
			})
		}
		sort.Slice(out, func(i, j int) bool { return out[i].Percent > out[j].Percent })
		return out
	}
	logErrorf("PIHOLE", "upstreams: unexpected response: %s", strings.TrimSpace(string(raw)))
	return nil
}

// phV6Lists fetches configured adlists (block and allow) — confirmed live
// shape: {"lists": [{"address","comment","enabled","type","number",...}]}.
// v6 only; no v5 equivalent is wired up here.
func phV6Lists(integID, baseURL, pass string, skipTLS bool) []PiHoleList {
	raw, err := phV6Get(integID, baseURL, pass, "/api/lists", skipTLS)
	if err != nil {
		logErrorf("PIHOLE", "lists error: %v", err)
		return nil
	}
	var r struct {
		Lists []struct {
			Address string `json:"address"`
			Comment string `json:"comment"`
			Enabled bool   `json:"enabled"`
			Type    string `json:"type"`
			Number  int    `json:"number"`
		} `json:"lists"`
	}
	if json.Unmarshal(raw, &r) != nil {
		logErrorf("PIHOLE", "lists: unexpected response: %s", strings.TrimSpace(string(raw)))
		return nil
	}
	out := make([]PiHoleList, 0, len(r.Lists))
	for _, l := range r.Lists {
		name := l.Comment
		if name == "" {
			name = l.Address
		}
		out = append(out, PiHoleList{Name: name, Enabled: l.Enabled, Type: l.Type, Count: l.Number})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Count > out[j].Count })
	return out
}

// ── v5 data fetchers ──────────────────────────────────────────────────────────

func phV5Summary(baseURL, token string, skipTLS bool) (piholeSummary, error) {
	raw, err := phV5Get(baseURL, token, "/admin/api.php?summaryRaw", skipTLS)
	if err != nil {
		return piholeSummary{}, err
	}
	var r struct {
		DomainsBeingBlocked int     `json:"domains_being_blocked"`
		DnsQueriesToday     int     `json:"dns_queries_today"`
		AdsBlockedToday     int     `json:"ads_blocked_today"`
		AdsPctToday         float64 `json:"ads_percentage_today"`
		UniqueDomains       int     `json:"unique_domains"`
		UniqueClients       int     `json:"unique_clients"`
		Status              string  `json:"status"` // "enabled" | "disabled"
	}
	if err := json.Unmarshal(raw, &r); err != nil {
		return piholeSummary{}, err
	}
	return piholeSummary{
		total:           r.DnsQueriesToday,
		blocked:         r.AdsBlockedToday,
		pctBlocked:      r.AdsPctToday,
		clients:         r.UniqueClients,
		domains:         r.UniqueDomains,
		gravity:         r.DomainsBeingBlocked,
		blockingEnabled: r.Status == "enabled",
	}, nil
}

func phV5OverTime(baseURL, token string, skipTLS bool) ([]int, []int) {
	raw, err := phV5Get(baseURL, token, "/admin/api.php?overTimeData10mins", skipTLS)
	if err != nil {
		return nil, nil
	}
	var r struct {
		DomainsOverTime map[string]int `json:"domains_over_time"`
		AdsOverTime     map[string]int `json:"ads_over_time"`
	}
	if err := json.Unmarshal(raw, &r); err != nil {
		return nil, nil
	}
	type entry struct {
		ts      int64
		total   int
		blocked int
	}
	var entries []entry
	for tsStr, count := range r.DomainsOverTime {
		ts, _ := strconv.ParseInt(tsStr, 10, 64)
		entries = append(entries, entry{ts: ts, total: count, blocked: r.AdsOverTime[tsStr]})
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].ts < entries[j].ts })
	if len(entries) > 144 {
		entries = entries[len(entries)-144:]
	}
	totals := make([]int, len(entries))
	blocked := make([]int, len(entries))
	for i, e := range entries {
		totals[i] = e.total
		blocked[i] = e.blocked
	}
	return totals, blocked
}

func phV5TopItems(baseURL, token string, skipTLS bool) ([]PiHoleDomain, []PiHoleDomain) {
	raw, err := phV5Get(baseURL, token, "/admin/api.php?topItems=10", skipTLS)
	if err != nil {
		return nil, nil
	}
	var r struct {
		TopQueries map[string]int `json:"top_queries"`
		TopAds     map[string]int `json:"top_ads"`
	}
	if err := json.Unmarshal(raw, &r); err != nil {
		return nil, nil
	}
	return phMapToDomains(r.TopQueries), phMapToDomains(r.TopAds)
}

func phV5TopClients(baseURL, token string, skipTLS bool) []PiHoleClient {
	raw, err := phV5Get(baseURL, token, "/admin/api.php?topClients=10", skipTLS)
	if err != nil {
		return nil
	}
	var r struct {
		TopSources map[string]int `json:"top_sources"`
	}
	if err := json.Unmarshal(raw, &r); err != nil {
		return nil
	}
	return phMapToClients(r.TopSources)
}

func phV5Upstreams(baseURL, token string, skipTLS bool) []PiHoleUpstream {
	raw, err := phV5Get(baseURL, token, "/admin/api.php?getForwardDests", skipTLS)
	if err != nil {
		return nil
	}
	var r struct {
		Destinations map[string]float64 `json:"forward_destinations"`
	}
	if err := json.Unmarshal(raw, &r); err != nil {
		return nil
	}
	var out []PiHoleUpstream
	for k, pct := range r.Destinations {
		// v5 names: "blocked|blocked", "cached|cached", "8.8.8.8#53|8.8.8.8"
		display := k
		if idx := strings.Index(k, "|"); idx >= 0 {
			display = k[:idx]
		}
		out = append(out, PiHoleUpstream{Name: display, Percent: pct})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Percent > out[j].Percent })
	return out
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func phMapToDomains(m map[string]int) []PiHoleDomain {
	out := make([]PiHoleDomain, 0, len(m))
	for name, count := range m {
		out = append(out, PiHoleDomain{Name: name, Count: count})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Count > out[j].Count })
	if len(out) > 10 {
		out = out[:10]
	}
	return out
}

func phMapToClients(m map[string]int) []PiHoleClient {
	out := make([]PiHoleClient, 0, len(m))
	for name, count := range m {
		out = append(out, PiHoleClient{Name: name, Count: count})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Count > out[j].Count })
	if len(out) > 10 {
		out = out[:10]
	}
	return out
}

// ── Panel data builder ────────────────────────────────────────────────────────

func fetchPiHolePanelData(db *sql.DB, cfg map[string]interface{}) (interface{}, error) {
	integID := stringVal(cfg, "integrationId")
	if integID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integID)
	if err != nil {
		return nil, err
	}
	if uiURL == "" {
		uiURL = apiURL
	}

	ver := phDetectVersion(integID, apiURL, skipTLS)
	days, _ := cfg["days"].(float64) // 0/absent → phRangeFromDays defaults to 1 (24h)

	pd := &PiHolePanelData{
		UIURL:         uiURL,
		IntegrationID: integID,
		Version:       ver,
		TopPermitted:  []PiHoleDomain{},
		TopBlocked:    []PiHoleDomain{},
		TopClients:    []PiHoleClient{},
		Upstreams:     []PiHoleUpstream{},
		Lists:         []PiHoleList{},
	}

	if ver == "v6" {
		sum, err := phV6Summary(integID, apiURL, apiKey, skipTLS)
		if err != nil {
			return nil, fmt.Errorf("summary: %w", err)
		}
		pd.TotalQueries = sum.total
		pd.BlockedQueries = sum.blocked
		pd.PercentBlocked = sum.pctBlocked
		pd.UniqueClients = sum.clients
		pd.UniqueDomains = sum.domains
		pd.GravityDomains = sum.gravity
		pd.GravityUpdated = sum.gravityUpdated
		pd.BlockingEnabled = phV6Blocking(integID, apiURL, apiKey, skipTLS)

		pd.OverTimeTotal, pd.OverTimeBlocked = phV6OverTime(integID, apiURL, apiKey, skipTLS, days)
		pd.TopPermitted = phV6TopDomains(integID, apiURL, apiKey, false, skipTLS, days)
		pd.TopBlocked = phV6TopDomains(integID, apiURL, apiKey, true, skipTLS, days)
		pd.TopClients = phV6TopClients(integID, apiURL, apiKey, skipTLS, days)
		pd.Upstreams = phV6Upstreams(integID, apiURL, apiKey, skipTLS)
		pd.Lists = phV6Lists(integID, apiURL, apiKey, skipTLS)
	} else {
		sum, err := phV5Summary(apiURL, apiKey, skipTLS)
		if err != nil {
			return nil, fmt.Errorf("summary: %w", err)
		}
		pd.TotalQueries = sum.total
		pd.BlockedQueries = sum.blocked
		pd.PercentBlocked = sum.pctBlocked
		pd.UniqueClients = sum.clients
		pd.UniqueDomains = sum.domains
		pd.GravityDomains = sum.gravity
		pd.BlockingEnabled = sum.blockingEnabled

		pd.OverTimeTotal, pd.OverTimeBlocked = phV5OverTime(apiURL, apiKey, skipTLS)
		pd.TopPermitted, pd.TopBlocked = phV5TopItems(apiURL, apiKey, skipTLS)
		pd.TopClients = phV5TopClients(apiURL, apiKey, skipTLS)
		pd.Upstreams = phV5Upstreams(apiURL, apiKey, skipTLS)
	}

	if pd.OverTimeTotal == nil {
		pd.OverTimeTotal = []int{}
	}
	if pd.OverTimeBlocked == nil {
		pd.OverTimeBlocked = []int{}
	}
	if pd.TopPermitted == nil {
		pd.TopPermitted = []PiHoleDomain{}
	}
	if pd.TopBlocked == nil {
		pd.TopBlocked = []PiHoleDomain{}
	}
	if pd.TopClients == nil {
		pd.TopClients = []PiHoleClient{}
	}
	if pd.Upstreams == nil {
		pd.Upstreams = []PiHoleUpstream{}
	}

	return pd, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testPiHoleConnection(apiURL, apiKey string, skipTLS bool) error {
	// Use a temporary integID for version cache during test
	tempID := "test:" + apiURL
	ver := phDetectVersion(tempID, apiURL, skipTLS)
	// Remove temp cache entry
	phVerCacheMu.Lock()
	delete(phVerCache, tempID)
	phVerCacheMu.Unlock()

	if ver == "v6" {
		_, _, err := phV6Login(apiURL, apiKey, skipTLS)
		if err != nil {
			return fmt.Errorf("Pi-hole v6 authentication failed: %w", err)
		}
		return nil
	}
	raw, err := phV5Get(apiURL, apiKey, "/admin/api.php?status", skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(raw, &r); err != nil || r.Status == "" {
		return fmt.Errorf("unexpected response — is this a Pi-hole v5 instance?")
	}
	return nil
}
