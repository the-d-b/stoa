package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
)

// ── Proxmox types ─────────────────────────────────────────────────────────────

type ProxmoxPanelData struct {
	UIURL        string           `json:"uiUrl"`
	Node         string           `json:"node"`
	CPU          ProxmoxGauge     `json:"cpu"`
	Memory       ProxmoxGauge     `json:"memory"`
	Storage      []ProxmoxStorage `json:"storage"`
	VMs          []ProxmoxVM      `json:"vms"`
	Temps        []ProxmoxTemp    `json:"temps"`
	NetIn        float64          `json:"netIn"`
	NetOut       float64          `json:"netOut"`
	LoadAvg      float64          `json:"loadAvg"`
	IOWait       float64          `json:"ioWait"`       // percentage
	CPUPressure  float64          `json:"cpuPressure"`  // PSI some %
	MemPressure  float64          `json:"memPressure"`  // PSI some %
	IOPressure   float64          `json:"ioPressure"`   // PSI some %
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
		log.Printf("[PROXMOX] nodes parse error or empty: %v (body=%s)", err, string(nodesBody[:min(200, len(nodesBody))]))
		return nil, fmt.Errorf("no Proxmox nodes found")
	}

	node := nodesResp.Data[0]
	data.Node = node.Node

	// Try /nodes/{node}/status first (requires Sys.Audit)
	nodeStatusBody, _ := proxmoxGet(apiURL, apiKey, fmt.Sprintf("/nodes/%s/status", node.Node), skipTLS)
	log.Printf("[PROXMOX] node status bodylen=%d", len(nodeStatusBody))
	parsedStatus := false
	if len(nodeStatusBody) > 10 {
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
		if json.Unmarshal(nodeStatusBody, &statusResp) == nil && statusResp.Data.Memory.Total > 0 {
			cpuPct := statusResp.Data.CPU * 100
			cpus := statusResp.Data.CPUInfo.CPUs
			if cpus == 0 { cpus = node.MaxCPU }
			data.CPU = ProxmoxGauge{Used: cpuPct, Label: fmt.Sprintf("%.0f%% · %d cores", cpuPct, cpus)}
			mem := statusResp.Data.Memory
			usedGB := float64(mem.Used) / 1073741824
			totalGB := float64(mem.Total) / 1073741824
			data.Memory = ProxmoxGauge{
				Used:  float64(mem.Used) / float64(mem.Total) * 100,
				Label: fmt.Sprintf("%.1f / %.0f GB", usedGB, totalGB),
			}
			parsedStatus = true
		}
	}
	// Fallback: try /cluster/resources which works with lower permissions
	if !parsedStatus {
		clusterBody, cerr := proxmoxGet(apiURL, apiKey, "/cluster/resources?type=node", skipTLS)
		if cerr == nil {
			var cr struct {
				Data []struct {
					Node   string  `json:"node"`
					CPU    float64 `json:"cpu"`
					MaxCPU int     `json:"maxcpu"`
					Mem    int64   `json:"mem"`
					MaxMem int64   `json:"maxmem"`
				} `json:"data"`
			}
			if json.Unmarshal(clusterBody, &cr) == nil {
				for _, n := range cr.Data {
					if n.Node == node.Node && n.MaxMem > 0 {
						cpuPct := n.CPU * 100
						data.CPU = ProxmoxGauge{Used: cpuPct, Label: fmt.Sprintf("%.0f%% · %d cores", cpuPct, n.MaxCPU)}
						usedGB := float64(n.Mem) / 1073741824
						totalGB := float64(n.MaxMem) / 1073741824
						data.Memory = ProxmoxGauge{
							Used:  float64(n.Mem) / float64(n.MaxMem) * 100,
							Label: fmt.Sprintf("%.1f / %.0f GB", usedGB, totalGB),
						}
					}
				}
			}
		}
	}

	// Storage
	storageBody, err := proxmoxGet(apiURL, apiKey, fmt.Sprintf("/nodes/%s/storage", node.Node), skipTLS)
	if err != nil { log.Printf("[PROXMOX] storage error: %v", err) }
	if err == nil {
		var storageResp struct {
			Data []struct {
				Storage string  `json:"storage"`
				Used    int64   `json:"used"`
				Total   int64   `json:"total"`
				Active  int     `json:"active"`
				Enabled int     `json:"enabled"`
				Type    string  `json:"type"`
			} `json:"data"`
		}
		if json.Unmarshal(storageBody, &storageResp) == nil {
			for _, s := range storageResp.Data {
				if s.Enabled == 0 || s.Total == 0 {
					continue
				}
				usedGB := float64(s.Used) / 1073741824
				totalGB := float64(s.Total) / 1073741824
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

	// RRD data — network and temperature (last data point from hour window)
	rrdBody, rrdErr := proxmoxGet(apiURL, apiKey, fmt.Sprintf("/nodes/%s/rrddata?timeframe=hour&cf=AVERAGE", node.Node), skipTLS)
	if rrdErr == nil && len(rrdBody) > 10 {
		var rrdResp struct {
			Data []map[string]interface{} `json:"data"`
		}
		if json.Unmarshal(rrdBody, &rrdResp) == nil && len(rrdResp.Data) > 0 {
			// Find last non-null data point
			var last map[string]interface{}
			for i := len(rrdResp.Data) - 1; i >= 0; i-- {
				if rrdResp.Data[i]["cpu"] != nil {
					last = rrdResp.Data[i]
					break
				}
			}
			if last != nil {
				if v, ok := last["netin"].(float64); ok { data.NetIn = v }
				if v, ok := last["netout"].(float64); ok { data.NetOut = v }
				if v, ok := last["loadavg"].(float64); ok { data.LoadAvg = v }
				if v, ok := last["iowait"].(float64); ok { data.IOWait = v * 100 }
				if v, ok := last["pressurecpusome"].(float64); ok { data.CPUPressure = v }
				if v, ok := last["pressurememorysome"].(float64); ok { data.MemPressure = v }
				if v, ok := last["pressureiosome"].(float64); ok { data.IOPressure = v }
				for k, v := range last {
					if strings.Contains(strings.ToLower(k), "temp") {
						if f, ok := v.(float64); ok && f > 0 {
							data.Temps = append(data.Temps, ProxmoxTemp{Name: k, TempC: f})
						}
					}
				}
			}
		}
	}

	// VMs (qemu)
	qemuBody, err := proxmoxGet(apiURL, apiKey, fmt.Sprintf("/nodes/%s/qemu", node.Node), skipTLS)
	if err != nil { log.Printf("[PROXMOX] qemu error: %v", err) }
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
					ID: vm.VMID, Name: vm.Name, Type: "qemu",
					Status: vm.Status, CPU: vm.CPU * 100,
					MemPct: memPct, Uptime: vm.Uptime,
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
					ID: ct.VMID, Name: ct.Name, Type: "lxc",
					Status: ct.Status, CPU: ct.CPU * 100,
					MemPct: memPct, Uptime: ct.Uptime,
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
