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
	UIURL      string `json:"uiUrl"`
	Status     string `json:"status"`
	PublicIP   string `json:"publicIp"`
	Country    string `json:"country"`
	City       string `json:"city"`
	Hostname   string `json:"hostname"`
	Provider   string `json:"provider"`
	ServerName string `json:"serverName"`
	Port       int    `json:"port"`
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

	// VPN status
	if body, err := gluetunGet(apiURL, apiKey, "/v1/openvpn/status", skipTLS); err == nil {
		var s struct {
			Status string `json:"status"`
		}
		if json.Unmarshal(body, &s) == nil {
			data.Status = s.Status
		}
	} else {
		// Try wireguard status
		if body2, err2 := gluetunGet(apiURL, apiKey, "/v1/vpn/status", skipTLS); err2 == nil {
			var s struct {
				Status string `json:"status"`
			}
			if json.Unmarshal(body2, &s) == nil {
				data.Status = s.Status
			}
		}
	}

	// Public IP + location
	if body, err := gluetunGet(apiURL, apiKey, "/v1/publicip/ip", skipTLS); err == nil {
		var ip struct {
			PublicIP string `json:"public_ip"`
			Country  string `json:"country"`
			City     string `json:"city"`
			Hostname string `json:"hostname"`
		}
		if json.Unmarshal(body, &ip) == nil {
			data.PublicIP = ip.PublicIP
			data.Country = ip.Country
			data.City = ip.City
			data.Hostname = ip.Hostname
		}
	}

	// Port forwarding
	if body, err := gluetunGet(apiURL, apiKey, "/v1/openvpn/portforwarded", skipTLS); err == nil {
		var pf struct {
			Port int `json:"port"`
		}
		if json.Unmarshal(body, &pf) == nil && pf.Port > 0 {
			data.Port = pf.Port
		}
	}

	// Server info
	if body, err := gluetunGet(apiURL, apiKey, "/v1/vpn/settings", skipTLS); err == nil {
		var settings struct {
			VPNProvider string `json:"vpn_service_provider"`
			ServerName  string `json:"server_hostname"`
		}
		if json.Unmarshal(body, &settings) == nil {
			data.Provider = settings.VPNProvider
			data.ServerName = settings.ServerName
		}
	}

	return data, nil
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
