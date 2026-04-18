package handlers

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

// ── OPNsense background worker ────────────────────────────────────────────────
// Connects to OPNsense SSE streams directly — no polling.
//
// /api/diagnostics/traffic/stream/1  → per-second byte deltas per interface
// /api/diagnostics/firewall/stream_log → live firewall log events
//
// Slow loop (30s): firmware, gateways, DNS stats, PF states, top talkers

func StartOPNsenseWorker(db *sql.DB, ig integrationMeta, stop <-chan struct{}) {
	go func() {
		backoff := 5 * time.Second
		for {
			select {
			case <-stop:
				return
			default:
			}
			err := runOPNsenseWorker(db, ig, stop)
			if err != nil {
				log.Printf("[OPNSENSE] worker error: %v — reconnecting in %s", err, backoff)
			}
			select {
			case <-stop:
				return
			case <-time.After(backoff):
				if backoff < 5*time.Minute {
					backoff *= 2
				}
			}
		}
	}()
}

func runOPNsenseWorker(db *sql.DB, ig integrationMeta, stop <-chan struct{}) error {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, ig.id)
	if err != nil {
		return fmt.Errorf("resolve: %w", err)
	}

	log.Printf("[OPNSENSE] worker started")

	// Initial slow data fetch
	data := &OPNsensePanelData{UIURL: uiURL}
	opnsenseFetchSlow(apiURL, apiKey, skipTLS, data)
	cacheSet(ig.id, data)
	log.Printf("[OPNSENSE] initial data cached")

	// ── Traffic stream goroutine ──────────────────────────────────────────
	trafficCh := make(chan opnsenseTrafficEvent, 32)
	go opnsenseStreamTraffic(apiURL, apiKey, skipTLS, trafficCh, stop)

	// ── Firewall stream goroutine ─────────────────────────────────────────
	fwCh := make(chan opnsenseFWEvent, 128)
	go opnsenseStreamFirewall(apiURL, apiKey, skipTLS, fwCh, stop)

	// ── Firewall event accumulator (rolling 30s window) ─────────────────
	fwCounts := map[string]int{} // "action|label" -> count
	fwTicker  := time.NewTicker(5 * time.Second)  // push FW summary every 5s
	fwReset   := time.NewTicker(30 * time.Second) // reset counts every 30s
	defer fwTicker.Stop()
	defer fwReset.Stop()

	slowTicker := time.NewTicker(30 * time.Second)
	defer slowTicker.Stop()

	for {
		select {
		case <-stop:
			return nil

		case evt := <-trafficCh:
			// Build a fresh copy — never mutate the cached pointer directly
			var prev OPNsensePanelData
			if p := opnsenseGetCached(ig.id, uiURL); p != nil {
				prev = *p // copy by value
			}
			prev.Interfaces = nil
			for id, iface := range evt.Interfaces {
				name := iface.Name
				if name == "" {
					name = strings.ToUpper(id)
				}
				inMbps := float64(iface.InBytes) * 8 / 1_000_000
				outMbps := float64(iface.OutBytes) * 8 / 1_000_000
				if inMbps < 0 { inMbps = 0 }
				if outMbps < 0 { outMbps = 0 }
				if inMbps > 0 || outMbps > 0 {
					prev.Interfaces = append(prev.Interfaces, OPNsenseInterface{
						Name:    name,
						Device:  id,
						InMbps:  inMbps,
						OutMbps: outMbps,
					})
				}
			}
			cacheSet(ig.id, &prev)

		case evt := <-fwCh:
			// Accumulate firewall events
			key := evt.Action + "|" + evt.Label
			if evt.Label == "" {
				key = evt.Action + "|rule-" + evt.RuleNr
			}
			fwCounts[key]++

		case <-fwReset.C:
			// Reset counts — start a fresh 30s window
			fwCounts = map[string]int{}

		case <-fwTicker.C:
			// Build fresh copy for FW events
			var prev OPNsensePanelData
			if p := opnsenseGetCached(ig.id, uiURL); p != nil {
				prev = *p // copy by value
			}
			prev.FWEvents = nil
			for key, count := range fwCounts {
				parts := strings.SplitN(key, "|", 2)
				action, label := parts[0], ""
				if len(parts) == 2 {
					label = parts[1]
				}
				prev.FWEvents = append(prev.FWEvents, OPNsenseFWEvent{
					Action: action,
					Label:  label,
					Count:  count,
				})
			}
			cacheSet(ig.id, &prev)

		case <-slowTicker.C:
			var prev OPNsensePanelData
			if p := opnsenseGetCached(ig.id, uiURL); p != nil {
				prev = *p
			}
			opnsenseFetchSlow(apiURL, apiKey, skipTLS, &prev)
			cacheSet(ig.id, &prev)
			log.Printf("[OPNSENSE] slow data refreshed")
		}
	}
}

// ── SSE stream readers ────────────────────────────────────────────────────────

type opnsenseTrafficEvent struct {
	Interfaces map[string]struct {
		InBytes  int64  `json:"inbytes"`
		OutBytes int64  `json:"outbytes"`
		Name     string `json:"name"`
	} `json:"interfaces"`
	Time float64 `json:"time"`
}

type opnsenseFWEvent struct {
	Action  string `json:"action"`
	Label   string `json:"label"`
	RuleNr  string `json:"rulenr"`
	Src     string `json:"src"`
	Dst     string `json:"dst"`
	Proto   string `json:"protoname"`
	SrcPort string `json:"srcport"`
	DstPort string `json:"dstport"`
}

func opnsenseStreamTraffic(apiURL, apiKey string, skipTLS bool, ch chan<- opnsenseTrafficEvent, stop <-chan struct{}) {
	for {
		select {
		case <-stop:
			return
		default:
		}
		if err := opnsenseReadStream(
			apiURL+"/api/diagnostics/traffic/stream/1",
			apiKey, skipTLS,
			func(data []byte) {
				var evt opnsenseTrafficEvent
				if json.Unmarshal(data, &evt) == nil {
					select {
					case ch <- evt:
					default:
					}
				}
			},
			stop,
		); err != nil {
			log.Printf("[OPNSENSE] traffic stream error: %v — reconnecting", err)
			select {
			case <-stop:
				return
			case <-time.After(5 * time.Second):
			}
		}
	}
}

func opnsenseStreamFirewall(apiURL, apiKey string, skipTLS bool, ch chan<- opnsenseFWEvent, stop <-chan struct{}) {
	for {
		select {
		case <-stop:
			return
		default:
		}
		if err := opnsenseReadStream(
			apiURL+"/api/diagnostics/firewall/stream_log",
			apiKey, skipTLS,
			func(data []byte) {
				var evt opnsenseFWEvent
				if json.Unmarshal(data, &evt) == nil && evt.Action != "" {
					select {
					case ch <- evt:
					default:
					}
				}
			},
			stop,
		); err != nil {
			log.Printf("[OPNSENSE] firewall stream error: %v — reconnecting", err)
			select {
			case <-stop:
				return
			case <-time.After(5 * time.Second):
			}
		}
	}
}

// opnsenseReadStream reads an OPNsense SSE stream until error or stop.
func opnsenseReadStream(url, apiKey string, skipTLS bool, onEvent func([]byte), stop <-chan struct{}) error {
	client := httpClient(skipTLS)
	client.Timeout = 0 // no timeout for streaming

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	if idx := strings.Index(apiKey, ":"); idx >= 0 {
		req.SetBasicAuth(apiKey[:idx], apiKey[idx+1:])
	} else {
		req.SetBasicAuth(apiKey, "")
	}
	req.Header.Set("Accept", "text/event-stream")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d from stream", resp.StatusCode)
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 64*1024), 64*1024)

	for scanner.Scan() {
		select {
		case <-stop:
			return nil
		default:
		}
		line := scanner.Text()
		if strings.HasPrefix(line, "data: ") {
			data := []byte(strings.TrimPrefix(line, "data: "))
			if len(data) > 2 {
				onEvent(data)
			}
		}
	}
	return scanner.Err()
}

// ── Slow data ─────────────────────────────────────────────────────────────────

func opnsenseFetchSlow(apiURL, apiKey string, skipTLS bool, data *OPNsensePanelData) {
	type result struct {
		key  string
		body []byte
	}
	ch := make(chan result, 7)
	paths := map[string]string{
		"firmware":        "/api/core/firmware/running",
		"firmware_status": "/api/core/firmware/status",
		"gateways":        "/api/routes/gateway/status",
		"interfaces_info": "/api/interfaces/overview/interfacesInfo",
		"dns":             "/api/unbound/diagnostics/stats",
		"pf":              "/api/diagnostics/firewall/pf_states",
		"top_talkers":     "/api/diagnostics/traffic/top/wan",
	}
	for key, path := range paths {
		go func(k, p string) {
			body, err := opnsenseGet(apiURL, apiKey, p, skipTLS)
			if err != nil {
				ch <- result{key: k}
				return
			}
			ch <- result{key: k, body: body}
		}(key, path)
	}

	results := map[string][]byte{}
	for i := 0; i < len(paths); i++ {
		r := <-ch
		if r.body != nil {
			results[r.key] = r.body
		}
	}

	if body, ok := results["firmware"]; ok {
		var fw struct{ Version string `json:"local_version"` }
		if json.Unmarshal(body, &fw) == nil {
			data.Version = fw.Version
		}
	}
	if body, ok := results["firmware_status"]; ok {
		var fw struct{ Status string `json:"status"` }
		if json.Unmarshal(body, &fw) == nil {
			data.UpdateAvail = fw.Status == "update"
		}
	}
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
			data.Gateways = nil
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
	if body, ok := results["interfaces_info"]; ok {
		var overview struct {
			Rows []struct {
				Identifier  string `json:"identifier"`
				Description string `json:"description"`
				Enabled     bool   `json:"enabled"`
				Addr4       string `json:"addr4"`
			} `json:"rows"`
		}
		if json.Unmarshal(body, &overview) == nil {
			addrMap := map[string]string{}
			for _, row := range overview.Rows {
				if !row.Enabled || row.Identifier == "" || row.Identifier == "lo0" {
					continue
				}
				addr := row.Addr4
				if idx := strings.Index(addr, "/"); idx >= 0 {
					addr = addr[:idx]
				}
				addrMap[row.Identifier] = addr
			}
			for i := range data.Interfaces {
				if addr, ok := addrMap[data.Interfaces[i].Device]; ok {
					data.Interfaces[i].IPAddr = addr
					data.Interfaces[i].Status = "up"
				}
			}
		}
	}
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
	if body, ok := results["pf"]; ok {
		var pf struct{ Current string `json:"current"` }
		if json.Unmarshal(body, &pf) == nil {
			fmt.Sscanf(pf.Current, "%d", &data.PFStates)
		}
	}
	if body, ok := results["top_talkers"]; ok {
		var res map[string]struct {
			Records []struct {
				RateBitsIn  float64 `json:"rate_bits_in"`
				RateBitsOut float64 `json:"rate_bits_out"`
				Rname       string  `json:"rname"`
				Address     string  `json:"address"`
			} `json:"records"`
		}
		if json.Unmarshal(body, &res) == nil {
			data.TopTalkers = nil
			if wan, ok := res["wan"]; ok {
				for i, rec := range wan.Records {
					if i >= 5 { break }
					host := strings.TrimSuffix(rec.Rname, ".")
					if host == "" { host = rec.Address }
					data.TopTalkers = append(data.TopTalkers, OPNsenseTalker{
						Host:    host,
						IP:      rec.Address,
						InMbps:  rec.RateBitsIn / 1_000_000,
						OutMbps: rec.RateBitsOut / 1_000_000,
					})
				}
			}
		}
	}
}

func opnsenseGetCached(integrationID, uiURL string) *OPNsensePanelData {
	if cached, ok := cacheGet(integrationID); ok {
		if d, ok := cached.(*OPNsensePanelData); ok {
			return d
		}
	}
	return &OPNsensePanelData{UIURL: uiURL}
}
