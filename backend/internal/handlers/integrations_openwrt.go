package handlers

import (
	"database/sql"
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

type OpenWrtIface struct {
	Name    string  `json:"name"`
	Up      bool    `json:"up"`
	InMbps  float64 `json:"inMbps"`
	OutMbps float64 `json:"outMbps"`
}

type OpenWrtClient struct {
	MAC    string `json:"mac"`
	Signal int    `json:"signal"` // dBm (negative)
	Device string `json:"device"` // radio name, e.g. "wlan0"
	TxRate int    `json:"txRate"` // Kbps
	RxRate int    `json:"rxRate"` // Kbps
}

type OpenWrtPanelData struct {
	UIURL         string          `json:"uiUrl"`
	IntegrationID string          `json:"integrationId"`
	Hostname      string          `json:"hostname"`
	Uptime        int64           `json:"uptime"`    // seconds
	Load1         float64         `json:"load1"`     // 1-min load average
	MemTotal      int64           `json:"memTotal"`  // bytes
	MemFree       int64           `json:"memFree"`   // bytes
	MemBuffered   int64           `json:"memBuffered"`
	Interfaces    []OpenWrtIface  `json:"interfaces"`
	Clients       []OpenWrtClient `json:"clients"`
	ClientCount   int             `json:"clientCount"`
}

// ── Session cache ─────────────────────────────────────────────────────────────

var (
	owrtSessionsMu sync.Mutex
	owrtSessions   = map[string]string{} // integID → session token

	owrtPrevMu  sync.Mutex
	owrtPrevMap = map[string]*owrtPrev{} // integID → previous traffic reading
)

type owrtPrev struct {
	At       time.Time
	InBytes  map[string]int64
	OutBytes map[string]int64
}

// ── HTTP + JSON-RPC helpers ───────────────────────────────────────────────────

func owrtPost(baseURL, body string, skipTLS bool) ([]byte, error) {
	req, err := http.NewRequest("POST", strings.TrimRight(baseURL, "/")+"/ubus", strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("unauthorized")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from OpenWrt", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// owrtUnwrap extracts data from a ubus JSON-RPC response: {"result":[code, data]}.
func owrtUnwrap(body []byte) ([]byte, error) {
	var envelope struct {
		Error  *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
		Result []json.RawMessage `json:"result"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, err
	}
	if envelope.Error != nil {
		if envelope.Error.Code == -32002 {
			return nil, fmt.Errorf("unauthorized")
		}
		return nil, fmt.Errorf("ubus error %d: %s", envelope.Error.Code, envelope.Error.Message)
	}
	if len(envelope.Result) < 2 {
		return nil, fmt.Errorf("empty result")
	}
	var code int
	json.Unmarshal(envelope.Result[0], &code)
	if code != 0 {
		return nil, fmt.Errorf("ubus status %d", code)
	}
	return envelope.Result[1], nil
}

// owrtCall invokes a ubus method and returns the unwrapped data payload.
func owrtCall(baseURL, session, object, method string, args interface{}, skipTLS bool) ([]byte, error) {
	argsJSON, _ := json.Marshal(args)
	body := fmt.Sprintf(`{"jsonrpc":"2.0","method":"call","params":[%q,%q,%q,%s],"id":1}`,
		session, object, method, string(argsJSON))
	raw, err := owrtPost(baseURL, body, skipTLS)
	if err != nil {
		return nil, err
	}
	return owrtUnwrap(raw)
}

func owrtLogin(baseURL, username, password string, skipTLS bool) (string, error) {
	body := fmt.Sprintf(
		`{"jsonrpc":"2.0","method":"call","params":["00000000000000000000000000000000","session","login",{"username":%q,"password":%q}],"id":1}`,
		username, password)
	raw, err := owrtPost(baseURL, body, skipTLS)
	if err != nil {
		return "", err
	}
	data, err := owrtUnwrap(raw)
	if err != nil {
		return "", fmt.Errorf("login: %v", err)
	}
	var result struct {
		UbusRPCSession string `json:"ubus_rpc_session"`
	}
	if err := json.Unmarshal(data, &result); err != nil || result.UbusRPCSession == "" {
		return "", fmt.Errorf("no session token in login response")
	}
	return result.UbusRPCSession, nil
}

func owrtGetSession(baseURL, apiKey, integID string, skipTLS bool) (string, error) {
	owrtSessionsMu.Lock()
	tok := owrtSessions[integID]
	owrtSessionsMu.Unlock()
	if tok != "" {
		return tok, nil
	}

	colonIdx := strings.Index(apiKey, ":")
	var username, password string
	if colonIdx >= 0 {
		username = apiKey[:colonIdx]
		password = apiKey[colonIdx+1:]
	} else {
		// bare value treated as root password
		username = "root"
		password = apiKey
	}

	tok, err := owrtLogin(baseURL, username, password, skipTLS)
	if err != nil {
		return "", err
	}
	owrtSessionsMu.Lock()
	owrtSessions[integID] = tok
	owrtSessionsMu.Unlock()
	return tok, nil
}

func owrtClearSession(integID string) {
	owrtSessionsMu.Lock()
	delete(owrtSessions, integID)
	owrtSessionsMu.Unlock()
}

// owrtCallRetry calls owrtCall and re-authenticates once on unauthorized errors.
func owrtCallRetry(baseURL, apiKey, integID, session, object, method string, args interface{}, skipTLS bool) ([]byte, error) {
	data, err := owrtCall(baseURL, session, object, method, args, skipTLS)
	if err != nil && strings.Contains(err.Error(), "unauthorized") {
		owrtClearSession(integID)
		session, err2 := owrtGetSession(baseURL, apiKey, integID, skipTLS)
		if err2 != nil {
			return nil, err2
		}
		return owrtCall(baseURL, session, object, method, args, skipTLS)
	}
	return data, err
}

// ── Main fetch ────────────────────────────────────────────────────────────────

func fetchOpenWrtPanelData(db *sql.DB, config map[string]interface{}) (*OpenWrtPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}

	data := &OpenWrtPanelData{
		UIURL:         uiURL,
		IntegrationID: integrationID,
		Interfaces:    []OpenWrtIface{},
		Clients:       []OpenWrtClient{},
	}

	session, err := owrtGetSession(apiURL, apiKey, integrationID, skipTLS)
	if err != nil {
		return nil, fmt.Errorf("OpenWrt auth failed: %v", err)
	}

	call := func(object, method string, args interface{}) ([]byte, error) {
		return owrtCallRetry(apiURL, apiKey, integrationID, session, object, method, args, skipTLS)
	}

	// ── System info ───────────────────────────────────────────────────────────
	if body, err := call("system", "info", map[string]interface{}{}); err == nil {
		var info struct {
			Uptime   int64   `json:"uptime"`
			Hostname string  `json:"hostname"`
			Load     []int64 `json:"load"`
			Memory   struct {
				Total    int64 `json:"total"`
				Free     int64 `json:"free"`
				Buffered int64 `json:"buffered"`
				Shared   int64 `json:"shared"`
			} `json:"memory"`
		}
		if json.Unmarshal(body, &info) == nil {
			data.Uptime = info.Uptime
			data.Hostname = info.Hostname
			data.MemTotal = info.Memory.Total
			data.MemFree = info.Memory.Free
			data.MemBuffered = info.Memory.Buffered
			if len(info.Load) >= 1 {
				// OpenWrt load values are scaled by 2^16 (65536)
				data.Load1 = float64(info.Load[0]) / 65536.0
			}
		}
	}

	// ── Network interfaces ────────────────────────────────────────────────────
	if body, err := call("network.device", "status", map[string]interface{}{}); err == nil {
		var raw map[string]json.RawMessage
		if json.Unmarshal(body, &raw) == nil {
			now := time.Now()

			cur := &owrtPrev{At: now, InBytes: map[string]int64{}, OutBytes: map[string]int64{}}

			type ifStats struct {
				Up         bool  `json:"up"`
				Carrier    bool  `json:"carrier"`
				RxBytes    int64 `json:"rx_bytes"`
				TxBytes    int64 `json:"tx_bytes"`
				Statistics *struct {
					RxBytes int64 `json:"rx_bytes"`
					TxBytes int64 `json:"tx_bytes"`
				} `json:"statistics"`
			}

			owrtPrevMu.Lock()
			prev := owrtPrevMap[integrationID]
			owrtPrevMu.Unlock()

			var elapsed float64
			if prev != nil {
				elapsed = now.Sub(prev.At).Seconds()
			}

			for name, raw := range raw {
				if name == "lo" {
					continue
				}
				var iface ifStats
				if json.Unmarshal(raw, &iface) != nil {
					continue
				}
				// Prefer stats from nested statistics object (newer OpenWrt)
				var rxBytes, txBytes int64
				if iface.Statistics != nil {
					rxBytes = iface.Statistics.RxBytes
					txBytes = iface.Statistics.TxBytes
				} else {
					rxBytes = iface.RxBytes
					txBytes = iface.TxBytes
				}
				cur.InBytes[name] = rxBytes
				cur.OutBytes[name] = txBytes

				pf := OpenWrtIface{Name: name, Up: iface.Up || iface.Carrier}
				if prev != nil && elapsed > 0 {
					inDelta := rxBytes - prev.InBytes[name]
					outDelta := txBytes - prev.OutBytes[name]
					if inDelta >= 0 {
						pf.InMbps = float64(inDelta) * 8 / elapsed / 1e6
					}
					if outDelta >= 0 {
						pf.OutMbps = float64(outDelta) * 8 / elapsed / 1e6
					}
				}
				data.Interfaces = append(data.Interfaces, pf)
			}

			owrtPrevMu.Lock()
			owrtPrevMap[integrationID] = cur
			owrtPrevMu.Unlock()

			// Sort: up interfaces first, then bridges, then physical, then virtual
			sort.Slice(data.Interfaces, func(i, j int) bool {
				a, b := data.Interfaces[i], data.Interfaces[j]
				if a.Up != b.Up {
					return a.Up
				}
				return a.Name < b.Name
			})
		}
	}

	// ── WiFi clients ──────────────────────────────────────────────────────────
	if body, err := call("iwinfo", "devices", map[string]interface{}{}); err == nil {
		var devResult struct {
			Devices []string `json:"devices"`
		}
		if json.Unmarshal(body, &devResult) == nil {
			for _, dev := range devResult.Devices {
				assocBody, aerr := call("iwinfo", "assoclist", map[string]interface{}{"device": dev})
				if aerr != nil {
					continue
				}
				var assoc struct {
					Results []struct {
						MAC      string `json:"mac"`
						Signal   int    `json:"signal"`
						Noise    int    `json:"noise"`
						Inactive int    `json:"inactive"`
						RX       struct {
							Rate int `json:"rate"` // Kbps
						} `json:"rx"`
						TX struct {
							Rate int `json:"rate"` // Kbps
						} `json:"tx"`
					} `json:"results"`
				}
				if json.Unmarshal(assocBody, &assoc) == nil {
					for _, c := range assoc.Results {
						data.Clients = append(data.Clients, OpenWrtClient{
							MAC:    c.MAC,
							Signal: c.Signal,
							Device: dev,
							TxRate: c.TX.Rate,
							RxRate: c.RX.Rate,
						})
					}
				}
			}
		}
	}
	// Sort clients: best signal first
	sort.Slice(data.Clients, func(i, j int) bool {
		return data.Clients[i].Signal > data.Clients[j].Signal
	})
	data.ClientCount = len(data.Clients)

	return data, nil
}

// ── Test ──────────────────────────────────────────────────────────────────────

func testOpenWrtConnection(apiURL, apiKey string, skipTLS bool) error {
	integID := "test-" + apiURL
	session, err := owrtGetSession(apiURL, apiKey, integID, skipTLS)
	if err != nil {
		return err
	}
	owrtClearSession(integID)
	_, err = owrtCall(apiURL, session, "system", "info", map[string]interface{}{}, skipTLS)
	return err
}
