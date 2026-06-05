package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type JellystatViews struct {
	Audio  int `json:"audio"`
	Movie  int `json:"movie"`
	Series int `json:"series"`
	Other  int `json:"other"`
}

type JellystatUser struct {
	Name  string `json:"name"`
	Plays int    `json:"plays"`
}

type JellystatItem struct {
	Name  string `json:"name"`
	Plays int    `json:"plays"`
}

type JellystatPanelData struct {
	UIURL     string          `json:"uiUrl"`
	Views     JellystatViews  `json:"views"`
	TopUsers  []JellystatUser `json:"topUsers"`
	TopMovies []JellystatItem `json:"topMovies"`
	TopSeries []JellystatItem `json:"topSeries"`
}

func jellystatGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	u := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-api-token", apiKey)
	req.Header.Set("Accept", "application/json")
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Jellystat", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func jellystatPost(baseURL, apiKey, path string, body interface{}, skipTLS bool) ([]byte, error) {
	u := strings.TrimRight(baseURL, "/") + path
	bodyBytes, _ := json.Marshal(body)
	req, err := http.NewRequest("POST", u, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-api-token", apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Jellystat", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func fetchJellystatPanelData(db *sql.DB, config map[string]interface{}) (*JellystatPanelData, error) {
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
	if timeRange == 0 {
		timeRange = 36500
	}

	data := &JellystatPanelData{UIURL: uiURL}

	// Views by library type
	viewsBody, viewsErr := jellystatGet(apiURL, apiKey,
		fmt.Sprintf("/stats/getViewsByLibraryType?days=%d", timeRange), skipTLS)
	if viewsErr == nil {
		var resp struct {
			Audio  interface{} `json:"Audio"`
			Movie  interface{} `json:"Movie"`
			Series interface{} `json:"Series"`
			Other  interface{} `json:"Other"`
		}
		if json.Unmarshal(viewsBody, &resp) == nil {
			toInt := func(v interface{}) int {
				if f, ok := v.(float64); ok {
					return int(f)
				}
				return 0
			}
			data.Views = JellystatViews{
				Audio:  toInt(resp.Audio),
				Movie:  toInt(resp.Movie),
				Series: toInt(resp.Series),
				Other:  toInt(resp.Other),
			}
		}
	}

	// Top users
	usersBody, _ := jellystatPost(apiURL, apiKey, "/stats/getMostActiveUsers",
		map[string]int{"days": timeRange}, skipTLS)
	if usersBody != nil {
		var rows []struct {
			Plays int    `json:"Plays"`
			Name  string `json:"Name"`
		}
		if json.Unmarshal(usersBody, &rows) == nil {
			for _, r := range rows {
				data.TopUsers = append(data.TopUsers, JellystatUser{Name: r.Name, Plays: r.Plays})
			}
		}
	}

	// Top movies
	moviesBody, _ := jellystatPost(apiURL, apiKey, "/stats/getMostViewedByType",
		map[string]interface{}{"days": timeRange, "type": "Movie"}, skipTLS)
	if moviesBody != nil {
		var rows []struct {
			Plays int    `json:"Plays"`
			Name  string `json:"Name"`
		}
		if json.Unmarshal(moviesBody, &rows) == nil {
			for _, r := range rows {
				data.TopMovies = append(data.TopMovies, JellystatItem{Name: r.Name, Plays: r.Plays})
			}
		}
	}

	// Top series
	seriesBody, _ := jellystatPost(apiURL, apiKey, "/stats/getMostViewedByType",
		map[string]interface{}{"days": timeRange, "type": "Series"}, skipTLS)
	if seriesBody != nil {
		var rows []struct {
			Plays int    `json:"Plays"`
			Name  string `json:"Name"`
		}
		if json.Unmarshal(seriesBody, &rows) == nil {
			for _, r := range rows {
				data.TopSeries = append(data.TopSeries, JellystatItem{Name: r.Name, Plays: r.Plays})
			}
		}
	}

	return data, nil
}

func testJellystatConnection(apiURL, apiKey string, skipTLS ...bool) error {
	skip := len(skipTLS) > 0 && skipTLS[0]
	_, err := jellystatGet(apiURL, apiKey, "/api/getconfig", skip)
	return err
}
