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
	"sync"
	"time"
)

// ── OPNsense types ────────────────────────────────────────────────────────────

type OPNsensePanelData struct {
	UIURL        string               `json:"uiUrl"`
	Version      string               `json:"version"`
	UpdateAvail  bool                 `json:"updateAvail"`
	Gateways     []OPNsenseGateway    `json:"gateways"`
	Interfaces   []OPNsenseInterface  `json:"interfaces"`
	TopTalkers   []OPNsenseTalker     `json:"topTalkers"`
	FWEvents     []OPNsenseFWEvent    `json:"fwEvents"`
	DNSQueries   int                  `json:"dnsQueries"`
	DNSCacheHits int                  `json:"dnsCacheHits"`
	DNSCacheMiss int                  `json:"dnsCacheMiss"`
	PFStates     int                  `json:"pfStates"`
}

type OPNsenseFWEvent struct {
	Action string `json:"action"`
	Label  string `json:"label"`
	Count  int    `json:"count"`
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

type OPNsenseTalker struct {
	Host    string  `json:"host"`
	IP      string  `json:"ip"`
	InMbps  float64 `json:"inMbps"`
	OutMbps float64 `json:"outMbps"`
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

	// ── Fetch all initial endpoints concurrently ───────────────────────────
	type result struct {
		key  string
		body []byte
		err  error
	}
	endpoints := []string{
		"firmware", "firmware_status", "gateways", "interfaces", "dns", "pf",
	}
	paths := map[string]string{
		"firmware":        "/api/core/firmware/running",
		"firmware_status": "/api/core/firmware/status",
		"gateways":        "/api/routes/gateway/status",
		"interfaces":      "/api/interfaces/overview/interfacesInfo",
		"dns":             "/api/unbound/diagnostics/stats",
		"pf":              "/api/diagnostics/firewall/pf_states",
	}

	results := make(map[string][]byte, len(endpoints))
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, key := range endpoints {
		wg.Add(1)
		go func(k, path string) {
			defer wg.Done()
			body, ferr := opnsenseGet(apiURL, apiKey, path, skipTLS)
			if ferr != nil {
				log.Printf("[OPNSENSE] %s err: %v", k, ferr)
				return
			}
			mu.Lock()
			results[k] = body
			mu.Unlock()
		}(key, paths[key])
	}
	wg.Wait()

	// ── Parse firmware version ─────────────────────────────────────────────
	if body, ok := results["firmware"]; ok {
		var fw struct{ Version string `json:"local_version"` }
		if json.Unmarshal(body, &fw) == nil {
			data.Version = fw.Version
		}
	}

	// ── Parse update status ────────────────────────────────────────────────
	if body, ok := results["firmware_status"]; ok {
		var fw struct{ Status string `json:"status"` }
		if json.Unmarshal(body, &fw) == nil {
			data.UpdateAvail = fw.Status == "update"
		}
	}

	// ── Parse gateways ─────────────────────────────────────────────────────
	if body, ok := results["gateways"]; ok {
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
				if g.Address == "~" || g.Address == "" {
					continue
				}
				status := "online"
				if sl := strings.ToLower(g.Status); sl != "online" && sl != "none" && sl != "" {
					status = "offline"
				}
				rtt := g.RTT
				if rtt == "~" { rtt = "" }
				loss := g.Loss
				if loss == "~" { loss = "" }
				data.Gateways = append(data.Gateways, OPNsenseGateway{
					Name: g.Name, Status: status, RTT: rtt, Loss: loss, Address: g.Address,
				})
			}
		}
	}

	// ── Parse interface list, then fetch traffic concurrently ──────────────
	ifaceNames := map[string]string{}
	ifaceAddrs := map[string]string{}
	if body, ok := results["interfaces"]; ok {
		var overview struct {
			Rows []struct {
				Identifier  string `json:"identifier"`
				Description string `json:"description"`
				Enabled     bool   `json:"enabled"`
				Addr4       string `json:"addr4"`
			} `json:"rows"`
		}
		if json.Unmarshal(body, &overview) == nil {
			for _, row := range overview.Rows {
				if !row.Enabled || row.Identifier == "" || row.Identifier == "lo0" {
					continue
				}
				ifaceNames[row.Identifier] = row.Description
				addr := row.Addr4
				if idx := strings.Index(addr, "/"); idx >= 0 {
					addr = addr[:idx]
				}
				ifaceAddrs[row.Identifier] = addr
			}
		}
	}

	// Fetch traffic for all interfaces concurrently — use short timeout, live packet inspection is slow
	type ifaceResult struct {
		id   string
		in   float64
		out  float64
	}
	ifaceCh := make(chan ifaceResult, len(ifaceNames))
	trafficClient := &http.Client{
		Timeout: 4 * time.Second, // traffic/top does live inspection — cap it
		Transport: httpClient(skipTLS).Transport,
	}
	for id := range ifaceNames {
		go func(ifID string) {
			body, ferr := opnsenseGetWithClient(trafficClient, apiURL, apiKey, "/api/diagnostics/traffic/top/"+ifID)
			if ferr != nil {
				ifaceCh <- ifaceResult{id: ifID}
				return
			}
			var res map[string]struct {
				Records []struct {
					RateBitsIn  float64 `json:"rate_bits_in"`
					RateBitsOut float64 `json:"rate_bits_out"`
					Rname       string  `json:"rname"`
					Address     string  `json:"address"`
				} `json:"records"`
			}
			var totalIn, totalOut float64
			if json.Unmarshal(body, &res) == nil {
				if ifData, ok := res[ifID]; ok {
					for _, rec := range ifData.Records {
						totalIn += rec.RateBitsIn
						totalOut += rec.RateBitsOut
					}
					// Capture top talkers from WAN
					if ifID == "wan" {
						mu.Lock()
						for i, rec := range ifData.Records {
							if i >= 5 { break }
							host := strings.TrimSuffix(rec.Rname, ".")
							if host == "" { host = rec.Address }
							data.TopTalkers = append(data.TopTalkers, OPNsenseTalker{
								Host:    host,
								IP:      rec.Address,
								InMbps:  rec.RateBitsIn / 1000000,
								OutMbps: rec.RateBitsOut / 1000000,
							})
						}
						mu.Unlock()
					}
				}
			}
			ifaceCh <- ifaceResult{id: ifID, in: totalIn / 1000000, out: totalOut / 1000000}
		}(id)
	}
	for i := 0; i < len(ifaceNames); i++ {
		r := <-ifaceCh
		if r.in > 0 || r.out > 0 {
			data.Interfaces = append(data.Interfaces, OPNsenseInterface{
				Name:    ifaceNames[r.id],
				Device:  r.id,
				IPAddr:  ifaceAddrs[r.id],
				InMbps:  r.in,
				OutMbps: r.out,
			})
		}
	}

	// ── Parse DNS stats ────────────────────────────────────────────────────
	if body, ok := results["dns"]; ok {
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

	// ── Parse PF states ────────────────────────────────────────────────────
	if body, ok := results["pf"]; ok {
		var pf struct{ Current string `json:"current"` }
		if json.Unmarshal(body, &pf) == nil {
			fmt.Sscanf(pf.Current, "%d", &data.PFStates)
		}
	}

	return data, nil
}

func opnsenseGetWithClient(client *http.Client, baseURL, apiKey, path string) ([]byte, error) {
	url := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	colonIdx := strings.Index(apiKey, ":")
	if colonIdx >= 0 {
		req.SetBasicAuth(apiKey[:colonIdx], apiKey[colonIdx+1:])
	} else {
		encoded := base64.StdEncoding.EncodeToString([]byte(apiKey))
		req.Header.Set("Authorization", "Basic "+encoded)
	}
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

func opnsenseGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	url := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	colonIdx := strings.Index(apiKey, ":")
	if colonIdx >= 0 {
		req.SetBasicAuth(apiKey[:colonIdx], apiKey[colonIdx+1:])
	} else {
		encoded := base64.StdEncoding.EncodeToString([]byte(apiKey))
		req.Header.Set("Authorization", "Basic "+encoded)
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
