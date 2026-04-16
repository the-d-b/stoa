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
	log.Printf("[CAL] fetchCalendarData: %d sources in config", len(sources))

	// Log full config for debugging
	if b, err := json.Marshal(config); err == nil {
		log.Printf("[CAL] config: %s", string(b))
	}

	events := []map[string]interface{}{}

	for i, src := range sources {
		source, _ := src.(map[string]interface{})
		if source == nil {
			log.Printf("[CAL] source[%d]: nil, skipping", i)
			continue
		}
		srcType := stringVal(source, "type")
		integrationID := stringVal(source, "integrationId")
		log.Printf("[CAL] source[%d]: type=%q integrationId=%q", i, srcType, integrationID)

		if integrationID == "" {
			log.Printf("[CAL] source[%d]: empty integrationId, skipping", i)
			continue
		}

		daysAhead := 30
		if v, ok := source["daysAhead"].(float64); ok {
			daysAhead = int(v)
		}
		log.Printf("[CAL] source[%d]: daysAhead=%d", i, daysAhead)

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
			log.Printf("[CAL] sonarr: %d episodes", len(episodes))
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
			log.Printf("[CAL] radarr: %d movies", len(movies))
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
			log.Printf("[CAL] lidarr: %d albums", len(albums))
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
			log.Printf("[CAL] google: tokenId=%s calendarId=%s daysAhead=%d", integrationID, calendarID, daysAhead)

			accessToken, aerr := GetValidAccessToken(db, integrationID)
			if aerr != nil {
				log.Printf("[CAL] google: GetValidAccessToken error: %v", aerr)
				continue
			}
			log.Printf("[CAL] google: got access token (len=%d)", len(accessToken))

			// Log available calendars to help debug calendar ID issues
			if cals, cerr := googleFetchCalendarList(accessToken); cerr == nil {
				for _, c := range cals {
					log.Printf("[CAL] google: available calendar id=%q summary=%q primary=%v", c.ID, c.Summary, c.Primary)
				}
			} else {
				log.Printf("[CAL] google: could not list calendars: %v", cerr)
			}

			timeMin := timeNow()
			timeMax := timeNow().AddDate(0, 0, daysAhead)
			log.Printf("[CAL] google: fetching %s to %s", timeMin.Format("2006-01-02"), timeMax.Format("2006-01-02"))

			items, gerr := FetchGoogleCalendarEvents(accessToken, calendarID, timeMin, timeMax)
			if gerr != nil {
				log.Printf("[CAL] google: FetchGoogleCalendarEvents error: %v", gerr)
				continue
			}
			log.Printf("[CAL] google: got %d items", len(items))

			for _, item := range items {
				start, _ := item["start"].(map[string]interface{})
				if start == nil {
					log.Printf("[CAL] google: item has no start: %v", item["summary"])
					continue
				}
				date := ""
				if d, ok := start["date"].(string); ok {
					date = d
				} else if dt, ok := start["dateTime"].(string); ok && len(dt) >= 10 {
					date = dt[:10]
				}
				if date == "" {
					log.Printf("[CAL] google: item has no date: %v", item["summary"])
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
				log.Printf("[CAL] google: adding event %q on %s", summary, date)
				events = append(events, map[string]interface{}{
					"source": "google", "date": date,
					"title": summary,
					"color": "#34d399",
				})
			}

		default:
			log.Printf("[CAL] source[%d]: unknown type %q", i, srcType)
		}
	}

	log.Printf("[CAL] returning %d total events", len(events))
	return map[string]interface{}{"events": events}, nil
}
