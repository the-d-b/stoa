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
	NetInterfaces []OMVNetIface   `json:"netInterfaces"`
	Services      OMVServices     `json:"services"`
	Shares        []string        `json:"shares"`
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
	DeviceName string  `json:"deviceName"`
	Model      string  `json:"model"`
	SizeGB     float64 `json:"sizeGb"`
	TempC      int     `json:"tempC"`
	PowerMode  string  `json:"powerMode"`
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
	var envelope struct {
		Response *struct {
			Authenticated bool   `json:"authenticated"`
			SessionID     string `json:"sessionid"`
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
	if envelope.Response == nil || !envelope.Response.Authenticated {
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

	// ── System info ───────────────────────────────────────────────────────
	if raw, err := omvRPC(apiURL, sessionID, "System", "getInformation", map[string]interface{}{}, skipTLS); err == nil {
		var info struct {
			Hostname       string  `json:"hostname"`
			Version        string  `json:"version"`
			CPUModelName   string  `json:"cpuModelName"`
			CPUCores       int     `json:"cpuCores"`
			CPUUtilization float64 `json:"cpuUtilization"`
			MemTotal       int64   `json:"memTotal"`
			MemUsed        int64   `json:"memUsed"`
			MemUtilization float64 `json:"memUtilization"`
			Uptime         int64   `json:"uptime"`
		}
		if json.Unmarshal(raw, &info) == nil {
			data.Hostname = info.Hostname
			data.Version = info.Version
			data.CPUModel = info.CPUModelName
			data.CPUCores = info.CPUCores
			data.CPUPercent = info.CPUUtilization
			data.RAMTotalGB = float64(info.MemTotal) / 1073741824
			data.RAMUsedGB = float64(info.MemUsed) / 1073741824
			data.RAMPercent = info.MemUtilization
			data.UptimeSecs = info.Uptime
		}
	} else if errors.Is(err, errOMVUnauth) {
		return nil, err
	}

	// ── Filesystems (data volumes only, not the root OS partition) ────────
	if raw, err := omvRPC(apiURL, sessionID, "FileSystemMgmt", "enumerateMountedFilesystems",
		map[string]interface{}{"includeroot": false}, skipTLS); err == nil {
		var fsList []struct {
			DeviceFile string `json:"devicefile"`
			Label      string `json:"label"`
			Type       string `json:"type"`
			Mountpoint string `json:"mountpoint"`
			Used       int64  `json:"used"`
			Size       int64  `json:"size"`
			Percentage int    `json:"percentage"`
		}
		if json.Unmarshal(raw, &fsList) == nil {
			for _, fs := range fsList {
				if fs.Size == 0 {
					continue
				}
				if fs.Type == "tmpfs" || fs.Type == "devtmpfs" || strings.HasPrefix(fs.Type, "dev") {
					continue
				}
				label := fs.Label
				if label == "" {
					label = fs.DeviceFile
				}
				data.Filesystems = append(data.Filesystems, OMVFilesystem{
					DeviceFile: fs.DeviceFile,
					Label:      label,
					Type:       fs.Type,
					MountPoint: fs.Mountpoint,
					TotalGB:    float64(fs.Size) / 1073741824,
					UsedGB:     float64(fs.Used) / 1073741824,
					Percent:    float64(fs.Percentage),
				})
			}
		}
	} else if errors.Is(err, errOMVUnauth) {
		return nil, err
	}

	// ── Disks with temperatures ───────────────────────────────────────────
	if raw, err := omvRPC(apiURL, sessionID, "DiskMgmt", "getList",
		map[string]interface{}{"start": 0, "limit": -1, "sortfield": "devicename", "sortdir": "asc"}, skipTLS); err == nil {
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
		}
	}

	// ── Network interfaces (cumulative counters → rate via diff) ──────────
	if raw, err := omvRPC(apiURL, sessionID, "Network", "enumerateDevices", map[string]interface{}{}, skipTLS); err == nil {
		var ifaceList []struct {
			DeviceName string `json:"devicename"`
			Link       bool   `json:"link"`
			Type       string `json:"type"`
			Stats      struct {
				RxBytes int64 `json:"rx_bytes"`
				TxBytes int64 `json:"tx_bytes"`
			} `json:"stats"`
		}
		if json.Unmarshal(raw, &ifaceList) == nil {
			for _, iface := range ifaceList {
				if iface.DeviceName == "lo" {
					continue
				}
				rxMBs, txMBs := 0.0, 0.0
				if prevNet != nil {
					if prev, ok := prevNet[iface.DeviceName]; ok {
						dt := now.Sub(prev.at).Seconds()
						if dt > 0 {
							rxDelta := iface.Stats.RxBytes - prev.rx
							txDelta := iface.Stats.TxBytes - prev.tx
							if rxDelta >= 0 && txDelta >= 0 { // guard against counter reset
								rxMBs = float64(rxDelta) / dt / 1048576
								txMBs = float64(txDelta) / dt / 1048576
							}
						}
					}
					prevNet[iface.DeviceName] = omvNetSnapshot{rx: iface.Stats.RxBytes, tx: iface.Stats.TxBytes, at: now}
				}
				data.NetInterfaces = append(data.NetInterfaces, OMVNetIface{
					Name:   iface.DeviceName,
					RxMBs:  rxMBs,
					TxMBs:  txMBs,
					LinkUp: iface.Link,
				})
			}
		}
	}

	// ── Services (enabled/running counts) ─────────────────────────────────
	if raw, err := omvRPC(apiURL, sessionID, "services", "getStatus", map[string]interface{}{}, skipTLS); err == nil {
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
	}

	// ── Shared folders ────────────────────────────────────────────────────
	if raw, err := omvRPC(apiURL, sessionID, "ShareMgmt", "enumerateSharedFolders", map[string]interface{}{}, skipTLS); err == nil {
		var shares []struct {
			Name string `json:"name"`
		}
		if json.Unmarshal(raw, &shares) == nil {
			for _, s := range shares {
				if s.Name != "" {
					data.Shares = append(data.Shares, s.Name)
				}
			}
		}
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
