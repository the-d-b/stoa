package handlers

import (
	"bytes"
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

type OmadaDevice struct {
	Name        string `json:"name"`
	Model       string `json:"model"`
	DeviceType  int    `json:"type"`   // 1=AP, 2=GW, 3=Switch
	Status      int    `json:"status"` // 1=online, 0=offline
	ClientCount int    `json:"clientCount"`
	UpTime      int64  `json:"upTime"` // seconds
}

type OmadaClient struct {
	Name        string  `json:"name"`
	MAC         string  `json:"mac"`
	ClientType  int     `json:"type"` // 0=wireless, 1=wired
	Band        string  `json:"band"` // "2.4GHz" / "5GHz"
	SSID        string  `json:"ssid"`
	SignalLevel int     `json:"signalLevel"` // 0-4 bars
	RxRate      float64 `json:"rxRate"`      // Mbps
	TxRate      float64 `json:"txRate"`      // Mbps
}

type OmadaAlert struct {
	Severity   string `json:"severity"`
	Message    string `json:"message"`
	DeviceName string `json:"deviceName"`
	Timestamp  int64  `json:"timestamp"` // ms
}

type OmadaSite struct {
	SiteID              string `json:"siteId"`
	Name                string `json:"name"`
	DeviceCount         int    `json:"deviceCount"`
	OnlineDeviceCount   int    `json:"onlineDeviceCount"`
	APCount             int    `json:"apCount"`
	ClientCount         int    `json:"clientCount"`
	WiredClientCount    int    `json:"wiredClientCount"`
	WirelessClientCount int    `json:"wirelessClientCount"`
}

type OmadaPanelData struct {
	UIURL           string        `json:"uiUrl"`
	IntegrationID   string        `json:"integrationId"`
	Sites           []OmadaSite   `json:"sites"`
	Devices         []OmadaDevice `json:"devices"`
	Clients         []OmadaClient `json:"clients"`
	Alerts          []OmadaAlert  `json:"alerts"`
	TotalDevices    int           `json:"totalDevices"`
	OnlineDevices   int           `json:"onlineDevices"`
	TotalClients    int           `json:"totalClients"`
	WirelessClients int           `json:"wirelessClients"`
	WiredClients    int           `json:"wiredClients"`
	APCount         int           `json:"apCount"`
}

// ── Session cache ─────────────────────────────────────────────────────────────

type omadaSession struct {
	Token     string
	OmadacID  string
	ExpiresAt time.Time
}

var (
	omadaSessionsMu sync.Mutex
	omadaSessions   = map[string]*omadaSession{} // integID → session
)

// ── HTTP helpers ──────────────────────────────────────────────────────────────

func omadaGet(baseURL, token, omadacID, path string, skipTLS bool) ([]byte, error) {
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-OMADA-AC-ID", omadacID)
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
		return nil, fmt.Errorf("HTTP %d from Omada", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func omadaLogin(baseURL, username, password string, skipTLS bool) (*omadaSession, error) {
	// Step 1: get omadacId (unauthenticated)
	infoReq, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+"/api/v2/openapi/logininfo", nil)
	if err != nil {
		return nil, err
	}
	infoResp, err := httpClient(skipTLS).Do(infoReq)
	if err != nil {
		return nil, fmt.Errorf("logininfo: %v", err)
	}
	defer infoResp.Body.Close()
	infoBody, _ := io.ReadAll(infoResp.Body)

	var loginInfo struct {
		ErrorCode int `json:"errorCode"`
		Result    struct {
			OmadacID string `json:"omadacId"`
		} `json:"result"`
	}
	if json.Unmarshal(infoBody, &loginInfo) != nil || loginInfo.Result.OmadacID == "" {
		return nil, fmt.Errorf("no omadacId in logininfo response")
	}
	omadacID := loginInfo.Result.OmadacID

	// Step 2: POST login with base64-encoded password
	b64Pass := base64.StdEncoding.EncodeToString([]byte(password))
	payload, _ := json.Marshal(map[string]string{
		"omadacId": omadacID,
		"username": username,
		"password": b64Pass,
	})
	loginReq, err := http.NewRequest("POST", strings.TrimRight(baseURL, "/")+"/api/v2/openapi/login", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	loginReq.Header.Set("Content-Type", "application/json")
	loginResp2, err := httpClient(skipTLS).Do(loginReq)
	if err != nil {
		return nil, fmt.Errorf("login: %v", err)
	}
	defer loginResp2.Body.Close()
	loginBody, _ := io.ReadAll(loginResp2.Body)
	if loginResp2.StatusCode >= 400 {
		return nil, fmt.Errorf("login HTTP %d", loginResp2.StatusCode)
	}

	var loginResult struct {
		ErrorCode int `json:"errorCode"`
		Result    struct {
			Token     string `json:"token"`
			ExpiresAt int64  `json:"expiresAt"` // ms since epoch
		} `json:"result"`
	}
	if json.Unmarshal(loginBody, &loginResult) != nil || loginResult.Result.Token == "" {
		return nil, fmt.Errorf("no token in login response")
	}
	expiresAt := time.Now().Add(30 * time.Minute)
	if loginResult.Result.ExpiresAt > 0 {
		expiresAt = time.Unix(loginResult.Result.ExpiresAt/1000, 0)
	}
	return &omadaSession{
		Token:     loginResult.Result.Token,
		OmadacID:  omadacID,
		ExpiresAt: expiresAt,
	}, nil
}

func omadaGetSession(baseURL, apiKey, integID string, skipTLS bool) (*omadaSession, error) {
	omadaSessionsMu.Lock()
	sess := omadaSessions[integID]
	omadaSessionsMu.Unlock()
	// Reuse session if it won't expire within the next 2 minutes
	if sess != nil && time.Now().Before(sess.ExpiresAt.Add(-2*time.Minute)) {
		return sess, nil
	}

	colonIdx := strings.Index(apiKey, ":")
	if colonIdx < 0 {
		return nil, fmt.Errorf("Omada credentials must be username:password")
	}
	username := apiKey[:colonIdx]
	password := apiKey[colonIdx+1:]

	sess, err := omadaLogin(baseURL, username, password, skipTLS)
	if err != nil {
		return nil, err
	}
	omadaSessionsMu.Lock()
	omadaSessions[integID] = sess
	omadaSessionsMu.Unlock()
	return sess, nil
}

func omadaClearSession(integID string) {
	omadaSessionsMu.Lock()
	delete(omadaSessions, integID)
	omadaSessionsMu.Unlock()
}

// ── Main fetch ────────────────────────────────────────────────────────────────

func fetchOmadaPanelData(db *sql.DB, config map[string]interface{}) (*OmadaPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}

	data := &OmadaPanelData{
		UIURL:         uiURL,
		IntegrationID: integrationID,
		Sites:         []OmadaSite{},
		Devices:       []OmadaDevice{},
		Clients:       []OmadaClient{},
		Alerts:        []OmadaAlert{},
	}

	sess, err := omadaGetSession(apiURL, apiKey, integrationID, skipTLS)
	if err != nil {
		return nil, fmt.Errorf("Omada auth: %v", err)
	}

	// Wrapper that retries once on unauthorized by re-authenticating.
	get := func(path string) ([]byte, error) {
		body, err := omadaGet(apiURL, sess.Token, sess.OmadacID, path, skipTLS)
		if err != nil && strings.Contains(err.Error(), "unauthorized") {
			omadaClearSession(integrationID)
			sess2, err2 := omadaGetSession(apiURL, apiKey, integrationID, skipTLS)
			if err2 != nil {
				return nil, err2
			}
			sess = sess2
			return omadaGet(apiURL, sess.Token, sess.OmadacID, path, skipTLS)
		}
		return body, err
	}

	// ── Sites ─────────────────────────────────────────────────────────────────
	if body, err := get("/api/v2/openapi/sites?currentPage=1&currentPageSize=100"); err == nil {
		var resp struct {
			Result struct {
				Data []struct {
					SiteID              string `json:"siteId"`
					Name                string `json:"name"`
					DeviceCount         int    `json:"deviceCount"`
					OnlineDeviceCount   int    `json:"onlineDeviceCount"`
					APCount             int    `json:"apCount"`
					ClientCount         int    `json:"clientCount"`
					WiredClientCount    int    `json:"wiredClientCount"`
					WirelessClientCount int    `json:"wirelessClientCount"`
				} `json:"data"`
			} `json:"result"`
		}
		if json.Unmarshal(body, &resp) == nil {
			for _, s := range resp.Result.Data {
				data.Sites = append(data.Sites, OmadaSite{
					SiteID:              s.SiteID,
					Name:                s.Name,
					DeviceCount:         s.DeviceCount,
					OnlineDeviceCount:   s.OnlineDeviceCount,
					APCount:             s.APCount,
					ClientCount:         s.ClientCount,
					WiredClientCount:    s.WiredClientCount,
					WirelessClientCount: s.WirelessClientCount,
				})
				data.TotalDevices += s.DeviceCount
				data.OnlineDevices += s.OnlineDeviceCount
				data.TotalClients += s.ClientCount
				data.WiredClients += s.WiredClientCount
				data.WirelessClients += s.WirelessClientCount
				data.APCount += s.APCount
			}
		}
	}

	// ── Devices per site ──────────────────────────────────────────────────────
	for _, site := range data.Sites {
		path := fmt.Sprintf("/api/v2/openapi/devices?siteId=%s&currentPage=1&currentPageSize=100", site.SiteID)
		if body, err := get(path); err == nil {
			var resp struct {
				Result struct {
					Data []struct {
						Name        string `json:"name"`
						Model       string `json:"model"`
						Type        int    `json:"type"`
						Status      int    `json:"status"`
						ClientCount int    `json:"clientCount"`
						UpTime      int64  `json:"upTime"`
					} `json:"data"`
				} `json:"result"`
			}
			if json.Unmarshal(body, &resp) == nil {
				for _, d := range resp.Result.Data {
					data.Devices = append(data.Devices, OmadaDevice{
						Name:        d.Name,
						Model:       d.Model,
						DeviceType:  d.Type,
						Status:      d.Status,
						ClientCount: d.ClientCount,
						UpTime:      d.UpTime,
					})
				}
			}
		}
	}

	// Sort: online first, then by type priority (GW > AP > Switch), then name
	typeOrder := func(t int) int {
		switch t {
		case 2:
			return 0 // Gateway
		case 1:
			return 1 // AP
		case 3:
			return 2 // Switch
		default:
			return 3
		}
	}
	sort.Slice(data.Devices, func(i, j int) bool {
		a, b := data.Devices[i], data.Devices[j]
		if a.Status != b.Status {
			return a.Status > b.Status // online first
		}
		oa, ob := typeOrder(a.DeviceType), typeOrder(b.DeviceType)
		if oa != ob {
			return oa < ob
		}
		return a.Name < b.Name
	})

	// ── Clients per site (limit to 3 sites to cap API calls) ─────────────────
	for i, site := range data.Sites {
		if i >= 3 {
			break
		}
		path := fmt.Sprintf("/api/v2/openapi/clients?siteId=%s&currentPage=1&currentPageSize=50", site.SiteID)
		if body, err := get(path); err == nil {
			var resp struct {
				Result struct {
					Data []struct {
						Name        string  `json:"name"`
						MAC         string  `json:"mac"`
						Type        int     `json:"type"`
						Band        string  `json:"band"`
						SSID        string  `json:"ssid"`
						SignalLevel int     `json:"signalLevel"`
						RxRate      float64 `json:"rxRate"`
						TxRate      float64 `json:"txRate"`
					} `json:"data"`
				} `json:"result"`
			}
			if json.Unmarshal(body, &resp) == nil {
				for _, c := range resp.Result.Data {
					data.Clients = append(data.Clients, OmadaClient{
						Name:        c.Name,
						MAC:         c.MAC,
						ClientType:  c.Type,
						Band:        c.Band,
						SSID:        c.SSID,
						SignalLevel: c.SignalLevel,
						RxRate:      c.RxRate,
						TxRate:      c.TxRate,
					})
				}
			}
		}
	}
	// Wireless clients first, sorted by signal level desc
	sort.Slice(data.Clients, func(i, j int) bool {
		a, b := data.Clients[i], data.Clients[j]
		if a.ClientType != b.ClientType {
			return a.ClientType < b.ClientType // wireless (0) before wired (1)
		}
		return a.SignalLevel > b.SignalLevel
	})

	// ── Alerts for first site ─────────────────────────────────────────────────
	if len(data.Sites) > 0 {
		path := fmt.Sprintf("/api/v2/openapi/alerts?siteId=%s&currentPage=1&currentPageSize=10", data.Sites[0].SiteID)
		if body, err := get(path); err == nil {
			var resp struct {
				Result struct {
					Data []struct {
						Severity   string `json:"severity"`
						Message    string `json:"message"`
						DeviceName string `json:"deviceName"`
						Timestamp  int64  `json:"timestamp"`
					} `json:"data"`
				} `json:"result"`
			}
			if json.Unmarshal(body, &resp) == nil {
				for _, a := range resp.Result.Data {
					data.Alerts = append(data.Alerts, OmadaAlert{
						Severity:   a.Severity,
						Message:    a.Message,
						DeviceName: a.DeviceName,
						Timestamp:  a.Timestamp,
					})
				}
			}
		}
	}

	return data, nil
}

// ── Test ──────────────────────────────────────────────────────────────────────

func testOmadaConnection(apiURL, apiKey string, skipTLS bool) error {
	integID := "test-" + apiURL
	sess, err := omadaGetSession(apiURL, apiKey, integID, skipTLS)
	if err != nil {
		return err
	}
	omadaClearSession(integID)
	_, err = omadaGet(apiURL, sess.Token, sess.OmadacID, "/api/v2/openapi/sites?currentPage=1&currentPageSize=1", skipTLS)
	return err
}
