package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
)

type SonarrPanelData struct {
	UIURL          string          `json:"uiUrl"`
	Upcoming       []SonarrEpisode `json:"upcoming"`
	History        []SonarrHistory `json:"history"`
	ZeroByte       []SonarrSeries  `json:"zeroByte"`
	ZeroByteCount  int             `json:"zeroByteCount"`
	SeriesCount    int             `json:"seriesCount"`
	EpisodeCount   int             `json:"episodeCount"`
	OnDiskCount    int             `json:"onDiskCount"`
}

type SonarrEpisode struct {
	ID          int    `json:"id"`
	SeriesTitle string `json:"seriesTitle"`
	TitleSlug   string `json:"titleSlug"`
	Title       string `json:"title"`
	Season      int    `json:"season"`
	Episode     int    `json:"episode"`
	AirDate     string `json:"airDate"`
	HasFile     bool   `json:"hasFile"`
}

type SonarrHistory struct {
	SeriesTitle string `json:"seriesTitle"`
	TitleSlug   string `json:"titleSlug"`
	Title       string `json:"title"`
	Season      int    `json:"season"`
	Episode     int    `json:"episode"`
	Date        string `json:"date"`
}

type SonarrSeries struct {
	ID        int    `json:"id"`
	Title     string `json:"title"`
	TitleSlug string `json:"titleSlug"`
	Year      int    `json:"year"`
}

func fetchSonarrPanelData(db *sql.DB, config map[string]interface{}) (*SonarrPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &SonarrPanelData{UIURL: uiURL}

	// Upcoming episodes — 90-day window
	upcStart := timeNow().Format("2006-01-02")
	upcEnd := timeNow().AddDate(0, 0, 90).Format("2006-01-02")
	upcoming, err := arrGet(apiURL, apiKey,
		fmt.Sprintf("/api/v3/calendar?includeSeries=true&unmonitored=true&start=%s&end=%s", upcStart, upcEnd))
	if err == nil {
		var episodes []map[string]interface{}
		json.Unmarshal(upcoming, &episodes)
		for _, ep := range episodes {
			series, _ := ep["series"].(map[string]interface{})
			seriesTitle, titleSlug := "", ""
			if series != nil {
				seriesTitle, _ = series["title"].(string)
				titleSlug, _ = series["titleSlug"].(string)
			}
			e := SonarrEpisode{
				SeriesTitle: seriesTitle,
				TitleSlug:   titleSlug,
				AirDate:     stringVal(ep, "airDate"),
				HasFile:     ep["hasFile"] == true,
			}
			if t, ok := ep["title"].(string); ok { e.Title = t }
			if s, ok := ep["seasonNumber"].(float64); ok { e.Season = int(s) }
			if n, ok := ep["episodeNumber"].(float64); ok { e.Episode = int(n) }
			if i, ok := ep["id"].(float64); ok { e.ID = int(i) }
			data.Upcoming = append(data.Upcoming, e)
		}
	}

	// Recent history
	hist, err := arrGet(apiURL, apiKey,
		"/api/v3/history?pageSize=5&sortKey=date&sortDirection=descending&eventType=1&includeSeries=true&includeEpisode=true")
	if err == nil {
		var histResp map[string]interface{}
		json.Unmarshal(hist, &histResp)
		if records, ok := histResp["records"].([]interface{}); ok {
			for _, r := range records {
				rec, _ := r.(map[string]interface{})
				if rec == nil { continue }
				series, _ := rec["series"].(map[string]interface{})
				episode, _ := rec["episode"].(map[string]interface{})
				seriesTitle, titleSlug := "", ""
				if series != nil {
					seriesTitle, _ = series["title"].(string)
					titleSlug, _ = series["titleSlug"].(string)
				}
				if seriesTitle == "" {
					seriesTitle, _ = rec["sourceTitle"].(string)
				}
				epTitle := ""
				season, epNum := 0, 0
				if episode != nil {
					epTitle, _ = episode["title"].(string)
					if s, ok := episode["seasonNumber"].(float64); ok { season = int(s) }
					if n, ok := episode["episodeNumber"].(float64); ok { epNum = int(n) }
				}
				data.History = append(data.History, SonarrHistory{
					SeriesTitle: seriesTitle,
					TitleSlug:   titleSlug,
					Title:       epTitle,
					Date:        stringVal(rec, "date"),
					Season:      season,
					Episode:     epNum,
				})
			}
		}
	}

	// Library stats via cache
	seriesList, seriesErr := getCachedArr(apiURL, apiKey, "sonarr")
	if seriesErr != nil {
		log.Printf("[SONARR] series fetch error: %v", seriesErr)
	} else {
		data.SeriesCount = len(seriesList)
		for _, s := range seriesList {
			statistics, _ := s["statistics"].(map[string]interface{})
			episodeFileCount := 0
			if statistics != nil {
				if v, ok := statistics["episodeFileCount"].(float64); ok { episodeFileCount = int(v) }
				if v, ok := statistics["episodeCount"].(float64); ok { data.EpisodeCount += int(v) }
				data.OnDiskCount += episodeFileCount
			}
			if episodeFileCount == 0 {
				ss := SonarrSeries{}
				ss.Title, _ = s["title"].(string)
				if y, ok := s["year"].(float64); ok { ss.Year = int(y) }
				if i, ok := s["id"].(float64); ok { ss.ID = int(i) }
				if slug, ok := s["titleSlug"].(string); ok { ss.TitleSlug = slug }
				data.ZeroByte = append(data.ZeroByte, ss)
			}
		}
	}
	data.ZeroByteCount = len(data.ZeroByte)
	return data, nil
}
