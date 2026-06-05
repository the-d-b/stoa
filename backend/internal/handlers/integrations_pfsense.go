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

// ── Types ─────────────────────────────────────────────────────────────────────

type PfSenseIface struct {
	Name    string  `json:"name"`
	Descr   string  `json:"descr"`
	Status  string  `json:"status"`
	InMbps  float64 `json:"inMbps"`
	OutMbps float64 `json:"outMbps"`
}

type PfSenseGateway struct {
	Name      string `json:"name"`
	Status    string `json:"status"`
	RTT       string `json:"rtt"`
	Loss      string `json:"loss"`
	Interface string `json:"interface"`
}

type PfSensePanelData struct {
	UIURL         string           `json:"uiUrl"`
	IntegrationID string           `json:"integrationId"`
	Hostname      string           `json:"hostname"`
	Version       string           `json:"version"`
	CPUUsage      float64          `json:"cpuUsage"`
	MemUsage      float64          `json:"memUsage"`
	Uptime        string           `json:"uptime"`
	Interfaces    []PfSenseIface   `json:"interfaces"`
	Gateways      []PfSenseGateway `json:"gateways"`
	StatesCurrent int              `json:"statesCurrent"`
	StatesLimit   int              `json:"statesLimit"`
}

// ── Delta tracker for traffic rates ──────────────────────────────────────────

type pfSensePrev struct {
	At       time.Time
	InBytes  map[string]int64
	OutBytes map[string]int64
}

var (
	pfSensePrevMu  sync.Mutex
	pfSensePrevMap = map[string]*pfSensePrev{} // integID → previous reading
)

// ── HTTP helper ───────────────────────────────────────────────────────────────

func pfSenseGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	// username:password → Basic Auth; bare key → Authorization: {key} (pfSense-pkg-API token mode)
	if colonIdx := strings.Index(apiKey, ":"); colonIdx >= 0 {
		encoded := base64.StdEncoding.EncodeToString([]byte(apiKey))
		req.Header.Set("Authorization", "Basic "+encoded)
	} else {
		req.Header.Set("Authorization", apiKey)
	}
	req.Header.Set("Accept", "application/json")
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("unauthorized (HTTP %d)", resp.StatusCode)
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from pfSense", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Main fetch ────────────────────────────────────────────────────────────────

func fetchPfSensePanelData(db *sql.DB, config map[string]interface{}) (*PfSensePanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}

	data := &PfSensePanelData{
		UIURL:         uiURL,
		IntegrationID: integrationID,
		Interfaces:    []PfSenseIface{},
		Gateways:      []PfSenseGateway{},
	}

	// ── System stats ──────────────────────────────────────────────────────────
	if body, err := pfSenseGet(apiURL, apiKey, "/api/v1/status/system", skipTLS); err == nil {
		var resp struct {
			Data struct {
				CPUUsage json.Number `json:"cpu_usage"`
				MemUsage json.Number `json:"mem_usage"`
				Uptime   string      `json:"uptime"`
				Hostname string      `json:"hostname"`
				// Version may be a plain string or a nested object — try string first
				Version json.RawMessage `json:"system_version"`
			} `json:"data"`
		}
		if json.Unmarshal(body, &resp) == nil {
			data.CPUUsage, _ = resp.Data.CPUUsage.Float64()
			data.MemUsage, _ = resp.Data.MemUsage.Float64()
			data.Uptime = resp.Data.Uptime
			data.Hostname = resp.Data.Hostname
			// Try plain string first, then extract from nested object
			var vStr string
			if json.Unmarshal(resp.Data.Version, &vStr) == nil {
				data.Version = vStr
			} else {
				var vObj struct {
					Current struct {
						Version string `json:"version"`
					} `json:"current"`
				}
				if json.Unmarshal(resp.Data.Version, &vObj) == nil {
					data.Version = vObj.Current.Version
				}
			}
		}
	}

	// ── Interfaces with traffic delta ─────────────────────────────────────────
	if body, err := pfSenseGet(apiURL, apiKey, "/api/v1/status/interface", skipTLS); err == nil {
		var raw struct {
			Data map[string]struct {
				If       string      `json:"if"`
				Descr    string      `json:"descr"`
				Status   string      `json:"status"`
				InBytes  json.Number `json:"inbytes"`
				OutBytes json.Number `json:"outbytes"`
			} `json:"data"`
		}
		if json.Unmarshal(body, &raw) == nil {
			now := time.Now()

			// Capture snapshot for next delta
			cur := &pfSensePrev{At: now, InBytes: map[string]int64{}, OutBytes: map[string]int64{}}
			for key, iface := range raw.Data {
				in, _ := iface.InBytes.Int64()
				out, _ := iface.OutBytes.Int64()
				cur.InBytes[key] = in
				cur.OutBytes[key] = out
			}

			pfSensePrevMu.Lock()
			prev := pfSensePrevMap[integrationID]
			pfSensePrevMap[integrationID] = cur
			pfSensePrevMu.Unlock()

			var elapsed float64
			if prev != nil {
				elapsed = now.Sub(prev.At).Seconds()
			}

			for key, iface := range raw.Data {
				pf := PfSenseIface{
					Name:   iface.If,
					Descr:  iface.Descr,
					Status: iface.Status,
				}
				if pf.Name == "" {
					pf.Name = key
				}
				if pf.Descr == "" {
					pf.Descr = pf.Name
				}

				if prev != nil && elapsed > 0 {
					inNow, _ := iface.InBytes.Int64()
					outNow, _ := iface.OutBytes.Int64()
					inDelta := inNow - prev.InBytes[key]
					outDelta := outNow - prev.OutBytes[key]
					if inDelta >= 0 {
						pf.InMbps = float64(inDelta) * 8 / elapsed / 1e6
					}
					if outDelta >= 0 {
						pf.OutMbps = float64(outDelta) * 8 / elapsed / 1e6
					}
				}
				data.Interfaces = append(data.Interfaces, pf)
			}

			// WAN first, LAN second, others alphabetically
			wanOrder := func(descr string) int {
				u := strings.ToUpper(descr)
				if strings.HasPrefix(u, "WAN") {
					return 0
				}
				if strings.HasPrefix(u, "LAN") {
					return 1
				}
				return 2
			}
			sort.Slice(data.Interfaces, func(i, j int) bool {
				wi, wj := wanOrder(data.Interfaces[i].Descr), wanOrder(data.Interfaces[j].Descr)
				if wi != wj {
					return wi < wj
				}
				return data.Interfaces[i].Descr < data.Interfaces[j].Descr
			})
		}
	}

	// ── Gateways ──────────────────────────────────────────────────────────────
	if body, err := pfSenseGet(apiURL, apiKey, "/api/v1/status/gateway", skipTLS); err == nil {
		var resp struct {
			Data []struct {
				Name      string `json:"name"`
				Status    string `json:"status"`
				Delay     string `json:"delay"`
				Loss      string `json:"loss"`
				Interface string `json:"interface"`
			} `json:"data"`
		}
		if json.Unmarshal(body, &resp) == nil {
			for _, gw := range resp.Data {
				data.Gateways = append(data.Gateways, PfSenseGateway{
					Name:      gw.Name,
					Status:    gw.Status,
					RTT:       gw.Delay,
					Loss:      gw.Loss,
					Interface: gw.Interface,
				})
			}
		}
	}

	// ── Firewall states ───────────────────────────────────────────────────────
	if body, err := pfSenseGet(apiURL, apiKey, "/api/v1/firewall/states/size", skipTLS); err == nil {
		var resp struct {
			Data struct {
				Current int `json:"current"`
				Limit   int `json:"limit"`
			} `json:"data"`
		}
		if json.Unmarshal(body, &resp) == nil {
			data.StatesCurrent = resp.Data.Current
			data.StatesLimit = resp.Data.Limit
		}
	}

	return data, nil
}

// ── Test ──────────────────────────────────────────────────────────────────────

func testPfSenseConnection(apiURL, apiKey string, skipTLS bool) error {
	_, err := pfSenseGet(apiURL, apiKey, "/api/v1/system/version", skipTLS)
	return err
}
