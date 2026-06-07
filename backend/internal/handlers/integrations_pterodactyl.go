package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type PterodactylServer struct {
	Identifier    string  `json:"identifier"`
	Name          string  `json:"name"`
	Description   string  `json:"description"`
	State         string  `json:"state"`
	CPUPercent    float64 `json:"cpuPercent"`
	MemoryMB      int64   `json:"memoryMB"`
	MemoryLimitMB int64   `json:"memoryLimitMB"`
	DiskMB        int64   `json:"diskMB"`
	DiskLimitMB   int64   `json:"diskLimitMB"`
	UptimeSecs    int64   `json:"uptimeSecs"`
}

type PterodactylPanelData struct {
	Servers      []PterodactylServer `json:"servers"`
	TotalCount   int                 `json:"totalCount"`
	RunningCount int                 `json:"runningCount"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func pterodactylGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("pterodactyl: HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Connection test ───────────────────────────────────────────────────────────

func testPterodactylConnection(baseURL, apiKey string, skipTLS bool) error {
	b, err := pterodactylGet(baseURL, apiKey, "/api/client/account", skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		Object string `json:"object"`
	}
	if json.Unmarshal(b, &r) != nil || r.Object != "account" {
		return fmt.Errorf("pterodactyl: unexpected response")
	}
	return nil
}

// ── Panel data ────────────────────────────────────────────────────────────────

func fetchPterodactylPanelData(_ *sql.DB, config map[string]interface{}) (*PterodactylPanelData, error) {
	baseURL, _ := config["baseURL"].(string)
	apiKey, _ := config["apiKey"].(string)
	skipTLS, _ := config["skipTLSVerify"].(bool)
	if baseURL == "" {
		return nil, fmt.Errorf("pterodactyl: baseURL not configured")
	}

	out := &PterodactylPanelData{Servers: []PterodactylServer{}}

	// Server list
	b, err := pterodactylGet(baseURL, apiKey, "/api/client/servers", skipTLS)
	if err != nil {
		return nil, err
	}

	var listResp struct {
		Data []struct {
			Attributes struct {
				Identifier  string `json:"identifier"`
				Name        string `json:"name"`
				Description string `json:"description"`
				Status      string `json:"status"`
				Limits      struct {
					Memory int64 `json:"memory"` // MB
					Disk   int64 `json:"disk"`   // MB
					CPU    int64 `json:"cpu"`    // percent
				} `json:"limits"`
			} `json:"attributes"`
		} `json:"data"`
	}
	if err := json.Unmarshal(b, &listResp); err != nil {
		return nil, fmt.Errorf("pterodactyl: failed to parse server list")
	}

	for _, item := range listResp.Data {
		attr := item.Attributes
		sv := PterodactylServer{
			Identifier:    attr.Identifier,
			Name:          attr.Name,
			Description:   attr.Description,
			State:         attr.Status,
			MemoryLimitMB: attr.Limits.Memory,
			DiskLimitMB:   attr.Limits.Disk,
		}

		// Per-server resource usage
		if rb, err := pterodactylGet(baseURL, apiKey,
			"/api/client/servers/"+attr.Identifier+"/resources", skipTLS); err == nil {
			var res struct {
				Attributes struct {
					CurrentState string `json:"current_state"`
					Resources    struct {
						MemoryBytes int64   `json:"memory_bytes"`
						CPUAbsolute float64 `json:"cpu_absolute"`
						DiskBytes   int64   `json:"disk_bytes"`
						Uptime      int64   `json:"uptime"`
					} `json:"resources"`
				} `json:"attributes"`
			}
			if json.Unmarshal(rb, &res) == nil {
				sv.State = res.Attributes.CurrentState
				sv.CPUPercent = res.Attributes.Resources.CPUAbsolute
				sv.MemoryMB = res.Attributes.Resources.MemoryBytes / 1024 / 1024
				sv.DiskMB = res.Attributes.Resources.DiskBytes / 1024 / 1024
				sv.UptimeSecs = res.Attributes.Resources.Uptime / 1000
			}
		}

		if sv.State == "running" {
			out.RunningCount++
		}
		out.Servers = append(out.Servers, sv)
	}

	out.TotalCount = len(out.Servers)
	return out, nil
}
