package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
)

// errSynoUnauth signals the session has expired (error code 119).
var errSynoUnauth = errors.New("synology: session invalid")

// ── Types ─────────────────────────────────────────────────────────────────────

type SynologyPanelData struct {
	UIURL      string         `json:"uiUrl"`
	Hostname   string         `json:"hostname"`
	Model      string         `json:"model"`
	DSMVersion string         `json:"dsmVersion"`
	UptimeSecs int64          `json:"uptimeSecs"`
	CPUPercent float64        `json:"cpuPercent"`
	RAMPercent float64        `json:"ramPercent"`
	RAMTotalGB float64        `json:"ramTotalGb"`
	RAMUsedGB  float64        `json:"ramUsedGb"`
	Volumes    []SynoVolume   `json:"volumes"`
	Disks      []SynoDisk     `json:"disks"`
	NetIfaces  []SynoNetIface `json:"netIfaces"`
	Shares     []string       `json:"shares"`
}

type SynoVolume struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`     // "/volume1"
	Status   string  `json:"status"`   // "normal", "degraded", "crashed"
	RAIDType string  `json:"raidType"` // "shr", "raid5", "basic"
	FSType   string  `json:"fsType"`   // "btrfs", "ext4"
	TotalGB  float64 `json:"totalGb"`
	UsedGB   float64 `json:"usedGb"`
	UsedPct  float64 `json:"usedPct"`
}

type SynoDisk struct {
	Name        string  `json:"name"`   // "Disk 1"
	Device      string  `json:"device"` // "sda"
	Model       string  `json:"model"`  // "WDC WD40EFRX"
	SizeGB      float64 `json:"sizeGb"`
	TempC       int     `json:"tempC"`
	Status      string  `json:"status"`      // "normal", "damaged"
	SMARTStatus string  `json:"smartStatus"` // "normal", "failed_read"
	DiskType    string  `json:"diskType"`    // "DATA", "CACHE", "SPARE"
}

type SynoNetIface struct {
	Device string  `json:"device"`
	RxMBs  float64 `json:"rxMbs"` // MB/s
	TxMBs  float64 `json:"txMbs"` // MB/s
}

// ── Session cache ─────────────────────────────────────────────────────────────

var (
	synoSessions   = map[string]string{}
	synoSessionsMu sync.Mutex
)

func synoGetSession(id string) string {
	synoSessionsMu.Lock()
	defer synoSessionsMu.Unlock()
	return synoSessions[id]
}

func synoSetSession(id, sid string) {
	synoSessionsMu.Lock()
	defer synoSessionsMu.Unlock()
	synoSessions[id] = sid
}

func synoClearSession(id string) {
	synoSessionsMu.Lock()
	defer synoSessionsMu.Unlock()
	delete(synoSessions, id)
}

// ── Auth ──────────────────────────────────────────────────────────────────────

func synoLogin(baseURL, username, password string, skipTLS bool) (string, error) {
	endpoint := strings.TrimRight(baseURL, "/") + "/webapi/auth.cgi"
	form := url.Values{
		"api":     {"SYNO.API.Auth"},
		"method":  {"login"},
		"version": {"6"},
		"account": {username},
		"passwd":  {password},
		"session": {"StoaDSM"},
		"format":  {"sid"},
	}
	req, err := http.NewRequest("POST", endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var result struct {
		Data *struct {
			SID string `json:"sid"`
		} `json:"data"`
		Error *struct {
			Code int `json:"code"`
		} `json:"error"`
		Success bool `json:"success"`
	}
	if json.Unmarshal(body, &result) != nil {
		return "", fmt.Errorf("invalid response from Synology — check API URL and port")
	}
	if !result.Success {
		if result.Error != nil {
			switch result.Error.Code {
			case 400, 401:
				return "", fmt.Errorf("invalid credentials — check username and password")
			case 402:
				return "", fmt.Errorf("account is disabled")
			case 403, 404:
				return "", fmt.Errorf("two-factor authentication required — create a local account with 2FA disabled")
			default:
				return "", fmt.Errorf("Synology auth error %d", result.Error.Code)
			}
		}
		return "", fmt.Errorf("Synology login failed")
	}
	if result.Data == nil || result.Data.SID == "" {
		return "", fmt.Errorf("empty session ID from Synology")
	}
	return result.Data.SID, nil
}

// synoGet calls the Synology entry.cgi API and returns the unwrapped data field.
// Returns errSynoUnauth on error code 119 (session expired).
func synoGet(baseURL, sid, api, method string, version int, extra map[string]string, skipTLS bool) (json.RawMessage, error) {
	params := url.Values{
		"api":     {api},
		"method":  {method},
		"version": {strconv.Itoa(version)},
		"_sid":    {sid},
	}
	for k, v := range extra {
		params.Set(k, v)
	}
	endpoint := strings.TrimRight(baseURL, "/") + "/webapi/entry.cgi?" + params.Encode()
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
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Synology", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)

	var result struct {
		Data  json.RawMessage `json:"data"`
		Error *struct {
			Code int `json:"code"`
		} `json:"error"`
		Success bool `json:"success"`
	}
	if json.Unmarshal(body, &result) != nil {
		return nil, fmt.Errorf("invalid JSON from Synology")
	}
	if !result.Success {
		if result.Error != nil && result.Error.Code == 119 {
			return nil, errSynoUnauth
		}
		code := 0
		if result.Error != nil {
			code = result.Error.Code
		}
		return nil, fmt.Errorf("Synology API %s error %d", api, code)
	}
	return result.Data, nil
}

// ── Data fetch ────────────────────────────────────────────────────────────────

func synoFetchAll(apiURL, sid, uiURL string, skipTLS bool) (*SynologyPanelData, error) {
	data := &SynologyPanelData{UIURL: uiURL}

	// ── DSM info ──────────────────────────────────────────────────────────────
	if raw, err := synoGet(apiURL, sid, "SYNO.DSM.Info", "getinfo", 2, nil, skipTLS); err == nil {
		var info struct {
			Hostname   string `json:"hostname"`
			Model      string `json:"model"`
			VersionStr string `json:"version_string"`
			Uptime     int64  `json:"uptime"`
			RAMSize    string `json:"ram_size"` // MB as string
		}
		if json.Unmarshal(raw, &info) == nil {
			data.Hostname = info.Hostname
			data.Model = info.Model
			data.DSMVersion = info.VersionStr
			data.UptimeSecs = info.Uptime
			if mb, e := strconv.ParseInt(strings.TrimSpace(info.RAMSize), 10, 64); e == nil && mb > 0 {
				data.RAMTotalGB = float64(mb) / 1024
			}
		}
	} else if errors.Is(err, errSynoUnauth) {
		return nil, err
	}

	// ── Utilization: CPU, RAM, network rates ──────────────────────────────────
	if raw, err := synoGet(apiURL, sid, "SYNO.Core.System.Utilization", "get", 1, nil, skipTLS); err == nil {
		var util struct {
			CPU struct {
				UserLoad   float64 `json:"user_load"`
				SystemLoad float64 `json:"system_load"`
				OtherLoad  float64 `json:"other_load"`
			} `json:"cpu"`
			Memory struct {
				RealUsage  float64 `json:"real_usage"`  // %
				MemorySize float64 `json:"memory_size"` // KB total
			} `json:"memory"`
			Network []struct {
				Device string  `json:"device"`
				Rx     float64 `json:"rx"` // KB/s
				Tx     float64 `json:"tx"` // KB/s
			} `json:"network"`
		}
		if json.Unmarshal(raw, &util) == nil {
			cpu := util.CPU.UserLoad + util.CPU.SystemLoad + util.CPU.OtherLoad
			if cpu > 100 {
				cpu = 100
			}
			data.CPUPercent = cpu
			data.RAMPercent = util.Memory.RealUsage
			// Prefer utilization memory_size (KB precision) over DSM info ram_size (MB precision)
			if util.Memory.MemorySize > 0 {
				data.RAMTotalGB = util.Memory.MemorySize / 1048576 // KB → GB
			}
			if data.RAMTotalGB > 0 {
				data.RAMUsedGB = data.RAMTotalGB * data.RAMPercent / 100
			}
			for _, iface := range util.Network {
				if iface.Device == "lo" {
					continue
				}
				if iface.Rx == 0 && iface.Tx == 0 {
					continue
				}
				data.NetIfaces = append(data.NetIfaces, SynoNetIface{
					Device: iface.Device,
					RxMBs:  iface.Rx / 1024, // KB/s → MB/s
					TxMBs:  iface.Tx / 1024,
				})
			}
		}
	} else if errors.Is(err, errSynoUnauth) {
		return nil, err
	}

	// ── Volumes ───────────────────────────────────────────────────────────────
	if raw, err := synoGet(apiURL, sid, "SYNO.Core.Storage.Volume", "list", 1,
		map[string]string{"limit": "-1"}, skipTLS); err == nil {
		var resp struct {
			Volumes []struct {
				ID       string `json:"id"`
				Name     string `json:"name"`
				Status   string `json:"status"`
				RAIDType string `json:"raid_type"`
				FSType   string `json:"fs_type"`
				Size     struct {
					Total string `json:"total"` // bytes as string
					Used  string `json:"used"`
				} `json:"size"`
			} `json:"volumes"`
		}
		if json.Unmarshal(raw, &resp) == nil {
			for _, v := range resp.Volumes {
				totalBytes, _ := strconv.ParseInt(strings.TrimSpace(v.Size.Total), 10, 64)
				usedBytes, _ := strconv.ParseInt(strings.TrimSpace(v.Size.Used), 10, 64)
				totalGB := float64(totalBytes) / 1073741824
				usedGB := float64(usedBytes) / 1073741824
				pct := 0.0
				if totalGB > 0 {
					pct = usedGB / totalGB * 100
				}
				name := v.Name
				if name == "" {
					name = v.ID
				}
				data.Volumes = append(data.Volumes, SynoVolume{
					ID:       v.ID,
					Name:     name,
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
	if raw, err := synoGet(apiURL, sid, "SYNO.Core.Storage.Disk", "list", 1,
		map[string]string{"limit": "-1", "include_emptyslot": "false"}, skipTLS); err == nil {
		var resp struct {
			Disks []struct {
				Name        string `json:"name"`
				Device      string `json:"device"`
				Model       string `json:"model"`
				SizeTotal   string `json:"size_total"` // bytes as string
				Temp        int    `json:"temp"`
				Status      string `json:"status"`
				SMARTStatus string `json:"smart_status"`
				DiskType    string `json:"diskType"`
				Type        string `json:"type"` // "DISK", "EXPANDER", etc.
			} `json:"disks"`
		}
		if json.Unmarshal(raw, &resp) == nil {
			for _, d := range resp.Disks {
				if d.Type == "EXPANDER" {
					continue
				}
				sizeBytes, _ := strconv.ParseInt(strings.TrimSpace(d.SizeTotal), 10, 64)
				data.Disks = append(data.Disks, SynoDisk{
					Name:        d.Name,
					Device:      d.Device,
					Model:       d.Model,
					SizeGB:      float64(sizeBytes) / 1073741824,
					TempC:       d.Temp,
					Status:      d.Status,
					SMARTStatus: d.SMARTStatus,
					DiskType:    d.DiskType,
				})
			}
		}
	}

	// ── Shared folders ────────────────────────────────────────────────────────
	if raw, err := synoGet(apiURL, sid, "SYNO.Core.Share", "list", 1,
		map[string]string{"limit": "200", "offset": "0"}, skipTLS); err == nil {
		var resp struct {
			Shares []struct {
				Name string `json:"name"`
			} `json:"shares"`
		}
		if json.Unmarshal(raw, &resp) == nil {
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

func synoGetCached(integrationID string) *SynologyPanelData {
	if cached, ok := cacheGet(integrationID); ok {
		if d, ok := cached.(*SynologyPanelData); ok {
			return d
		}
	}
	return &SynologyPanelData{}
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchSynologyPanelData(db *sql.DB, config map[string]interface{}) (*SynologyPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if cached := synoGetCached(integrationID); cached.Hostname != "" {
		cached.UIURL = uiURL
		return cached, nil
	}
	// Cache miss — authenticate and do a one-shot fetch
	username, password := omvParseCredentials(apiKey) // reuses "user:pass" splitter
	sid, err := synoLogin(apiURL, username, password, skipTLS)
	if err != nil {
		return nil, fmt.Errorf("Synology login: %w", err)
	}
	synoSetSession(integrationID, sid)
	return synoFetchAll(apiURL, sid, uiURL, skipTLS)
}

// ── Connection test ───────────────────────────────────────────────────────────

func testSynologyConnection(apiURL, apiKey string, skipTLS bool) error {
	username, password := omvParseCredentials(apiKey)
	sid, err := synoLogin(apiURL, username, password, skipTLS)
	if err != nil {
		return err
	}
	raw, err := synoGet(apiURL, sid, "SYNO.DSM.Info", "getinfo", 2, nil, skipTLS)
	if err != nil {
		return err
	}
	var info struct {
		Model string `json:"model"`
	}
	if json.Unmarshal(raw, &info) != nil || info.Model == "" {
		return fmt.Errorf("unexpected response from Synology — check API URL and port")
	}
	return nil
}
