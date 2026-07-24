package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ── Proxmox types ─────────────────────────────────────────────────────────────

type ProxmoxPanelData struct {
	UIURL       string           `json:"uiUrl"`
	Version     string           `json:"version"`
	Node        string           `json:"node"`
	CPU         ProxmoxGauge     `json:"cpu"`
	Memory      ProxmoxGauge     `json:"memory"`
	Storage     []ProxmoxStorage `json:"storage"`
	VMs         []ProxmoxVM      `json:"vms"`
	Temps       []ProxmoxTemp    `json:"temps"`
	NetIn       float64          `json:"netIn"`
	NetOut      float64          `json:"netOut"`
	LoadAvg     float64          `json:"loadAvg"`
	IOWait      float64          `json:"ioWait"`      // percentage
	CPUPressure float64          `json:"cpuPressure"` // PSI some %
	MemPressure float64          `json:"memPressure"` // PSI some %
	IOPressure  float64          `json:"ioPressure"`  // PSI some %
}

type ProxmoxGauge struct {
	Used  float64 `json:"used"`
	Label string  `json:"label"`
}

type ProxmoxStorage struct {
	Name    string  `json:"name"`
	UsedGB  float64 `json:"usedGb"`
	TotalGB float64 `json:"totalGb"`
	Percent float64 `json:"percent"`
	Active  bool    `json:"active"`
}

type ProxmoxVM struct {
	ID     int     `json:"id"`
	Name   string  `json:"name"`
	Type   string  `json:"type"`
	Status string  `json:"status"`
	CPU    float64 `json:"cpu"`
	MemPct float64 `json:"memPct"`
	Uptime int64   `json:"uptime"`
}

type ProxmoxTemp struct {
	Name  string  `json:"name"`
	TempC float64 `json:"tempC"`
}

func fetchProxmoxPanelData(db *sql.DB, config map[string]interface{}) (*ProxmoxPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &ProxmoxPanelData{UIURL: uiURL}

	// Version — best-effort, doesn't block the rest of the fetch on failure
	if verBody, verr := proxmoxGet(apiURL, apiKey, "/version", skipTLS); verr == nil {
		var verResp struct {
			Data struct {
				Version string `json:"version"`
			} `json:"data"`
		}
		if json.Unmarshal(verBody, &verResp) == nil {
			data.Version = verResp.Data.Version
		}
	}

	// Get node list
	nodesBody, err := proxmoxGet(apiURL, apiKey, "/nodes", skipTLS)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Proxmox: %v", err)
	}
	var nodesResp struct {
		Data []struct {
			Node   string  `json:"node"`
			CPU    float64 `json:"cpu"`
			MaxCPU int     `json:"maxcpu"`
			Mem    int64   `json:"mem"`
			MaxMem int64   `json:"maxmem"`
			Status string  `json:"status"`
		} `json:"data"`
	}
	if err := json.Unmarshal(nodesBody, &nodesResp); err != nil || len(nodesResp.Data) == 0 {
		logErrorf("PROXMOX", "nodes parse error or empty: %v (body=%s)", err, string(nodesBody[:min(200, len(nodesBody))]))
		return nil, fmt.Errorf("no Proxmox nodes found")
	}

	node := nodesResp.Data[0]
	data.Node = node.Node

	// Try /nodes/{node}/status first (requires Sys.Audit)
	nodeStatusBody, _ := proxmoxGet(apiURL, apiKey, fmt.Sprintf("/nodes/%s/status", node.Node), skipTLS)
	logDebugf("PROXMOX", "node status bodylen=%d", len(nodeStatusBody))
	cpu, mem, ok := proxmoxParseNodeStatus(nodeStatusBody, node.MaxCPU)
	if ok {
		data.CPU, data.Memory = cpu, mem
	} else {
		// Fallback: try /cluster/resources which works with lower permissions
		clusterBody, cerr := proxmoxGet(apiURL, apiKey, "/cluster/resources?type=node", skipTLS)
		if cerr == nil {
			if cpu, mem, ok := proxmoxParseClusterResources(clusterBody, node.Node); ok {
				data.CPU, data.Memory = cpu, mem
			}
		}
	}

	// Storage
	storageBody, err := proxmoxGet(apiURL, apiKey, fmt.Sprintf("/nodes/%s/storage", node.Node), skipTLS)
	if err != nil {
		logErrorf("PROXMOX", "storage error: %v", err)
	} else {
		data.Storage = proxmoxParseStorage(storageBody)
	}

	// RRD data — network and temperature (last data point from hour window)
	rrdBody, rrdErr := proxmoxGet(apiURL, apiKey, fmt.Sprintf("/nodes/%s/rrddata?timeframe=hour&cf=AVERAGE", node.Node), skipTLS)
	if rrdErr == nil && len(rrdBody) > 10 {
		proxmoxApplyRRD(data, rrdBody)
	}

	// VMs (qemu)
	qemuBody, err := proxmoxGet(apiURL, apiKey, fmt.Sprintf("/nodes/%s/qemu", node.Node), skipTLS)
	if err != nil {
		logErrorf("PROXMOX", "qemu error: %v", err)
	} else {
		data.VMs = append(data.VMs, proxmoxParseVMList(qemuBody, "qemu")...)
	}

	// Containers (lxc)
	lxcBody, err := proxmoxGet(apiURL, apiKey, fmt.Sprintf("/nodes/%s/lxc", node.Node), skipTLS)
	if err == nil {
		data.VMs = append(data.VMs, proxmoxParseVMList(lxcBody, "lxc")...)
	}

	data.VMs = proxmoxSortRunningFirst(data.VMs)

	return data, nil
}

// proxmoxParseNodeStatus decodes /nodes/{node}/status (requires Sys.Audit
// permission on the node — not always granted to the API token, hence the
// cluster/resources fallback in proxmoxParseClusterResources). ok is false
// when the body is empty/malformed or Memory.Total is zero, signaling the
// caller to fall back.
func proxmoxParseNodeStatus(body []byte, maxCPUFallback int) (cpu, mem ProxmoxGauge, ok bool) {
	if len(body) <= 10 {
		return cpu, mem, false
	}
	var statusResp struct {
		Data struct {
			CPU    float64 `json:"cpu"`
			Memory struct {
				Used  int64 `json:"used"`
				Total int64 `json:"total"`
			} `json:"memory"`
			CPUInfo struct {
				CPUs int `json:"cpus"`
			} `json:"cpuinfo"`
		} `json:"data"`
	}
	if json.Unmarshal(body, &statusResp) != nil || statusResp.Data.Memory.Total == 0 {
		return cpu, mem, false
	}
	cpuPct := statusResp.Data.CPU * 100
	cpus := statusResp.Data.CPUInfo.CPUs
	if cpus == 0 {
		cpus = maxCPUFallback
	}
	cpu = ProxmoxGauge{Used: cpuPct, Label: fmt.Sprintf("%.0f%% · %d cores", cpuPct, cpus)}
	m := statusResp.Data.Memory
	usedGB := float64(m.Used) / 1073741824
	totalGB := float64(m.Total) / 1073741824
	mem = ProxmoxGauge{
		Used:  float64(m.Used) / float64(m.Total) * 100,
		Label: fmt.Sprintf("%.1f / %.0f GB", usedGB, totalGB),
	}
	return cpu, mem, true
}

// proxmoxParseClusterResources decodes /cluster/resources?type=node and
// extracts the entry matching nodeName — the lower-permission fallback when
// proxmoxParseNodeStatus can't be used.
func proxmoxParseClusterResources(body []byte, nodeName string) (cpu, mem ProxmoxGauge, ok bool) {
	var cr struct {
		Data []struct {
			Node   string  `json:"node"`
			CPU    float64 `json:"cpu"`
			MaxCPU int     `json:"maxcpu"`
			Mem    int64   `json:"mem"`
			MaxMem int64   `json:"maxmem"`
		} `json:"data"`
	}
	if json.Unmarshal(body, &cr) != nil {
		return cpu, mem, false
	}
	for _, n := range cr.Data {
		if n.Node != nodeName || n.MaxMem <= 0 {
			continue
		}
		cpuPct := n.CPU * 100
		cpu = ProxmoxGauge{Used: cpuPct, Label: fmt.Sprintf("%.0f%% · %d cores", cpuPct, n.MaxCPU)}
		usedGB := float64(n.Mem) / 1073741824
		totalGB := float64(n.MaxMem) / 1073741824
		mem = ProxmoxGauge{
			Used:  float64(n.Mem) / float64(n.MaxMem) * 100,
			Label: fmt.Sprintf("%.1f / %.0f GB", usedGB, totalGB),
		}
		return cpu, mem, true
	}
	return cpu, mem, false
}

// proxmoxParseStorage decodes /nodes/{node}/storage, skipping disabled
// storages and ones reporting zero total capacity (avoids a divide-by-zero
// percent and a meaningless all-zero row).
func proxmoxParseStorage(body []byte) []ProxmoxStorage {
	var storageResp struct {
		Data []struct {
			Storage string `json:"storage"`
			Used    int64  `json:"used"`
			Total   int64  `json:"total"`
			Active  int    `json:"active"`
			Enabled int    `json:"enabled"`
			Type    string `json:"type"`
		} `json:"data"`
	}
	if json.Unmarshal(body, &storageResp) != nil {
		return nil
	}
	var out []ProxmoxStorage
	for _, s := range storageResp.Data {
		if s.Enabled == 0 || s.Total == 0 {
			continue
		}
		out = append(out, ProxmoxStorage{
			Name:    s.Storage,
			UsedGB:  float64(s.Used) / 1073741824,
			TotalGB: float64(s.Total) / 1073741824,
			Percent: float64(s.Used) / float64(s.Total) * 100,
			Active:  s.Active == 1,
		})
	}
	return out
}

// proxmoxApplyRRD decodes /nodes/{node}/rrddata (hour window) and applies
// the last non-null data point to data. RRD buckets near "now" are commonly
// null until the collector's next tick, so this walks backward from the end
// rather than trusting the last array element to be populated. Temperature
// sensors have no fixed key set across hardware, so they're detected by
// substring match on "temp" rather than named fields.
func proxmoxApplyRRD(data *ProxmoxPanelData, body []byte) {
	var rrdResp struct {
		Data []map[string]interface{} `json:"data"`
	}
	if json.Unmarshal(body, &rrdResp) != nil || len(rrdResp.Data) == 0 {
		return
	}
	var last map[string]interface{}
	for i := len(rrdResp.Data) - 1; i >= 0; i-- {
		if rrdResp.Data[i]["cpu"] != nil {
			last = rrdResp.Data[i]
			break
		}
	}
	if last == nil {
		return
	}
	if v, ok := last["netin"].(float64); ok {
		data.NetIn = v
	}
	if v, ok := last["netout"].(float64); ok {
		data.NetOut = v
	}
	if v, ok := last["loadavg"].(float64); ok {
		data.LoadAvg = v
	}
	if v, ok := last["iowait"].(float64); ok {
		data.IOWait = v * 100
	}
	if v, ok := last["pressurecpusome"].(float64); ok {
		data.CPUPressure = v
	}
	if v, ok := last["pressurememorysome"].(float64); ok {
		data.MemPressure = v
	}
	if v, ok := last["pressureiosome"].(float64); ok {
		data.IOPressure = v
	}
	for k, v := range last {
		if strings.Contains(strings.ToLower(k), "temp") {
			if f, ok := v.(float64); ok && f > 0 {
				data.Temps = append(data.Temps, ProxmoxTemp{Name: k, TempC: f})
			}
		}
	}
}

// proxmoxParseVMList decodes a /nodes/{node}/qemu or /nodes/{node}/lxc
// response — both endpoints share this exact shape, differing only in
// which guest type they list, hence the shared parser with vmType passed
// through rather than duplicated per endpoint.
func proxmoxParseVMList(body []byte, vmType string) []ProxmoxVM {
	var resp struct {
		Data []struct {
			VMID   int     `json:"vmid"`
			Name   string  `json:"name"`
			Status string  `json:"status"`
			CPU    float64 `json:"cpu"`
			Mem    int64   `json:"mem"`
			MaxMem int64   `json:"maxmem"`
			Uptime int64   `json:"uptime"`
		} `json:"data"`
	}
	if json.Unmarshal(body, &resp) != nil {
		return nil
	}
	var out []ProxmoxVM
	for _, vm := range resp.Data {
		memPct := 0.0
		if vm.MaxMem > 0 {
			memPct = float64(vm.Mem) / float64(vm.MaxMem) * 100
		}
		out = append(out, ProxmoxVM{
			ID: vm.VMID, Name: vm.Name, Type: vmType,
			Status: vm.Status, CPU: vm.CPU * 100,
			MemPct: memPct, Uptime: vm.Uptime,
		})
	}
	return out
}

// proxmoxSortRunningFirst returns vms with all "running" guests first,
// preserving relative order within each group (stable partition).
func proxmoxSortRunningFirst(vms []ProxmoxVM) []ProxmoxVM {
	running := []ProxmoxVM{}
	stopped := []ProxmoxVM{}
	for _, vm := range vms {
		if vm.Status == "running" {
			running = append(running, vm)
		} else {
			stopped = append(stopped, vm)
		}
	}
	return append(running, stopped...)
}

func proxmoxGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	url := strings.TrimRight(baseURL, "/") + "/api2/json" + path
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", apiKey)
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Proxmox", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func testProxmoxConnection(apiURL, apiKey string, skipTLS bool) error {
	body, err := proxmoxGet(apiURL, apiKey, "/version", skipTLS)
	if err != nil {
		return err
	}
	var resp struct {
		Data struct {
			Version string `json:"version"`
		} `json:"data"`
	}
	if json.Unmarshal(body, &resp) != nil || resp.Data.Version == "" {
		return fmt.Errorf("unexpected response from Proxmox")
	}
	return nil
}
