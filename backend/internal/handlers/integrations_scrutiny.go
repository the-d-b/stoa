package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type ScrutinyDevice struct {
	DeviceName      string `json:"deviceName"`
	ModelName       string `json:"modelName"`
	DeviceProtocol  string `json:"deviceProtocol"`  // ATA, NVMe, SCSI
	Capacity        int64  `json:"capacity"`        // bytes
	RotationalSpeed int    `json:"rotationalSpeed"` // RPM; 0 = SSD/NVMe
	Status          string `json:"status"`          // passed, warning, failed, unknown
	Temperature     int    `json:"temperature"`     // Celsius
	PowerOnHours    int    `json:"powerOnHours"`
	ReallocSectors  int64  `json:"reallocSectors"`
	PendingSectors  int64  `json:"pendingSectors"`
	LastSeen        string `json:"lastSeen"` // RFC3339
}

type ScrutinyPanelData struct {
	UIURL          string           `json:"uiUrl"`
	IntegrationID  string           `json:"integrationId"`
	TotalDevices   int              `json:"totalDevices"`
	PassedDevices  int              `json:"passedDevices"`
	WarningDevices int              `json:"warningDevices"`
	FailedDevices  int              `json:"failedDevices"`
	AvgTemp        int              `json:"avgTemp"`
	MaxTemp        int              `json:"maxTemp"`
	Devices        []ScrutinyDevice `json:"devices"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func scrutinyGet(baseURL, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	fullURL := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", fullURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Scrutiny", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func scrutinyStatusStr(code int) string {
	switch code {
	case 0:
		return "passed"
	case 2:
		return "warning" // failed Scrutiny threshold, passed SMART
	default:
		return "failed" // failed SMART threshold
	}
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchScrutinyPanelData(db *sql.DB, config map[string]interface{}) (*ScrutinyPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("integrationId required")
	}
	baseURL, uiURL, _, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if uiURL == "" {
		uiURL = baseURL
	}

	body, err := scrutinyGet(baseURL, "/api/summary", skipTLS)
	if err != nil {
		return nil, fmt.Errorf("summary: %w", err)
	}

	var resp struct {
		Success bool `json:"success"`
		Data    struct {
			Summary map[string]struct {
				Device struct {
					DeviceName      string `json:"device_name"`
					ModelName       string `json:"model_name"`
					Manufacturer    string `json:"manufacturer"`
					Capacity        int64  `json:"capacity"`
					RotationalSpeed int    `json:"rotational_speed"`
					DeviceType      string `json:"device_type"`
					DeviceProtocol  string `json:"device_protocol"`
				} `json:"device"`
				SmartResults []struct {
					Date         string `json:"date"`
					SmartStatus  int    `json:"smart_status"`
					Temp         int    `json:"temp"`
					PowerOnHours int    `json:"power_on_hours"`
					Attrs        map[string]struct {
						RawValue    int64  `json:"raw_value"`
						FailureRisk string `json:"failure_risk"`
					} `json:"attrs"`
				} `json:"smart_results"`
			} `json:"summary"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("parsing summary: %w", err)
	}

	out := &ScrutinyPanelData{UIURL: uiURL, IntegrationID: integrationID}
	tempSum, tempCount := 0, 0

	for _, entry := range resp.Data.Summary {
		dev := ScrutinyDevice{
			DeviceName:      entry.Device.DeviceName,
			ModelName:       entry.Device.ModelName,
			DeviceProtocol:  strings.ToUpper(entry.Device.DeviceProtocol),
			Capacity:        entry.Device.Capacity,
			RotationalSpeed: entry.Device.RotationalSpeed,
			Status:          "unknown",
		}

		if len(entry.SmartResults) > 0 {
			latest := entry.SmartResults[0]
			dev.Status = scrutinyStatusStr(latest.SmartStatus)
			dev.Temperature = latest.Temp
			dev.PowerOnHours = latest.PowerOnHours
			dev.LastSeen = latest.Date

			// Fallback: read temperature from attr 194 if top-level is zero
			if dev.Temperature == 0 {
				if a, ok := latest.Attrs["194"]; ok {
					dev.Temperature = int(a.RawValue)
				}
			}
			if a, ok := latest.Attrs["5"]; ok {
				dev.ReallocSectors = a.RawValue
			}
			if a, ok := latest.Attrs["197"]; ok {
				dev.PendingSectors = a.RawValue
			}
		}

		switch dev.Status {
		case "passed":
			out.PassedDevices++
		case "warning":
			out.WarningDevices++
		case "failed":
			out.FailedDevices++
		}
		out.TotalDevices++

		if dev.Temperature > 0 {
			tempSum += dev.Temperature
			tempCount++
			if dev.Temperature > out.MaxTemp {
				out.MaxTemp = dev.Temperature
			}
		}
		out.Devices = append(out.Devices, dev)
	}

	if tempCount > 0 {
		out.AvgTemp = tempSum / tempCount
	}

	// Sort: failed → warning → passed → unknown, then alphabetical within
	priority := map[string]int{"failed": 0, "warning": 1, "passed": 2, "unknown": 3}
	sort.Slice(out.Devices, func(i, j int) bool {
		pi, pj := priority[out.Devices[i].Status], priority[out.Devices[j].Status]
		if pi != pj {
			return pi < pj
		}
		return out.Devices[i].DeviceName < out.Devices[j].DeviceName
	})

	return out, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testScrutinyConnection(baseURL, _ string, skipTLS bool) error {
	body, err := scrutinyGet(baseURL, "/api/summary", skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		Success bool `json:"success"`
	}
	if json.Unmarshal(body, &r) != nil || !r.Success {
		return fmt.Errorf("unexpected response from Scrutiny")
	}
	return nil
}
