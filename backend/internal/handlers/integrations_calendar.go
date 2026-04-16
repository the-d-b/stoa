package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"
)

func fetchCalendarData(db *sql.DB, config map[string]interface{}) (map[string]interface{}, error) {
	sources, _ := config["sources"].([]interface{})

	events := []map[string]interface{}{}

	for _, src := range sources {
		source, _ := src.(map[string]interface{})
		if source == nil { continue }
		srcType := stringVal(source, "type")
		integrationID := stringVal(source, "integrationId")

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
				airDate, _ := ep["airDate"].(string)
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
			upcoming, err := arrGet(apiURL, apiKey,
				fmt.Sprintf("/api/v3/calendar?start=%s&end=%s", calStart, calEnd), skipTLS)
			if err != nil {
				log.Printf("[CAL] radarr fetch error: %v", err)
				continue
			}
			var movies []map[string]interface{}
			json.Unmarshal(upcoming, &movies)
			for _, m := range movies {
				title, _ := m["title"].(string)
				titleSlug, _ := m["titleSlug"].(string)
				date, _ := m["inCinemas"].(string)
				if date == "" {
					date, _ = m["digitalRelease"].(string)
				}
				if date == "" {
					date, _ = m["physicalRelease"].(string)
				}
				if len(date) > 10 {
					date = date[:10]
				}
				events = append(events, map[string]interface{}{
					"source": "radarr", "date": date,
					"title": title, "titleSlug": titleSlug,
					"uiUrl": uiURL, "color": "#f59e0b",
					"hasFile": m["hasFile"] == true,
				})
			}

		case "lidarr":
			apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
			if err != nil {
				log.Printf("[CAL] lidarr resolveIntegration error: %v", err)
				continue
			}
			upcoming, err := arrGet(apiURL, apiKey,
				fmt.Sprintf("/api/v1/calendar?start=%s&end=%s", calStart, calEnd), skipTLS)
			if err != nil {
				log.Printf("[CAL] lidarr fetch error: %v", err)
				continue
			}
			var albums []map[string]interface{}
			json.Unmarshal(upcoming, &albums)
			for _, al := range albums {
				title, _ := al["title"].(string)
				date, _ := al["releaseDate"].(string)
				if len(date) > 10 {
					date = date[:10]
				}
				artist := ""
				if a, ok := al["artist"].(map[string]interface{}); ok {
					artist, _ = a["artistName"].(string)
				}
				events = append(events, map[string]interface{}{
					"source": "lidarr", "date": date,
					"title":  fmt.Sprintf("%s — %s", artist, title),
					"uiUrl":  uiURL,
					"color":  "#a78bfa",
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

	return map[string]interface{}{"events": events}, nil
}
