package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type FittrackeeWorkout struct {
	ID          string  `json:"id"`
	SportID     int     `json:"sportId"`
	SportLabel  string  `json:"sportLabel"`
	Title       string  `json:"title"`
	WorkoutDate string  `json:"workoutDate"`
	Distance    float64 `json:"distance"`
	Duration    string  `json:"duration"`
	AveSpeed    float64 `json:"aveSpeed"`
	Ascent      float64 `json:"ascent"`
}

type FittrackeePanelData struct {
	UIURL         string              `json:"uiUrl"`
	NbWorkouts    int                 `json:"nbWorkouts"`
	NbSports      int                 `json:"nbSports"`
	TotalDistance float64             `json:"totalDistance"`
	TotalDuration string              `json:"totalDuration"`
	TotalAscent   float64             `json:"totalAscent"`
	Workouts      []FittrackeeWorkout `json:"workouts"`
}

// ── Auth ──────────────────────────────────────────────────────────────────────

func fittrackeeLogin(baseURL, apiKey string, skipTLS bool) (string, error) {
	idx := strings.Index(apiKey, ":")
	if idx < 0 {
		return "", fmt.Errorf("fittrackee: credentials must be email:password")
	}
	email := apiKey[:idx]
	password := apiKey[idx+1:]

	body, _ := json.Marshal(map[string]string{"email": email, "password": password})
	req, err := http.NewRequest("POST", strings.TrimRight(baseURL, "/")+"/api/auth/login", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("fittrackee: login failed (HTTP %d) — check email and password", resp.StatusCode)
	}
	b, _ := io.ReadAll(resp.Body)
	var r struct {
		AuthToken string `json:"auth_token"`
	}
	if json.Unmarshal(b, &r) != nil || r.AuthToken == "" {
		return "", fmt.Errorf("fittrackee: no auth_token in login response")
	}
	return r.AuthToken, nil
}

func fittrackeeGet(baseURL, token, path string, skipTLS bool) ([]byte, error) {
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("fittrackee: HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Test ──────────────────────────────────────────────────────────────────────

func testFittrackeeConnection(apiURL, apiKey string, skipTLS bool) error {
	_, err := fittrackeeLogin(apiURL, apiKey, skipTLS)
	return err
}

// fittrackeeRawWorkout is the shared workout shape returned by both
// /api/workouts?per_page=10 (all-time view) and the with_statistics=true
// period-filtered call — same JSON fields either way.
type fittrackeeRawWorkout struct {
	ID          string  `json:"id"`
	SportID     int     `json:"sport_id"`
	Title       string  `json:"title"`
	WorkoutDate string  `json:"workout_date"`
	Distance    float64 `json:"distance"`
	Duration    string  `json:"duration"`
	AveSpeed    float64 `json:"ave_speed"`
	Ascent      float64 `json:"ascent"`
}

func mapFittrackeeWorkout(w fittrackeeRawWorkout, sportLabels map[int]string) FittrackeeWorkout {
	label := sportLabels[w.SportID]
	if label == "" {
		label = fmt.Sprintf("Sport %d", w.SportID)
	}
	return FittrackeeWorkout{
		ID:          w.ID,
		SportID:     w.SportID,
		SportLabel:  label,
		Title:       w.Title,
		WorkoutDate: w.WorkoutDate,
		Distance:    w.Distance,
		Duration:    w.Duration,
		AveSpeed:    w.AveSpeed,
		Ascent:      w.Ascent,
	}
}

// ── Main fetch ────────────────────────────────────────────────────────────────

func fetchFittrackeePanelData(db *sql.DB, config map[string]interface{}) (*FittrackeePanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("fittrackee: no integration configured")
	}
	baseURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if baseURL == "" {
		return nil, fmt.Errorf("fittrackee: baseURL not configured")
	}

	token, err := fittrackeeLogin(baseURL, apiKey, skipTLS)
	if err != nil {
		return nil, err
	}

	out := &FittrackeePanelData{
		UIURL:    uiURL,
		Workouts: []FittrackeeWorkout{},
	}

	get := func(path string) ([]byte, error) {
		return fittrackeeGet(baseURL, token, path, skipTLS)
	}
	anyOK := false

	// Build sport id→label map
	sportLabels := map[int]string{}
	if b, err := get("/api/sports"); err == nil {
		anyOK = true
		var resp struct {
			Data struct {
				Sports []struct {
					ID    int    `json:"id"`
					Label string `json:"label"`
				} `json:"sports"`
			} `json:"data"`
		}
		if json.Unmarshal(b, &resp) == nil {
			for _, s := range resp.Data.Sports {
				sportLabels[s.ID] = s.Label
			}
		}
	} else {
		logErrorf("Fittrackee", "sports error: %v", err)
	}

	// days is the panel-selected time range (7/30/90 via the UI pill
	// selector, passed as a live ?days= override — see GetPanelData). 0 or
	// absent means "all time", the original/default behavior.
	days, _ := config["days"].(float64)

	if days > 0 {
		// Period view: FitTrackee's with_statistics=true computes the
		// period's totals server-side (count/distance/duration/ascent/sport
		// count) scoped to [today-days, today] — no need to touch the
		// lifetime /api/auth/profile or sum anything client-side.
		from := timeNow().AddDate(0, 0, -int(days)).Format("2006-01-02")
		to := timeNow().Format("2006-01-02")
		path := fmt.Sprintf("/api/workouts?from=%s&to=%s&per_page=20&order=desc&order_by=workout_date&with_statistics=true", from, to)
		if b, err := get(path); err == nil {
			anyOK = true
			var resp struct {
				Data struct {
					Workouts   []fittrackeeRawWorkout `json:"workouts"`
					Statistics struct {
						All struct {
							Count         int      `json:"count"`
							TotalDistance *float64 `json:"total_distance"`
							TotalDuration *string  `json:"total_duration"`
							TotalAscent   *float64 `json:"total_ascent"`
							TotalSports   int      `json:"total_sports"`
						} `json:"all"`
					} `json:"statistics"`
				} `json:"data"`
			}
			if json.Unmarshal(b, &resp) == nil {
				all := resp.Data.Statistics.All
				out.NbWorkouts = all.Count
				out.NbSports = all.TotalSports
				if all.TotalDistance != nil {
					out.TotalDistance = *all.TotalDistance
				}
				if all.TotalDuration != nil {
					out.TotalDuration = *all.TotalDuration
				}
				if all.TotalAscent != nil {
					out.TotalAscent = *all.TotalAscent
				}
				for _, w := range resp.Data.Workouts {
					out.Workouts = append(out.Workouts, mapFittrackeeWorkout(w, sportLabels))
				}
			} else {
				logErrorf("Fittrackee", "workouts (period=%.0fd): unexpected response: %s", days, strings.TrimSpace(string(b)))
			}
		} else {
			logErrorf("Fittrackee", "workouts (period=%.0fd) error: %v", days, err)
		}
	} else {
		// All-time view (default/unchanged): lifetime totals from the
		// profile, plus the 10 most recent workouts regardless of date.
		if b, err := get("/api/auth/profile"); err == nil {
			anyOK = true
			var resp struct {
				Data struct {
					NbWorkouts    int     `json:"nb_workouts"`
					NbSports      int     `json:"nb_sports"`
					TotalDistance float64 `json:"total_distance"`
					TotalDuration string  `json:"total_duration"`
					TotalAscent   float64 `json:"total_ascent"`
				} `json:"data"`
			}
			if json.Unmarshal(b, &resp) == nil {
				out.NbWorkouts = resp.Data.NbWorkouts
				out.NbSports = resp.Data.NbSports
				out.TotalDistance = resp.Data.TotalDistance
				out.TotalDuration = resp.Data.TotalDuration
				out.TotalAscent = resp.Data.TotalAscent
			}
		} else {
			logErrorf("Fittrackee", "profile error: %v", err)
		}

		if b, err := get("/api/workouts?per_page=10&order=desc&order_by=workout_date"); err == nil {
			anyOK = true
			var resp struct {
				Data struct {
					Workouts []fittrackeeRawWorkout `json:"workouts"`
				} `json:"data"`
			}
			if json.Unmarshal(b, &resp) == nil {
				for _, w := range resp.Data.Workouts {
					out.Workouts = append(out.Workouts, mapFittrackeeWorkout(w, sportLabels))
				}
			}
		} else {
			logErrorf("Fittrackee", "workouts error: %v", err)
		}
	}

	// Every endpoint failed — surface the error instead of rendering zeros
	if !anyOK {
		return nil, fmt.Errorf("fittrackee unreachable — check URL and credentials (see server log for details)")
	}

	return out, nil
}
