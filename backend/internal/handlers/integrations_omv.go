package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// errOMVUnauth signals the session has expired or credentials are wrong.
var errOMVUnauth = errors.New("omv: unauthorized")

// ── Types ─────────────────────────────────────────────────────────────────────

type OMVPanelData struct {
	UIURL         string          `json:"uiUrl"`
	Hostname      string          `json:"hostname"`
	Version       string          `json:"version"`
	CPUModel      string          `json:"cpuModel"`
	CPUCores      int             `json:"cpuCores"`
	CPUPercent    float64         `json:"cpuPercent"`
	RAMTotalGB    float64         `json:"ramTotalGb"`
	RAMUsedGB     float64         `json:"ramUsedGb"`
	RAMPercent    float64         `json:"ramPercent"`
	UptimeSecs    int64           `json:"uptimeSecs"`
	Filesystems   []OMVFilesystem `json:"filesystems"`
	Disks         []OMVDisk       `json:"disks"`
	RaidArrays    []OMVRaidArray  `json:"raidArrays"`
	NetInterfaces []OMVNetIface   `json:"netInterfaces"`
	Services      OMVServices     `json:"services"`
	Shares        []string        `json:"shares"`
	Alerts        []OMVAlert      `json:"alerts"`
}

type OMVFilesystem struct {
	DeviceFile string  `json:"deviceFile"`
	Label      string  `json:"label"`
	Type       string  `json:"type"`
	MountPoint string  `json:"mountPoint"`
	TotalGB    float64 `json:"totalGb"`
	UsedGB     float64 `json:"usedGb"`
	Percent    float64 `json:"percent"`
}

type OMVDisk struct {
	DeviceName  string  `json:"deviceName"`
	Model       string  `json:"model"`
	SizeGB      float64 `json:"sizeGb"`
	TempC       int     `json:"tempC"`
	PowerMode   string  `json:"powerMode"`
	SmartStatus string  `json:"smartStatus"` // "GOOD"/"BAD"/"" — from a separate SMART call, merged in by device name
}

// OMVRaidArray is a software RAID (mdadm) array — the multi-disk analog to
// TrueNAS's ZFS pools, though mdadm has no ARC/pool-health-percentage
// equivalent, just a device list and a state string.
type OMVRaidArray struct {
	Name       string   `json:"name"`
	Level      string   `json:"level"`
	NumDevices int      `json:"numDevices"`
	Devices    []string `json:"devices"`
	SizeGB     float64  `json:"sizeGb"`
	State      string   `json:"state"`
}

// OMVAlert is synthesized by Stoa from several signals OMV itself doesn't
// unify into a single feed (no "list current alerts" RPC exists in OMV at
// all — checked every core RPC service) — reboot-required, pending package
// updates, a degraded RAID array, or a disk that's failed its SMART check.
type OMVAlert struct {
	Level   string `json:"level"` // "warning" or "error"
	Message string `json:"message"`
}

type OMVNetIface struct {
	Name   string  `json:"name"`
	RxMBs  float64 `json:"rxMbs"`
	TxMBs  float64 `json:"txMbs"`
	LinkUp bool    `json:"linkUp"`
}

type OMVServices struct {
	Running int `json:"running"`
	Stopped int `json:"stopped"`
}

// ── Session cache (per integration ID) ───────────────────────────────────────

var (
	omvSessions   = map[string]string{}
	omvSessionsMu sync.Mutex
)

func omvGetSession(integID string) string {
	omvSessionsMu.Lock()
	defer omvSessionsMu.Unlock()
	return omvSessions[integID]
}

func omvSetSession(integID, sessionID string) {
	omvSessionsMu.Lock()
	defer omvSessionsMu.Unlock()
	omvSessions[integID] = sessionID
}

func omvClearSession(integID string) {
	omvSessionsMu.Lock()
	defer omvSessionsMu.Unlock()
	delete(omvSessions, integID)
}

// ── RPC helpers ───────────────────────────────────────────────────────────────

func omvLogin(baseURL, username, password string, skipTLS bool) (string, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"service": "session",
		"method":  "login",
		"params":  map[string]string{"username": username, "password": password},
	})
	url := strings.TrimRight(baseURL, "/") + "/rpc.php"
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("OMV login HTTP %d — check URL and credentials", resp.StatusCode)
	}
	respBody, _ := io.ReadAll(resp.Body)
	// Confirmed live against a real OMV 8.5.7 instance: there is no boolean
	// "authenticated" field at all — success is signaled by a string
	// "status" field equal to "authenticated". The old check silently always
	// evaluated false (Go doesn't error on a missing field, only a type
	// mismatch on a present one), so this failed for every login regardless
	// of whether the credentials were actually correct.
	var envelope struct {
		Response *struct {
			Status    string `json:"status"`
			SessionID string `json:"sessionid"`
		} `json:"response"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(respBody, &envelope) != nil {
		return "", fmt.Errorf("invalid login response from OMV")
	}
	if envelope.Error != nil {
		return "", fmt.Errorf("OMV login error: %s", envelope.Error.Message)
	}
	if envelope.Response == nil || envelope.Response.Status != "authenticated" {
		return "", fmt.Errorf("authentication failed — check username and password")
	}
	return envelope.Response.SessionID, nil
}

// omvRPC sends a JSON-RPC call and returns the unwrapped response body.
// Returns errOMVUnauth on HTTP 401/403 so callers can trigger re-auth.
func omvRPC(baseURL, sessionID, service, method string, params interface{}, skipTLS bool) (json.RawMessage, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"service": service,
		"method":  method,
		"params":  params,
	})
	url := strings.TrimRight(baseURL, "/") + "/rpc.php"
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if sessionID != "" {
		req.Header.Set("X-OPENMEDIAVAULT-SESSIONID", sessionID)
	}
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, errOMVUnauth
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from OMV", resp.StatusCode)
	}
	respBody, _ := io.ReadAll(resp.Body)
	var envelope struct {
		Response json.RawMessage `json:"response"`
		Error    *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(respBody, &envelope) != nil {
		return nil, fmt.Errorf("invalid JSON from OMV")
	}
	if envelope.Error != nil {
		return nil, fmt.Errorf("OMV RPC %s.%s: %s", service, method, envelope.Error.Message)
	}
	return envelope.Response, nil
}

// ── Network rate tracking ─────────────────────────────────────────────────────

type omvNetSnapshot struct {
	rx, tx int64
	at     time.Time
}

// ── Data fetch ────────────────────────────────────────────────────────────────

// omvFetchAll fetches all OMV metrics in one pass.
// prevNet accumulates interface counters across calls for rate calculation;
// pass nil for one-shot calls where rates are not meaningful.
func omvFetchAll(apiURL, sessionID, uiURL string, prevNet map[string]omvNetSnapshot, skipTLS bool) (*OMVPanelData, error) {
	data := &OMVPanelData{UIURL: uiURL}
	now := time.Now()
	anyOK := false
	// Signals gathered along the way, folded into a synthesized Alerts list
	// at the end — OMV has no unified "list current alerts" RPC of its own.
	rebootRequired := false
	pkgUpdates := 0

	// ── System info ───────────────────────────────────────────────────────
	if raw, err := omvRPC(apiURL, sessionID, "System", "getInformation", map[string]interface{}{}, skipTLS); err == nil {
		anyOK = true
		// Confirmed live against a real OMV 8.5.7 instance: cpuCores, memTotal,
		// memUsed, and memUtilization all come back as quoted JSON strings, not
		// numbers — a numeric Go target fails the WHOLE struct's Unmarshal, not
		// just those fields, which is why hostname/version/etc were also
		// silently zeroed. uptime is a bare number but has a fractional part
		// (e.g. 74839.31), which also fails against an int64 target.
		// Separately, both utilization fields are a 0-1 fraction on the wire
		// (memUtilization "0.04180" against a real ~4.18% used/total ratio),
		// not an already-scaled 0-100 percentage.
		var info struct {
			Hostname            string  `json:"hostname"`
			Version             string  `json:"version"`
			CPUModelName        string  `json:"cpuModelName"`
			CPUCores            string  `json:"cpuCores"`
			CPUUtilization      float64 `json:"cpuUtilization"`
			MemTotal            string  `json:"memTotal"`
			MemUsed             string  `json:"memUsed"`
			MemUtilization      string  `json:"memUtilization"`
			Uptime              float64 `json:"uptime"`
			RebootRequired      bool    `json:"rebootRequired"`
			AvailablePkgUpdates int     `json:"availablePkgUpdates"`
		}
		if json.Unmarshal(raw, &info) == nil {
			data.Hostname = info.Hostname
			data.Version = info.Version
			data.CPUModel = info.CPUModelName
			if cores, cerr := strconv.Atoi(strings.TrimSpace(info.CPUCores)); cerr == nil {
				data.CPUCores = cores
			}
			// Unlike memUtilization, this one is already 0-100 on the wire —
			// confirmed both by OMV's own source (Cpu::utilization() clamps
			// to min(100.0, ...) before returning) and by the 960% bug this
			// produced when it was incorrectly ×100'd by analogy with memory.
			data.CPUPercent = info.CPUUtilization
			if memTotal, merr := strconv.ParseInt(strings.TrimSpace(info.MemTotal), 10, 64); merr == nil {
				data.RAMTotalGB = float64(memTotal) / 1073741824
			}
			if memUsed, merr := strconv.ParseInt(strings.TrimSpace(info.MemUsed), 10, 64); merr == nil {
				data.RAMUsedGB = float64(memUsed) / 1073741824
			}
			if memUtil, merr := strconv.ParseFloat(strings.TrimSpace(info.MemUtilization), 64); merr == nil {
				data.RAMPercent = memUtil * 100
			}
			data.UptimeSecs = int64(info.Uptime)
			rebootRequired = info.RebootRequired
			pkgUpdates = info.AvailablePkgUpdates
		} else {
			logErrorf("OMV", "system info: unexpected response: %s", strings.TrimSpace(string(raw)))
		}
	} else if errors.Is(err, errOMVUnauth) {
		return nil, err
	} else {
		logErrorf("OMV", "system info error: %v", err)
	}

	// ── Filesystems (data volumes only, not the root OS partition) ────────
	if raw, err := omvRPC(apiURL, sessionID, "FileSystemMgmt", "enumerateMountedFilesystems",
		map[string]interface{}{"includeroot": false}, skipTLS); err == nil {
		anyOK = true
		// Confirmed live: "devicefile" is a /dev/disk/by-uuid/... path, not
		// the clean device name — "canonicaldevicefile" is (e.g. /dev/md0).
		// "size" and "available" are raw byte counts as strings, but "used"
		// is a pre-formatted, unit-suffixed string ("13.99 GiB") that can't
		// be parsed as a plain integer at all — computed as size-available
		// instead, which is both more precise and avoids needing a
		// GiB/MiB/TiB text parser. "percentage" is a genuine JSON number,
		// unlike nearly everything else this integration touches.
		var fsList []struct {
			DeviceFile          string `json:"devicefile"`
			CanonicalDeviceFile string `json:"canonicaldevicefile"`
			Label               string `json:"label"`
			Type                string `json:"type"`
			Mountpoint          string `json:"mountpoint"`
			Size                string `json:"size"`
			Available           string `json:"available"`
			Percentage          int    `json:"percentage"`
		}
		if json.Unmarshal(raw, &fsList) == nil {
			for _, fs := range fsList {
				size, serr := strconv.ParseInt(strings.TrimSpace(fs.Size), 10, 64)
				if serr != nil || size == 0 {
					continue
				}
				if fs.Type == "tmpfs" || fs.Type == "devtmpfs" || strings.HasPrefix(fs.Type, "dev") {
					continue
				}
				available, _ := strconv.ParseInt(strings.TrimSpace(fs.Available), 10, 64)
				used := size - available
				if used < 0 {
					used = 0
				}
				deviceFile := fs.CanonicalDeviceFile
				if deviceFile == "" {
					deviceFile = fs.DeviceFile
				}
				label := fs.Label
				if label == "" {
					label = deviceFile
				}
				data.Filesystems = append(data.Filesystems, OMVFilesystem{
					DeviceFile: deviceFile,
					Label:      label,
					Type:       fs.Type,
					MountPoint: fs.Mountpoint,
					TotalGB:    float64(size) / 1073741824,
					UsedGB:     float64(used) / 1073741824,
					Percent:    float64(fs.Percentage),
				})
			}
		} else {
			logErrorf("OMV", "filesystems: unexpected response: %s", strings.TrimSpace(string(raw)))
		}
	} else if errors.Is(err, errOMVUnauth) {
		return nil, err
	} else {
		logErrorf("OMV", "filesystems error: %v", err)
	}

	// ── Disks with temperatures ───────────────────────────────────────────
	if raw, err := omvRPC(apiURL, sessionID, "DiskMgmt", "getList",
		map[string]interface{}{"start": 0, "limit": -1, "sortfield": "devicename", "sortdir": "asc"}, skipTLS); err == nil {
		anyOK = true
		var diskResp struct {
			Data []struct {
				DeviceName  string `json:"devicename"`
				Model       string `json:"model"`
				Size        string `json:"size"`
				Temperature string `json:"temperature"`
				PowerMode   string `json:"powermode"`
			} `json:"data"`
		}
		if json.Unmarshal(raw, &diskResp) == nil {
			for _, d := range diskResp.Data {
				sizeGB := 0.0
				if n, e := strconv.ParseInt(strings.TrimSpace(d.Size), 10, 64); e == nil && n > 0 {
					sizeGB = float64(n) / 1073741824
				}
				tempC := 0
				if t := strings.TrimSpace(d.Temperature); t != "" {
					if n, e := strconv.Atoi(t); e == nil && n > 0 {
						tempC = n
					}
				}
				data.Disks = append(data.Disks, OMVDisk{
					DeviceName: d.DeviceName,
					Model:      d.Model,
					SizeGB:     sizeGB,
					TempC:      tempC,
					PowerMode:  d.PowerMode,
				})
			}
		} else {
			logErrorf("OMV", "disks: unexpected response: %s", strings.TrimSpace(string(raw)))
		}
	} else {
		logErrorf("OMV", "disks error: %v", err)
	}

	// ── Network interfaces (cumulative counters → rate via diff) ──────────
	// Confirmed live: rx_bytes/tx_bytes are quoted JSON strings, same
	// string-vs-number pattern as System.getInformation above.
	if raw, err := omvRPC(apiURL, sessionID, "Network", "enumerateDevices", map[string]interface{}{}, skipTLS); err == nil {
		anyOK = true
		var ifaceList []struct {
			DeviceName string `json:"devicename"`
			Link       bool   `json:"link"`
			Type       string `json:"type"`
			Stats      struct {
				RxBytes string `json:"rx_bytes"`
				TxBytes string `json:"tx_bytes"`
			} `json:"stats"`
		}
		if json.Unmarshal(raw, &ifaceList) == nil {
			for _, iface := range ifaceList {
				if iface.DeviceName == "lo" {
					continue
				}
				rxBytes, _ := strconv.ParseInt(strings.TrimSpace(iface.Stats.RxBytes), 10, 64)
				txBytes, _ := strconv.ParseInt(strings.TrimSpace(iface.Stats.TxBytes), 10, 64)
				rxMBs, txMBs := 0.0, 0.0
				if prevNet != nil {
					if prev, ok := prevNet[iface.DeviceName]; ok {
						dt := now.Sub(prev.at).Seconds()
						if dt > 0 {
							rxDelta := rxBytes - prev.rx
							txDelta := txBytes - prev.tx
							if rxDelta >= 0 && txDelta >= 0 { // guard against counter reset
								rxMBs = float64(rxDelta) / dt / 1048576
								txMBs = float64(txDelta) / dt / 1048576
							}
						}
					}
					prevNet[iface.DeviceName] = omvNetSnapshot{rx: rxBytes, tx: txBytes, at: now}
				}
				data.NetInterfaces = append(data.NetInterfaces, OMVNetIface{
					Name:   iface.DeviceName,
					RxMBs:  rxMBs,
					TxMBs:  txMBs,
					LinkUp: iface.Link,
				})
			}
		} else {
			logErrorf("OMV", "network interfaces: unexpected response: %s", strings.TrimSpace(string(raw)))
		}
	} else {
		logErrorf("OMV", "network interfaces error: %v", err)
	}

	// ── Services (enabled/running counts) ─────────────────────────────────
	if raw, err := omvRPC(apiURL, sessionID, "services", "getStatus", map[string]interface{}{}, skipTLS); err == nil {
		anyOK = true
		var svcResp struct {
			Data []struct {
				Enabled bool `json:"enabled"`
				Running bool `json:"running"`
			} `json:"data"`
		}
		if json.Unmarshal(raw, &svcResp) == nil {
			for _, svc := range svcResp.Data {
				if svc.Running {
					data.Services.Running++
				} else if svc.Enabled {
					// Enabled but not running is noteworthy
					data.Services.Stopped++
				}
			}
		}
	} else {
		logErrorf("OMV", "services error: %v", err)
	}

	// ── Shared folders ────────────────────────────────────────────────────
	if raw, err := omvRPC(apiURL, sessionID, "ShareMgmt", "enumerateSharedFolders", map[string]interface{}{}, skipTLS); err == nil {
		anyOK = true
		var shares []struct {
			Name string `json:"name"`
		}
		if json.Unmarshal(raw, &shares) == nil {
			for _, s := range shares {
				if s.Name != "" {
					data.Shares = append(data.Shares, s.Name)
				}
			}
		} else {
			logErrorf("OMV", "shared folders: unexpected response: %s", strings.TrimSpace(string(raw)))
		}
	} else {
		logErrorf("OMV", "shared folders error: %v", err)
	}

	// ── RAID arrays (mdadm — the multi-disk analog to TrueNAS pools) ──────
	// Confirmed live: "size" is a byte-count string like everywhere else;
	// "numdevices" is, unusually, a genuine JSON number. "state" is "clean"
	// while healthy — anything else (degraded/resyncing/recovering/etc)
	// gets folded into Alerts below.
	degradedRaid := []string{}
	if raw, err := omvRPC(apiURL, sessionID, "MdMgmt", "enumerateDevices", map[string]interface{}{}, skipTLS); err == nil {
		anyOK = true
		var raidList []struct {
			DeviceFile string   `json:"devicefile"`
			Level      string   `json:"level"`
			NumDevices int      `json:"numdevices"`
			Devices    []string `json:"devices"`
			Size       string   `json:"size"`
			State      string   `json:"state"`
		}
		if json.Unmarshal(raw, &raidList) == nil {
			for _, r := range raidList {
				sizeGB := 0.0
				if size, serr := strconv.ParseInt(strings.TrimSpace(r.Size), 10, 64); serr == nil {
					sizeGB = float64(size) / 1073741824
				}
				data.RaidArrays = append(data.RaidArrays, OMVRaidArray{
					Name:       r.DeviceFile,
					Level:      r.Level,
					NumDevices: r.NumDevices,
					Devices:    r.Devices,
					SizeGB:     sizeGB,
					State:      r.State,
				})
				if r.State != "" && r.State != "clean" && r.State != "active" {
					degradedRaid = append(degradedRaid, fmt.Sprintf("%s (%s) is %s", r.DeviceFile, r.Level, r.State))
				}
			}
		} else {
			logErrorf("OMV", "raid arrays: unexpected response: %s", strings.TrimSpace(string(raw)))
		}
	} else {
		// Not an error worth logging loudly — the openmediavault-md plugin
		// isn't installed on every OMV instance, so "no RAID service" is a
		// normal, expected outcome, not a fetch failure.
		logDebugf("OMV", "raid arrays unavailable (openmediavault-md plugin not installed?): %v", err)
	}

	// ── SMART health — merged into the existing Disks list by device name,
	// not shown as a separate table ─────────────────────────────────────
	failedSmart := []string{}
	if raw, err := omvRPC(apiURL, sessionID, "smart", "getList",
		map[string]interface{}{"start": 0, "limit": -1, "sortfield": "devicename", "sortdir": "asc"}, skipTLS); err == nil {
		anyOK = true
		var smartResp struct {
			Data []struct {
				DeviceName    string `json:"devicename"`
				OverallStatus string `json:"overallstatus"`
			} `json:"data"`
		}
		if json.Unmarshal(raw, &smartResp) == nil {
			statusByDevice := map[string]string{}
			for _, s := range smartResp.Data {
				statusByDevice[s.DeviceName] = s.OverallStatus
			}
			for i := range data.Disks {
				if status, ok := statusByDevice[data.Disks[i].DeviceName]; ok {
					data.Disks[i].SmartStatus = status
					if status != "" && status != "GOOD" {
						failedSmart = append(failedSmart, fmt.Sprintf("%s SMART status: %s", data.Disks[i].DeviceName, status))
					}
				}
			}
		} else {
			logErrorf("OMV", "smart: unexpected response: %s", strings.TrimSpace(string(raw)))
		}
	} else {
		logErrorf("OMV", "smart error: %v", err)
	}

	// ── Synthesized alerts ─────────────────────────────────────────────────
	if rebootRequired {
		data.Alerts = append(data.Alerts, OMVAlert{Level: "warning", Message: "Reboot required"})
	}
	if pkgUpdates > 0 {
		s := ""
		if pkgUpdates != 1 {
			s = "s"
		}
		data.Alerts = append(data.Alerts, OMVAlert{Level: "warning", Message: fmt.Sprintf("%d package update%s available", pkgUpdates, s)})
	}
	for _, msg := range degradedRaid {
		data.Alerts = append(data.Alerts, OMVAlert{Level: "error", Message: msg})
	}
	for _, msg := range failedSmart {
		data.Alerts = append(data.Alerts, OMVAlert{Level: "error", Message: msg})
	}

	// Every endpoint failed — surface the error instead of rendering zeros
	if !anyOK {
		return nil, fmt.Errorf("openmediavault unreachable — check URL, credentials, and TLS settings (see server log for details)")
	}

	return data, nil
}

// ── Cache helper ──────────────────────────────────────────────────────────────

func omvGetCached(integrationID string) *OMVPanelData {
	if cached, ok := cacheGet(integrationID); ok {
		if d, ok := cached.(*OMVPanelData); ok {
			return d
		}
	}
	return &OMVPanelData{}
}

// ── Panel fetcher (registered in panelFetchers) ───────────────────────────────

func fetchOMVPanelData(db *sql.DB, config map[string]interface{}) (*OMVPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	// Serve from worker cache when available
	if cached := omvGetCached(integrationID); cached.Hostname != "" {
		cached.UIURL = uiURL
		return cached, nil
	}
	// Cache miss — authenticate and do a synchronous one-shot fetch
	username, password := omvParseCredentials(apiKey)
	sessionID, err := omvLogin(apiURL, username, password, skipTLS)
	if err != nil {
		return nil, fmt.Errorf("OMV login failed: %w", err)
	}
	omvSetSession(integrationID, sessionID)
	return omvFetchAll(apiURL, sessionID, uiURL, nil, skipTLS)
}

// ── Connection test ───────────────────────────────────────────────────────────

func testOMVConnection(apiURL, apiKey string, skipTLS bool) error {
	username, password := omvParseCredentials(apiKey)
	sessionID, err := omvLogin(apiURL, username, password, skipTLS)
	if err != nil {
		return err
	}
	raw, err := omvRPC(apiURL, sessionID, "System", "getInformation", map[string]interface{}{}, skipTLS)
	if err != nil {
		return err
	}
	var info struct {
		Hostname string `json:"hostname"`
	}
	if json.Unmarshal(raw, &info) != nil || info.Hostname == "" {
		return fmt.Errorf("unexpected response from OMV — check API URL")
	}
	return nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// omvParseCredentials splits "username:password" stored in the secret field.
func omvParseCredentials(apiKey string) (username, password string) {
	if idx := strings.Index(apiKey, ":"); idx >= 0 {
		return apiKey[:idx], apiKey[idx+1:]
	}
	return apiKey, ""
}
