package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
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
		if v, ok := source["daysAhead"].(float64); ok { daysAhead = int(v) }

		apiURL, uiURL, apiKey, err := resolveIntegration(db, integrationID)
		if err != nil { continue }

		calStart := timeNow().Format("2006-01-02")
		calEnd := timeNow().AddDate(0, 0, daysAhead).Format("2006-01-02")

		switch srcType {
		case "sonarr":
			upcoming, err := arrGet(apiURL, apiKey,
				fmt.Sprintf("/api/v3/calendar?includeSeries=true&unmonitored=true&start=%s&end=%s", calStart, calEnd))
			if err != nil { continue }
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
					"title": fmt.Sprintf("%s — %s", seriesTitle, epTitle),
					"seriesTitle": seriesTitle, "epTitle": epTitle,
					"titleSlug": titleSlug, "uiUrl": uiURL,
					"color": "#60a5fa", "hasFile": ep["hasFile"] == true,
				})
			}

		case "radarr":
			upcoming, err := arrGet(apiURL, apiKey,
				fmt.Sprintf("/api/v3/calendar?start=%s&end=%s&unmonitored=true", calStart, calEnd))
			if err != nil { continue }
			var movies []map[string]interface{}
			json.Unmarshal(upcoming, &movies)
			for _, m := range movies {
				title, _ := m["title"].(string)
				titleSlug, _ := m["titleSlug"].(string)
				// Prefer digital release date, fall back to physical, then cinemas
				date, _ := m["digitalRelease"].(string)
				if date == "" { date, _ = m["physicalRelease"].(string) }
				if date == "" { date, _ = m["inCinemas"].(string) }
				events = append(events, map[string]interface{}{
					"source": "radarr", "date": date,
					"title": title, "titleSlug": titleSlug,
					"uiUrl": uiURL, "color": "#f59e0b",
					"hasFile": m["hasFile"] == true,
				})
			}

		case "lidarr":
			upcoming, err := arrGet(apiURL, apiKey,
				fmt.Sprintf("/api/v1/calendar?start=%s&end=%s&unmonitored=true&includeArtist=true", calStart, calEnd))
			if err != nil { continue }
			var albums []map[string]interface{}
			json.Unmarshal(upcoming, &albums)
			for _, a := range albums {
				title, _ := a["title"].(string)
				date, _ := a["releaseDate"].(string)
				foreignAlbumId, _ := a["foreignAlbumId"].(string)
				artist, _ := a["artist"].(map[string]interface{})
				artistName := ""
				foreignArtistId := ""
				if artist != nil {
					artistName, _ = artist["artistName"].(string)
					foreignArtistId, _ = artist["foreignArtistId"].(string)
				}
				events = append(events, map[string]interface{}{
					"source": "lidarr", "date": date,
					"title": fmt.Sprintf("%s — %s", artistName, title),
					"artistName": artistName, "albumTitle": title,
					"foreignAlbumId": foreignAlbumId, "foreignArtistId": foreignArtistId,
					"uiUrl": uiURL, "color": "#a78bfa",
				})
			}

		}
	}

	return map[string]interface{}{"events": events}, nil
}
