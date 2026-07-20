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

type TailscaleDevice struct {
	ID                        string   `json:"id"`
	Name                      string   `json:"name"`
	Hostname                  string   `json:"hostname"`
	Addresses                 []string `json:"addresses"`
	User                      string   `json:"user"`
	OS                        string   `json:"os"`
	ClientVersion             string   `json:"clientVersion"`
	UpdateAvailable           bool     `json:"updateAvailable"`
	Created                   string   `json:"created"`
	LastSeen                  string   `json:"lastSeen"`
	Expires                   string   `json:"expires"`
	Authorized                bool     `json:"authorized"`
	IsExternal                bool     `json:"isExternal"`
	Tags                      []string `json:"tags"`
	KeyExpiryDisabled         bool     `json:"keyExpiryDisabled"`
	BlocksIncomingConnections bool     `json:"blocksIncomingConnections"`
	ConnectedToControl        bool     `json:"connectedToControl"`
	AdvertisedRoutes          []string `json:"advertisedRoutes"`
	EnabledRoutes             []string `json:"enabledRoutes"`
	// Derived
	IsOnline       bool `json:"isOnline"`
	IsExitNode     bool `json:"isExitNode"`
	IsSubnetRouter bool `json:"isSubnetRouter"`
	ExpiringIn     int  `json:"expiringIn"` // days until expiry; -1 = disabled
	KeyExpired     bool `json:"keyExpired"`
}

type TailscaleKey struct {
	ID          string `json:"id"`
	Description string `json:"description"`
	Created     string `json:"created"`
	Expires     string `json:"expires"`
	Reusable    bool   `json:"reusable"`
	Ephemeral   bool   `json:"ephemeral"`
	ExpiringIn  int    `json:"expiringIn"` // days until expiry; -1 = never
	Expired     bool   `json:"expired"`
}

type TailscalePanelData struct {
	UIURL               string            `json:"uiUrl"`
	IntegrationID       string            `json:"integrationId"`
	Devices             []TailscaleDevice `json:"devices"`
	TotalDevices        int               `json:"totalDevices"`
	OnlineDevices       int               `json:"onlineDevices"`
	OfflineDevices      int               `json:"offlineDevices"`
	UpdatesAvailable    int               `json:"updatesAvailable"`
	ExitNodes           int               `json:"exitNodes"`
	SubnetRouters       int               `json:"subnetRouters"`
	UnauthorizedDevices int               `json:"unauthorizedDevices"`
	ExpiringDevices     int               `json:"expiringDevices"` // expired or expiring within 30 days
	Keys                []TailscaleKey    `json:"keys"`
	ExpiringKeys        int               `json:"expiringKeys"`
	ExpiredKeys         int               `json:"expiredKeys"`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func tsIsExitNode(routes []string) bool {
	for _, r := range routes {
		if r == "0.0.0.0/0" || r == "::/0" {
			return true
		}
	}
	return false
}

func tsIsSubnetRouter(routes []string) bool {
	for _, r := range routes {
		if r != "0.0.0.0/0" && r != "::/0" {
			return true
		}
	}
	return false
}

func tsExpiringIn(expires string, disabled bool) (daysLeft int, expired bool) {
	if disabled || expires == "" {
		return -1, false
	}
	t, err := time.Parse(time.RFC3339, expires)
	if err != nil {
		return -1, false
	}
	days := int(time.Until(t).Hours() / 24)
	if days < 0 {
		return 0, true
	}
	return days, false
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func tailscaleGet(apiKey, path string) ([]byte, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", "https://api.tailscale.com"+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed: check your API key")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Tailscale API", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchTailscalePanelData(db *sql.DB, config map[string]interface{}) (*TailscalePanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("integrationId required")
	}
	apiURL, uiURL, apiKey, _, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if apiKey == "" {
		return nil, fmt.Errorf("API key required (tskey-api-...)")
	}

	// URL field = tailnet name. Blank or starts with "http" → use "-" (default tailnet).
	tailnet := "-"
	if apiURL != "" && !strings.HasPrefix(apiURL, "http") {
		tailnet = strings.TrimSpace(apiURL)
	}
	if uiURL == "" {
		uiURL = "https://login.tailscale.com/admin/machines"
	}

	body, err := tailscaleGet(apiKey, fmt.Sprintf("/api/v2/tailnet/%s/devices?fields=all", tailnet))
	if err != nil {
		return nil, err
	}

	var raw struct {
		Devices []struct {
			ID                        string   `json:"id"`
			Name                      string   `json:"name"`
			Hostname                  string   `json:"hostname"`
			Addresses                 []string `json:"addresses"`
			User                      string   `json:"user"`
			OS                        string   `json:"os"`
			ClientVersion             string   `json:"clientVersion"`
			UpdateAvailable           bool     `json:"updateAvailable"`
			Created                   string   `json:"created"`
			LastSeen                  string   `json:"lastSeen"`
			Expires                   string   `json:"expires"`
			Authorized                bool     `json:"authorized"`
			IsExternal                bool     `json:"isExternal"`
			Tags                      []string `json:"tags"`
			KeyExpiryDisabled         bool     `json:"keyExpiryDisabled"`
			BlocksIncomingConnections bool     `json:"blocksIncomingConnections"`
			ConnectedToControl        bool     `json:"connectedToControl"`
			AdvertisedRoutes          []string `json:"advertisedRoutes"`
			EnabledRoutes             []string `json:"enabledRoutes"`
		} `json:"devices"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("parsing devices: %w", err)
	}

	out := &TailscalePanelData{UIURL: uiURL, IntegrationID: integrationID}

	for _, d := range raw.Devices {
		isExit := tsIsExitNode(d.EnabledRoutes)
		isSubnet := tsIsSubnetRouter(d.EnabledRoutes)
		daysLeft, expired := tsExpiringIn(d.Expires, d.KeyExpiryDisabled)

		dev := TailscaleDevice{
			ID:                        d.ID,
			Name:                      d.Name,
			Hostname:                  d.Hostname,
			Addresses:                 d.Addresses,
			User:                      d.User,
			OS:                        d.OS,
			ClientVersion:             d.ClientVersion,
			UpdateAvailable:           d.UpdateAvailable,
			Created:                   d.Created,
			LastSeen:                  d.LastSeen,
			Expires:                   d.Expires,
			Authorized:                d.Authorized,
			IsExternal:                d.IsExternal,
			Tags:                      d.Tags,
			KeyExpiryDisabled:         d.KeyExpiryDisabled,
			BlocksIncomingConnections: d.BlocksIncomingConnections,
			ConnectedToControl:        d.ConnectedToControl,
			AdvertisedRoutes:          d.AdvertisedRoutes,
			EnabledRoutes:             d.EnabledRoutes,
			IsOnline:                  d.ConnectedToControl,
			IsExitNode:                isExit,
			IsSubnetRouter:            isSubnet,
			ExpiringIn:                daysLeft,
			KeyExpired:                expired,
		}
		out.Devices = append(out.Devices, dev)
		out.TotalDevices++
		if d.ConnectedToControl {
			out.OnlineDevices++
		} else {
			out.OfflineDevices++
		}
		if d.UpdateAvailable {
			out.UpdatesAvailable++
		}
		if isExit {
			out.ExitNodes++
		}
		if isSubnet {
			out.SubnetRouters++
		}
		if !d.Authorized {
			out.UnauthorizedDevices++
		}
		if expired || (daysLeft >= 0 && daysLeft <= 30) {
			out.ExpiringDevices++
		}
	}

	// Sort: online first; within online: exit nodes, then subnet routers, then normal.
	// Within each tier: alphabetical by name.
	sort.SliceStable(out.Devices, func(i, j int) bool {
		di, dj := out.Devices[i], out.Devices[j]
		if di.IsOnline != dj.IsOnline {
			return di.IsOnline
		}
		if di.IsExitNode != dj.IsExitNode {
			return di.IsExitNode
		}
		if di.IsSubnetRouter != dj.IsSubnetRouter {
			return di.IsSubnetRouter
		}
		return strings.ToLower(di.Name) < strings.ToLower(dj.Name)
	})

	// Fetch auth keys — non-fatal if token lacks keys:read scope
	if keysBody, kErr := tailscaleGet(apiKey, fmt.Sprintf("/api/v2/tailnet/%s/keys", tailnet)); kErr == nil {
		var rawKeys struct {
			Keys []struct {
				ID           string `json:"id"`
				Description  string `json:"description"`
				Created      string `json:"created"`
				Expires      string `json:"expires"`
				Revoked      string `json:"revoked"`
				Invalid      bool   `json:"invalid"`
				Capabilities struct {
					Devices struct {
						Create struct {
							Reusable  bool `json:"reusable"`
							Ephemeral bool `json:"ephemeral"`
						} `json:"create"`
					} `json:"devices"`
				} `json:"capabilities"`
			} `json:"keys"`
		}
		if json.Unmarshal(keysBody, &rawKeys) == nil {
			for _, k := range rawKeys.Keys {
				if k.Invalid || (k.Revoked != "" && k.Revoked != "0001-01-01T00:00:00Z") {
					continue
				}
				daysLeft, expired := tsExpiringIn(k.Expires, false)
				out.Keys = append(out.Keys, TailscaleKey{
					ID:          k.ID,
					Description: k.Description,
					Created:     k.Created,
					Expires:     k.Expires,
					Reusable:    k.Capabilities.Devices.Create.Reusable,
					Ephemeral:   k.Capabilities.Devices.Create.Ephemeral,
					ExpiringIn:  daysLeft,
					Expired:     expired,
				})
				if expired {
					out.ExpiredKeys++
				} else if daysLeft >= 0 && daysLeft <= 30 {
					out.ExpiringKeys++
				}
			}
		}
	}

	return out, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testTailscaleConnection(baseURL, apiKey string, skipTLS bool) error {
	body, err := tailscaleGet(apiKey, "/api/v2/tailnet/-/devices")
	if err != nil {
		return err
	}
	var result struct {
		Devices []interface{} `json:"devices"`
	}
	if json.Unmarshal(body, &result) != nil {
		return fmt.Errorf("unexpected response from Tailscale API")
	}
	return nil
}
