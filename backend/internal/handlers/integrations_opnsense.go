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
	UIURL         string               `json:"uiUrl"`
	Version       string               `json:"version"`
	UpdateAvail   bool                 `json:"updateAvail"`
	Gateways      []OPNsenseGateway    `json:"gateways"`
	Interfaces    []OPNsenseInterface  `json:"interfaces"`
	TopTalkers    []OPNsenseTalker     `json:"topTalkers"`
	DNSQueries    int                  `json:"dnsQueries"`
	DNSCacheHits  int                  `json:"dnsCacheHits"`
	DNSCacheMiss  int                  `json:"dnsCacheMiss"`
	PFStates      int                  `json:"pfStates"`
}

type OPNsenseTalker struct {
	Host    string  `json:"host"`
	InMbps  float64 `json:"inMbps"`
	OutMbps float64 `json:"outMbps"`
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
				// Skip gateways with no IP address (e.g. IPv6 DHCPv6 with no lease)
				if g.Address == "~" || g.Address == "" {
					continue
				}
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

	// Get interface list from overview — gives enabled interfaces with descriptions
	ifaceNames := map[string]string{} // identifier -> description
	ifaceAddrs := map[string]string{} // identifier -> ipv4
	if body, err := opnsenseGet(apiURL, apiKey, "/api/interfaces/overview/interfacesInfo", skipTLS); err == nil {
		var overview struct {
			Rows []struct {
				Identifier  string `json:"identifier"`
				Description string `json:"description"`
				Enabled     bool   `json:"enabled"`
				Status      string `json:"status"`
				Addr4       string `json:"addr4"`
			} `json:"rows"`
		}
		if json.Unmarshal(body, &overview) == nil {
			for _, row := range overview.Rows {
				if !row.Enabled || row.Identifier == "" { continue }
				if row.Identifier == "lo0" { continue } // skip loopback
				ifaceNames[row.Identifier] = row.Description
				ifaceAddrs[row.Identifier] = strings.TrimSuffix(row.Addr4, "/24")
				// trim subnet mask
				if idx := strings.Index(row.Addr4, "/"); idx >= 0 {
					ifaceAddrs[row.Identifier] = row.Addr4[:idx]
				}
			}
		}
	} else {
		log.Printf("[OPNSENSE] interfacesInfo err: %v", err)
	}

	// Fetch live traffic rates per interface using /traffic/top/{id}
	for id, desc := range ifaceNames {
		body, err := opnsenseGet(apiURL, apiKey, "/api/diagnostics/traffic/top/"+id, skipTLS)
		if err != nil {
			log.Printf("[OPNSENSE] traffic/top/%s err: %v", id, err)
			continue
		}
		// Response: {"wan": {"records": [{"rate_bits_in": N, "rate_bits_out": N, ...}]}}
		var result map[string]struct {
			Records []struct {
				RateBitsIn  float64 `json:"rate_bits_in"`
				RateBitsOut float64 `json:"rate_bits_out"`
			} `json:"records"`
			Status string `json:"status"`
		}
		if json.Unmarshal(body, &result) != nil { continue }
		ifData, ok := result[id]
		if !ok { continue }
		// Sum rates across all active connections
		var totalIn, totalOut float64
		for _, rec := range ifData.Records {
			totalIn += rec.RateBitsIn
			totalOut += rec.RateBitsOut
		}
		data.Interfaces = append(data.Interfaces, OPNsenseInterface{
			Name:    desc,
			Device:  id,
			IPAddr:  ifaceAddrs[id],
			InMbps:  totalIn / 1000000,
			OutMbps: totalOut / 1000000,
		})
	}

	// Top talkers on WAN interface
	if body, err := opnsenseGet(apiURL, apiKey, "/api/diagnostics/traffic/top/wan", skipTLS); err == nil {
		var result map[string]struct {
			Records []struct {
				RateBitsIn  float64 `json:"rate_bits_in"`
				RateBitsOut float64 `json:"rate_bits_out"`
				Rname       string  `json:"rname"`
				Address     string  `json:"address"`
			} `json:"records"`
		}
		if json.Unmarshal(body, &result) == nil {
			if wan, ok := result["wan"]; ok {
				for i, rec := range wan.Records {
					if i >= 5 { break }
					host := rec.Rname
					if host == "" { host = rec.Address }
					// trim trailing dot from rname
					host = strings.TrimSuffix(host, ".")
					data.TopTalkers = append(data.TopTalkers, OPNsenseTalker{
						Host:    host,
						InMbps:  rec.RateBitsIn / 1000000,
						OutMbps: rec.RateBitsOut / 1000000,
					})
				}
			}
		}
	}

	// Unbound DNS stats
	if body, err := opnsenseGet(apiURL, apiKey, "/api/unbound/diagnostics/stats", skipTLS); err == nil {
		var stats struct {
			Data struct {
				Total struct {
					Num struct {
						Queries   string `json:"queries"`
						CacheHits string `json:"cachehits"`
						CacheMiss string `json:"cachemiss"`
					} `json:"num"`
				} `json:"total"`
			} `json:"data"`
		}
		if json.Unmarshal(body, &stats) == nil {
			fmt.Sscanf(stats.Data.Total.Num.Queries, "%d", &data.DNSQueries)
			fmt.Sscanf(stats.Data.Total.Num.CacheHits, "%d", &data.DNSCacheHits)
			fmt.Sscanf(stats.Data.Total.Num.CacheMiss, "%d", &data.DNSCacheMiss)
		}
	}

	// PF firewall states
	if body, err := opnsenseGet(apiURL, apiKey, "/api/diagnostics/firewall/pf_states", skipTLS); err == nil {
		var pf struct {
			Current string `json:"current"`
		}
		if json.Unmarshal(body, &pf) == nil {
			fmt.Sscanf(pf.Current, "%d", &data.PFStates)
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
