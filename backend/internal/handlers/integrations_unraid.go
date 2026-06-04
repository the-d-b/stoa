package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
)

// ── Unraid types ──────────────────────────────────────────────────────────────

// unraidBigInt handles Unraid's BigInt fields, which may serialize as quoted
// strings (e.g. "1099511627776") when values exceed JavaScript's safe integer range.
type unraidBigInt int64

func (n *unraidBigInt) UnmarshalJSON(data []byte) error {
	if len(data) == 0 || string(data) == "null" {
		return nil
	}
	if len(data) >= 2 && data[0] == '"' {
		s := string(data[1 : len(data)-1])
		v, err := strconv.ParseInt(s, 10, 64)
		if err == nil {
			*n = unraidBigInt(v)
		}
		return nil
	}
	var f float64
	if err := json.Unmarshal(data, &f); err == nil {
		*n = unraidBigInt(int64(f))
	}
	return nil
}

type UnraidPanelData struct {
	UIURL         string             `json:"uiUrl"`
	Hostname      string             `json:"hostname"`
	Version       string             `json:"version"`
	CPUModel      string             `json:"cpuModel"`
	CPUCores      int                `json:"cpuCores"`
	CPUThreads    int                `json:"cpuThreads"`
	CPUPercent    float64            `json:"cpuPercent"`
	RAMTotalGB    float64            `json:"ramTotalGb"`
	RAMUsedGB     float64            `json:"ramUsedGb"`
	RAMPercent    float64            `json:"ramPercent"`
	ArrayState    string             `json:"arrayState"`
	ArrayUsedGB   float64            `json:"arrayUsedGb"`
	ArrayTotalGB  float64            `json:"arrayTotalGb"`
	ArrayPercent  float64            `json:"arrayPercent"`
	Disks         []UnraidDisk       `json:"disks"`
	ParityCheck   *UnraidParityCheck `json:"parityCheck,omitempty"`
	DockerRunning int                `json:"dockerRunning"`
	DockerStopped int                `json:"dockerStopped"`
	VMRunning     int                `json:"vmRunning"`
	VMStopped     int                `json:"vmStopped"`
	NetInterfaces []UnraidNetIface   `json:"netInterfaces"`
	Shares        []UnraidShare      `json:"shares"`
}

type UnraidDisk struct {
	Name      string  `json:"name"`
	SizeGB    float64 `json:"sizeGb"`
	TempC     int     `json:"tempC"`
	Status    string  `json:"status"`
	Color     string  `json:"color"`
	NumErrors int     `json:"numErrors"`
}

type UnraidParityCheck struct {
	Status   string  `json:"status"`
	Speed    string  `json:"speed"`
	Duration int     `json:"duration"`
	Progress float64 `json:"progress"`
}

type UnraidNetIface struct {
	Name  string  `json:"name"`
	RxMBs float64 `json:"rxMbs"`
	TxMBs float64 `json:"txMbs"`
}

type UnraidShare struct {
	Name string `json:"name"`
}

// ── GraphQL query ─────────────────────────────────────────────────────────────

const unraidFullQuery = `{
  info {
    os { hostname platform }
    cpu { brand cores threads }
    memory { total free }
    version
  }
  array {
    state
    capacity { kilobytes { free total used } }
    disks {
      id name size temp
      status { color name }
      numErrors
    }
    parityCheckStatus {
      status speed duration bytesChecked bytesTotal
    }
  }
  docker {
    containers { names status }
  }
  vms {
    domain { uuid name state { name } }
  }
  shares { name }
  network {
    iface { name rxSec txSec ipaddr }
  }
}`

// ── HTTP fetch ────────────────────────────────────────────────────────────────

func fetchUnraidPanelData(db *sql.DB, config map[string]interface{}) (*UnraidPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	_, uiURL, _, _, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	// Serve from worker cache when available
	if cached := unraidGetCached(integrationID); cached.Hostname != "" {
		cached.UIURL = uiURL
		return cached, nil
	}
	return unraidHTTPFetch(db, integrationID, uiURL)
}

func unraidHTTPFetch(db *sql.DB, integrationID, uiURL string) (*UnraidPanelData, error) {
	apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	raw, err := unraidHTTPQuery(apiURL, apiKey, unraidFullQuery, skipTLS)
	if err != nil {
		return nil, err
	}
	data := buildUnraidPanelData(raw)
	data.UIURL = uiURL
	return data, nil
}

func unraidHTTPQuery(baseURL, apiKey, query string, skipTLS bool) (json.RawMessage, error) {
	body := fmt.Sprintf(`{"query":%q}`, query)
	url := strings.TrimRight(baseURL, "/") + "/graphql"
	req, err := http.NewRequest("POST", url, strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("unauthorized — check API key")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Unraid", resp.StatusCode)
	}
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var gqlResp struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(respBody, &gqlResp); err != nil {
		return nil, fmt.Errorf("invalid GraphQL response")
	}
	return gqlResp.Data, nil
}

// ── Response parsing ──────────────────────────────────────────────────────────

func buildUnraidPanelData(raw json.RawMessage) *UnraidPanelData {
	data := &UnraidPanelData{}
	if raw == nil {
		return data
	}

	var resp struct {
		Info struct {
			OS  struct{ Hostname string `json:"hostname"` } `json:"os"`
			CPU struct {
				Brand   string `json:"brand"`
				Cores   int    `json:"cores"`
				Threads int    `json:"threads"`
			} `json:"cpu"`
			Memory struct {
				Total unraidBigInt `json:"total"`
				Free  unraidBigInt `json:"free"`
			} `json:"memory"`
			Version string `json:"version"`
		} `json:"info"`
		Array struct {
			State    string `json:"state"`
			Capacity struct {
				Kilobytes struct {
					Free  unraidBigInt `json:"free"`
					Total unraidBigInt `json:"total"`
					Used  unraidBigInt `json:"used"`
				} `json:"kilobytes"`
			} `json:"capacity"`
			Disks []struct {
				Name   string       `json:"name"`
				Size   unraidBigInt `json:"size"`
				Temp   int          `json:"temp"`
				Status struct {
					Color string `json:"color"`
					Name  string `json:"name"`
				} `json:"status"`
				NumErrors int `json:"numErrors"`
			} `json:"disks"`
			ParityCheckStatus *struct {
				Status       string       `json:"status"`
				Speed        string       `json:"speed"`
				Duration     int          `json:"duration"`
				BytesChecked unraidBigInt `json:"bytesChecked"`
				BytesTotal   unraidBigInt `json:"bytesTotal"`
			} `json:"parityCheckStatus"`
		} `json:"array"`
		Docker struct {
			Containers []struct {
				Names  json.RawMessage `json:"names"`
				Status string          `json:"status"`
			} `json:"containers"`
		} `json:"docker"`
		VMs struct {
			Domain []struct {
				State struct{ Name string `json:"name"` } `json:"state"`
			} `json:"domain"`
		} `json:"vms"`
		Shares  []struct{ Name string `json:"name"` } `json:"shares"`
		Network struct {
			Iface []struct {
				Name   string       `json:"name"`
				RxSec  unraidBigInt `json:"rxSec"`
				TxSec  unraidBigInt `json:"txSec"`
				IPAddr string       `json:"ipaddr"`
			} `json:"iface"`
		} `json:"network"`
	}

	if json.Unmarshal(raw, &resp) != nil {
		return data
	}

	// System info
	data.Hostname = resp.Info.OS.Hostname
	data.Version = resp.Info.Version
	data.CPUModel = resp.Info.CPU.Brand
	data.CPUCores = resp.Info.CPU.Cores
	data.CPUThreads = resp.Info.CPU.Threads

	// Memory (bytes → GB)
	if resp.Info.Memory.Total > 0 {
		totalGB := float64(resp.Info.Memory.Total) / 1073741824
		freeGB := float64(resp.Info.Memory.Free) / 1073741824
		usedGB := totalGB - freeGB
		data.RAMTotalGB = totalGB
		data.RAMUsedGB = usedGB
		if totalGB > 0 {
			data.RAMPercent = usedGB / totalGB * 100
		}
	}

	// Array state and capacity (kilobytes → GB)
	data.ArrayState = resp.Array.State
	kbTotal := float64(resp.Array.Capacity.Kilobytes.Total)
	kbUsed := float64(resp.Array.Capacity.Kilobytes.Used)
	if kbTotal > 0 {
		data.ArrayTotalGB = kbTotal / 1048576
		data.ArrayUsedGB = kbUsed / 1048576
		data.ArrayPercent = kbUsed / kbTotal * 100
	}

	// Disks
	for _, d := range resp.Array.Disks {
		data.Disks = append(data.Disks, UnraidDisk{
			Name:      d.Name,
			SizeGB:    float64(d.Size) / 1073741824,
			TempC:     d.Temp,
			Status:    d.Status.Name,
			Color:     d.Status.Color,
			NumErrors: d.NumErrors,
		})
	}

	// Parity check (only present during an active check)
	if p := resp.Array.ParityCheckStatus; p != nil && p.Status != "" && p.Status != "NO_PARITY" {
		pc := &UnraidParityCheck{Status: p.Status, Speed: p.Speed, Duration: p.Duration}
		if p.BytesTotal > 0 {
			pc.Progress = float64(p.BytesChecked) / float64(p.BytesTotal) * 100
		}
		data.ParityCheck = pc
	}

	// Docker containers
	for _, c := range resp.Docker.Containers {
		st := strings.ToLower(c.Status)
		if strings.Contains(st, "running") || strings.Contains(st, "up") {
			data.DockerRunning++
		} else {
			data.DockerStopped++
		}
	}

	// VMs
	for _, v := range resp.VMs.Domain {
		if strings.ToLower(v.State.Name) == "running" {
			data.VMRunning++
		} else {
			data.VMStopped++
		}
	}

	// Network interfaces — skip loopback and interfaces with no IP
	for _, iface := range resp.Network.Iface {
		if iface.Name == "lo" || iface.IPAddr == "" {
			continue
		}
		data.NetInterfaces = append(data.NetInterfaces, UnraidNetIface{
			Name:  iface.Name,
			RxMBs: float64(iface.RxSec) / 1048576,
			TxMBs: float64(iface.TxSec) / 1048576,
		})
	}

	// Shares
	for _, s := range resp.Shares {
		if s.Name != "" {
			data.Shares = append(data.Shares, UnraidShare{Name: s.Name})
		}
	}

	return data
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func unraidGetCached(integrationID string) *UnraidPanelData {
	if cached, ok := cacheGet(integrationID); ok {
		if d, ok := cached.(*UnraidPanelData); ok {
			return d
		}
	}
	return &UnraidPanelData{}
}

func testUnraidConnection(apiURL, apiKey string, skipTLS bool) error {
	raw, err := unraidHTTPQuery(apiURL, apiKey, `{ info { version } }`, skipTLS)
	if err != nil {
		return err
	}
	var resp struct {
		Info struct{ Version string `json:"version"` } `json:"info"`
	}
	if json.Unmarshal(raw, &resp) != nil || resp.Info.Version == "" {
		return fmt.Errorf("unexpected response from Unraid — check API key and URL")
	}
	return nil
}
