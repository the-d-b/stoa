package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
)

type RadarrPanelData struct {
	UIURL       string         `json:"uiUrl"`
	Upcoming    []RadarrMovie  `json:"upcoming"`
	History     []RadarrMovie  `json:"history"`
	Missing     []RadarrMovie  `json:"missing"`
	MovieCount  int            `json:"movieCount"`
	OnDiskCount int            `json:"onDiskCount"`
}

type RadarrMovie struct {
	ID          int    `json:"id"`
	Title       string `json:"title"`
	TitleSlug   string `json:"titleSlug"`
	Year        int    `json:"year"`
	InCinemas   string `json:"inCinemas,omitempty"`
	DigitalDate string `json:"digitalRelease,omitempty"`
	HasFile     bool   `json:"hasFile"`
	Date        string `json:"date,omitempty"`
}

func fetchRadarrPanelData(db *sql.DB, config map[string]interface{}) (*RadarrPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &RadarrPanelData{UIURL: uiURL}

	// Upcoming releases — calendar endpoint
	upcStart := timeNow().Format("2006-01-02")
	upcEnd := timeNow().AddDate(0, 0, 90).Format("2006-01-02")
	upcoming, err := arrGet(apiURL, apiKey,
		fmt.Sprintf("/api/v3/calendar?start=%s&end=%s&unmonitored=true", upcStart, upcEnd))
	if err == nil {
		var movies []map[string]interface{}
		json.Unmarshal(upcoming, &movies)
		for _, m := range movies {
			movie := radarrMovieFromMap(m)
			data.Upcoming = append(data.Upcoming, movie)
		}
	}

	// Recent history
	hist, err := arrGet(apiURL, apiKey,
		"/api/v3/history?pageSize=5&sortKey=date&sortDirection=descending&eventType=1&includeMovie=true")
	if err == nil {
		var histResp map[string]interface{}
		json.Unmarshal(hist, &histResp)
		if records, ok := histResp["records"].([]interface{}); ok {
			for _, r := range records {
				rec, _ := r.(map[string]interface{})
				if rec == nil { continue }
				movie, _ := rec["movie"].(map[string]interface{})
				if movie == nil { continue }
				m := radarrMovieFromMap(movie)
				m.Date = stringVal(rec, "date")
				data.History = append(data.History, m)
			}
		}
	}

	// Library stats via cache
	movieList, err := getCachedArr(apiURL, apiKey, "radarr")
	if err != nil {
		log.Printf("[RADARR] movie fetch error: %v", err)
	} else {
		data.MovieCount = len(movieList)
		for _, m := range movieList {
			if m["hasFile"] == true {
				data.OnDiskCount++
			} else {
				mv := radarrMovieFromMap(m)
				data.Missing = append(data.Missing, mv)
			}
		}
		// Cap missing list
		if len(data.Missing) > 20 {
			data.Missing = data.Missing[:20]
		}
	}
	return data, nil
}

func radarrMovieFromMap(m map[string]interface{}) RadarrMovie {
	mv := RadarrMovie{}
	mv.Title, _ = m["title"].(string)
	mv.TitleSlug, _ = m["titleSlug"].(string)
	if y, ok := m["year"].(float64); ok { mv.Year = int(y) }
	if i, ok := m["id"].(float64); ok { mv.ID = int(i) }
	mv.HasFile = m["hasFile"] == true
	mv.InCinemas, _ = m["inCinemas"].(string)
	mv.DigitalDate, _ = m["digitalRelease"].(string)
	return mv
}
