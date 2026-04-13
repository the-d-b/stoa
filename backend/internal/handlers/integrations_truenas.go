package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ── TrueNAS types ─────────────────────────────────────────────────────────────

type TrueNASPanelData struct {
	UIURL     string         `json:"uiUrl"`
	Hostname  string         `json:"hostname"`
	Version   string         `json:"version"`
	TotalRAM  string         `json:"totalRam"`
	CPUModel  string         `json:"cpuModel"`
	CPUCores  int            `json:"cpuCores"`
	Pools     []TrueNASPool  `json:"pools"`
	Alerts    []TrueNASAlert `json:"alerts"`
	Disks     []TrueNASDisk  `json:"disks"`
	VMs       []TrueNASVM    `json:"vms"`
	Apps      []TrueNASApp   `json:"apps"`
}

type TrueNASPool struct {
	Name    string  `json:"name"`
	Status  string  `json:"status"`
	UsedGB  float64 `json:"usedGb"`
	TotalGB float64 `json:"totalGb"`
	Percent float64 `json:"percent"`
}

type TrueNASAlert struct {
	Level   string `json:"level"`
	Message string `json:"message"`
}

type TrueNASDisk struct {
	Name  string  `json:"name"`
	TempC float64 `json:"tempC"`
}

type TrueNASVM struct {
	Name   string `json:"name"`
	Status string `json:"status"`
}

type TrueNASApp struct {
	Name            string `json:"name"`
	Status          string `json:"status"`
	UpdateAvailable bool   `json:"updateAvailable"`
}

func fetchTrueNASPanelData(db *sql.DB, config map[string]interface{}) (*TrueNASPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &TrueNASPanelData{UIURL: uiURL}

	// System info
	if body, err := truenasGet(apiURL, apiKey, "/system/info", skipTLS); err == nil {
		var info struct {
			Hostname string `json:"hostname"`
			Version  string `json:"version"`
			PhysMem  int64  `json:"physmem"`
			Model    string `json:"model"`
			Cores    int    `json:"cores"`
		}
		if json.Unmarshal(body, &info) == nil {
			data.Hostname = info.Hostname
			data.Version = info.Version
			data.CPUModel = info.Model
			data.CPUCores = info.Cores
			if info.PhysMem > 0 {
				gb := float64(info.PhysMem) / 1073741824
				data.TotalRAM = fmt.Sprintf("%.0f GB RAM", gb)
			}
		}
	}

	// Pools
	if body, err := truenasGet(apiURL, apiKey, "/pool", skipTLS); err == nil {
		var pools []struct {
			Name      string `json:"name"`
			Status    string `json:"status"`
			Size      int64  `json:"size"`
			Allocated int64  `json:"allocated"`
		}
		if json.Unmarshal(body, &pools) == nil {
			for _, p := range pools {
				totalGB := float64(p.Size) / 1073741824
				usedGB := float64(p.Allocated) / 1073741824
				pct := 0.0
				if totalGB > 0 {
					pct = usedGB / totalGB * 100
				}
				data.Pools = append(data.Pools, TrueNASPool{
					Name:    p.Name,
					Status:  p.Status,
					UsedGB:  usedGB,
					TotalGB: totalGB,
					Percent: pct,
				})
			}
		}
	}

	// Alerts (non-dismissed)
	if body, err := truenasGet(apiURL, apiKey, "/alert/list", skipTLS); err == nil {
		var alerts []struct {
			Level     string `json:"level"`
			Formatted string `json:"formatted"`
			Dismissed bool   `json:"dismissed"`
		}
		if json.Unmarshal(body, &alerts) == nil {
			for _, a := range alerts {
				if a.Dismissed {
					continue
				}
				msg := a.Formatted
				if len(msg) > 120 {
					msg = msg[:120] + "…"
				}
				data.Alerts = append(data.Alerts, TrueNASAlert{
					Level:   a.Level,
					Message: msg,
				})
			}
		}
	}

	// Disk temperatures via disk/query with temperature extra
	if body, err := truenasGet(apiURL, apiKey, "/disk?limit=24&extra=%7B%22include_expired%22%3Afalse%2C%22passwords%22%3Afalse%2C%22supports_smart%22%3Atrue%7D", skipTLS); err == nil {
		var disks []struct {
			Name        string  `json:"name"`
			Temperature float64 `json:"temperature"`
		}
		if json.Unmarshal(body, &disks) == nil {
			for _, d := range disks {
				if d.Temperature > 0 {
					data.Disks = append(data.Disks, TrueNASDisk{
						Name:  d.Name,
						TempC: d.Temperature,
					})
				}
			}
		}
	}

	// VMs
	if body, err := truenasGet(apiURL, apiKey, "/vm?limit=20", skipTLS); err == nil {
		var vms []struct {
			Name   string `json:"name"`
			Status struct {
				State string `json:"state"`
			} `json:"status"`
		}
		if json.Unmarshal(body, &vms) == nil {
			for _, v := range vms {
				data.VMs = append(data.VMs, TrueNASVM{
					Name:   v.Name,
					Status: v.Status.State,
				})
			}
		}
	}

	// Apps (Docker containers via TrueNAS Scale apps)
	if body, err := truenasGet(apiURL, apiKey, "/app?limit=50", skipTLS); err == nil {
		var apps []struct {
			Name            string `json:"name"`
			State           string `json:"state"`
			UpdateAvailable bool   `json:"update_available"`
		}
		if json.Unmarshal(body, &apps) == nil {
			for _, a := range apps {
				data.Apps = append(data.Apps, TrueNASApp{
					Name:            a.Name,
					Status:          a.State,
					UpdateAvailable: a.UpdateAvailable,
				})
			}
		}
	}

	return data, nil
}

func truenasGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	url := strings.TrimRight(baseURL, "/") + "/api/v2.0" + path
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from TrueNAS", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func truenasPost(baseURL, apiKey, path, body string, skipTLS bool) ([]byte, error) {
	url := strings.TrimRight(baseURL, "/") + "/api/v2.0" + path
	req, err := http.NewRequest("POST", url, strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from TrueNAS", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func testTrueNASConnection(apiURL, apiKey string, skipTLS bool) error {
	body, err := truenasGet(apiURL, apiKey, "/system/info", skipTLS)
	if err != nil {
		return err
	}
	var info map[string]interface{}
	if json.Unmarshal(body, &info) != nil || info["hostname"] == nil {
		return fmt.Errorf("unexpected response from TrueNAS")
	}
	return nil
}
