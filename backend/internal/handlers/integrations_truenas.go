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
	UIURL    string          `json:"uiUrl"`
	Hostname string          `json:"hostname"`
	Version  string          `json:"version"`
	CPU      TrueNASGauge    `json:"cpu"`
	Memory   TrueNASGauge    `json:"memory"`
	Pools    []TrueNASPool   `json:"pools"`
	Alerts   []TrueNASAlert  `json:"alerts"`
	Disks    []TrueNASDisk   `json:"disks"`
}

type TrueNASGauge struct {
	Used    float64 `json:"used"`    // percentage 0-100
	Label   string  `json:"label"`   // e.g. "32 GB / 64 GB"
}

type TrueNASPool struct {
	Name    string  `json:"name"`
	Status  string  `json:"status"`  // ONLINE, DEGRADED, FAULTED, etc.
	UsedGB  float64 `json:"usedGb"`
	TotalGB float64 `json:"totalGb"`
	Percent float64 `json:"percent"`
}

type TrueNASAlert struct {
	Level   string `json:"level"`   // CRITICAL, WARNING, INFO
	Message string `json:"message"`
}

type TrueNASDisk struct {
	Name    string  `json:"name"`
	TempC   float64 `json:"tempC"`
	Serial  string  `json:"serial"`
}

func fetchTrueNASPanelData(db *sql.DB, config map[string]interface{}) (*TrueNASPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	_, skipTLS := config["skipTls"].(bool)

	data := &TrueNASPanelData{UIURL: uiURL}

	// System info
	if body, err := truenasGet(apiURL, apiKey, "/system/info", skipTLS); err == nil {
		var info struct {
			Hostname string `json:"hostname"`
			Version  string `json:"version"`
		}
		if json.Unmarshal(body, &info) == nil {
			data.Hostname = info.Hostname
			data.Version = info.Version
		}
	}

	// CPU usage
	if body, err := truenasGet(apiURL, apiKey, "/reporting/get_data?graphs=[{\"name\":\"cpu\"}]&reporting_query={\"start\":\"now-2s\",\"end\":\"now\",\"aggregate\":true}", skipTLS); err == nil {
		var resp []struct {
			Data [][]float64 `json:"data"`
		}
		if json.Unmarshal(body, &resp) == nil && len(resp) > 0 && len(resp[0].Data) > 0 {
			row := resp[0].Data[len(resp[0].Data)-1]
			if len(row) > 0 {
				// CPU reporting gives user+system+interrupt etc — sum non-idle
				var total float64
				for _, v := range row {
					total += v
				}
				data.CPU = TrueNASGauge{Used: total, Label: fmt.Sprintf("%.0f%%", total)}
			}
		}
	}

	// Memory
	if body, err := truenasGet(apiURL, apiKey, "/stats/get_data?stats=[{\"name\":\"memory\",\"identifier\":null}]&start=\"now-2s\"&end=\"now\"", skipTLS); err == nil {
		_ = body // fallback to system/info memory below
	}
	// Simpler memory via vm.stats
	if body, err := truenasGet(apiURL, apiKey, "/system/info", skipTLS); err == nil {
		var info struct {
			PhysMemSize int64 `json:"physmem"`
		}
		if json.Unmarshal(body, &info) == nil && info.PhysMemSize > 0 {
			// Get actual usage via reporting
			totalGB := float64(info.PhysMemSize) / 1024 / 1024 / 1024
			if memBody, err := truenasGet(apiURL, apiKey, "/reporting/get_data?graphs=[{\"name\":\"memory\"}]&reporting_query={\"start\":\"now-2s\",\"end\":\"now\",\"aggregate\":true}", skipTLS); err == nil {
				var resp []struct {
					Data   [][]float64 `json:"data"`
					Legend []string    `json:"legend"`
				}
				if json.Unmarshal(memBody, &resp) == nil && len(resp) > 0 {
					// Find "used" in legend
					usedIdx := -1
					for i, l := range resp[0].Legend {
						if strings.EqualFold(l, "used") {
							usedIdx = i
							break
						}
					}
					if usedIdx >= 0 && len(resp[0].Data) > 0 {
						row := resp[0].Data[len(resp[0].Data)-1]
						if usedIdx < len(row) {
							usedBytes := row[usedIdx]
							usedGB := usedBytes / 1024 / 1024 / 1024
							pct := usedGB / totalGB * 100
							data.Memory = TrueNASGauge{
								Used:  pct,
								Label: fmt.Sprintf("%.1f / %.0f GB", usedGB, totalGB),
							}
						}
					}
				}
			}
		}
	}

	// Pools
	if body, err := truenasGet(apiURL, apiKey, "/pool", skipTLS); err == nil {
		var pools []struct {
			Name   string `json:"name"`
			Status string `json:"status"`
			Size   int64  `json:"size"`
			Allocated int64 `json:"allocated"`
		}
		if json.Unmarshal(body, &pools) == nil {
			for _, p := range pools {
				totalGB := float64(p.Size) / 1024 / 1024 / 1024
				usedGB := float64(p.Allocated) / 1024 / 1024 / 1024
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

	// Alerts
	if body, err := truenasGet(apiURL, apiKey, "/alert/list", skipTLS); err == nil {
		var alerts []struct {
			Level    string `json:"level"`
			Formatted string `json:"formatted"`
			Dismissed bool   `json:"dismissed"`
		}
		if json.Unmarshal(body, &alerts) == nil {
			for _, a := range alerts {
				if !a.Dismissed {
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
	}

	// Disk temps (limit to first 12)
	if body, err := truenasGet(apiURL, apiKey, "/disk?limit=20&extra={\"include_expired\":false}", skipTLS); err == nil {
		var disks []struct {
			Name        string  `json:"name"`
			Serial      string  `json:"serial"`
			Temperature float64 `json:"temperature"`
		}
		if json.Unmarshal(body, &disks) == nil {
			for i, d := range disks {
				if i >= 12 { break }
				data.Disks = append(data.Disks, TrueNASDisk{
					Name:   d.Name,
					Serial: d.Serial,
					TempC:  d.Temperature,
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
