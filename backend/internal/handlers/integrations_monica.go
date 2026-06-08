package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type MonicaReminder struct {
	ID               int    `json:"id"`
	Title            string `json:"title"`
	NextExpectedDate string `json:"nextExpectedDate"`
	ContactName      string `json:"contactName"`
	DaysUntil        int    `json:"daysUntil"`
}

type MonicaPanelData struct {
	TotalContacts int              `json:"totalContacts"`
	Reminders     []MonicaReminder `json:"reminders"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func monicaGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("monica: HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Connection test ───────────────────────────────────────────────────────────

func testMonicaConnection(baseURL, apiKey string, skipTLS bool) error {
	b, err := monicaGet(baseURL, apiKey, "/api/contacts?limit=1", skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		Meta struct {
			Total int `json:"total"`
		} `json:"meta"`
	}
	if json.Unmarshal(b, &r) != nil {
		return fmt.Errorf("monica: unexpected response")
	}
	return nil
}

// ── Panel data ────────────────────────────────────────────────────────────────

func fetchMonicaPanelData(_ *sql.DB, config map[string]interface{}) (*MonicaPanelData, error) {
	baseURL, _ := config["baseURL"].(string)
	apiKey, _ := config["apiKey"].(string)
	skipTLS, _ := config["skipTLSVerify"].(bool)
	if baseURL == "" {
		return nil, fmt.Errorf("monica: baseURL not configured")
	}

	out := &MonicaPanelData{Reminders: []MonicaReminder{}}

	// Total contacts — just need the meta.total
	if b, err := monicaGet(baseURL, apiKey, "/api/contacts?limit=1", skipTLS); err == nil {
		var r struct {
			Meta struct {
				Total int `json:"total"`
			} `json:"meta"`
		}
		if json.Unmarshal(b, &r) == nil {
			out.TotalContacts = r.Meta.Total
		}
	}

	// Upcoming reminders — fetch current month (0) and next month (1)
	today := time.Now().Truncate(24 * time.Hour)
	seen := map[int]bool{}
	for _, month := range []int{0, 1} {
		b, err := monicaGet(baseURL, apiKey, fmt.Sprintf("/api/reminders/upcoming/%d", month), skipTLS)
		if err != nil {
			continue
		}
		var r struct {
			Data []struct {
				ID               int    `json:"id"`
				Title            string `json:"title"`
				NextExpectedDate string `json:"next_expected_date"`
				Contact          struct {
					CompleteName string `json:"complete_name"`
				} `json:"contact"`
			} `json:"data"`
		}
		if json.Unmarshal(b, &r) != nil {
			continue
		}
		for _, item := range r.Data {
			if seen[item.ID] {
				continue
			}
			t, err := time.Parse("2006-01-02", item.NextExpectedDate)
			if err != nil || t.Before(today) {
				continue
			}
			seen[item.ID] = true
			days := int(t.Sub(today).Hours() / 24)
			out.Reminders = append(out.Reminders, MonicaReminder{
				ID:               item.ID,
				Title:            item.Title,
				NextExpectedDate: item.NextExpectedDate,
				ContactName:      item.Contact.CompleteName,
				DaysUntil:        days,
			})
		}
	}

	sort.Slice(out.Reminders, func(i, j int) bool {
		return out.Reminders[i].DaysUntil < out.Reminders[j].DaysUntil
	})

	return out, nil
}
