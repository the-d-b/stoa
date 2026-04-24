package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
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

		}
	}

	log.Printf("[CAL] fetchCalendarData: returning %d total events", len(events))
	return map[string]interface{}{"events": events}, nil
}
