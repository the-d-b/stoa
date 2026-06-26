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

type LubeLoggerReminder struct {
	Description string  `json:"description"`
	Urgency     string  `json:"urgency"`    // "Not Urgent", "Urgent", "Very Urgent", "Past Due"
	DueDate     string  `json:"dueDate"`    // empty for mileage-only reminders
	DueOdometer float64 `json:"dueOdometer"` // 0 for date-only reminders
	Metric      string  `json:"metric"`
}

type LubeLoggerServiceRecord struct {
	Date        string  `json:"date"`
	Description string  `json:"description"`
	Odometer    float64 `json:"odometer"`
	Cost        float64 `json:"cost"`
}

type LubeLoggerVehicle struct {
	ID            int                       `json:"id"`
	Year          string                    `json:"year"`
	Make          string                    `json:"make"`
	Model         string                    `json:"model"`
	ImageURL      string                    `json:"imageURL"`
	LastOdometer  float64                   `json:"lastOdometer"`
	Reminders     []LubeLoggerReminder      `json:"reminders"`
	RecentService []LubeLoggerServiceRecord `json:"recentService"`
}

type LubeLoggerPanelData struct {
	UIURL          string              `json:"uiUrl"`
	IntegrationID  string              `json:"integrationId"`
	Vehicles       []LubeLoggerVehicle `json:"vehicles"`
	OverdueCount   int                 `json:"overdueCount"`
	UrgentCount    int                 `json:"urgentCount"`
	TotalReminders int                 `json:"totalReminders"`
}

// urgencyRank maps urgency to sort order (lowest = most urgent).
var urgencyRank = map[string]int{"past due": 0, "very urgent": 1, "urgent": 2, "not urgent": 3}

func lubeUrgencyRank(u string) int {
	if r, ok := urgencyRank[strings.ToLower(u)]; ok {
		return r
	}
	return 99
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func lubeGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	if idx := strings.Index(apiKey, ":"); idx >= 0 {
		req.SetBasicAuth(apiKey[:idx], apiKey[idx+1:])
	} else if apiKey != "" {
		req.Header.Set("x-api-key", apiKey)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

func fetchLubeLoggerPanelData(db *sql.DB, config map[string]interface{}) (*LubeLoggerPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("integrationId required in panel config")
	}
	baseURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}

	vBody, err := lubeGet(baseURL, apiKey, "/api/vehicles", skipTLS)
	if err != nil {
		return nil, fmt.Errorf("vehicles: %w", err)
	}
	var rawVehicles []struct {
		ID       int             `json:"id"`
		Year     json.RawMessage `json:"year"` // int or string depending on version
		Make     string          `json:"make"`
		Model    string          `json:"model"`
		ImageURL string          `json:"imageURL"`
	}
	if err := json.Unmarshal(vBody, &rawVehicles); err != nil {
		return nil, fmt.Errorf("vehicles parse: %w", err)
	}

	vehicles := make([]LubeLoggerVehicle, 0, len(rawVehicles))
	overdueCount, urgentCount, totalReminders := 0, 0, 0

	for _, rv := range rawVehicles {
		year := strings.Trim(string(rv.Year), `"`)
		imageURL := rv.ImageURL
		if strings.Contains(imageURL, "noimage") {
			imageURL = ""
		} else if imageURL != "" && !strings.HasPrefix(imageURL, "http") {
			imageURL = strings.TrimRight(baseURL, "/") + imageURL
		}
		v := LubeLoggerVehicle{
			ID:       rv.ID,
			Year:     year,
			Make:     rv.Make,
			Model:    rv.Model,
			ImageURL: imageURL,
		}

		// Reminders
		rBody, _ := lubeGet(baseURL, apiKey, fmt.Sprintf("/api/vehicle/reminders?vehicleId=%d", rv.ID), skipTLS)
		if rBody != nil {
			var raw []struct {
				Description string          `json:"description"`
				Urgency     string          `json:"urgency"`
				DueDate     string          `json:"dueDate"`
				DueOdometer json.RawMessage `json:"dueOdometer"`
				Metric      string          `json:"metric"`
			}
			if json.Unmarshal(rBody, &raw) == nil {
				for _, r := range raw {
					var odo float64
					json.Unmarshal(r.DueOdometer, &odo)
					rem := LubeLoggerReminder{
						Description: r.Description,
						Urgency:     r.Urgency,
						DueDate:     r.DueDate,
						DueOdometer: odo,
						Metric:      r.Metric,
					}
					v.Reminders = append(v.Reminders, rem)
					totalReminders++
					u := strings.ToLower(r.Urgency)
					switch u {
					case "past due":
						overdueCount++
					case "very urgent", "urgent":
						urgentCount++
					}
				}
				sort.Slice(v.Reminders, func(i, j int) bool {
					return lubeUrgencyRank(v.Reminders[i].Urgency) < lubeUrgencyRank(v.Reminders[j].Urgency)
				})
			}
		}

		// Recent service records
		sBody, _ := lubeGet(baseURL, apiKey, fmt.Sprintf("/api/vehicle/servicerecords?vehicleId=%d", rv.ID), skipTLS)
		if sBody != nil {
			var raw []struct {
				Date        string          `json:"date"`
				Description string          `json:"description"`
				Odometer    json.RawMessage `json:"odometer"`
				Cost        json.RawMessage `json:"cost"`
			}
			if json.Unmarshal(sBody, &raw) == nil {
				sort.Slice(raw, func(i, j int) bool { return raw[i].Date > raw[j].Date })
				for i, s := range raw {
					if i >= 5 {
						break
					}
					var odo, cost float64
					json.Unmarshal(s.Odometer, &odo)
					json.Unmarshal(s.Cost, &cost)
					v.RecentService = append(v.RecentService, LubeLoggerServiceRecord{
						Date:        s.Date,
						Description: s.Description,
						Odometer:    odo,
						Cost:        cost,
					})
					if i == 0 {
						v.LastOdometer = odo
					}
				}
			}
		}

		vehicles = append(vehicles, v)
	}

	return &LubeLoggerPanelData{
		UIURL:          uiURL,
		IntegrationID:  integrationID,
		Vehicles:       vehicles,
		OverdueCount:   overdueCount,
		UrgentCount:    urgentCount,
		TotalReminders: totalReminders,
	}, nil
}

// ── Test ──────────────────────────────────────────────────────────────────────

func testLubeLoggerConnection(baseURL, apiKey string, skipTLS bool) error {
	body, err := lubeGet(baseURL, apiKey, "/api/vehicles", skipTLS)
	if err != nil {
		return err
	}
	var v []interface{}
	if err := json.Unmarshal(body, &v); err != nil {
		return fmt.Errorf("unexpected response from LubeLogger")
	}
	return nil
}
