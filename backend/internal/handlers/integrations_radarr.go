package handlers

import (
	"database/sql"
	"encoding/json"
	"strings"
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
	PosterURL       string `json:"posterUrl,omitempty"`
	Certification   string `json:"certification,omitempty"`
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
		ratingsFilter := allowedRatings(config)
		if records, ok := histResp["records"].([]interface{}); ok {
			for _, r := range records {
				rec, _ := r.(map[string]interface{})
				if rec == nil { continue }
				movie, _ := rec["movie"].(map[string]interface{})
				if movie == nil { continue }
				m := radarrMovieFromMap(movie)
				m.Date = stringVal(rec, "date")
				if ratingAllowed(m.Certification, ratingsFilter) {
					data.History = append(data.History, m)
				}
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
		ratingsFilter2 := allowedRatings(config)
		for _, m := range movieList {
			mv := radarrMovieFromMap(m)
			if m["hasFile"] == true {
				data.OnDiskCount++
			} else if ratingAllowed(mv.Certification, ratingsFilter2) {
				data.Missing = append(data.Missing, mv)
			}
		}

	}
	data.MissingCount = len(data.Missing)
	return data, nil
}

// allowedRatings parses a comma-separated ratings config string into a set.
// Returns nil if empty (no filtering).
func allowedRatings(config map[string]interface{}) map[string]bool {
	raw, _ := config["allowedRatings"].(string)
	if raw == "" { return nil }
	set := map[string]bool{}
	for _, r := range strings.Split(raw, ",") {
		r = strings.TrimSpace(strings.ToUpper(r))
		if r != "" { set[r] = true }
	}
	if len(set) == 0 { return nil }
	return set
}

// ratingAllowed returns true if the movie/show should be shown.
// If filter is nil (not configured), everything passes.
// NR/empty certification is excluded when filter is active.
func ratingAllowed(certification string, filter map[string]bool) bool {
	if filter == nil { return true }
	c := strings.TrimSpace(strings.ToUpper(certification))
	if c == "" || c == "NR" || c == "NOT RATED" { return false }
	return filter[c]
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
	mv.Certification, _ = m["certification"].(string)
	// Extract poster from images array
	if images, ok := m["images"].([]interface{}); ok {
		for _, img := range images {
			if im, ok := img.(map[string]interface{}); ok {
				if ct, _ := im["coverType"].(string); ct == "poster" {
					if ru, _ := im["remoteUrl"].(string); ru != "" {
						mv.PosterURL = ru
						break
					}
				}
			}
		}
	}
	return mv
}
