package handlers

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

// ── OPNsense types ────────────────────────────────────────────────────────────

type OPNsensePanelData struct {
	UIURL        string              `json:"uiUrl"`
	Version      string              `json:"version"`
	UpdateAvail  bool                `json:"updateAvail"`
	Gateways     []OPNsenseGateway   `json:"gateways"`
	Interfaces   []OPNsenseInterface `json:"interfaces"`
	TopTalkers   []OPNsenseTalker    `json:"topTalkers"`
	FWEvents     []OPNsenseFWEvent   `json:"fwEvents"`
	DNSQueries   int                 `json:"dnsQueries"`
	DNSCacheHits int                 `json:"dnsCacheHits"`
	DNSCacheMiss int                 `json:"dnsCacheMiss"`
	PFStates     int                 `json:"pfStates"`
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
	anyOK := false

	// ── Fetch all initial endpoints concurrently ───────────────────────────
	endpoints := []string{
		"firmware_status", "gateways", "interfaces", "dns", "pf",
	}
	paths := map[string]string{
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
				logErrorf("OPNSENSE", "%s err: %v", k, ferr)
				return
			}
			mu.Lock()
			results[k] = body
			mu.Unlock()
		}(key, paths[key])
	}
	wg.Wait()

	// ── Parse firmware version + update status ─────────────────────────────
	if body, ok := results["firmware_status"]; ok {
		anyOK = true
		data.Version, data.UpdateAvail = opnsenseParseFirmwareStatus(body)
	}

	// ── Parse gateways ─────────────────────────────────────────────────────
	if body, ok := results["gateways"]; ok {
		anyOK = true
		data.Gateways = opnsenseParseGateways(body)
	}

	// ── Parse interface list, then fetch traffic concurrently ──────────────
	ifaceNames := map[string]string{}
	ifaceAddrs := map[string]string{}
	if body, ok := results["interfaces"]; ok {
		anyOK = true
		for id, info := range opnsenseParseInterfacesInfo(body) {
			ifaceNames[id] = info.Name
			ifaceAddrs[id] = info.Addr
		}
	}

	// Fetch traffic for all interfaces concurrently — use short timeout, live packet inspection is slow
	type ifaceResult struct {
		id  string
		in  float64
		out float64
	}
	ifaceCh := make(chan ifaceResult, len(ifaceNames))
	trafficClient := &http.Client{
		Timeout:   4 * time.Second, // traffic/top does live inspection — cap it
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
				}
			}
			// Capture top talkers from WAN
			if ifID == "wan" {
				if talkers := opnsenseParseTopTalkers(body, "wan", 5); talkers != nil {
					mu.Lock()
					data.TopTalkers = talkers
					mu.Unlock()
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
	// Sort interfaces by device name so order is stable across re-renders
	sort.Slice(data.Interfaces, func(i, j int) bool {
		return data.Interfaces[i].Device < data.Interfaces[j].Device
	})

	// ── Parse DNS stats ────────────────────────────────────────────────────
	if body, ok := results["dns"]; ok {
		anyOK = true
		data.DNSQueries, data.DNSCacheHits, data.DNSCacheMiss = opnsenseParseDNSStats(body)
	}

	// ── Parse PF states ────────────────────────────────────────────────────
	if body, ok := results["pf"]; ok {
		anyOK = true
		data.PFStates = opnsenseParsePFStates(body)
	}

	// Every endpoint failed — surface the error instead of rendering zeros
	if !anyOK {
		return nil, fmt.Errorf("opnsense unreachable — check URL, credentials, and TLS settings (see server log for details)")
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
		logDebugf("OPNSENSE", "HTTP %d for %s body=%s", resp.StatusCode, path, string(body[:min(200, len(body))]))
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
