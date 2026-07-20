package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

// ── Session cache ─────────────────────────────────────────────────────────────

var wgEasySessionCache = struct {
	sync.RWMutex
	m map[string]wgEasySession
}{m: make(map[string]wgEasySession)}

type wgEasySession struct {
	cookie    string // "name=value; name2=value2" ready to send as Cookie header
	expiresAt time.Time
}

// ── Types ─────────────────────────────────────────────────────────────────────

type WGEasyClient struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	Address           string `json:"address"`
	Enabled           bool   `json:"enabled"`
	Connected         bool   `json:"connected"`         // handshake within 3 minutes
	LastHandshake     string `json:"lastHandshake"`     // ISO timestamp or ""
	LastHandshakeSecs int64  `json:"lastHandshakeSecs"` // seconds since handshake; -1 = never
	TransferRx        int64  `json:"transferRx"`        // bytes server received from client
	TransferTx        int64  `json:"transferTx"`        // bytes server sent to client
	Endpoint          string `json:"endpoint"`          // client's real IP:port, empty if offline
}

type WGEasyPanelData struct {
	UIURL            string         `json:"uiUrl"`
	IntegrationID    string         `json:"integrationId"`
	ServerRunning    bool           `json:"serverRunning"`
	ServerAddress    string         `json:"serverAddress"`
	ServerPort       int            `json:"serverPort"`
	Clients          []WGEasyClient `json:"clients"`
	TotalClients     int            `json:"totalClients"`
	ConnectedClients int            `json:"connectedClients"`
	EnabledClients   int            `json:"enabledClients"`
	DisabledClients  int            `json:"disabledClients"`
	TotalRx          int64          `json:"totalRx"`
	TotalTx          int64          `json:"totalTx"`
}

// ── Auth ──────────────────────────────────────────────────────────────────────

func wgEasyAuth(baseURL, password string, skipTLS bool) (string, error) {
	payload, _ := json.Marshal(map[string]string{"password": password})
	client := httpClient(skipTLS)
	req, err := http.NewRequest("POST", strings.TrimRight(baseURL, "/")+"/api/session", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return "", fmt.Errorf("authentication failed: check password")
	}
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("HTTP %d from wg-easy", resp.StatusCode)
	}
	// Collect all Set-Cookie values into a single Cookie header string
	var parts []string
	for _, sc := range resp.Header["Set-Cookie"] {
		if idx := strings.Index(sc, ";"); idx > 0 {
			parts = append(parts, strings.TrimSpace(sc[:idx]))
		} else {
			parts = append(parts, strings.TrimSpace(sc))
		}
	}
	return strings.Join(parts, "; "), nil
}

func wgEasyGetSession(cacheKey, baseURL, password string, skipTLS bool) (string, error) {
	if password == "" {
		return "", nil // no-auth instance
	}
	wgEasySessionCache.RLock()
	cached, ok := wgEasySessionCache.m[cacheKey]
	wgEasySessionCache.RUnlock()
	if ok && time.Now().Before(cached.expiresAt) {
		return cached.cookie, nil
	}
	cookie, err := wgEasyAuth(baseURL, password, skipTLS)
	if err != nil {
		return "", err
	}
	wgEasySessionCache.Lock()
	wgEasySessionCache.m[cacheKey] = wgEasySession{cookie: cookie, expiresAt: time.Now().Add(23 * time.Hour)}
	wgEasySessionCache.Unlock()
	return cookie, nil
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func wgEasyGet(baseURL, cookie, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case 401, 403:
		return nil, fmt.Errorf("authentication failed")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from wg-easy", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// wgEasyUnwrap handles both bare responses and {"status":"success","data":...} wrappers.
func wgEasyUnwrap(body []byte) json.RawMessage {
	var wrapper struct {
		Status string          `json:"status"`
		Data   json.RawMessage `json:"data"`
	}
	if json.Unmarshal(body, &wrapper) == nil && len(wrapper.Data) > 0 && wrapper.Status != "" {
		return wrapper.Data
	}
	return body
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func wgEasyStr(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func wgEasyBool(v interface{}) bool {
	switch n := v.(type) {
	case bool:
		return n
	case float64:
		return n != 0
	}
	return false
}

func wgEasyInt64(v interface{}) int64 {
	if n, ok := v.(float64); ok {
		return int64(n)
	}
	return 0
}

var wgEasyHandshakeFormats = []string{
	time.RFC3339Nano,
	time.RFC3339,
	"2006-01-02T15:04:05.000Z",
	"2006-01-02T15:04:05Z",
}

func wgEasyParseHandshake(s string) (secAgo int64, connected bool) {
	if s == "" || s == "null" {
		return -1, false
	}
	for _, f := range wgEasyHandshakeFormats {
		if t, err := time.Parse(f, s); err == nil {
			secs := int64(time.Since(t).Seconds())
			return secs, secs >= 0 && secs < 180
		}
	}
	return -1, false
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchWGEasyPanelData(db *sql.DB, config map[string]interface{}) (*WGEasyPanelData, error) {
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

	cookie, err := wgEasyGetSession(integrationID, baseURL, apiKey, skipTLS)
	if err != nil {
		return nil, err
	}

	// Re-auth wrapper: clears cache and retries once on auth failure.
	fetch := func(path string) ([]byte, error) {
		data, ferr := wgEasyGet(baseURL, cookie, path, skipTLS)
		if ferr != nil && strings.Contains(ferr.Error(), "authentication failed") && apiKey != "" {
			wgEasySessionCache.Lock()
			delete(wgEasySessionCache.m, integrationID)
			wgEasySessionCache.Unlock()
			cookie, ferr = wgEasyGetSession(integrationID, baseURL, apiKey, skipTLS)
			if ferr != nil {
				return nil, ferr
			}
			return wgEasyGet(baseURL, cookie, path, skipTLS)
		}
		return data, ferr
	}

	out := &WGEasyPanelData{UIURL: uiURL, IntegrationID: integrationID}

	// ── Server status ─────────────────────────────────────────────────────────
	if body, err := fetch("/api/wireguard/server"); err == nil {
		data := wgEasyUnwrap(body)
		var srv map[string]interface{}
		if json.Unmarshal(data, &srv) == nil {
			out.ServerRunning = wgEasyBool(srv["running"])
			out.ServerAddress = wgEasyStr(srv["address"])
			if p, ok := srv["listenPort"].(float64); ok {
				out.ServerPort = int(p)
			}
		}
	} else {
		// Older versions may not have this endpoint — assume running
		out.ServerRunning = true
	}

	// ── Clients ───────────────────────────────────────────────────────────────
	body, err := fetch("/api/client")
	if err != nil {
		return nil, fmt.Errorf("clients: %w", err)
	}
	data := wgEasyUnwrap(body)
	var rawClients []map[string]interface{}
	if err := json.Unmarshal(data, &rawClients); err != nil {
		return nil, fmt.Errorf("parsing clients: %w", err)
	}

	for _, c := range rawClients {
		// Handle both "latestHandshakeAt" (v14) and "lastHandshake" (v15+) field names
		hs := wgEasyStr(c["latestHandshakeAt"])
		if hs == "" {
			hs = wgEasyStr(c["lastHandshake"])
		}

		secAgo, connected := wgEasyParseHandshake(hs)
		enabled := wgEasyBool(c["enabled"])

		// Handle both transferRx/transferTx and transferRy/transferTy (API typo variants)
		rx := wgEasyInt64(c["transferRx"])
		tx := wgEasyInt64(c["transferTx"])
		if tx == 0 {
			tx = wgEasyInt64(c["transferTy"]) // known API typo in some versions
		}

		client := WGEasyClient{
			ID:                wgEasyStr(c["id"]),
			Name:              wgEasyStr(c["name"]),
			Address:           wgEasyStr(c["address"]),
			Enabled:           enabled,
			Connected:         connected && enabled,
			LastHandshake:     hs,
			LastHandshakeSecs: secAgo,
			TransferRx:        rx,
			TransferTx:        tx,
			Endpoint:          wgEasyStr(c["endpoint"]),
		}
		out.Clients = append(out.Clients, client)
		out.TotalClients++
		if enabled {
			out.EnabledClients++
			if connected {
				out.ConnectedClients++
			}
		} else {
			out.DisabledClients++
		}
		out.TotalRx += rx
		out.TotalTx += tx
	}

	// Sort: connected first (by tx desc), then enabled/inactive (by recency), then disabled
	sort.SliceStable(out.Clients, func(i, j int) bool {
		ci, cj := out.Clients[i], out.Clients[j]
		if ci.Connected != cj.Connected {
			return ci.Connected
		}
		if ci.Enabled != cj.Enabled {
			return ci.Enabled
		}
		// Among same group: most recent handshake first; never-seen last
		if ci.LastHandshakeSecs < 0 && cj.LastHandshakeSecs >= 0 {
			return false
		}
		if cj.LastHandshakeSecs < 0 && ci.LastHandshakeSecs >= 0 {
			return true
		}
		return ci.LastHandshakeSecs < cj.LastHandshakeSecs
	})

	return out, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testWGEasyConnection(baseURL, apiKey string, skipTLS bool) error {
	cacheKey := "test:" + baseURL
	cookie, err := wgEasyGetSession(cacheKey, baseURL, apiKey, skipTLS)
	if err != nil {
		return err
	}
	body, err := wgEasyGet(baseURL, cookie, "/api/client", skipTLS)
	if err != nil {
		return err
	}
	data := wgEasyUnwrap(body)
	var result []interface{}
	if json.Unmarshal(data, &result) != nil {
		return fmt.Errorf("unexpected response from wg-easy")
	}
	return nil
}
