package handlers

// Background refresh for connected Google Calendar accounts. Unlike normal
// integrations, Google accounts aren't rows in the `integrations` table (they're
// OAuth grants in google_oauth_tokens) and aren't gated behind the SSE-client
// worker lifecycle — connecting one or a few Google accounts is cheap enough
// to just run unconditionally from boot. GetValidAccessToken already handles
// refresh-on-demand transparently, so this loop never needs its own token
// refresh logic — it just has to call it on schedule.
//
// One (tokenId, calendarId) pair can be shared by multiple calendar panels;
// which calendars are actually in use is discovered by scanning calendar
// panel configs each tick rather than tracked separately, so a newly added
// source starts getting refreshed on the very next tick with no extra wiring.

import (
	"database/sql"
	"encoding/json"
	"time"
)

const googleWorkerTick = 60 * time.Second

// googleCalKey is the calEventsCache key for one account+calendar pair.
func googleCalKey(tokenID, calendarID string) string {
	return tokenID + "|" + calendarID
}

// StartGoogleCalendarWorker runs the Google Calendar background refresh loop
// for the lifetime of the process. Call once at boot.
func StartGoogleCalendarWorker(db *sql.DB) {
	go func() {
		lastRefreshed := map[string]time.Time{} // googleCalKey → last refresh time
		logDebugf("GCAL", "worker started")
		for {
			googleWorkerTickOnce(db, lastRefreshed)
			time.Sleep(googleWorkerTick)
		}
	}()
}

func googleWorkerTickOnce(db *sql.DB, lastRefreshed map[string]time.Time) {
	type tokenRow struct {
		ID          string
		RefreshSecs int
	}
	rows, err := db.Query("SELECT id, refresh_secs FROM google_oauth_tokens")
	if err != nil {
		logErrorf("GCAL", "listing tokens: %v", err)
		return
	}
	var tokens []tokenRow
	for rows.Next() {
		var t tokenRow
		if rows.Scan(&t.ID, &t.RefreshSecs) == nil {
			tokens = append(tokens, t)
		}
	}
	rows.Close()
	if len(tokens) == 0 {
		return
	}

	// Discover which calendars are actually in use per token from calendar
	// panel configs; tokens with no configured source still get "primary"
	// so a freshly connected account has data ready immediately.
	calendarsByToken := discoverGoogleCalendarSources(db)

	now := time.Now()
	for _, t := range tokens {
		calIDs := calendarsByToken[t.ID]
		if len(calIDs) == 0 {
			calIDs = []string{"primary"}
		}
		refreshSecs := t.RefreshSecs
		if refreshSecs < 900 {
			refreshSecs = 900
		}
		for _, calID := range calIDs {
			key := googleCalKey(t.ID, calID)
			if last, ok := lastRefreshed[key]; ok && now.Sub(last) < time.Duration(refreshSecs)*time.Second {
				continue
			}
			lastRefreshed[key] = now
			if err := refreshGoogleCalendar(db, t.ID, calID); err != nil {
				logErrorf("GCAL", "refresh %s (calendar=%s): %v", t.ID, calID, err)
			} else {
				logDebugf("GCAL", "refreshed %s (calendar=%s)", t.ID, calID)
			}
		}
	}
}

// discoverGoogleCalendarSources scans every calendar panel's config for
// "google" sources and returns the distinct calendarIds requested per token.
func discoverGoogleCalendarSources(db *sql.DB) map[string][]string {
	result := map[string]map[string]bool{}
	rows, err := db.Query("SELECT config FROM panels WHERE type='calendar'")
	if err != nil {
		return nil
	}
	defer rows.Close()
	for rows.Next() {
		var cfgStr string
		if rows.Scan(&cfgStr) != nil {
			continue
		}
		var cfg struct {
			Sources []struct {
				Type          string `json:"type"`
				IntegrationID string `json:"integrationId"`
				CalendarID    string `json:"calendarId"`
			} `json:"sources"`
		}
		if json.Unmarshal([]byte(cfgStr), &cfg) != nil {
			continue
		}
		for _, s := range cfg.Sources {
			if s.Type != "google" || s.IntegrationID == "" {
				continue
			}
			calID := s.CalendarID
			if calID == "" {
				calID = "primary"
			}
			if result[s.IntegrationID] == nil {
				result[s.IntegrationID] = map[string]bool{}
			}
			result[s.IntegrationID][calID] = true
		}
	}
	out := map[string][]string{}
	for tokenID, set := range result {
		for calID := range set {
			out[tokenID] = append(out[tokenID], calID)
		}
	}
	return out
}

// refreshGoogleCalendar fetches and computes events for one account+calendar
// pair and stores them in the shared calendar-events cache.
func refreshGoogleCalendar(db *sql.DB, tokenID, calendarID string) error {
	accessToken, err := GetValidAccessToken(db, tokenID)
	if err != nil {
		return err
	}
	events, err := computeGoogleCalEvents(accessToken, calendarID)
	if err != nil {
		return err
	}
	calEventsSet(googleCalKey(tokenID, calendarID), events)
	return nil
}

func computeGoogleCalEvents(accessToken, calendarID string) ([]map[string]interface{}, error) {
	calStart, calEnd := calWindow()
	items, err := FetchGoogleCalendarEvents(accessToken, calendarID, calStart, calEnd)
	if err != nil {
		return nil, err
	}
	events := []map[string]interface{}{}
	for _, item := range items {
		start, _ := item["start"].(map[string]interface{})
		end, _ := item["end"].(map[string]interface{})
		if start == nil {
			continue
		}
		date, startDT, endDT := "", "", ""
		if d, ok := start["date"].(string); ok {
			date = d
		} else if dt, ok := start["dateTime"].(string); ok && len(dt) >= 10 {
			date = dt[:10]
			startDT = dt
			if end != nil {
				if et, ok2 := end["dateTime"].(string); ok2 {
					endDT = et
				}
			}
		}
		if date == "" {
			continue
		}
		if eventDate, perr := time.Parse("2006-01-02", date); perr == nil {
			if eventDate.Before(timeNow().Truncate(24 * time.Hour)) {
				continue
			}
		}
		summary, _ := item["summary"].(string)
		if summary == "" {
			summary = "(no title)"
		}
		events = append(events, map[string]interface{}{
			"source": "google", "date": date, "title": summary,
			"startDT": startDT, "endDT": endDT, "color": "#34d399",
		})
	}
	return events, nil
}
