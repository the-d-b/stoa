package handlers

import (
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

// ── Types ─────────────────────────────────────────────────────────────────────

type CloudflareZone struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"` // "active", "pending", "initializing", "moved"
	Plan   string `json:"plan"`
	Paused bool   `json:"paused"`
	// Analytics (last 24h)
	Requests       int64 `json:"requests"`
	CachedRequests int64 `json:"cachedRequests"`
	Bandwidth      int64 `json:"bandwidth"`   // bytes
	Threats        int64 `json:"threats"`
	Uniques        int64 `json:"uniques"`
	PageViews      int64 `json:"pageViews"`
}

type CloudflareIngress struct {
	Hostname string `json:"hostname"`
	Service  string `json:"service"`
	Path     string `json:"path,omitempty"`
}

type CloudflareTunnelConn struct {
	ColoName           string `json:"coloName"`
	IsPendingReconnect bool   `json:"isPendingReconnect"`
}

type CloudflareTunnel struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Status      string                 `json:"status"` // "healthy","degraded","down","inactive"
	CreatedAt   string                 `json:"createdAt"`
	Connections []CloudflareTunnelConn `json:"connections"`
	Ingress     []CloudflareIngress    `json:"ingress"`
}

type CloudflarePanelData struct {
	UIURL          string             `json:"uiUrl"`
	IntegrationID  string             `json:"integrationId"`
	Zones          []CloudflareZone   `json:"zones"`
	Tunnels        []CloudflareTunnel `json:"tunnels"`
	TotalZones     int                `json:"totalZones"`
	ActiveZones    int                `json:"activeZones"`
	TotalTunnels   int                `json:"totalTunnels"`
	HealthyTunnels int                `json:"healthyTunnels"`
	DownTunnels    int                `json:"downTunnels"`
	// Aggregate 24h across all zones
	TotalRequests  int64 `json:"totalRequests"`
	TotalThreats   int64 `json:"totalThreats"`
	TotalBandwidth int64 `json:"totalBandwidth"`
	TotalUniques   int64 `json:"totalUniques"`
}

// ── HTTP client ───────────────────────────────────────────────────────────────

const cfAPIBase = "https://api.cloudflare.com/client/v4"

func cfGet(apiKey string, path string) ([]byte, error) {
	req, err := http.NewRequest("GET", cfAPIBase+path, nil)
	if err != nil {
		return nil, err
	}
	if strings.Contains(apiKey, ":") {
		// legacy: email:globalApiKey
		idx := strings.Index(apiKey, ":")
		req.Header.Set("X-Auth-Email", apiKey[:idx])
		req.Header.Set("X-Auth-Key", apiKey[idx+1:])
	} else {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed (HTTP %d) — check API token permissions", resp.StatusCode)
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("HTTP %d from %s", resp.StatusCode, path)
	}
	return io.ReadAll(resp.Body)
}

// cfResult unmarshals the standard {"result":...,"success":...} envelope.
func cfResult(body []byte, dest interface{}) error {
	var env struct {
		Result  json.RawMessage `json:"result"`
		Success bool            `json:"success"`
		Errors  []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(body, &env); err != nil {
		return err
	}
	if !env.Success && len(env.Errors) > 0 {
		return fmt.Errorf("API error: %s", env.Errors[0].Message)
	}
	return json.Unmarshal(env.Result, dest)
}

// ── Zones ─────────────────────────────────────────────────────────────────────

func cfFetchZones(apiKey string) ([]CloudflareZone, string, error) {
	body, err := cfGet(apiKey, "/zones?per_page=50&status=active")
	if err != nil {
		return nil, "", err
	}
	var raw []struct {
		ID      string `json:"id"`
		Name    string `json:"name"`
		Status  string `json:"status"`
		Paused  bool   `json:"paused"`
		Plan    struct {
			Name string `json:"name"`
		} `json:"plan"`
		Account struct {
			ID string `json:"id"`
		} `json:"account"`
	}
	if err := cfResult(body, &raw); err != nil {
		return nil, "", err
	}

	accountID := ""
	zones := make([]CloudflareZone, 0, len(raw))
	for _, r := range raw {
		if accountID == "" {
			accountID = r.Account.ID
		}
		zones = append(zones, CloudflareZone{
			ID:     r.ID,
			Name:   r.Name,
			Status: r.Status,
			Plan:   r.Plan.Name,
			Paused: r.Paused,
		})
	}
	return zones, accountID, nil
}

func cfFetchZoneAnalytics(apiKey, zoneID string) (requests, cached, bandwidth, threats, uniques, pageviews int64) {
	body, err := cfGet(apiKey, "/zones/"+zoneID+"/analytics/dashboard?since=-1440&continuous=false")
	if err != nil {
		return
	}
	var result struct {
		Totals struct {
			Requests struct {
				All    int64 `json:"all"`
				Cached int64 `json:"cached"`
			} `json:"requests"`
			Bandwidth struct {
				All int64 `json:"all"`
			} `json:"bandwidth"`
			Threats struct {
				All int64 `json:"all"`
			} `json:"threats"`
			Uniques struct {
				All int64 `json:"all"`
			} `json:"uniques"`
			PageViews struct {
				All int64 `json:"all"`
			} `json:"pageviews"`
		} `json:"totals"`
	}
	if err := cfResult(body, &result); err != nil {
		return
	}
	requests = result.Totals.Requests.All
	cached = result.Totals.Requests.Cached
	bandwidth = result.Totals.Bandwidth.All
	threats = result.Totals.Threats.All
	uniques = result.Totals.Uniques.All
	pageviews = result.Totals.PageViews.All
	return
}

// ── Tunnels ───────────────────────────────────────────────────────────────────

func cfFetchTunnels(apiKey, accountID string) ([]CloudflareTunnel, error) {
	body, err := cfGet(apiKey, "/accounts/"+accountID+"/cfd_tunnel?per_page=100&is_deleted=false")
	if err != nil {
		return nil, err
	}
	var raw []struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		Status      string `json:"status"`
		CreatedAt   string `json:"created_at"`
		Connections []struct {
			ColoName           string `json:"colo_name"`
			IsPendingReconnect bool   `json:"is_pending_reconnect"`
		} `json:"connections"`
	}
	if err := cfResult(body, &raw); err != nil {
		return nil, err
	}

	tunnels := make([]CloudflareTunnel, 0, len(raw))
	for _, r := range raw {
		t := CloudflareTunnel{
			ID:        r.ID,
			Name:      r.Name,
			Status:    r.Status,
			CreatedAt: r.CreatedAt,
		}
		for _, c := range r.Connections {
			t.Connections = append(t.Connections, CloudflareTunnelConn{
				ColoName:           c.ColoName,
				IsPendingReconnect: c.IsPendingReconnect,
			})
		}
		tunnels = append(tunnels, t)
	}
	return tunnels, nil
}

func cfFetchTunnelIngress(apiKey, accountID, tunnelID string) []CloudflareIngress {
	body, err := cfGet(apiKey, "/accounts/"+accountID+"/cfd_tunnel/"+tunnelID+"/configurations")
	if err != nil {
		return nil
	}
	var result struct {
		Config struct {
			Ingress []struct {
				Hostname string `json:"hostname"`
				Service  string `json:"service"`
				Path     string `json:"path"`
			} `json:"ingress"`
		} `json:"config"`
	}
	if err := cfResult(body, &result); err != nil {
		return nil
	}
	out := make([]CloudflareIngress, 0)
	for _, r := range result.Config.Ingress {
		// Skip the catch-all fallback rule (no hostname)
		if r.Hostname == "" {
			continue
		}
		out = append(out, CloudflareIngress{
			Hostname: r.Hostname,
			Service:  r.Service,
			Path:     r.Path,
		})
	}
	return out
}

// ── Panel data builder ────────────────────────────────────────────────────────

func fetchCloudflarePanelData(db *sql.DB, config map[string]interface{}) (*CloudflarePanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	_, uiURL, apiKey, _, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if apiKey == "" {
		return nil, fmt.Errorf("no API token configured — add a secret with your Cloudflare API token")
	}

	// 1. Fetch zones (also gets accountID)
	zones, accountID, err := cfFetchZones(apiKey)
	if err != nil {
		return nil, fmt.Errorf("zones: %w", err)
	}

	// 2. Fetch analytics for each zone concurrently (cap at 10)
	maxAnalytics := 10
	if len(zones) < maxAnalytics {
		maxAnalytics = len(zones)
	}
	var wg sync.WaitGroup
	for i := 0; i < maxAnalytics; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			req, cached, bw, threats, uniques, pv := cfFetchZoneAnalytics(apiKey, zones[idx].ID)
			zones[idx].Requests = req
			zones[idx].CachedRequests = cached
			zones[idx].Bandwidth = bw
			zones[idx].Threats = threats
			zones[idx].Uniques = uniques
			zones[idx].PageViews = pv
		}(i)
	}
	wg.Wait()

	// Sort zones by request volume desc
	sort.Slice(zones, func(i, j int) bool {
		return zones[i].Requests > zones[j].Requests
	})

	d := &CloudflarePanelData{
		UIURL:         uiURL,
		IntegrationID: integrationID,
		Zones:         zones,
		TotalZones:    len(zones),
	}
	for i := range zones {
		if zones[i].Status == "active" && !zones[i].Paused {
			d.ActiveZones++
		}
		d.TotalRequests += zones[i].Requests
		d.TotalThreats += zones[i].Threats
		d.TotalBandwidth += zones[i].Bandwidth
		d.TotalUniques += zones[i].Uniques
	}

	// 3. Fetch tunnels (requires accountID)
	if accountID != "" {
		tunnels, err := cfFetchTunnels(apiKey, accountID)
		if err == nil {
			// 4. Fetch ingress config for each non-inactive tunnel concurrently
			var tmu sync.Mutex
			var twg sync.WaitGroup
			for i := range tunnels {
				if tunnels[i].Status == "inactive" {
					continue
				}
				twg.Add(1)
				go func(idx int) {
					defer twg.Done()
					ingress := cfFetchTunnelIngress(apiKey, accountID, tunnels[idx].ID)
					tmu.Lock()
					tunnels[idx].Ingress = ingress
					tmu.Unlock()
				}(i)
			}
			twg.Wait()

			// Sort: healthy first, then degraded, then down, then inactive
			sort.Slice(tunnels, func(i, j int) bool {
				return cfTunnelPriority(tunnels[i].Status) < cfTunnelPriority(tunnels[j].Status)
			})

			d.Tunnels = tunnels
			d.TotalTunnels = len(tunnels)
			for _, t := range tunnels {
				switch t.Status {
				case "healthy":
					d.HealthyTunnels++
				case "degraded", "down":
					d.DownTunnels++
				}
			}
		}
	}

	return d, nil
}

func cfTunnelPriority(status string) int {
	switch status {
	case "healthy":
		return 0
	case "degraded":
		return 1
	case "down":
		return 2
	default: // inactive
		return 3
	}
}

// ── Connection test ───────────────────────────────────────────────────────────

func testCloudflareConnection(_, apiKey string, _ bool) error {
	body, err := cfGet(apiKey, "/user/tokens/verify")
	if err != nil {
		// Try zones as fallback (email:key auth doesn't support /user/tokens/verify)
		body2, err2 := cfGet(apiKey, "/zones?per_page=1")
		if err2 != nil {
			return fmt.Errorf("authentication failed: %w", err)
		}
		var check struct{ Success bool `json:"success"` }
		if json.Unmarshal(body2, &check) != nil || !check.Success {
			return fmt.Errorf("invalid response from Cloudflare API")
		}
		return nil
	}
	var result struct {
		Result struct {
			Status string `json:"status"`
		} `json:"result"`
		Success bool `json:"success"`
	}
	if err := json.Unmarshal(body, &result); err != nil || !result.Success {
		return fmt.Errorf("invalid API token")
	}
	if result.Result.Status != "active" {
		return fmt.Errorf("API token status: %s (expected active)", result.Result.Status)
	}
	return nil
}
