package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"io"
	"strings"
)

// ── Tautulli types ────────────────────────────────────────────────────────────

type TautulliPanelData struct {
	UIURL       string              `json:"uiUrl"`
	MostPlayed  []TautulliMediaStat `json:"mostPlayed"`
	UserStats   []TautulliUserStat  `json:"userStats"`
	History     []TautulliHistory   `json:"history"`
}

type TautulliMediaStat struct {
	Title            string `json:"title"`
	GrandparentTitle string `json:"grandparentTitle"`
	MediaType        string `json:"mediaType"`
	PlayCount        int    `json:"playCount"`
	TotalDuration    int    `json:"totalDuration"` // seconds
	ThumbURL         string `json:"thumbUrl,omitempty"`
	RatingKey        string `json:"ratingKey,omitempty"`
}

type TautulliUserStat struct {
	User          string `json:"user"`
	PlayCount     int    `json:"playCount"`
	TotalDuration int    `json:"totalDuration"` // seconds
	LastPlayed    string `json:"lastPlayed"`
}

type TautulliHistory struct {
	User             string  `json:"user"`
	Title            string  `json:"title"`
	GrandparentTitle string  `json:"grandparentTitle"`
	MediaType        string  `json:"mediaType"`
	Date             int64   `json:"date"`
	Duration         int     `json:"duration"` // seconds
	PercentComplete  float64 `json:"percentComplete"`
	RatingKey        string  `json:"ratingKey,omitempty"`
	ThumbURL         string  `json:"thumbUrl,omitempty"`
}

func fetchTautulliPanelData(db *sql.DB, config map[string]interface{}) (*TautulliPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}

	// Time range from config: 1, 7, 30, or 0 (all time)
	timeRange := 30
	if v, ok := config["timeRange"].(float64); ok {
		timeRange = int(v)
	}
	// Tautulli doesn't support time_range=0; use large number for "all time"
	if timeRange == 0 {
		timeRange = 36500
	}

	data := &TautulliPanelData{UIURL: uiURL}

	// Most played — top 10 across all media types
	mostPlayedBody, err := tautulliGet(apiURL, apiKey, "get_home_stats", fmt.Sprintf(
		"&time_range=%d&stats_count=10&stats_type=plays", timeRange,
	), skipTLS)
	if err == nil {
		log.Printf("[TAUTULLI] most-played raw: %.500s", string(mostPlayedBody))
		var resp struct {
			Response struct {
				Data []struct {
					StatID string `json:"stat_id"`
					Rows   []struct {
						Title                string      `json:"title"`
						GrandparentTitle     string      `json:"grandparent_title"`
						MediaType            string      `json:"media_type"`
						TotalPlays           int         `json:"total_plays"`
						TotalDuration        int         `json:"total_duration"`
						RatingKey            interface{} `json:"rating_key"`
						GrandparentRatingKey interface{} `json:"grandparent_rating_key"`
						Thumb                string      `json:"thumb"`
					} `json:"rows"`
				} `json:"data"`
			} `json:"response"`
		}
		if err2 := json.Unmarshal(mostPlayedBody, &resp); err2 != nil {
			log.Printf("[TAUTULLI] most-played unmarshal error: %v", err2)
		} else {
			log.Printf("[TAUTULLI] most-played parsed: %d stat groups", len(resp.Response.Data))
			for _, stat := range resp.Response.Data {
				log.Printf("[TAUTULLI] stat_id=%q rows=%d", stat.StatID, len(stat.Rows))
				// Accept any stat with media rows
				for _, row := range stat.Rows {
					rk := ""
					switch v := row.RatingKey.(type) {
					case float64:
						if v > 0 { rk = fmt.Sprintf("%.0f", v) }
					case string:
						rk = v
					}
					thumbURL := ""
					if row.Thumb != "" && rk != "" {
						thumbURL = fmt.Sprintf("%s/api/v2?apikey=%s&cmd=get_image&rating_key=%s&width=150&height=225&fallback=poster", apiURL, apiKey, rk)
					}
					data.MostPlayed = append(data.MostPlayed, TautulliMediaStat{
						Title:            row.Title,
						GrandparentTitle: row.GrandparentTitle,
						MediaType:        row.MediaType,
						PlayCount:        row.TotalPlays,
						TotalDuration:    row.TotalDuration,
						RatingKey:        rk,
						ThumbURL:         thumbURL,
					})
				}
			}
		}
	}

	// User stats
	userStatsBody, err := tautulliGet(apiURL, apiKey, "get_home_stats", fmt.Sprintf(
		"&time_range=%d&stats_count=8&stats_type=plays", timeRange,
	), skipTLS)
	if err == nil {
		var resp struct {
			Response struct {
				Data []struct {
					StatID string `json:"stat_id"`
					Rows   []struct {
						FriendlyName  string `json:"friendly_name"`
						TotalPlays    int    `json:"total_plays"`
						TotalDuration int    `json:"total_duration"`
						LastPlay      int64  `json:"last_play"`
					} `json:"rows"`
				} `json:"data"`
			} `json:"response"`
		}
		if json.Unmarshal(userStatsBody, &resp) == nil {
			for _, stat := range resp.Response.Data {
				if stat.StatID != "top_users" { continue }
				for _, row := range stat.Rows {
					data.UserStats = append(data.UserStats, TautulliUserStat{
						User:          row.FriendlyName,
						PlayCount:     row.TotalPlays,
						TotalDuration: row.TotalDuration,
					})
				}
			}
		}
	}

	// Recent history — last 8 plays
	histBody, err := tautulliGet(apiURL, apiKey, "get_history",
		"&length=8&order_column=date&order_dir=desc",
		skipTLS)
	if err == nil {
		var resp struct {
			Response struct {
				Data struct {
					Data []struct {
						FriendlyName     string  `json:"friendly_name"`
						Title            string  `json:"title"`
						GrandparentTitle string  `json:"grandparent_title"`
						MediaType        string  `json:"media_type"`
						Date             int64   `json:"date"`
						Duration         int     `json:"duration"`
						PercentComplete  float64 `json:"percent_complete"`
						RatingKey        int     `json:"rating_key"`
					} `json:"data"`
				} `json:"data"`
			} `json:"response"`
		}
		if json.Unmarshal(histBody, &resp) == nil {
			for _, row := range resp.Response.Data.Data {
					hrk := ""
					if row.RatingKey > 0 { hrk = fmt.Sprintf("%d", row.RatingKey) }
					data.History = append(data.History, TautulliHistory{
						User:             row.FriendlyName,
						Title:            row.Title,
						GrandparentTitle: row.GrandparentTitle,
						MediaType:        row.MediaType,
						Date:             row.Date,
						Duration:         row.Duration,
						PercentComplete:  row.PercentComplete,
						RatingKey:        hrk,
					})
			}
		}
	}

	return data, nil
}

func tautulliGet(baseURL, apiKey, cmd, extraParams string, skipTLS ...bool) ([]byte, error) {
	url := fmt.Sprintf("%s/api/v2?apikey=%s&cmd=%s%s",
		strings.TrimRight(baseURL, "/"), apiKey, cmd, extraParams)
	client := httpClient(len(skipTLS) > 0 && skipTLS[0])
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Tautulli", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func testTautulliConnection(apiURL, apiKey string, skipTLS ...bool) error {
	body, err := tautulliGet(apiURL, apiKey, "arnold", "", (len(skipTLS) > 0 && skipTLS[0]))
	if err != nil {
		return err
	}
	var resp map[string]interface{}
	if json.Unmarshal(body, &resp) != nil {
		return fmt.Errorf("unexpected response from Tautulli")
	}
	return nil
}
