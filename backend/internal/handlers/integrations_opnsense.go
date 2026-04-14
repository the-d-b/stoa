package handlers

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ── OPNsense types ────────────────────────────────────────────────────────────

type OPNsensePanelData struct {
	UIURL      string             `json:"uiUrl"`
	Version    string             `json:"version"`
	UpdateAvail bool              `json:"updateAvail"`
	Gateways   []OPNsenseGateway  `json:"gateways"`
	Interfaces []OPNsenseInterface `json:"interfaces"`
}

type OPNsenseGateway struct {
	Name    string `json:"name"`
	Status  string `json:"status"`  // online, offline, unknown
	RTT     string `json:"rtt"`
	Loss    string `json:"loss"`
	Address string `json:"address"`
}

type OPNsenseInterface struct {
	Name    string  `json:"name"`
	Device  string  `json:"device"`
	Status  string  `json:"status"`
	InMbps  float64 `json:"inMbps"`
	OutMbps float64 `json:"outMbps"`
	IPAddr  string  `json:"ipAddr"`
}

func fetchOPNsensePanelData(db *sql.DB, config map[string]interface{}) (*OPNsensePanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	// OPNsense uses key:secret as basic auth
	// Store as "key:secret" in the secret field
	data := &OPNsensePanelData{UIURL: uiURL}

	// Firmware/version
	if body, err := opnsenseGet(apiURL, apiKey, "/api/core/firmware/running", skipTLS); err == nil {
		var fw struct {
			Status  string `json:"status"`
			Version string `json:"local_version"`
		}
		if json.Unmarshal(body, &fw) == nil {
			data.Version = fw.Version
		}
	}

	// Check for updates
	if body, err := opnsenseGet(apiURL, apiKey, "/api/core/firmware/status", skipTLS); err == nil {
		var fw struct {
			Status string `json:"status"`
		}
		if json.Unmarshal(body, &fw) == nil {
			data.UpdateAvail = fw.Status == "update"
		}
	}

	// Gateways
	if body, err := opnsenseGet(apiURL, apiKey, "/api/routes/gateway/status", skipTLS); err == nil {
		var gw struct {
			Items []struct {
				Name    string `json:"name"`
				Status  string `json:"status_translated"`
				RTT     string `json:"delay"`
				Loss    string `json:"loss"`
				Address string `json:"address"`
			} `json:"items"`
		}
		if json.Unmarshal(body, &gw) == nil {
			for _, g := range gw.Items {
				status := "online"
				if strings.EqualFold(g.Status, "offline") || strings.EqualFold(g.Status, "down") {
					status = "offline"
				}
				data.Gateways = append(data.Gateways, OPNsenseGateway{
					Name:    g.Name,
					Status:  status,
					RTT:     g.RTT,
					Loss:    g.Loss,
					Address: g.Address,
				})
			}
		}
	}

	// Interfaces via traffic stats
	if body, err := opnsenseGet(apiURL, apiKey, "/api/diagnostics/traffic/top/0.1", skipTLS); err == nil {
		var traffic struct {
			Interfaces map[string]struct {
				Name    string  `json:"name"`
				Inbytes float64 `json:"inbytes_rate"`
				Outbytes float64 `json:"outbytes_rate"`
			} `json:"interfaces"`
		}
		if json.Unmarshal(body, &traffic) == nil {
			for _, iface := range traffic.Interfaces {
				if iface.Name == "" {
					continue
				}
				data.Interfaces = append(data.Interfaces, OPNsenseInterface{
					Name:    iface.Name,
					InMbps:  iface.Inbytes * 8 / 1000000,
					OutMbps: iface.Outbytes * 8 / 1000000,
				})
			}
		}
	}

	// Interface details (IP, status)
	if body, err := opnsenseGet(apiURL, apiKey, "/api/diagnostics/interface/getInterfaceNames", skipTLS); err == nil {
		var names map[string]string
		if json.Unmarshal(body, &names) == nil {
			// Match names to existing interfaces or add new ones
			existing := map[string]*OPNsenseInterface{}
			for i := range data.Interfaces {
				existing[data.Interfaces[i].Device] = &data.Interfaces[i]
			}
			for device, name := range names {
				if _, ok := existing[device]; !ok {
					data.Interfaces = append(data.Interfaces, OPNsenseInterface{
						Name:   name,
						Device: device,
					})
				} else {
					existing[device].Name = name
					existing[device].Device = device
				}
			}
		}
	}

	return data, nil
}

func opnsenseGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	url := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	// apiKey is stored as "key:secret"
	encoded := base64.StdEncoding.EncodeToString([]byte(apiKey))
	req.Header.Set("Authorization", "Basic "+encoded)
	req.Header.Set("Content-Type", "application/json")
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from OPNsense", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func testOPNsenseConnection(apiURL, apiKey string, skipTLS bool) error {
	body, err := opnsenseGet(apiURL, apiKey, "/api/core/firmware/running", skipTLS)
	if err != nil {
		return err
	}
	var resp map[string]interface{}
	if json.Unmarshal(body, &resp) != nil {
		return fmt.Errorf("unexpected response from OPNsense")
	}
	return nil
}
