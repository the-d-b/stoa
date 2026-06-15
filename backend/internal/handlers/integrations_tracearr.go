package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

type TracearrStreamSummary struct {
	Total       int `json:"total"`
	Transcodes  int `json:"transcodes"`
	DirectPlays int `json:"directPlays"`
}

type TracearrStream struct {
	Username    string `json:"username"`
	MediaTitle  string `json:"mediaTitle"`
	ShowTitle   string `json:"showTitle"`
	MediaType   string `json:"mediaType"`
	State       string `json:"state"`
	ProgressMs  int64  `json:"progressMs"`
	DurationMs  int64  `json:"durationMs"`
	IsTranscode bool   `json:"isTranscode"`
	Platform    string `json:"platform"`
	ServerName  string `json:"serverName"`
	ThumbURL    string `json:"thumbUrl,omitempty"`
}

type TracearrUser struct {
	Username string `json:"username"`
	Plays    int    `json:"plays"`
}

type TracearrHistoryItem struct {
	Username    string `json:"username"`
	MediaTitle  string `json:"mediaTitle"`
	ShowTitle   string `json:"showTitle"`
	MediaType   string `json:"mediaType"`
	DurationMs  int64  `json:"durationMs"`
	Watched     bool   `json:"watched"`
	StartedAt   string `json:"startedAt"`
	Platform    string `json:"platform"`
	ServerName  string `json:"serverName"`
	IsTranscode bool   `json:"isTranscode"`
}

type TracearrViolation struct {
	Severity  string `json:"severity"`
	RuleType  string `json:"ruleType"`
	RuleName  string `json:"ruleName"`
	Username  string `json:"username"`
	CreatedAt string `json:"createdAt"`
}

type TracearrPanelData struct {
	UIURL           string                `json:"uiUrl"`
	Summary         TracearrStreamSummary `json:"summary"`
	Streams         []TracearrStream      `json:"streams"`
	TotalPlays      int                   `json:"totalPlays"`
	TotalDurationMs int64                 `json:"totalDurationMs"`
	UniqueUsers     int                   `json:"uniqueUsers"`
	TopUsers        []TracearrUser        `json:"topUsers"`
	RecentHistory   []TracearrHistoryItem `json:"recentHistory"`
	Violations      []TracearrViolation   `json:"violations"`
}

func tracearrGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	u := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "application/json")
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Tracearr", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func fetchTracearrPanelData(db *sql.DB, config map[string]interface{}) (*TracearrPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}

	timeRange := 30
	if v, ok := config["timeRange"].(float64); ok {
		timeRange = int(v)
	}

	var startDate string
	if timeRange > 0 {
		startDate = time.Now().UTC().Add(-time.Duration(timeRange) * 24 * time.Hour).Format("2006-01-02")
	}

	data := &TracearrPanelData{UIURL: uiURL}

	// Live streams
	streamsBody, sErr := tracearrGet(apiURL, apiKey, "/api/v1/public/streams", skipTLS)
	if sErr == nil {
		var resp struct {
			Data []struct {
				Username    string `json:"username"`
				MediaTitle  string `json:"mediaTitle"`
				ShowTitle   string `json:"showTitle"`
				MediaType   string `json:"mediaType"`
				State       string `json:"state"`
				ProgressMs  int64  `json:"progressMs"`
				DurationMs  int64  `json:"durationMs"`
				IsTranscode bool   `json:"isTranscode"`
				Platform    string `json:"platform"`
				ServerName  string `json:"serverName"`
				PosterUrl   string `json:"posterUrl"`
			} `json:"data"`
			Summary struct {
				Total       int `json:"total"`
				Transcodes  int `json:"transcodes"`
				DirectPlays int `json:"directPlays"`
			} `json:"summary"`
		}
		if json.Unmarshal(streamsBody, &resp) == nil {
			data.Summary = TracearrStreamSummary{
				Total:       resp.Summary.Total,
				Transcodes:  resp.Summary.Transcodes,
				DirectPlays: resp.Summary.DirectPlays,
			}
			for _, s := range resp.Data {
				thumbURL := ""
				if s.PosterUrl != "" && integrationID != "" {
					thumbURL = "/api/images/proxy?integration=" + url.QueryEscape(integrationID) + "&url=" + url.QueryEscape(s.PosterUrl)
				}
				data.Streams = append(data.Streams, TracearrStream{
					Username:    s.Username,
					MediaTitle:  s.MediaTitle,
					ShowTitle:   s.ShowTitle,
					MediaType:   s.MediaType,
					State:       s.State,
					ProgressMs:  s.ProgressMs,
					DurationMs:  s.DurationMs,
					IsTranscode: s.IsTranscode,
					Platform:    s.Platform,
					ServerName:  s.ServerName,
					ThumbURL:    thumbURL,
				})
			}
		}
	}

	// Period history — drives plays count, top users, recent plays
	histPath := "/api/v1/public/history?pageSize=100"
	if startDate != "" {
		histPath += "&startDate=" + startDate
	}
	histBody, hErr := tracearrGet(apiURL, apiKey, histPath, skipTLS)
	if hErr == nil {
		var resp struct {
			Data []struct {
				MediaTitle  string `json:"mediaTitle"`
				ShowTitle   string `json:"showTitle"`
				MediaType   string `json:"mediaType"`
				DurationMs  int64  `json:"durationMs"`
				Watched     bool   `json:"watched"`
				StartedAt   string `json:"startedAt"`
				Platform    string `json:"platform"`
				ServerName  string `json:"serverName"`
				IsTranscode bool   `json:"isTranscode"`
				User        struct {
					Username string `json:"username"`
				} `json:"user"`
			} `json:"data"`
			Meta struct {
				Total int `json:"total"`
			} `json:"meta"`
		}
		if json.Unmarshal(histBody, &resp) == nil {
			data.TotalPlays = resp.Meta.Total
			userPlays := make(map[string]int)
			var totalDurMs int64
			for _, h := range resp.Data {
				totalDurMs += h.DurationMs
				userPlays[h.User.Username]++
			}
			data.TotalDurationMs = totalDurMs
			data.UniqueUsers = len(userPlays)
			type userEntry struct{ name string; plays int }
			var users []userEntry
			for name, plays := range userPlays {
				users = append(users, userEntry{name, plays})
			}
			sort.Slice(users, func(i, j int) bool { return users[i].plays > users[j].plays })
			for i, u := range users {
				if i >= 5 { break }
				data.TopUsers = append(data.TopUsers, TracearrUser{Username: u.name, Plays: u.plays})
			}
			// Recent history (first 10 = most recent)
			for i, h := range resp.Data {
				if i >= 10 { break }
				data.RecentHistory = append(data.RecentHistory, TracearrHistoryItem{
					Username:    h.User.Username,
					MediaTitle:  h.MediaTitle,
					ShowTitle:   h.ShowTitle,
					MediaType:   h.MediaType,
					DurationMs:  h.DurationMs,
					Watched:     h.Watched,
					StartedAt:   h.StartedAt,
					Platform:    h.Platform,
					ServerName:  h.ServerName,
					IsTranscode: h.IsTranscode,
				})
			}
		}
	}

	// Recent unacknowledged violations (not time-range filtered)
	vBody, _ := tracearrGet(apiURL, apiKey,
		"/api/v1/public/violations?pageSize=5&acknowledged=false", skipTLS)
	if vBody != nil {
		var resp struct {
			Data []struct {
				Severity string `json:"severity"`
				Rule     struct {
					Type string `json:"type"`
					Name string `json:"name"`
				} `json:"rule"`
				User struct {
					Username string `json:"username"`
				} `json:"user"`
				CreatedAt string `json:"createdAt"`
			} `json:"data"`
		}
		if json.Unmarshal(vBody, &resp) == nil {
			for _, v := range resp.Data {
				data.Violations = append(data.Violations, TracearrViolation{
					Severity:  v.Severity,
					RuleType:  v.Rule.Type,
					RuleName:  v.Rule.Name,
					Username:  v.User.Username,
					CreatedAt: v.CreatedAt,
				})
			}
		}
	}

	return data, nil
}

func testTracearrConnection(apiURL, apiKey string, skipTLS ...bool) error {
	skip := len(skipTLS) > 0 && skipTLS[0]
	_, err := tracearrGet(apiURL, apiKey, "/api/v1/public/health", skip)
	return err
}
