package handlers

import (
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type UniFiRadio struct {
	Band        string `json:"band"` // "2.4G", "5G", "6G"
	Channel     int    `json:"channel"`
	Utilization int    `json:"cu"` // channel utilization %
	Clients     int    `json:"clients"`
	TxBytes     int64  `json:"txBytes"`
	RxBytes     int64  `json:"rxBytes"`
}

type UniFiPort struct {
	Index    int     `json:"idx"`
	Name     string  `json:"name"`
	Speed    int     `json:"speed"` // Mbps
	Up       bool    `json:"up"`
	PoE      bool    `json:"poe"`
	PoEPower float64 `json:"poePower"` // watts
	TxBytes  int64   `json:"txBytes"`
	RxBytes  int64   `json:"rxBytes"`
}

type UniFiSpeedtest struct {
	Download float64 `json:"dl"` // Mbps
	Upload   float64 `json:"ul"` // Mbps
	RunAt    int64   `json:"at"` // unix timestamp
}

type UniFiWAN struct {
	Name      string          `json:"name"`
	IP        string          `json:"ip"`
	Up        bool            `json:"up"`
	Type      string          `json:"type"` // "dhcp", "pppoe", etc.
	TxMBs     float64         `json:"txMBs"`
	RxMBs     float64         `json:"rxMBs"`
	LatencyMs float64         `json:"latencyMs"`
	Speedtest *UniFiSpeedtest `json:"speedtest,omitempty"`
}

type UniFiDevice struct {
	MAC        string       `json:"mac"`
	Name       string       `json:"name"`
	Model      string       `json:"model"`
	DeviceType string       `json:"type"` // "ap", "sw", "gw"
	IP         string       `json:"ip"`
	State      int          `json:"state"` // 1=connected, 0=disconnected
	Uptime     int64        `json:"uptime"`
	Version    string       `json:"version"`
	CPUPercent float64      `json:"cpu"`
	MemPercent float64      `json:"mem"`
	Clients    int          `json:"clients"`
	TxBytes    int64        `json:"txBytes"`
	RxBytes    int64        `json:"rxBytes"`
	Radios     []UniFiRadio `json:"radios,omitempty"`
	Ports      []UniFiPort  `json:"ports,omitempty"`
	WAN        *UniFiWAN    `json:"wan,omitempty"`
	// Switch port summary
	PortsUp    int     `json:"portsUp"`
	PortsTotal int     `json:"portsTotal"`
	TotalPoEW  float64 `json:"totalPoE"` // total PoE watts delivered
}

type UniFiClient struct {
	MAC          string  `json:"mac"`
	Hostname     string  `json:"hostname"`
	IP           string  `json:"ip"`
	IsWired      bool    `json:"wired"`
	IsGuest      bool    `json:"guest"`
	Band         string  `json:"band"` // "2.4G", "5G", "6G", "" for wired
	RSSI         int     `json:"rssi"`
	Satisfaction int     `json:"satisfaction"` // 0-100
	TxRateMbps   float64 `json:"txRate"`
	RxRateMbps   float64 `json:"rxRate"`
	Uptime       int64   `json:"uptime"`
	SSID         string  `json:"ssid"`
	APIP         string  `json:"apIp"`
}

type UniFiEvent struct {
	Key       string `json:"key"`
	Subsystem string `json:"subsystem"`
	Message   string `json:"msg"`
	Time      int64  `json:"time"`
}

type UniFiPanelData struct {
	UIURL           string        `json:"uiUrl"`
	IntegrationID   string        `json:"integrationId"`
	SiteName        string        `json:"siteName"`
	Devices         []UniFiDevice `json:"devices"`
	Clients         []UniFiClient `json:"clients"`
	Events          []UniFiEvent  `json:"events"`
	TotalDevices    int           `json:"totalDevices"`
	OnlineDevices   int           `json:"onlineDevices"`
	APCount         int           `json:"apCount"`
	SwitchCount     int           `json:"switchCount"`
	GWCount         int           `json:"gwCount"`
	TotalClients    int           `json:"totalClients"`
	WiredClients    int           `json:"wiredClients"`
	WirelessClients int           `json:"wirelessClients"`
	GuestClients    int           `json:"guestClients"`
	WANUp           bool          `json:"wanUp"`
	WANIP           string        `json:"wanIp"`
	WANLatencyMs    float64       `json:"wanLatencyMs"`
	SpeedtestDl     float64       `json:"speedtestDl"`
	SpeedtestUl     float64       `json:"speedtestUl"`
	SpeedtestAt     int64         `json:"speedtestAt"`
}

// ── Session cache ─────────────────────────────────────────────────────────────

type unifiSession struct {
	client    *http.Client
	apiBase   string // e.g. "https://host/proxy/network/api/s/default"
	wsBase    string // e.g. "wss://host/proxy/network/wss/s/default"
	headers   map[string]string
	isLegacy  bool
	isAPIKey  bool
	expiresAt time.Time
}

var (
	unifiSessionsMu sync.Mutex
	unifiSessions   = map[string]*unifiSession{}
)

func unifiGetSession(integrationID, baseURL, apiKey string, skipTLS bool) (*unifiSession, error) {
	unifiSessionsMu.Lock()
	sess := unifiSessions[integrationID]
	if sess != nil && time.Now().Before(sess.expiresAt.Add(-5*time.Minute)) {
		unifiSessionsMu.Unlock()
		return sess, nil
	}
	unifiSessionsMu.Unlock()

	newSess, err := unifiLogin(baseURL, apiKey, skipTLS)
	if err != nil {
		return nil, err
	}

	unifiSessionsMu.Lock()
	unifiSessions[integrationID] = newSess
	unifiSessionsMu.Unlock()
	return newSess, nil
}

func unifiInvalidateSession(integrationID string) {
	unifiSessionsMu.Lock()
	delete(unifiSessions, integrationID)
	unifiSessionsMu.Unlock()
}

func unifiLogin(baseURL, apiKey string, skipTLS bool) (*unifiSession, error) {
	baseURL = strings.TrimRight(baseURL, "/")
	tlsCfg := &tls.Config{Renegotiation: tls.RenegotiateOnceAsClient}
	if skipTLS {
		tlsCfg.InsecureSkipVerify = true //nolint:gosec
	}
	transport := &http.Transport{TLSClientConfig: tlsCfg}

	if !strings.Contains(apiKey, ":") {
		// API key auth — stateless, no session management
		client := &http.Client{Transport: transport, Timeout: 15 * time.Second}
		wsBase := unifiToWSURL(baseURL) + "/proxy/network/wss/s/default"
		return &unifiSession{
			client:    client,
			apiBase:   baseURL + "/proxy/network/api/s/default",
			wsBase:    wsBase,
			headers:   map[string]string{"X-API-KEY": apiKey},
			isAPIKey:  true,
			expiresAt: time.Now().Add(24 * time.Hour),
		}, nil
	}

	// Session auth: split username:password on first colon
	idx := strings.Index(apiKey, ":")
	username := apiKey[:idx]
	password := apiKey[idx+1:]
	credJSON, _ := json.Marshal(map[string]string{"username": username, "password": password})

	jar, _ := cookiejar.New(nil)
	client := &http.Client{Transport: transport, Timeout: 15 * time.Second, Jar: jar}

	// Try UniFi OS path first (port 443, /api/auth/login)
	loginURL := baseURL + "/api/auth/login"
	req, _ := http.NewRequest("POST", loginURL, strings.NewReader(string(credJSON)))
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err == nil && resp.StatusCode == 200 {
		csrf := resp.Header.Get("X-CSRF-Token")
		resp.Body.Close()
		wsBase := unifiToWSURL(baseURL) + "/proxy/network/wss/s/default"
		return &unifiSession{
			client:    client,
			apiBase:   baseURL + "/proxy/network/api/s/default",
			wsBase:    wsBase,
			headers:   map[string]string{"X-CSRF-Token": csrf},
			expiresAt: time.Now().Add(12 * time.Hour),
		}, nil
	}
	if resp != nil {
		resp.Body.Close()
	}

	// Fall back to legacy controller path (/api/login)
	loginURL = baseURL + "/api/login"
	req2, _ := http.NewRequest("POST", loginURL, strings.NewReader(string(credJSON)))
	req2.Header.Set("Content-Type", "application/json")
	resp2, err := client.Do(req2)
	if err != nil {
		return nil, fmt.Errorf("login failed: %w", err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != 200 {
		return nil, fmt.Errorf("login HTTP %d — check credentials", resp2.StatusCode)
	}
	wsBase := unifiToWSURL(baseURL) + "/wss/s/default"
	return &unifiSession{
		client:    client,
		apiBase:   baseURL + "/api/s/default",
		wsBase:    wsBase,
		headers:   map[string]string{},
		isLegacy:  true,
		expiresAt: time.Now().Add(12 * time.Hour),
	}, nil
}

func unifiToWSURL(baseURL string) string {
	u := strings.TrimRight(baseURL, "/")
	if strings.HasPrefix(u, "https://") {
		return "wss://" + u[8:]
	}
	if strings.HasPrefix(u, "http://") {
		return "ws://" + u[7:]
	}
	return "wss://" + u
}

func (sess *unifiSession) get(path string) ([]byte, error) {
	req, err := http.NewRequest("GET", sess.apiBase+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range sess.headers {
		req.Header.Set(k, v)
	}
	resp, err := sess.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("auth error: HTTP %d", resp.StatusCode)
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Raw API response parsing ───────────────────────────────────────────────────

type unifiAPIResp struct {
	Meta struct {
		RC string `json:"rc"`
	} `json:"meta"`
	Data json.RawMessage `json:"data"`
}

type rawUniFiDevice struct {
	MAC      string `json:"mac"`
	Type     string `json:"type"`
	Name     string `json:"name"`
	Model    string `json:"model"`
	IP       string `json:"ip"`
	State    int    `json:"state"`
	Uptime   int64  `json:"uptime"`
	Version  string `json:"version"`
	NumSta   int    `json:"num_sta"`
	TxBytes  int64  `json:"tx_bytes"`
	RxBytes  int64  `json:"rx_bytes"`
	SysStats struct {
		CPU json.Number `json:"cpu"`
		Mem json.Number `json:"mem"`
	} `json:"system-stats"`
	RadioTableStats []struct {
		Radio   string      `json:"radio"`
		Channel int         `json:"channel"`
		CUTotal json.Number `json:"cu_total"`
		NumSta  int         `json:"num_sta"`
		TxBytes int64       `json:"tx_bytes"`
		RxBytes int64       `json:"rx_bytes"`
	} `json:"radio_table_stats"`
	PortTable []struct {
		PortIdx   int         `json:"port_idx"`
		Name      string      `json:"name"`
		Speed     int         `json:"speed"`
		Up        bool        `json:"up"`
		PoEEnable bool        `json:"poe_enable"`
		PoEPower  json.Number `json:"poe_power"`
		TxBytes   int64       `json:"tx_bytes"`
		RxBytes   int64       `json:"rx_bytes"`
	} `json:"port_table"`
	WAN1 *struct {
		IP      string      `json:"ip"`
		Type    string      `json:"type"`
		Up      bool        `json:"up"`
		RxBytes int64       `json:"rx_bytes"`
		TxBytes int64       `json:"tx_bytes"`
		Latency json.Number `json:"latency"`
	} `json:"wan1"`
	WAN2 *struct {
		IP   string `json:"ip"`
		Type string `json:"type"`
		Up   bool   `json:"up"`
	} `json:"wan2"`
	SpeedtestStatus *struct {
		Download json.Number `json:"download"`
		Upload   json.Number `json:"upload"`
		Rundate  int64       `json:"rundate"`
	} `json:"speedtest-status"`
}

type rawUniFiClient struct {
	MAC          string      `json:"mac"`
	Hostname     string      `json:"hostname"`
	IP           string      `json:"ip"`
	IsWired      bool        `json:"is_wired"`
	IsGuest      bool        `json:"is_guest"`
	Radio        string      `json:"radio"`
	RSSI         int         `json:"rssi"`
	Signal       int         `json:"signal"`
	Satisfaction json.Number `json:"satisfaction"`
	TxRate       json.Number `json:"tx_rate"` // Kbps
	RxRate       json.Number `json:"rx_rate"` // Kbps
	Uptime       int64       `json:"uptime"`
	ESSID        string      `json:"essid"`
	APIP         string      `json:"ap_ip"`
}

// ── Data fetching ─────────────────────────────────────────────────────────────

func unifiRadioBand(radio string) string {
	switch radio {
	case "ng":
		return "2.4G"
	case "na":
		return "5G"
	case "6e", "ax":
		return "6G"
	default:
		return radio
	}
}

func unifiDeviceType(rawType string) string {
	switch rawType {
	case "uap":
		return "ap"
	case "usw":
		return "sw"
	default:
		// ugw, udm, udm-pro, uxg, usg → gateway
		return "gw"
	}
}

func jsonFloat(n json.Number) float64 {
	f, _ := strconv.ParseFloat(n.String(), 64)
	return f
}

func uniFiFetchDevices(sess *unifiSession) ([]UniFiDevice, error) {
	body, err := sess.get("/stat/device")
	if err != nil {
		return nil, err
	}
	var resp unifiAPIResp
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("parse devices: %w", err)
	}
	var raw []rawUniFiDevice
	if err := json.Unmarshal(resp.Data, &raw); err != nil {
		return nil, fmt.Errorf("decode devices: %w", err)
	}

	out := make([]UniFiDevice, 0, len(raw))
	for _, r := range raw {
		d := UniFiDevice{
			MAC:        r.MAC,
			Name:       r.Name,
			Model:      r.Model,
			DeviceType: unifiDeviceType(r.Type),
			IP:         r.IP,
			State:      r.State,
			Uptime:     r.Uptime,
			Version:    r.Version,
			Clients:    r.NumSta,
			TxBytes:    r.TxBytes,
			RxBytes:    r.RxBytes,
			CPUPercent: jsonFloat(r.SysStats.CPU),
			MemPercent: jsonFloat(r.SysStats.Mem),
		}

		// AP radios
		for _, rt := range r.RadioTableStats {
			d.Radios = append(d.Radios, UniFiRadio{
				Band:        unifiRadioBand(rt.Radio),
				Channel:     rt.Channel,
				Utilization: int(jsonFloat(rt.CUTotal)),
				Clients:     rt.NumSta,
				TxBytes:     rt.TxBytes,
				RxBytes:     rt.RxBytes,
			})
		}

		// Switch ports
		for _, p := range r.PortTable {
			poePower := jsonFloat(p.PoEPower)
			d.Ports = append(d.Ports, UniFiPort{
				Index:    p.PortIdx,
				Name:     p.Name,
				Speed:    p.Speed,
				Up:       p.Up,
				PoE:      p.PoEEnable,
				PoEPower: poePower,
				TxBytes:  p.TxBytes,
				RxBytes:  p.RxBytes,
			})
			if p.Up {
				d.PortsUp++
			}
			d.PortsTotal++
			if p.PoEEnable {
				d.TotalPoEW += poePower
			}
		}

		// Gateway WAN
		if r.WAN1 != nil {
			wan := &UniFiWAN{
				Name:      "WAN",
				IP:        r.WAN1.IP,
				Up:        r.WAN1.Up,
				Type:      r.WAN1.Type,
				TxMBs:     float64(r.WAN1.TxBytes) / 1048576,
				RxMBs:     float64(r.WAN1.RxBytes) / 1048576,
				LatencyMs: jsonFloat(r.WAN1.Latency),
			}
			if r.SpeedtestStatus != nil {
				wan.Speedtest = &UniFiSpeedtest{
					Download: jsonFloat(r.SpeedtestStatus.Download),
					Upload:   jsonFloat(r.SpeedtestStatus.Upload),
					RunAt:    r.SpeedtestStatus.Rundate,
				}
			}
			d.WAN = wan
		}

		out = append(out, d)
	}

	// Sort: GW first, then AP, then switch; within type sort by name
	sort.Slice(out, func(i, j int) bool {
		pi, pj := unifiDeviceSortPriority(out[i].DeviceType), unifiDeviceSortPriority(out[j].DeviceType)
		if pi != pj {
			return pi < pj
		}
		return out[i].Name < out[j].Name
	})
	return out, nil
}

func unifiDeviceSortPriority(t string) int {
	switch t {
	case "gw":
		return 0
	case "ap":
		return 1
	default:
		return 2
	}
}

func uniFiFetchClients(sess *unifiSession) ([]UniFiClient, error) {
	body, err := sess.get("/stat/sta")
	if err != nil {
		return nil, err
	}
	var resp unifiAPIResp
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("parse clients: %w", err)
	}
	var raw []rawUniFiClient
	if err := json.Unmarshal(resp.Data, &raw); err != nil {
		return nil, fmt.Errorf("decode clients: %w", err)
	}

	out := make([]UniFiClient, 0, len(raw))
	for _, r := range raw {
		hostname := r.Hostname
		if hostname == "" {
			hostname = r.MAC
		}
		rssi := r.RSSI
		if rssi == 0 {
			rssi = r.Signal
		}
		c := UniFiClient{
			MAC:          r.MAC,
			Hostname:     hostname,
			IP:           r.IP,
			IsWired:      r.IsWired,
			IsGuest:      r.IsGuest,
			RSSI:         rssi,
			Satisfaction: int(jsonFloat(r.Satisfaction)),
			TxRateMbps:   jsonFloat(r.TxRate) / 1000,
			RxRateMbps:   jsonFloat(r.RxRate) / 1000,
			Uptime:       r.Uptime,
			SSID:         r.ESSID,
			APIP:         r.APIP,
		}
		if !r.IsWired {
			c.Band = unifiRadioBand(r.Radio)
		}
		out = append(out, c)
	}

	// Sort: wired first, then wireless by satisfaction desc
	sort.Slice(out, func(i, j int) bool {
		if out[i].IsWired != out[j].IsWired {
			return out[i].IsWired
		}
		return out[i].Satisfaction > out[j].Satisfaction
	})
	return out, nil
}

func uniFiFetchEvents(sess *unifiSession) ([]UniFiEvent, error) {
	body, err := sess.get("/stat/event?_limit=30")
	if err != nil {
		return nil, err
	}
	var resp unifiAPIResp
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, nil // events are non-critical
	}
	var raw []struct {
		Key       string `json:"key"`
		Subsystem string `json:"subsystem"`
		Msg       string `json:"msg"`
		Time      int64  `json:"time"`
	}
	if err := json.Unmarshal(resp.Data, &raw); err != nil {
		return nil, nil
	}
	out := make([]UniFiEvent, 0, len(raw))
	for _, r := range raw {
		msg := r.Msg
		if len(msg) > 120 {
			msg = msg[:120] + "…"
		}
		out = append(out, UniFiEvent{
			Key:       r.Key,
			Subsystem: r.Subsystem,
			Message:   msg,
			Time:      r.Time,
		})
	}
	return out, nil
}

func uniFiFetchSiteName(sess *unifiSession) string {
	body, err := sess.get("/stat/sysinfo")
	if err != nil {
		return ""
	}
	var resp unifiAPIResp
	if err := json.Unmarshal(body, &resp); err != nil {
		return ""
	}
	var info []struct {
		Hostname string `json:"hostname"`
	}
	if err := json.Unmarshal(resp.Data, &info); err != nil || len(info) == 0 {
		return ""
	}
	return info[0].Hostname
}

func uniFiBuildPanelData(devices []UniFiDevice, clients []UniFiClient, events []UniFiEvent, siteName, uiURL, integrationID string) *UniFiPanelData {
	d := &UniFiPanelData{
		UIURL:         uiURL,
		IntegrationID: integrationID,
		SiteName:      siteName,
		Devices:       devices,
		Clients:       clients,
		Events:        events,
		TotalDevices:  len(devices),
	}
	for i := range devices {
		if devices[i].State == 1 {
			d.OnlineDevices++
		}
		switch devices[i].DeviceType {
		case "ap":
			d.APCount++
		case "sw":
			d.SwitchCount++
		case "gw":
			d.GWCount++
			if devices[i].WAN != nil && devices[i].WAN.Up {
				d.WANUp = true
				d.WANIP = devices[i].WAN.IP
				d.WANLatencyMs = devices[i].WAN.LatencyMs
				if devices[i].WAN.Speedtest != nil {
					d.SpeedtestDl = devices[i].WAN.Speedtest.Download
					d.SpeedtestUl = devices[i].WAN.Speedtest.Upload
					d.SpeedtestAt = devices[i].WAN.Speedtest.RunAt
				}
			}
		}
	}
	for i := range clients {
		d.TotalClients++
		if clients[i].IsWired {
			d.WiredClients++
		} else {
			d.WirelessClients++
		}
		if clients[i].IsGuest {
			d.GuestClients++
		}
	}
	return d
}

// ── Panel data accessor (reads worker cache) ──────────────────────────────────

func fetchUniFiPanelData(db *sql.DB, config map[string]interface{}) (*UniFiPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	_, uiURL, _, _, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if cached := unifiGetCached(integrationID); cached.TotalDevices > 0 || cached.IntegrationID != "" {
		return cached, nil
	}
	// Cache miss — do a fresh REST fetch (worker not running yet or first load)
	apiURL, uiURL2, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	_ = uiURL
	sess, err := unifiLogin(apiURL, apiKey, skipTLS)
	if err != nil {
		return nil, fmt.Errorf("auth: %w", err)
	}
	devices, err := uniFiFetchDevices(sess)
	if err != nil {
		return nil, fmt.Errorf("devices: %w", err)
	}
	clients, _ := uniFiFetchClients(sess)
	events, _ := uniFiFetchEvents(sess)
	siteName := uniFiFetchSiteName(sess)
	return uniFiBuildPanelData(devices, clients, events, siteName, uiURL2, integrationID), nil
}

func unifiGetCached(integrationID string) *UniFiPanelData {
	if cached, ok := cacheGet(integrationID); ok {
		if d, ok := cached.(*UniFiPanelData); ok {
			return d
		}
	}
	return &UniFiPanelData{}
}

// ── Connection test ───────────────────────────────────────────────────────────

func testUniFiConnection(apiURL, apiKey string, skipTLS bool) error {
	sess, err := unifiLogin(apiURL, apiKey, skipTLS)
	if err != nil {
		return err
	}
	body, err := sess.get("/stat/sysinfo")
	if err != nil {
		return fmt.Errorf("sysinfo: %w", err)
	}
	var resp unifiAPIResp
	if err := json.Unmarshal(body, &resp); err != nil {
		return fmt.Errorf("invalid response")
	}
	if resp.Meta.RC != "ok" {
		return fmt.Errorf("controller returned rc=%s", resp.Meta.RC)
	}
	return nil
}
