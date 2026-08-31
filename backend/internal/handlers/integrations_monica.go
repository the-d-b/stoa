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

func fetchMonicaPanelData(db *sql.DB, config map[string]interface{}) (*MonicaPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("monica: no integration configured")
	}
	baseURL, _, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if baseURL == "" {
		return nil, fmt.Errorf("monica: baseURL not configured")
	}

	out := &MonicaPanelData{Reminders: []MonicaReminder{}}
	anyOK := false

	// Total contacts — just need the meta.total
	if b, err := monicaGet(baseURL, apiKey, "/api/contacts?limit=1", skipTLS); err == nil {
		anyOK = true
		var r struct {
			Meta struct {
				Total int `json:"total"`
			} `json:"meta"`
		}
		if json.Unmarshal(b, &r) == nil {
			out.TotalContacts = r.Meta.Total
		} else {
			logErrorf("MONICA", "contacts: unexpected response: %s", strings.TrimSpace(string(b)))
		}
	} else {
		logErrorf("MONICA", "contacts error: %v", err)
	}

	// Upcoming reminders — fetch current month (0) and next month (1).
	// Confirmed live these two indices are correct (0 = this calendar month,
	// 1 = next) — that part of the original assumption was right.
	today := time.Now().UTC().Truncate(24 * time.Hour)
	seen := map[int]bool{}
	for _, month := range []int{0, 1} {
		b, err := monicaGet(baseURL, apiKey, fmt.Sprintf("/api/reminders/upcoming/%d", month), skipTLS)
		if err != nil {
			logErrorf("MONICA", "reminders (month=%d) error: %v", month, err)
			continue
		}
		anyOK = true
		var r struct {
			Data []struct {
				ID          int    `json:"id"`
				Title       string `json:"title"`
				PlannedDate string `json:"planned_date"`
				Contact     struct {
					CompleteName string `json:"complete_name"`
				} `json:"contact"`
			} `json:"data"`
		}
		if json.Unmarshal(b, &r) != nil {
			logErrorf("MONICA", "reminders (month=%d): unexpected response: %s", month, strings.TrimSpace(string(b)))
			continue
		}
		for _, item := range r.Data {
			if seen[item.ID] {
				continue
			}
			// Confirmed live: the field is "planned_date" (the previously
			// assumed "next_expected_date" doesn't exist in the response at
			// all), and it's a full timestamp with fractional seconds
			// ("2026-09-04T00:00:00.000000Z"), not a bare date. Both were
			// wrong, which silently dropped every single reminder with no
			// error — json.Unmarshal doesn't fail on an unmatched field
			// name, it just leaves the Go field at its zero value, and a
			// zero-value empty string then fails to date-parse.
			t, err := time.Parse(time.RFC3339Nano, item.PlannedDate)
			if err != nil {
				logErrorf("MONICA", "reminders (month=%d): could not parse planned_date %q for reminder id=%d", month, item.PlannedDate, item.ID)
				continue
			}
			t = t.UTC()
			if t.Before(today) {
				continue
			}
			seen[item.ID] = true
			days := int(t.Sub(today).Hours() / 24)
			out.Reminders = append(out.Reminders, MonicaReminder{
				ID:               item.ID,
				Title:            item.Title,
				NextExpectedDate: t.Format("2006-01-02"),
				ContactName:      item.Contact.CompleteName,
				DaysUntil:        days,
			})
		}
	}

	sort.Slice(out.Reminders, func(i, j int) bool {
		return out.Reminders[i].DaysUntil < out.Reminders[j].DaysUntil
	})

	// Every endpoint failed — surface the error instead of rendering zeros
	if !anyOK {
		return nil, fmt.Errorf("monica unreachable — check URL and credentials (see server log for details)")
	}

	return out, nil
}
