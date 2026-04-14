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
	UIURL       string               `json:"uiUrl"`
	Version     string               `json:"version"`
	UpdateAvail bool                 `json:"updateAvail"`
	Gateways    []OPNsenseGateway    `json:"gateways"`
	Interfaces  []OPNsenseInterface  `json:"interfaces"`
}

type OPNsenseGateway struct {
	Name    string `json:"name"`
	Status  string `json:"status"`
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
	data := &OPNsensePanelData{UIURL: uiURL}

	// Firmware version
	if body, err := opnsenseGet(apiURL, apiKey, "/api/core/firmware/running", skipTLS); err != nil {
		log.Printf("[OPNSENSE] firmware err: %v", err)
	} else {
		var fw struct {
			Version string `json:"local_version"`
		}
		if json.Unmarshal(body, &fw) == nil {
			data.Version = fw.Version
		}
	}

	// Update status
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
	} else {
		var gw struct {
			Items []struct {
				Name    string `json:"name"`
				Status  string `json:"status_translated"`
				RTT     string `json:"delay"`
				Loss    string `json:"loss"`
				StdDev  string `json:"stddev"`
				Address string `json:"address"`
			} `json:"items"`
		}
		if json.Unmarshal(body, &gw) == nil {
			for _, g := range gw.Items {
				// status_translated values: "Online", "Offline", "Loss", etc.
				status := "online"
				sl := strings.ToLower(g.Status)
				if sl != "online" && sl != "none" && sl != "" {
					status = "offline"
				}
				rtt := g.RTT
				if rtt == "~" { rtt = "" }
				loss := g.Loss
				if loss == "~" { loss = "" }
				data.Gateways = append(data.Gateways, OPNsenseGateway{
					Name:    g.Name,
					Status:  status,
					RTT:     rtt,
					Loss:    loss,
					Address: g.Address,
				})
			}
		}
	}

	// Interface traffic — try /top/0.1 first (live rates), fall back to statistics
	if body, err := opnsenseGet(apiURL, apiKey, "/api/diagnostics/traffic/top/0.1", skipTLS); err != nil {
		log.Printf("[OPNSENSE] traffic/top err: %v — trying statistics", err)
		// Fallback: cumulative stats
		if body2, err2 := opnsenseGet(apiURL, apiKey, "/api/diagnostics/interface/getInterfaceStatistics", skipTLS); err2 != nil {
			log.Printf("[OPNSENSE] interface stats err: %v", err2)
		} else {
			var stats map[string]struct {
				Interface string  `json:"interface"`
				Inbytes   float64 `json:"inbytes"`
				Outbytes  float64 `json:"outbytes"`
				IPAddress string  `json:"ipaddress"`
			}
			if json.Unmarshal(body2, &stats) == nil {
				for device, s := range stats {
					if s.Inbytes == 0 && s.Outbytes == 0 {
						continue
					}
					name := s.Interface
					if name == "" {
						name = device
					}
					data.Interfaces = append(data.Interfaces, OPNsenseInterface{
						Name:    name,
						Device:  device,
						IPAddr:  s.IPAddress,
						InMbps:  s.Inbytes / 1048576,
						OutMbps: s.Outbytes / 1048576,
					})
				}
			}
		}
	} else {
		var traffic struct {
			Interfaces map[string]struct {
				Name         string  `json:"name"`
				InbytesRate  float64 `json:"inbytes_rate"`
				OutbytesRate float64 `json:"outbytes_rate"`
			} `json:"interfaces"`
		}
		if json.Unmarshal(body, &traffic) == nil {
			for device, iface := range traffic.Interfaces {
				name := iface.Name
				if name == "" {
					name = device
				}
				data.Interfaces = append(data.Interfaces, OPNsenseInterface{
					Name:    name,
					Device:  device,
					InMbps:  iface.InbytesRate * 8 / 1000000,
					OutMbps: iface.OutbytesRate * 8 / 1000000,
				})
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
	// OPNsense uses key:secret as Basic auth — split on first colon
	colonIdx := strings.Index(apiKey, ":")
	if colonIdx >= 0 {
		key := apiKey[:colonIdx]
		secret := apiKey[colonIdx+1:]
		req.SetBasicAuth(key, secret)
		log.Printf("[OPNSENSE] auth key len=%d secret len=%d", len(key), len(secret))
	} else {
		// Fallback: use whole string as username
		encoded := base64.StdEncoding.EncodeToString([]byte(apiKey))
		req.Header.Set("Authorization", "Basic "+encoded)
		log.Printf("[OPNSENSE] auth no colon found, using full string len=%d", len(apiKey))
	}
	req.Header.Set("Content-Type", "application/json")
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("[OPNSENSE] HTTP %d for %s body=%s", resp.StatusCode, path, string(body[:min(200, len(body))]))
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
