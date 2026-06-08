package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"
)

// localDate extracts the YYYY-MM-DD date in local server time from a UTC timestamp.
// Radarr/Lidarr return UTC midnight — without this, users west of UTC see dates
// shifted one day earlier than the arr app shows.
func localDate(raw string) string {
	if raw == "" {
		return ""
	}
	if len(raw) <= 10 {
		return raw // already a plain date
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return raw[:10] // fallback: just trim
	}
	return t.Local().Format("2006-01-02")
}

func fetchCalendarData(db *sql.DB, config map[string]interface{}) (map[string]interface{}, error) {
	sources, _ := config["sources"].([]interface{})
	log.Printf("[CAL] fetchCalendarData: %d sources", len(sources))

	events := []map[string]interface{}{}

	for _, src := range sources {
		source, _ := src.(map[string]interface{})
		if source == nil { continue }
		srcType := stringVal(source, "type")
		integrationID := stringVal(source, "integrationId")

		log.Printf("[CAL] source: type=%q integrationId=%q", srcType, integrationID)
		if integrationID == "" { continue }

		daysAhead := 30
		if v, ok := source["daysAhead"].(float64); ok {
			daysAhead = int(v)
		}

		calStart := timeNow().Format("2006-01-02")
		calEnd := timeNow().AddDate(0, 0, daysAhead).Format("2006-01-02")

		switch srcType {
		case "sonarr":
			apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
			if err != nil {
				log.Printf("[CAL] sonarr resolveIntegration error: %v", err)
				continue
			}
			upcoming, err := arrGet(apiURL, apiKey,
				fmt.Sprintf("/api/v3/calendar?includeSeries=true&unmonitored=true&start=%s&end=%s", calStart, calEnd), skipTLS)
			if err != nil {
				log.Printf("[CAL] sonarr fetch error: %v", err)
				continue
			}
			var episodes []map[string]interface{}
			json.Unmarshal(upcoming, &episodes)
			for _, ep := range episodes {
				series, _ := ep["series"].(map[string]interface{})
				seriesTitle, titleSlug := "", ""
				if series != nil {
					seriesTitle, _ = series["title"].(string)
					titleSlug, _ = series["titleSlug"].(string)
				}
				epTitle, _ := ep["title"].(string)
				airDateRaw, _ := ep["airDate"].(string)
				airDate := localDate(airDateRaw)
				events = append(events, map[string]interface{}{
					"source": "sonarr", "date": airDate,
					"title":       fmt.Sprintf("%s — %s", seriesTitle, epTitle),
					"seriesTitle": seriesTitle, "epTitle": epTitle,
					"titleSlug": titleSlug, "uiUrl": uiURL,
					"color": "#60a5fa", "hasFile": ep["hasFile"] == true,
				})
			}

		case "radarr":
			apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
			if err != nil {
				log.Printf("[CAL] radarr resolveIntegration error: %v", err)
				continue
			}
			// unmonitored=true returns all movies regardless of monitored status
			upcoming, err := arrGet(apiURL, apiKey,
				fmt.Sprintf("/api/v3/calendar?unmonitored=true&start=%s&end=%s", calStart, calEnd), skipTLS)
			if err != nil {
				log.Printf("[CAL] radarr fetch error: %v", err)
				continue
			}
			var movies []map[string]interface{}
			json.Unmarshal(upcoming, &movies)
			today := timeNow().Format("2006-01-02")
			for _, m := range movies {
				title, _ := m["title"].(string)
				titleSlug, _ := m["titleSlug"].(string)
				// Emit a separate event for each future release date
				type releaseInfo struct{ date, label string }
				var releases []releaseInfo
				for _, pair := range []struct{ key, label string }{
					{"inCinemas", "In Cinemas"},
					{"digitalRelease", "Digital"},
					{"physicalRelease", "Physical"},
				} {
					if raw, _ := m[pair.key].(string); raw != "" {
						d := localDate(raw)
						if d >= today {
							releases = append(releases, releaseInfo{d, pair.label})
						}
					}
				}
				log.Printf("[CAL] radarr %q: %d future releases", title, len(releases))
				for _, rel := range releases {
					events = append(events, map[string]interface{}{
						"source":    "radarr",
						"date":      rel.date,
						"title":     fmt.Sprintf("%s (%s)", title, rel.label),
						"titleSlug": titleSlug,
						"uiUrl":     uiURL,
						"color":     "#f59e0b",
						"hasFile":   m["hasFile"] == true,
					})
				}
			}

		case "readarr":
			apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
			if err != nil {
				log.Printf("[CAL] readarr resolveIntegration error: %v", err)
				continue
			}
			upcoming, err := arrGet(apiURL, apiKey,
				fmt.Sprintf("/api/v1/calendar?unmonitored=true&start=%s&end=%s", calStart, calEnd), skipTLS)
			if err != nil {
				log.Printf("[CAL] readarr fetch error: %v", err)
				continue
			}
			var books []map[string]interface{}
			json.Unmarshal(upcoming, &books)
			for _, bk := range books {
				title, _ := bk["title"].(string)
				rawDate, _ := bk["releaseDate"].(string)
				date := localDate(rawDate)
				if date == "" {
					continue
				}
				titleSlug, _ := bk["titleSlug"].(string)
				author := ""
				if a, ok := bk["author"].(map[string]interface{}); ok {
					author, _ = a["authorName"].(string)
				}
				displayTitle := title
				if author != "" {
					displayTitle = fmt.Sprintf("%s — %s", author, title)
				}
				events = append(events, map[string]interface{}{
					"source":    "readarr",
					"date":      date,
					"title":     displayTitle,
					"titleSlug": titleSlug,
					"uiUrl":     uiURL,
					"color":     "#6ee7b7",
					"hasFile":   bk["hasFile"] == true,
				})
			}

		case "lidarr":
			apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
			if err != nil {
				log.Printf("[CAL] lidarr resolveIntegration error: %v", err)
				continue
			}
			// unmonitored=true returns all albums regardless of monitored status
			upcoming, err := arrGet(apiURL, apiKey,
				fmt.Sprintf("/api/v1/calendar?unmonitored=true&start=%s&end=%s", calStart, calEnd), skipTLS)
			if err != nil {
				log.Printf("[CAL] lidarr fetch error: %v", err)
				continue
			}
			var albums []map[string]interface{}
			json.Unmarshal(upcoming, &albums)
			for _, al := range albums {
				title, _ := al["title"].(string)
				rawDate, _ := al["releaseDate"].(string)
				date := localDate(rawDate)
				artist := ""
				foreign := ""
				if a, ok := al["artist"].(map[string]interface{}); ok {
					artist, _ = a["artistName"].(string)
					foreign, _ = a["foreignArtistId"].(string)
				}
				events = append(events, map[string]interface{}{
					"source":          "lidarr",
					"date":            date,
					"title":           fmt.Sprintf("%s — %s", artist, title),
					"uiUrl":           uiURL,
					"color":           "#a78bfa",
					"foreignArtistId": foreign,
				})
			}

		case "weather":
			// Read from integration cache — same data as weather panel
			log.Printf("[CAL] fetching weather for integration %s", integrationID)
			wd, werr := getWeatherData(db, integrationID, map[string]interface{}{"integrationId": integrationID})
			if werr != nil {
				log.Printf("[CAL] weather error for %s: %v", integrationID, werr)
				continue
			}
			log.Printf("[CAL] weather ok for %s, city=%s, days=%d", integrationID, wd.City, len(wd.Daily))
			// Build one event per day from the 7-day forecast
			for _, day := range wd.Daily {
				if day.Date == "" { continue }
				tmp := day.MaxF
				tmpMin := day.MinF
				if wd.Unit == "c" { tmp = day.MaxC; tmpMin = day.MinC }
				city := wd.City
				title := fmt.Sprintf("%s %s %.0f°/%.0f°", city, day.Icon, tmp, tmpMin)
				events = append(events, map[string]interface{}{
					"source":  "weather",
					"date":    day.Date,
					"title":   title,
					"icon":    day.Icon,
					"color":   "#60a5fa",
					"tagId":   integrationID,
				})
			}

		case "google":
			calendarID := stringVal(source, "calendarId")
			if calendarID == "" {
				calendarID = "primary"
			}

			accessToken, aerr := GetValidAccessToken(db, integrationID)
			if aerr != nil {
				log.Printf("[CAL] google: GetValidAccessToken error: %v", aerr)
				continue
			}

			timeMin := timeNow()
			timeMax := timeNow().AddDate(0, 0, daysAhead)

			items, gerr := FetchGoogleCalendarEvents(accessToken, calendarID, timeMin, timeMax)
			if gerr != nil {
				log.Printf("[CAL] google: FetchGoogleCalendarEvents error: %v", gerr)
				continue
			}

			for _, item := range items {
				start, _ := item["start"].(map[string]interface{})
				end, _ := item["end"].(map[string]interface{})
				if start == nil {
					continue
				}
				date, startDT, endDT := "", "", ""
				if d, ok := start["date"].(string); ok {
					date = d // all-day event
				} else if dt, ok := start["dateTime"].(string); ok && len(dt) >= 10 {
					date = dt[:10]
					startDT = dt // pass raw RFC3339 to frontend for local tz formatting
					if end != nil {
						if et, ok2 := end["dateTime"].(string); ok2 {
							endDT = et
						}
					}
				}
				if date == "" {
					continue
				}
				if eventDate, err := time.Parse("2006-01-02", date); err == nil {
					if eventDate.Before(timeNow().Truncate(24 * time.Hour)) {
						continue
					}
				}
				summary, _ := item["summary"].(string)
				if summary == "" {
					summary = "(no title)"
				}
				events = append(events, map[string]interface{}{
					"source":  "google",
					"date":    date,
					"title":   summary,
					"startDT": startDT,
					"endDT":   endDT,
					"color":   "#34d399",
				})
			}

		case "sports":
			// Read from sports integration cache — convert schedule to calendar events
			// Look up integration name for use as pill label
			var intName string
			db.QueryRow(`SELECT COALESCE(name,'Sports') FROM integrations WHERE id=?`, integrationID).Scan(&intName)
			if intName == "" { intName = "Sports" }
			cached, ok := cacheGet(integrationID)
			if !ok {
				// Cache miss — fetch live
				sportsData, serr := FetchSportsData(db, integrationID)
				if serr != nil {
					log.Printf("[CAL] sports: fetch error: %v", serr)
					continue
				}
				cacheSet(integrationID, sportsData)
				cached = sportsData
			}
			// Type-assert to SportsPanelData
			sportsData, ok := cached.(*SportsPanelData)
			if !ok {
				// Try JSON round-trip if cached as interface{}
				if b, jerr := json.Marshal(cached); jerr == nil {
					var sd SportsPanelData
					if jerr2 := json.Unmarshal(b, &sd); jerr2 == nil {
						sportsData = &sd
						ok = true
					}
				}
			}
			if !ok || sportsData == nil {
				log.Printf("[CAL] sports: could not read cached data for %s", integrationID)
				continue
			}
			// Convert upcoming schedule games to calendar events
			log.Printf("[CAL] sports: %d schedule items, %d games", len(sportsData.Schedule), len(sportsData.Games))
			todayDate := timeNow().Local().Format("2006-01-02")
			for _, g := range sportsData.Schedule {
				if g.StartTime == "" { continue }
				var t time.Time
				var terr error
				for _, fmt2 := range []string{time.RFC3339, "2006-01-02T15:04Z", "2006-01-02T15:04:05Z"} {
					t, terr = time.Parse(fmt2, g.StartTime)
					if terr == nil { break }
				}
				if terr != nil {
					log.Printf("[CAL] sports: bad startTime %q: %v", g.StartTime, terr)
					continue
				}
				// Skip TBD/if-necessary games -- no confirmed time yet
				if g.IsTBD {
					continue
				}
				// Use local time for date so games tonight don't appear as tomorrow
				date := t.Local().Format("2006-01-02")
				// Include today and future games
				if date < todayDate { continue }
				title := fmt.Sprintf("%s %s @ %s", g.League, g.AwayAbbr, g.HomeAbbr)
				if g.IsFavorite {
					title = "⭐ " + title
				}
				events = append(events, map[string]interface{}{
					"source":  intName,
					"date":    date,
					"startDT": g.StartTime,
					"title":   title,
					"color":   "#f97316",
					"league":  g.League,
				})
			}

		case "lubelogger":
			apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
			_ = uiURL
			if err != nil {
				log.Printf("[CAL] lubelogger resolveIntegration error: %v", err)
				continue
			}
			vBody, err := lubeGet(apiURL, apiKey, "/api/vehicles", skipTLS)
			if err != nil {
				log.Printf("[CAL] lubelogger vehicles error: %v", err)
				continue
			}
			var vehicles []struct {
				ID    int             `json:"id"`
				Year  json.RawMessage `json:"year"`
				Make  string          `json:"make"`
				Model string          `json:"model"`
			}
			if err := json.Unmarshal(vBody, &vehicles); err != nil {
				log.Printf("[CAL] lubelogger vehicles parse error: %v", err)
				continue
			}
			urgencyColor := map[string]string{
				"past due":    "#ef4444",
				"very urgent": "#f97316",
				"urgent":      "#f59e0b",
				"not urgent":  "#6366f1",
			}
			for _, vehicle := range vehicles {
				year := strings.Trim(string(vehicle.Year), `"`)
				vehicleName := strings.TrimSpace(year + " " + vehicle.Make + " " + vehicle.Model)
				rBody, _ := lubeGet(apiURL, apiKey, fmt.Sprintf("/api/vehicle/reminders?vehicleId=%d", vehicle.ID), skipTLS)
				if rBody == nil {
					continue
				}
				var reminders []struct {
					Description string `json:"description"`
					Urgency     string `json:"urgency"`
					DueDate     string `json:"dueDate"`
				}
				if json.Unmarshal(rBody, &reminders) != nil {
					continue
				}
				for _, r := range reminders {
					if r.DueDate == "" {
						continue // mileage-only reminders have no calendar date
					}
					u := strings.ToLower(r.Urgency)
					color := urgencyColor[u]
					if color == "" {
						color = "#6366f1"
					}
					events = append(events, map[string]interface{}{
						"source": "lubelogger",
						"date":   r.DueDate,
						"title":  fmt.Sprintf("%s — %s", vehicleName, r.Description),
						"color":  color,
						"uiUrl":  uiURL,
					})
				}
			}

		}
	}

	// ── Kanban due dates ───────────────────────────────────────────────────
	for _, src := range sources {
		source, _ := src.(map[string]interface{})
		if source == nil || stringVal(source, "type") != "kanban" {
			continue
		}
		panelID := stringVal(source, "panelId")
		if panelID == "" {
			continue
		}
		var panelTitle string
		db.QueryRow("SELECT COALESCE(title,'') FROM panels WHERE id=?", panelID).Scan(&panelTitle)
		rows, err := db.Query(`
			SELECT kc.title, kc.due_date, kb.id, kb.name
			FROM kanban_cards kc
			JOIN kanban_boards kb ON kc.board_id=kb.id
			WHERE kb.panel_id=?
			  AND kc.due_date IS NOT NULL AND kc.due_date != ''
			  AND kc.status NOT IN ('completed','cancelled')
			ORDER BY kc.due_date ASC
		`, panelID)
		if err != nil {
			continue
		}
		for rows.Next() {
			var title, dueDate, boardID, boardName string
			rows.Scan(&title, &dueDate, &boardID, &boardName)
			source := boardName
			if panelTitle != "" {
				source = panelTitle + " › " + boardName
			}
			events = append(events, map[string]interface{}{
				"source":  source,
				"date":    dueDate,
				"title":   title,
				"color":   "#8b5cf6",
				"boardId": boardID,
			})
		}
		rows.Close()
	}

	// ── Checklist due dates ─────────────────────────────────────────────────
	// Any checklist source type pulls due-date items from checklist panels
	for _, src := range sources {
		source, _ := src.(map[string]interface{})
		if source == nil || stringVal(source, "type") != "checklist" { continue }
		panelID := stringVal(source, "panelId")
		if panelID == "" { continue }
		rows, err := db.Query(`
			SELECT text, due_date FROM checklist_items
			WHERE panel_id = ? AND due_date IS NOT NULL AND completed = 0
		`, panelID)
		if err != nil { continue }
		for rows.Next() {
			var text, dueDate string
			rows.Scan(&text, &dueDate)
			// Show as event on the day BEFORE the due date ("due tomorrow")
			due, err := time.Parse("2006-01-02", dueDate)
			if err != nil { continue }
			eventDate := due.AddDate(0, 0, -1).Format("2006-01-02")
			events = append(events, map[string]interface{}{
				"date":   eventDate,
				"title":  "Due tomorrow: " + text,
				"color":  "#f59e0b",
				"source": "checklist",
			})
		}
		rows.Close()
	}

	log.Printf("[CAL] fetchCalendarData: returning %d total events", len(events))
	return map[string]interface{}{"events": events}, nil
}
