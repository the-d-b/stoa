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
	UIURL        string          `json:"uiUrl"`
	Hostname     string          `json:"hostname"`
	Model        string          `json:"model"`
	DSMVersion   string          `json:"dsmVersion"`
	UptimeSecs   int64           `json:"uptimeSecs"`
	CPUPercent   float64         `json:"cpuPercent"`
	RAMPercent   float64         `json:"ramPercent"`
	RAMTotalGB   float64         `json:"ramTotalGb"`
	RAMUsedGB    float64         `json:"ramUsedGb"`
	DiskReadMBs  float64         `json:"diskReadMbs"`
	DiskWriteMBs float64         `json:"diskWriteMbs"`
	DiskBusy     float64         `json:"diskBusy"` // percent, aggregate across all disks
	Volumes      []SynoVolume    `json:"volumes"`
	DiskSummary  SynoDiskSummary `json:"diskSummary"`
	NetIfaces    []SynoNetIface  `json:"netIfaces"`
	Shares       []string        `json:"shares"`
	Alerts       []SynoAlert     `json:"alerts"`
}

// SynoDiskSummary is a count, not a per-disk list — "N disks · all healthy",
// naming only the ones worth a look, matching how the Unraid/OMV panels
// summarize disk health rather than enumerating every drive.
type SynoDiskSummary struct {
	Total   int      `json:"total"`
	Healthy int      `json:"healthy"`
	Issues  []string `json:"issues"`
}

type SynoAlert struct {
	Level   string `json:"level"` // "warning" | "error"
	Message string `json:"message"`
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

// synoFetchFast fetches DSM info + live utilization (CPU, RAM, network, disk
// I/O). Split out from synoFetchSlow so the two can be composed by
// synoFetchAll — both run on the same user-configured refresh interval,
// there's no separate fast/slow polling cadence here (DSM's webapi has no
// live-push mechanism at all — session-cookie REST only — so there's no
// "live" tier to poll faster; every field updates at the same rate).
func synoFetchFast(apiURL, sid string, skipTLS bool) (*SynologyPanelData, error) {
	data := &SynologyPanelData{}
	anyOK := false

	// ── DSM info ──────────────────────────────────────────────────────────────
	if raw, err := synoGet(apiURL, sid, "SYNO.DSM.Info", "getinfo", 2, nil, skipTLS); err == nil {
		anyOK = true
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
	} else {
		logErrorf("SYNOLOGY", "DSM info error: %v", err)
	}

	// ── Utilization: CPU, RAM, network rates ──────────────────────────────────
	if raw, err := synoGet(apiURL, sid, "SYNO.Core.System.Utilization", "get", 1, nil, skipTLS); err == nil {
		anyOK = true
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
			Disk struct {
				Total struct {
					// Field is literally "read_byte"/"write_byte" (not
					// "read_kb" like network's rx/tx) — treated as bytes/sec
					// accordingly, unlike network's KB/s. Unverified against
					// a real sustained transfer; sanity-check the displayed
					// MB/s against DSM's own Resource Monitor once there's
					// real disk I/O to compare against.
					ReadByte    float64 `json:"read_byte"`
					WriteByte   float64 `json:"write_byte"`
					Utilization float64 `json:"utilization"` // percent, disk busy
				} `json:"total"`
			} `json:"disk"`
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
			data.DiskReadMBs = util.Disk.Total.ReadByte / 1048576
			data.DiskWriteMBs = util.Disk.Total.WriteByte / 1048576
			data.DiskBusy = util.Disk.Total.Utilization
		}
	} else if errors.Is(err, errSynoUnauth) {
		return nil, err
	} else {
		logErrorf("SYNOLOGY", "utilization error: %v", err)
	}

	if !anyOK {
		return nil, fmt.Errorf("synology unreachable — check URL, credentials, and TLS settings (see server log for details)")
	}
	return data, nil
}

// synoFetchSlow fetches storage (volumes + disk health summary) and shares —
// the other half of synoFetchAll, see synoFetchFast's doc comment.
func synoFetchSlow(apiURL, sid string, skipTLS bool) (*SynologyPanelData, error) {
	data := &SynologyPanelData{DiskSummary: SynoDiskSummary{Issues: []string{}}}
	anyOK := false

	// ── Storage: volumes, disks, and pools (one combined call) ───────────────────
	// DSM's own Storage Manager doesn't use SYNO.Core.Storage.Volume/.Disk at
	// all — those still exist in the API registry (SYNO.API.Info reports them
	// as valid) but reject every real request with error 101. Confirmed via
	// the browser's own network calls against a live DSM 7.2.2 instance that
	// the real API is SYNO.Storage.CGI.Storage / load_info, which returns
	// disks, storagePools, and volumes together in one response.
	if raw, err := synoGet(apiURL, sid, "SYNO.Storage.CGI.Storage", "load_info", 1, nil, skipTLS); err == nil {
		anyOK = true
		var resp struct {
			Disks []struct {
				ID          string `json:"id"`
				Device      string `json:"device"`
				Name        string `json:"name"`
				Model       string `json:"model"`
				SizeTotal   string `json:"size_total"` // bytes as string
				Temp        int    `json:"temp"`       // -1 = no data (disk idle / not in a pool)
				Status      string `json:"status"`
				SMARTStatus string `json:"smart_status"` // null on the wire for unused disks; unmarshals fine to ""
				DiskType    string `json:"diskType"`
			} `json:"disks"`
			StoragePools []struct {
				ID         string `json:"id"`
				DeviceType string `json:"device_type"` // e.g. "raid_0" — more specific than either volume's or pool's own "raidType" field ("multiple")
			} `json:"storagePools"`
			Volumes []struct {
				ID       string `json:"id"`
				VolPath  string `json:"vol_path"` // "/volume1"
				VolDesc  string `json:"vol_desc"` // user-given name
				FSType   string `json:"fs_type"`
				PoolPath string `json:"pool_path"` // joins to storagePools[].id
				Status   string `json:"status"`
				Size     struct {
					Total string `json:"total"` // bytes as string
					Used  string `json:"used"`
				} `json:"size"`
			} `json:"volumes"`
		}
		if json.Unmarshal(raw, &resp) == nil {
			poolRaidType := map[string]string{}
			for _, p := range resp.StoragePools {
				poolRaidType[p.ID] = p.DeviceType
			}
			for _, v := range resp.Volumes {
				totalBytes, _ := strconv.ParseInt(strings.TrimSpace(v.Size.Total), 10, 64)
				usedBytes, _ := strconv.ParseInt(strings.TrimSpace(v.Size.Used), 10, 64)
				totalGB := float64(totalBytes) / 1073741824
				usedGB := float64(usedBytes) / 1073741824
				pct := 0.0
				if totalGB > 0 {
					pct = usedGB / totalGB * 100
				}
				name := v.VolDesc
				if name == "" {
					name = v.VolPath
				}
				if name == "" {
					name = v.ID
				}
				data.Volumes = append(data.Volumes, SynoVolume{
					ID:       v.ID,
					Name:     name,
					Status:   v.Status,
					RAIDType: poolRaidType[v.PoolPath],
					FSType:   v.FSType,
					TotalGB:  totalGB,
					UsedGB:   usedGB,
					UsedPct:  pct,
				})
				if v.Status != "" && v.Status != "normal" {
					level := "warning"
					if v.Status == "crashed" || v.Status == "error" {
						level = "error"
					}
					data.Alerts = append(data.Alerts, SynoAlert{Level: level, Message: fmt.Sprintf("Volume %s is %s", name, v.Status)})
				}
			}
			// Disk health — a count with named exceptions, not a per-disk list
			// (see SynoDiskSummary's doc comment). Synology's SMART data has
			// been confirmed accurate in testing (unlike some other NAS APIs),
			// so this is a reliable signal, not just a best-effort one.
			for _, d := range resp.Disks {
				data.DiskSummary.Total++
				name := d.Name
				if name == "" {
					name = d.ID
				}
				device := strings.TrimPrefix(d.Device, "/dev/")
				label := name
				if device != "" {
					label += " (" + device + ")"
				}
				switch {
				case d.Status == "damaged" || d.Status == "crashed":
					data.Alerts = append(data.Alerts, SynoAlert{Level: "error", Message: fmt.Sprintf("Disk %s is %s", label, d.Status)})
					data.DiskSummary.Issues = append(data.DiskSummary.Issues, label)
				case d.SMARTStatus != "" && d.SMARTStatus != "normal":
					data.Alerts = append(data.Alerts, SynoAlert{Level: "warning", Message: fmt.Sprintf("Disk %s SMART status: %s", label, d.SMARTStatus)})
					data.DiskSummary.Issues = append(data.DiskSummary.Issues, label)
				default:
					data.DiskSummary.Healthy++
				}
			}
		} else {
			logErrorf("SYNOLOGY", "storage: unexpected response: %s", strings.TrimSpace(string(raw)))
		}
	} else {
		logErrorf("SYNOLOGY", "storage error: %v", err)
	}

	// ── Shared folders ────────────────────────────────────────────────────────
	if raw, err := synoGet(apiURL, sid, "SYNO.Core.Share", "list", 1,
		map[string]string{"limit": "200", "offset": "0"}, skipTLS); err == nil {
		anyOK = true
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
	} else {
		logErrorf("SYNOLOGY", "shared folders error: %v", err)
	}

	// Every endpoint failed — surface the error instead of rendering zeros
	if !anyOK {
		return nil, fmt.Errorf("synology unreachable — check URL, credentials, and TLS settings (see server log for details)")
	}

	return data, nil
}

// synoFetchAll runs both synoFetchFast and synoFetchSlow — this is the one
// the worker actually calls, once per the integration's own configured
// refresh interval. Kept as two separate functions purely for code
// organization (system stats vs. storage/shares), not for polling at
// different rates.
func synoFetchAll(apiURL, sid, uiURL string, skipTLS bool) (*SynologyPanelData, error) {
	data, err := synoFetchFast(apiURL, sid, skipTLS)
	if err != nil {
		return nil, err
	}
	if slow, serr := synoFetchSlow(apiURL, sid, skipTLS); serr == nil {
		data.Volumes = slow.Volumes
		data.DiskSummary = slow.DiskSummary
		data.Shares = slow.Shares
		data.Alerts = slow.Alerts
	} else {
		logErrorf("SYNOLOGY", "slow fetch error: %v", serr)
	}
	data.UIURL = uiURL
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
