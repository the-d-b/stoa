package handlers

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
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
	if body, err := opnsenseGet(apiURL, apiKey, "/api/core/firmware/running", skipTLS); err != nil {
		log.Printf("[OPNSENSE] firmware err: %v", err)
	} else if true {
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
	if body, err := opnsenseGet(apiURL, apiKey, "/api/routes/gateway/status", skipTLS); err != nil {
		log.Printf("[OPNSENSE] gateway err: %v", err)
	} else if true {
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

	// Interface traffic - OPNsense uses /api/diagnostics/traffic/interface
	if body, err := opnsenseGet(apiURL, apiKey, "/api/diagnostics/traffic/interface", skipTLS); err == nil {
		var traffic struct {
			Interfaces map[string]struct {
				Name         string  `json:"name"`
				InbytesRate  float64 `json:"inbytes_rate"`
				OutbytesRate float64 `json:"outbytes_rate"`
				IPv4         []struct {
					IPAddr string `json:"ipaddr"`
				} `json:"ipv4"`
			} `json:"interfaces"`
		}
		if json.Unmarshal(body, &traffic) == nil {
			for device, iface := range traffic.Interfaces {
				name := iface.Name
				if name == "" { name = device }
				ipAddr := ""
				if len(iface.IPv4) > 0 { ipAddr = iface.IPv4[0].IPAddr }
				data.Interfaces = append(data.Interfaces, OPNsenseInterface{
					Name:    name,
					Device:  device,
					InMbps:  iface.InbytesRate * 8 / 1000000,
					OutMbps: iface.OutbytesRate * 8 / 1000000,
					IPAddr:  ipAddr,
				})
			}
		}
	} else {
		log.Printf("[OPNSENSE] traffic err: %v", err)
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
