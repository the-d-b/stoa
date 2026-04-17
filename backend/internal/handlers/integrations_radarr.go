package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
)

type RadarrPanelData struct {
	UIURL        string        `json:"uiUrl"`
	History      []RadarrMovie `json:"history"`
	Missing      []RadarrMovie `json:"missing"`
	MissingCount int           `json:"missingCount"`
	MovieCount   int           `json:"movieCount"`
	OnDiskCount  int           `json:"onDiskCount"`
}

type RadarrMovie struct {
	ID              int    `json:"id"`
	Title           string `json:"title"`
	TitleSlug       string `json:"titleSlug"`
	Year            int    `json:"year"`
	DigitalRelease  string `json:"digitalRelease,omitempty"`
	PhysicalRelease string `json:"physicalRelease,omitempty"`
	HasFile         bool   `json:"hasFile"`
	Date            string `json:"date,omitempty"`
}

func fetchRadarrPanelData(db *sql.DB, config map[string]interface{}) (*RadarrPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &RadarrPanelData{UIURL: uiURL}

	// Recent history
	hist, err := arrGet(apiURL, apiKey,
		"/api/v3/history?pageSize=5&sortKey=date&sortDirection=descending&eventType=1&includeMovie=true", skipTLS)
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
	movieRaw, err := arrGet(apiURL, apiKey, "/api/v3/movie", skipTLS)
	var movieList []map[string]interface{}
	if err == nil {
		json.Unmarshal(movieRaw, &movieList)
	}
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

	}
	data.MissingCount = len(data.Missing)
	return data, nil
}

func radarrMovieFromMap(m map[string]interface{}) RadarrMovie {
	mv := RadarrMovie{}
	mv.Title, _ = m["title"].(string)
	mv.TitleSlug, _ = m["titleSlug"].(string)
	if y, ok := m["year"].(float64); ok { mv.Year = int(y) }
	if i, ok := m["id"].(float64); ok { mv.ID = int(i) }
	mv.HasFile = m["hasFile"] == true
	mv.DigitalRelease, _ = m["digitalRelease"].(string)
	mv.PhysicalRelease, _ = m["physicalRelease"].(string)
	return mv
}
