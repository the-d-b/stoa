package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type WgerWeightEntry struct {
	Date   string  `json:"date"`
	Weight float64 `json:"weight"`
}

type WgerSession struct {
	Date       string `json:"date"`
	Impression string `json:"impression"`
	Notes      string `json:"notes"`
}

type WgerPanelData struct {
	UIURL          string            `json:"uiUrl"`
	TotalWorkouts  int               `json:"totalWorkouts"`
	WeightUnit     string            `json:"weightUnit"` // "kg" or "lb", whatever the wger account is set to
	WeightEntries  []WgerWeightEntry `json:"weightEntries"`
	RecentSessions []WgerSession     `json:"recentSessions"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func wgerGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Token "+apiKey)
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("wger: HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Test ──────────────────────────────────────────────────────────────────────

func testWgerConnection(apiURL, apiKey string, skipTLS bool) error {
	_, err := wgerGet(apiURL, apiKey, "/api/v2/userprofile/?format=json", skipTLS)
	return err
}

// ── Main fetch ────────────────────────────────────────────────────────────────

func fetchWgerPanelData(db *sql.DB, config map[string]interface{}) (*WgerPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("wger: no integration configured")
	}
	baseURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if baseURL == "" {
		return nil, fmt.Errorf("wger: baseURL not configured")
	}

	out := &WgerPanelData{
		UIURL:          uiURL,
		WeightEntries:  []WgerWeightEntry{},
		RecentSessions: []WgerSession{},
	}

	get := func(path string) ([]byte, error) {
		return wgerGet(baseURL, apiKey, path, skipTLS)
	}
	anyOK := false

	// wger returns weight pre-converted to whatever the user's profile
	// weight_unit is set to ('kg' or 'lb', default 'kg' per
	// wger/core/models/profile.py) — mirror that setting rather than forcing
	// a unit of our own; no conversion needed, wger already did it.
	out.WeightUnit = "kg"
	if b, err := get("/api/v2/userprofile/?format=json"); err == nil {
		var prof struct {
			WeightUnit string `json:"weight_unit"`
		}
		if json.Unmarshal(b, &prof) == nil && prof.WeightUnit != "" {
			out.WeightUnit = prof.WeightUnit
		}
	}

	// days is the panel-selected time range (7/30/60/90 via the UI pill
	// selector, passed as a live ?days= override — see GetPanelData). 0 or
	// absent means "all time", the original/default "most recent N" behavior.
	// Confirmed live against a running wger/server:latest that the currently
	// *released* API still uses "date" (bare YYYY-MM-DD) on workoutsession —
	// wger's master branch on GitHub already has an unreleased datetime_start/
	// datetime_end migration, which is what the field-name assumption below
	// was (wrongly) based on before checking a live response.
	days, _ := config["days"].(float64)
	sessionPath := "/api/v2/workoutsession/?format=json&ordering=-date&limit=5"
	weightPath := "/api/v2/weightentry/?format=json&ordering=-date&limit=10"
	if days > 0 {
		from := timeNow().AddDate(0, 0, -int(days)).Format("2006-01-02")
		sessionPath = fmt.Sprintf("/api/v2/workoutsession/?format=json&ordering=-date&limit=100&date__gte=%s", from)
		weightPath = fmt.Sprintf("/api/v2/weightentry/?format=json&ordering=-date&limit=100&date__gte=%s", from)
	}

	// Recent workout sessions — pagination `count` gives total. Reads both
	// the current released field ("date") and the unreleased one
	// ("datetime_start", already on wger's master branch), preferring
	// whichever is actually present, so this keeps working across an
	// eventual wger upgrade without needing another live-vs-source fix.
	if b, err := get(sessionPath); err == nil {
		anyOK = true
		var resp struct {
			Count   int `json:"count"`
			Results []struct {
				Date          string `json:"date"`
				DatetimeStart string `json:"datetime_start"`
				Impression    string `json:"impression"`
				Notes         string `json:"notes"`
			} `json:"results"`
		}
		if json.Unmarshal(b, &resp) == nil {
			out.TotalWorkouts = resp.Count
			for _, s := range resp.Results {
				date := s.Date
				if date == "" {
					date = s.DatetimeStart
				}
				out.RecentSessions = append(out.RecentSessions, WgerSession{
					Date:       date,
					Impression: s.Impression,
					Notes:      s.Notes,
				})
			}
		}
	} else {
		logErrorf("wger", "workoutsession error: %v", err)
	}

	// Recent weight entries for trend (newest-first)
	if b, err := get(weightPath); err == nil {
		anyOK = true
		var resp struct {
			Results []struct {
				Date string `json:"date"`
				// DRF's DecimalField serializes as a JSON string ("94.60"),
				// not a number — a float64 target here silently fails the
				// whole Unmarshal, which is why this was never logged.
				Weight string `json:"weight"`
			} `json:"results"`
		}
		if json.Unmarshal(b, &resp) == nil {
			for _, e := range resp.Results {
				w, perr := strconv.ParseFloat(e.Weight, 64)
				if perr != nil {
					logErrorf("wger", "weightentry: could not parse weight %q for entry dated %s", e.Weight, e.Date)
					continue
				}
				out.WeightEntries = append(out.WeightEntries, WgerWeightEntry{
					Date:   e.Date,
					Weight: w,
				})
			}
		} else {
			logErrorf("wger", "weightentry: unexpected response: %s", strings.TrimSpace(string(b)))
		}
	} else {
		logErrorf("wger", "weightentry error: %v", err)
	}

	// Every endpoint failed — surface the error instead of rendering zeros
	if !anyOK {
		return nil, fmt.Errorf("wger unreachable — check URL and API token (see server log for details)")
	}

	return out, nil
}
