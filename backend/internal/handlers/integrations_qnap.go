package handlers

import (
	"crypto/md5"
	"database/sql"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
)

// errQNAPUnauth signals session expiry (authPassed=0 or HTTP 401).
var errQNAPUnauth = errors.New("qnap: session invalid")

// ── Types ─────────────────────────────────────────────────────────────────────

type QNAPPanelData struct {
	UIURL      string       `json:"uiUrl"`
	Hostname   string       `json:"hostname"`
	Model      string       `json:"model"`
	FWVersion  string       `json:"fwVersion"`
	UptimeSecs int64        `json:"uptimeSecs"`
	CPUPercent float64      `json:"cpuPercent"`
	RAMPercent float64      `json:"ramPercent"`
	RAMTotalGB float64      `json:"ramTotalGb"`
	RAMUsedGB  float64      `json:"ramUsedGb"`
	Volumes    []QNAPVolume `json:"volumes"`
	Disks      []QNAPDisk   `json:"disks"`
	NetRxMBs   float64      `json:"netRxMbs"` // aggregate across interfaces
	NetTxMBs   float64      `json:"netTxMbs"`
	Shares     []string     `json:"shares"`
}

type QNAPVolume struct {
	Label    string  `json:"label"`
	Status   string  `json:"status"`
	RAIDType string  `json:"raidType"`
	FSType   string  `json:"fsType"`
	TotalGB  float64 `json:"totalGb"`
	UsedGB   float64 `json:"usedGb"`
	UsedPct  float64 `json:"usedPct"`
}

type QNAPDisk struct {
	ID          string  `json:"id"`
	Model       string  `json:"model"`
	SizeGB      float64 `json:"sizeGb"`
	TempC       int     `json:"tempC"`
	Status      string  `json:"status"`
	SMARTStatus string  `json:"smartStatus"`
}

// ── Session cache ─────────────────────────────────────────────────────────────

var (
	qnapSessions   = map[string]string{}
	qnapSessionsMu sync.Mutex
)

func qnapGetSession(id string) string {
	qnapSessionsMu.Lock()
	defer qnapSessionsMu.Unlock()
	return qnapSessions[id]
}

func qnapSetSession(id, sid string) {
	qnapSessionsMu.Lock()
	defer qnapSessionsMu.Unlock()
	qnapSessions[id] = sid
}

func qnapClearSession(id string) {
	qnapSessionsMu.Lock()
	defer qnapSessionsMu.Unlock()
	delete(qnapSessions, id)
}

// ── Auth ──────────────────────────────────────────────────────────────────────

// qnapLogin authenticates and returns an authSid session token.
// QNAP requires the password to be MD5-hashed (lowercase hex), matching
// how the QTS web UI sends credentials from the browser.
func qnapLogin(baseURL, username, password string, skipTLS bool) (string, error) {
	h := md5.Sum([]byte(password))
	md5pass := fmt.Sprintf("%x", h)

	endpoint := strings.TrimRight(baseURL, "/") +
		"/cgi-bin/authLogin.cgi?user=" + username +
		"&passwd=" + md5pass +
		"&serviceKey=1&rememberme=1"

	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return "", err
	}
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var result struct {
		XMLName    xml.Name `xml:"QDocRoot"`
		AuthPassed string   `xml:"authPassed"`
		AuthSid    string   `xml:"authSid"`
	}
	if xml.Unmarshal(body, &result) != nil {
		return "", fmt.Errorf("invalid response from QNAP — check API URL and port")
	}
	if result.AuthPassed != "1" {
		return "", fmt.Errorf("authentication failed — check username and password")
	}
	if result.AuthSid == "" {
		return "", fmt.Errorf("empty session token from QNAP")
	}
	return result.AuthSid, nil
}

// qnapGet performs a GET request to a QNAP CGI endpoint with the session token.
// Returns errQNAPUnauth on HTTP 401 or when the response signals authPassed=0.
func qnapGet(baseURL, sid, path string, skipTLS bool) ([]byte, error) {
	sep := "?"
	if strings.Contains(path, "?") {
		sep = "&"
	}
	endpoint := strings.TrimRight(baseURL, "/") + path + sep + "sid=" + sid

	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, errQNAPUnauth
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from QNAP", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)

	// Detect session expiry in the response body
	var check struct {
		XMLName    xml.Name `xml:"QDocRoot"`
		AuthPassed string   `xml:"authPassed"`
	}
	if xml.Unmarshal(body, &check) == nil && check.AuthPassed == "0" {
		return nil, errQNAPUnauth
	}
	return body, nil
}

// ── Memory unit heuristic ─────────────────────────────────────────────────────

// qnapMemToGB converts a raw QNAP memory value to GB.
// QTS reports memory in one of three units depending on firmware version:
//   - MB  (value < 100,000)         e.g. 8192 for 8 GB
//   - KB  (100,000 ≤ value < 10^10) e.g. 8,388,608 for 8 GB
//   - B   (value ≥ 10^10)           e.g. 8,589,934,592 for 8 GB
func qnapMemToGB(v int64) float64 {
	if v <= 0 {
		return 0
	}
	if v < 100_000 {
		return float64(v) / 1024 // MB → GB
	}
	if v < 10_000_000_000 {
		return float64(v) / 1_048_576 // KB → GB
	}
	return float64(v) / 1_073_741_824 // B → GB
}

// ── Data fetch ────────────────────────────────────────────────────────────────

func qnapFetchAll(apiURL, sid, uiURL string, skipTLS bool) (*QNAPPanelData, error) {
	data := &QNAPPanelData{UIURL: uiURL}

	// ── System info: CPU, RAM, uptime, hostname, model, firmware ─────────────
	// QTS 4.x nests these under func>ownContent; QTS 5.x puts them at top level.
	// Both path variants are included so either structure decodes correctly.
	if body, err := qnapGet(apiURL, sid, "/cgi-bin/management/manaRequest.cgi?subfunc=sysinfo&hd=no&multicpu=1", skipTLS); err == nil {
		var info struct {
			XMLName xml.Name `xml:"QDocRoot"`
			// Top-level fields (QTS 5.x)
			CPUFlat  int    `xml:"CPU_Usage"`
			MemSizeF int64  `xml:"Memory_Size"`
			MemFreeF int64  `xml:"Memory_Free"`
			UptimeF  int64  `xml:"uptime"`
			NetRxF   int64  `xml:"net_rx"` // bytes/sec aggregate; may be absent
			NetTxF   int64  `xml:"net_tx"`
			// Nested under func > ownContent (QTS 4.x)
			CPUNest  int   `xml:"func>ownContent>CPU_Usage"`
			MemSizeN int64 `xml:"func>ownContent>Memory_Size"`
			MemFreeN int64 `xml:"func>ownContent>Memory_Free"`
			UptimeN  int64 `xml:"func>ownContent>uptime"`
			NetRxN   int64 `xml:"func>ownContent>net_rx"`
			NetTxN   int64 `xml:"func>ownContent>net_tx"`
			// Always top-level
			Hostname  string `xml:"host_name"`
			Model     string `xml:"model"`
			FWVersion string `xml:"fw_version"`
		}
		if xml.Unmarshal(body, &info) == nil {
			data.Hostname = info.Hostname
			data.Model = info.Model
			data.FWVersion = info.FWVersion

			cpu := info.CPUFlat
			if info.CPUNest > 0 {
				cpu = info.CPUNest
			}
			data.CPUPercent = float64(cpu)

			memTotal := info.MemSizeF
			if info.MemSizeN > 0 {
				memTotal = info.MemSizeN
			}
			memFree := info.MemFreeF
			if info.MemFreeN > 0 {
				memFree = info.MemFreeN
			}
			uptime := info.UptimeF
			if info.UptimeN > 0 {
				uptime = info.UptimeN
			}
			data.UptimeSecs = uptime
			data.RAMTotalGB = qnapMemToGB(memTotal)
			data.RAMUsedGB = data.RAMTotalGB - qnapMemToGB(memFree)
			if data.RAMTotalGB > 0 {
				data.RAMPercent = data.RAMUsedGB / data.RAMTotalGB * 100
			}

			netRx := info.NetRxF
			if info.NetRxN > 0 {
				netRx = info.NetRxN
			}
			netTx := info.NetTxF
			if info.NetTxN > 0 {
				netTx = info.NetTxN
			}
			data.NetRxMBs = float64(netRx) / 1_048_576
			data.NetTxMBs = float64(netTx) / 1_048_576
		}
	} else if errors.Is(err, errQNAPUnauth) {
		return nil, err
	}

	// ── Volumes ───────────────────────────────────────────────────────────────
	if body, err := qnapGet(apiURL, sid, "/cgi-bin/disk/diskRequest.cgi?subfunc=volume_list", skipTLS); err == nil {
		var resp struct {
			XMLName xml.Name `xml:"QDocRoot"`
			Volumes []struct {
				Label    string `xml:"label"`
				Status   string `xml:"status"`
				RAIDType string `xml:"raid_type"`
				FSType   string `xml:"fs_type"`
				Capacity int64  `xml:"capacity"` // bytes
				Free     int64  `xml:"free"`      // bytes
			} `xml:"volume_list>volume"`
		}
		if xml.Unmarshal(body, &resp) == nil {
			for _, v := range resp.Volumes {
				totalGB := float64(v.Capacity) / 1_073_741_824
				freeGB := float64(v.Free) / 1_073_741_824
				usedGB := totalGB - freeGB
				pct := 0.0
				if totalGB > 0 {
					pct = usedGB / totalGB * 100
				}
				label := v.Label
				if label == "" {
					label = "Volume"
				}
				data.Volumes = append(data.Volumes, QNAPVolume{
					Label:    label,
					Status:   v.Status,
					RAIDType: v.RAIDType,
					FSType:   v.FSType,
					TotalGB:  totalGB,
					UsedGB:   usedGB,
					UsedPct:  pct,
				})
			}
		}
	}

	// ── Disks ─────────────────────────────────────────────────────────────────
	if body, err := qnapGet(apiURL, sid, "/cgi-bin/disk/diskRequest.cgi?subfunc=disk_overview", skipTLS); err == nil {
		var resp struct {
			XMLName xml.Name `xml:"QDocRoot"`
			Disks   []struct {
				ID          string `xml:"id"`
				Model       string `xml:"model"`
				Capacity    int64  `xml:"capacity"` // bytes
				Temperature int    `xml:"temperature"`
				Status      string `xml:"status"`
				SmartStatus string `xml:"smart_status"`
			} `xml:"disk_list>disk"`
		}
		if xml.Unmarshal(body, &resp) == nil {
			for _, d := range resp.Disks {
				if d.ID == "" && d.Model == "" {
					continue
				}
				data.Disks = append(data.Disks, QNAPDisk{
					ID:          d.ID,
					Model:       d.Model,
					SizeGB:      float64(d.Capacity) / 1_073_741_824,
					TempC:       d.Temperature,
					Status:      d.Status,
					SMARTStatus: d.SmartStatus,
				})
			}
		}
	}

	// ── Shared folders ────────────────────────────────────────────────────────
	if body, err := qnapGet(apiURL, sid, "/cgi-bin/share/shareRequest.cgi?subfunc=get_share_list", skipTLS); err == nil {
		var resp struct {
			XMLName xml.Name `xml:"QDocRoot"`
			Shares  []struct {
				Name string `xml:"Name"`
			} `xml:"Share_List>Share"`
		}
		if xml.Unmarshal(body, &resp) == nil {
			for _, s := range resp.Shares {
				if s.Name != "" {
					data.Shares = append(data.Shares, s.Name)
				}
			}
		}
	}

	return data, nil
}

// ── Cache helper ──────────────────────────────────────────────────────────────

func qnapGetCached(integrationID string) *QNAPPanelData {
	if cached, ok := cacheGet(integrationID); ok {
		if d, ok := cached.(*QNAPPanelData); ok {
			return d
		}
	}
	return &QNAPPanelData{}
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchQNAPPanelData(db *sql.DB, config map[string]interface{}) (*QNAPPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if cached := qnapGetCached(integrationID); cached.Hostname != "" {
		cached.UIURL = uiURL
		return cached, nil
	}
	username, password := omvParseCredentials(apiKey) // reuses "user:pass" splitter
	sid, err := qnapLogin(apiURL, username, password, skipTLS)
	if err != nil {
		return nil, fmt.Errorf("QNAP login: %w", err)
	}
	qnapSetSession(integrationID, sid)
	return qnapFetchAll(apiURL, sid, uiURL, skipTLS)
}

// ── Connection test ───────────────────────────────────────────────────────────

func testQNAPConnection(apiURL, apiKey string, skipTLS bool) error {
	username, password := omvParseCredentials(apiKey)
	sid, err := qnapLogin(apiURL, username, password, skipTLS)
	if err != nil {
		return err
	}
	body, err := qnapGet(apiURL, sid, "/cgi-bin/management/manaRequest.cgi?subfunc=sysinfo&hd=no&multicpu=1", skipTLS)
	if err != nil {
		return err
	}
	var info struct {
		XMLName  xml.Name `xml:"QDocRoot"`
		Model    string   `xml:"model"`
		Hostname string   `xml:"host_name"`
	}
	if xml.Unmarshal(body, &info) != nil || (info.Model == "" && info.Hostname == "") {
		return fmt.Errorf("unexpected response from QNAP — check API URL and port")
	}
	return nil
}
