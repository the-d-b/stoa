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
	UIURL   string          `json:"uiUrl"`
	Node    string          `json:"node"`
	CPU     ProxmoxGauge    `json:"cpu"`
	Memory  ProxmoxGauge    `json:"memory"`
	Storage []ProxmoxStorage `json:"storage"`
	VMs     []ProxmoxVM     `json:"vms"`
}

type ProxmoxGauge struct {
	Used  float64 `json:"used"`  // percentage 0-100
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
	ID      int     `json:"id"`
	Name    string  `json:"name"`
	Type    string  `json:"type"`    // qemu or lxc
	Status  string  `json:"status"`  // running, stopped
	CPU     float64 `json:"cpu"`     // 0-100
	MemPct  float64 `json:"memPct"`  // 0-100
	Uptime  int64   `json:"uptime"`  // seconds
}

func fetchProxmoxPanelData(db *sql.DB, config map[string]interface{}) (*ProxmoxPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	_, skipTLS := config["skipTls"].(bool)

	// API token format: "PVEAPIToken=user@realm!tokenid=secret"
	data := &ProxmoxPanelData{UIURL: uiURL}

	// Get node list — pick first node
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
		return nil, fmt.Errorf("no Proxmox nodes found")
	}

	node := nodesResp.Data[0]
	data.Node = node.Node

	// CPU
	cpuPct := node.CPU * 100
	data.CPU = ProxmoxGauge{
		Used:  cpuPct,
		Label: fmt.Sprintf("%.0f%% of %d cores", cpuPct, node.MaxCPU),
	}

	// Memory
	if node.MaxMem > 0 {
		usedGB := float64(node.Mem) / 1024 / 1024 / 1024
		totalGB := float64(node.MaxMem) / 1024 / 1024 / 1024
		pct := float64(node.Mem) / float64(node.MaxMem) * 100
		data.Memory = ProxmoxGauge{
			Used:  pct,
			Label: fmt.Sprintf("%.1f / %.0f GB", usedGB, totalGB),
		}
	}

	// Storage
	storageBody, err := proxmoxGet(apiURL, apiKey, fmt.Sprintf("/nodes/%s/storage", node.Node), skipTLS)
	if err == nil {
		var storageResp struct {
			Data []struct {
				Storage string  `json:"storage"`
				Used    int64   `json:"used"`
				Total   int64   `json:"total"`
				Active  int     `json:"active"`
				Enabled int     `json:"enabled"`
			} `json:"data"`
		}
		if json.Unmarshal(storageBody, &storageResp) == nil {
			for _, s := range storageResp.Data {
				if s.Enabled == 0 || s.Total == 0 { continue }
				usedGB := float64(s.Used) / 1024 / 1024 / 1024
				totalGB := float64(s.Total) / 1024 / 1024 / 1024
				data.Storage = append(data.Storage, ProxmoxStorage{
					Name:    s.Storage,
					UsedGB:  usedGB,
					TotalGB: totalGB,
					Percent: float64(s.Used) / float64(s.Total) * 100,
					Active:  s.Active == 1,
				})
			}
		}
	}

	// VMs (qemu)
	qemuBody, err := proxmoxGet(apiURL, apiKey, fmt.Sprintf("/nodes/%s/qemu", node.Node), skipTLS)
	if err == nil {
		var qemuResp struct {
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
		if json.Unmarshal(qemuBody, &qemuResp) == nil {
			for _, vm := range qemuResp.Data {
				memPct := 0.0
				if vm.MaxMem > 0 {
					memPct = float64(vm.Mem) / float64(vm.MaxMem) * 100
				}
				data.VMs = append(data.VMs, ProxmoxVM{
					ID:     vm.VMID,
					Name:   vm.Name,
					Type:   "qemu",
					Status: vm.Status,
					CPU:    vm.CPU * 100,
					MemPct: memPct,
					Uptime: vm.Uptime,
				})
			}
		}
	}

	// Containers (lxc)
	lxcBody, err := proxmoxGet(apiURL, apiKey, fmt.Sprintf("/nodes/%s/lxc", node.Node), skipTLS)
	if err == nil {
		var lxcResp struct {
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
		if json.Unmarshal(lxcBody, &lxcResp) == nil {
			for _, ct := range lxcResp.Data {
				memPct := 0.0
				if ct.MaxMem > 0 {
					memPct = float64(ct.Mem) / float64(ct.MaxMem) * 100
				}
				data.VMs = append(data.VMs, ProxmoxVM{
					ID:     ct.VMID,
					Name:   ct.Name,
					Type:   "lxc",
					Status: ct.Status,
					CPU:    ct.CPU * 100,
					MemPct: memPct,
					Uptime: ct.Uptime,
				})
			}
		}
	}

	// Sort: running first
	running := []ProxmoxVM{}
	stopped := []ProxmoxVM{}
	for _, vm := range data.VMs {
		if vm.Status == "running" {
			running = append(running, vm)
		} else {
			stopped = append(stopped, vm)
		}
	}
	data.VMs = append(running, stopped...)

	return data, nil
}

func proxmoxGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	url := strings.TrimRight(baseURL, "/") + "/api2/json" + path
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", apiKey) // "PVEAPIToken=user@realm!tokenid=secret"
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
