package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"

	"github.com/gorilla/mux"
)

// ── Mylar3 types ──────────────────────────────────────────────────────────────

type Mylar3PanelData struct {
	UIURL         string         `json:"uiUrl"`
	IntegrationID string         `json:"integrationId"`
	SeriesCount   int            `json:"seriesCount"`
	WantedCount   int            `json:"wantedCount"`
	UpcomingCount int            `json:"upcomingCount"`
	Series        []Mylar3Series `json:"series"`
	Wanted        []Mylar3Issue  `json:"wanted"`
	Upcoming      []Mylar3Issue  `json:"upcoming"`
}

type Mylar3Series struct {
	ComicID string `json:"comicId"`
	Name    string `json:"name"`
}

type Mylar3Issue struct {
	ComicID     string `json:"comicId"`
	ComicName   string `json:"comicName"`
	IssueNumber string `json:"issueNumber"`
	Date        string `json:"date,omitempty"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func mylar3Get(apiURL, apiKey, cmd string, extra map[string]string, skipTLS bool) ([]byte, error) {
	params := url.Values{}
	params.Set("apikey", apiKey)
	params.Set("cmd", cmd)
	for k, v := range extra {
		params.Set(k, v)
	}
	u := strings.TrimRight(apiURL, "/") + "/api?" + params.Encode()
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return nil, err
	}
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("mylar3: HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Fetcher ───────────────────────────────────────────────────────────────────

func fetchMylar3PanelData(db *sql.DB, config map[string]interface{}) (*Mylar3PanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &Mylar3PanelData{
		UIURL:         uiURL,
		IntegrationID: integrationID,
		Series:        []Mylar3Series{},
		Wanted:        []Mylar3Issue{},
		Upcoming:      []Mylar3Issue{},
	}

	// ── getIndex — all series ─────────────────────────────────────────────────
	body, err := mylar3Get(apiURL, apiKey, "getIndex", nil, skipTLS)
	if err != nil {
		log.Printf("[MYLAR3] getIndex error: %v", err)
	} else {
		var resp map[string]interface{}
		if json.Unmarshal(body, &resp) == nil {
			if arr, ok := resp["data"].([]interface{}); ok {
				data.SeriesCount = len(arr)
				for _, item := range arr {
					m, ok := item.(map[string]interface{})
					if !ok {
						continue
					}
					id, _ := m["ComicID"].(string)
					name, _ := m["ComicName"].(string)
					if id != "" && name != "" {
						data.Series = append(data.Series, Mylar3Series{ComicID: id, Name: name})
					}
				}
			}
		}
	}

	// ── getWanted — missing issues ────────────────────────────────────────────
	body, err = mylar3Get(apiURL, apiKey, "getWanted", nil, skipTLS)
	if err != nil {
		log.Printf("[MYLAR3] getWanted error: %v", err)
	} else {
		var resp map[string]interface{}
		if json.Unmarshal(body, &resp) == nil {
			// Wanted is nested: data.issues[]
			if dataObj, ok := resp["data"].(map[string]interface{}); ok {
				if issues, ok := dataObj["issues"].([]interface{}); ok {
					for _, item := range issues {
						m, ok := item.(map[string]interface{})
						if !ok {
							continue
						}
						issue := Mylar3Issue{
							ComicName:   stringVal(m, "ComicName"),
							IssueNumber: mylar3StringOrNum(m, "Issue_Number"),
						}
						issue.ComicID, _ = m["ComicID"].(string)
						if issue.ComicName != "" {
							data.Wanted = append(data.Wanted, issue)
						}
					}
				}
			}
			data.WantedCount = len(data.Wanted)
		}
	}

	// ── getUpcoming — future releases ─────────────────────────────────────────
	body, err = mylar3Get(apiURL, apiKey, "getUpcoming", nil, skipTLS)
	if err != nil {
		log.Printf("[MYLAR3] getUpcoming error: %v", err)
	} else {
		var resp map[string]interface{}
		if json.Unmarshal(body, &resp) == nil {
			if arr, ok := resp["data"].([]interface{}); ok {
				for _, item := range arr {
					m, ok := item.(map[string]interface{})
					if !ok {
						continue
					}
					issue := Mylar3Issue{
						ComicName:   stringVal(m, "ComicName"),
						IssueNumber: mylar3StringOrNum(m, "Issue_Number"),
						Date:        stringVal(m, "ReleaseDate"),
					}
					issue.ComicID, _ = m["ComicID"].(string)
					if issue.ComicName != "" {
						data.Upcoming = append(data.Upcoming, issue)
					}
				}
				data.UpcomingCount = len(data.Upcoming)
			}
		}
	}

	return data, nil
}

// mylar3StringOrNum returns a string field or formats a float64 field as a string.
func mylar3StringOrNum(m map[string]interface{}, key string) string {
	if s, ok := m[key].(string); ok {
		return s
	}
	if f, ok := m[key].(float64); ok {
		return fmt.Sprintf("%g", f)
	}
	return ""
}

// ── Cover proxy ───────────────────────────────────────────────────────────────

func ProxyMylar3Cover(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		integID := vars["integrationId"]
		comicID := vars["comicId"]

		apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, integID)
		if err != nil {
			http.Error(w, "integration not found", http.StatusNotFound)
			return
		}

		body, err := mylar3Get(apiURL, apiKey, "getArtistArt",
			map[string]string{"ComicID": comicID}, skipTLS)
		if err != nil {
			http.Error(w, "cover fetch failed", http.StatusBadGateway)
			return
		}

		w.Header().Set("Content-Type", http.DetectContentType(body))
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.Write(body)
	}
}
