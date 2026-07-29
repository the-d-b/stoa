package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ── Gluetun types ─────────────────────────────────────────────────────────────

type GluetunPanelData struct {
	UIURL        string `json:"uiUrl"`
	Status       string `json:"status"`
	PublicIP     string `json:"publicIp"`
	Country      string `json:"country"`
	City         string `json:"city"`
	Region       string `json:"region,omitempty"`
	Hostname     string `json:"hostname,omitempty"`
	Organization string `json:"organization,omitempty"`
	Timezone     string `json:"timezone,omitempty"`
	Provider     string `json:"provider"`
	ServerName   string `json:"serverName"`
	VPNType      string `json:"vpnType,omitempty"`
	Protocol     string `json:"protocol,omitempty"`
	Port         int    `json:"port"`
	Warning      string `json:"warning,omitempty"`
}

// firstNonEmpty returns the first list argument that has at least one element —
// used to pick the most specific Gluetun server-selection field present.
func firstNonEmpty(lists ...[]string) []string {
	for _, l := range lists {
		if len(l) > 0 {
			return l
		}
	}
	return nil
}

func fetchGluetunPanelData(db *sql.DB, config map[string]interface{}) (*GluetunPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &GluetunPanelData{UIURL: uiURL}
	anyOK := false

	// VPN status
	if body, err := gluetunGet(apiURL, apiKey, "/v1/openvpn/status", skipTLS); err == nil {
		anyOK = true
		var s struct {
			Status string `json:"status"`
		}
		if json.Unmarshal(body, &s) == nil {
			data.Status = s.Status
		}
	} else {
		// Try wireguard status
		if body2, err2 := gluetunGet(apiURL, apiKey, "/v1/vpn/status", skipTLS); err2 == nil {
			anyOK = true
			var s struct {
				Status string `json:"status"`
			}
			if json.Unmarshal(body2, &s) == nil {
				data.Status = s.Status
			}
		} else {
			logErrorf("GLUETUN", "vpn status error: openvpn=%v wireguard=%v", err, err2)
		}
	}

	// Public IP + location. Gluetun v3.40+ requires an API key for this route
	// (while keeping the status/portforward routes public), so a missing or
	// wrong key silently loses the panel's IP and location.
	if body, err := gluetunGet(apiURL, apiKey, "/v1/publicip/ip", skipTLS); err == nil {
		anyOK = true
		var ip struct {
			PublicIP     string `json:"public_ip"`
			Country      string `json:"country"`
			City         string `json:"city"`
			Region       string `json:"region"`
			Hostname     string `json:"hostname"`
			Organization string `json:"organization"`
			Timezone     string `json:"timezone"`
		}
		if json.Unmarshal(body, &ip) == nil {
			data.PublicIP = ip.PublicIP
			data.Country = ip.Country
			data.City = ip.City
			data.Region = ip.Region
			data.Hostname = ip.Hostname
			data.Organization = ip.Organization
			data.Timezone = ip.Timezone
		}
	} else {
		logErrorf("GLUETUN", "publicip error: %v", err)
		if gluetunAuthDenied(err) {
			if apiKey == "" {
				data.Warning = "Public IP needs an API key — Gluetun v3.40+ restricts this route. See the Gluetun integration docs."
			} else {
				data.Warning = "Public IP denied — check the API key role config in Gluetun (auth/config.toml routes)."
			}
		}
	}

	// Port forwarding — try both endpoint variants
	var pfErr error
	for _, pfPath := range []string{"/v1/portforward", "/v1/openvpn/portforwarded"} {
		if body, err := gluetunGet(apiURL, apiKey, pfPath, skipTLS); err == nil {
			anyOK = true
			pfErr = nil
			var pf struct {
				Port int `json:"port"`
			}
			if json.Unmarshal(body, &pf) == nil && pf.Port > 0 {
				data.Port = pf.Port
				break
			}
		} else {
			pfErr = err
		}
	}
	if pfErr != nil {
		logErrorf("GLUETUN", "port forwarding error: %v", pfErr)
	}

	// Server info. The settings response nests provider details, and the
	// chosen "server" is a selection (hostnames/cities/regions/…) rather than a
	// single hostname — so surface the most specific set that's populated.
	if body, err := gluetunGet(apiURL, apiKey, "/v1/vpn/settings", skipTLS); err == nil {
		anyOK = true
		var settings struct {
			Type     string `json:"type"`
			Provider struct {
				Name            string `json:"name"`
				ServerSelection struct {
					Countries []string `json:"countries"`
					Regions   []string `json:"regions"`
					Cities    []string `json:"cities"`
					Hostnames []string `json:"hostnames"`
					Names     []string `json:"names"`
					OpenVPN   struct {
						Protocol string `json:"protocol"`
					} `json:"openvpn"`
				} `json:"server_selection"`
			} `json:"provider"`
		}
		if json.Unmarshal(body, &settings) == nil {
			data.Provider = settings.Provider.Name
			data.VPNType = settings.Type
			data.Protocol = settings.Provider.ServerSelection.OpenVPN.Protocol
			sel := settings.Provider.ServerSelection
			data.ServerName = strings.Join(
				firstNonEmpty(sel.Hostnames, sel.Names, sel.Cities, sel.Regions, sel.Countries), ", ")
		}
	} else {
		logErrorf("GLUETUN", "vpn/settings error: %v", err)
	}

	// Every endpoint failed — surface the error instead of rendering zeros
	if !anyOK {
		return nil, fmt.Errorf("gluetun unreachable — check URL, API key, and TLS settings (see server log for details)")
	}

	return data, nil
}

// gluetunAuthDenied reports whether a gluetunGet error was an auth rejection.
func gluetunAuthDenied(err error) bool {
	return err != nil && (strings.Contains(err.Error(), "HTTP 401") || strings.Contains(err.Error(), "HTTP 403"))
}

func gluetunGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	url := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	if apiKey != "" {
		req.Header.Set("X-API-Key", apiKey)
	}
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Gluetun", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func testGluetunConnection(apiURL, apiKey string, skipTLS bool) error {
	body, err := gluetunGet(apiURL, apiKey, "/v1/vpn/status", skipTLS)
	if err != nil {
		body, err = gluetunGet(apiURL, apiKey, "/v1/openvpn/status", skipTLS)
	}
	if err != nil {
		return err
	}
	var resp map[string]interface{}
	if json.Unmarshal(body, &resp) != nil {
		return fmt.Errorf("unexpected response from Gluetun")
	}
	return nil
}
