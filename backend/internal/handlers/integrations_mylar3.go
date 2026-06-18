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
)

// ── Types ─────────────────────────────────────────────────────────────────────

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
	ComicID     string `json:"comicId"`
	Name        string `json:"name"`
	ImageURL    string `json:"imageUrl"`
	Status      string `json:"status"`
	Publisher   string `json:"publisher"`
	Year        string `json:"year"`
	TotalIssues int    `json:"totalIssues"`
}

type Mylar3Issue struct {
	ComicID     string `json:"comicId"`
	ComicName   string `json:"comicName"`
	IssueNumber string `json:"issueNumber"`
	IssueName   string `json:"issueName"`
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

	// ── getIndex — {"success": true, "data": [...]}
	// Fields: id, name, imageURL, status, publisher, year, totalIssues
	body, err := mylar3Get(apiURL, apiKey, "getIndex", nil, skipTLS)
	if err != nil {
		return nil, err
	}
	var indexResp struct {
		Data []map[string]interface{} `json:"data"`
	}
	if json.Unmarshal(body, &indexResp) == nil {
		data.SeriesCount = len(indexResp.Data)
		for _, m := range indexResp.Data {
			id := stringVal(m, "id")
			name := stringVal(m, "name")
			if id == "" || name == "" {
				continue
			}
			s := Mylar3Series{
				ComicID:   id,
				Name:      name,
				ImageURL:  stringVal(m, "imageURL"),
				Status:    stringVal(m, "status"),
				Publisher: stringVal(m, "publisher"),
				Year:      stringVal(m, "year"),
			}
			if n, ok := m["totalIssues"].(float64); ok {
				s.TotalIssues = int(n)
			}
			data.Series = append(data.Series, s)
		}
	}

	// ── getWanted — {"issues": [...]} directly, no success/data wrapper
	// Fields: ComicID, ComicName, Issue_Number, IssueName, ReleaseDate
	body, err = mylar3Get(apiURL, apiKey, "getWanted", nil, skipTLS)
	if err != nil {
		log.Printf("[MYLAR3] getWanted error: %v", err)
	} else {
		var wantedResp struct {
			Issues []map[string]interface{} `json:"issues"`
		}
		if json.Unmarshal(body, &wantedResp) == nil {
			for _, m := range wantedResp.Issues {
				issue := Mylar3Issue{
					ComicID:     stringVal(m, "ComicID"),
					ComicName:   stringVal(m, "ComicName"),
					IssueNumber: mylar3StringOrNum(m, "Issue_Number"),
					IssueName:   stringVal(m, "IssueName"),
					Date:        stringVal(m, "ReleaseDate"),
				}
				if issue.ComicName != "" {
					data.Wanted = append(data.Wanted, issue)
				}
			}
			data.WantedCount = len(data.Wanted)
		}
	}

	// ── getUpcoming — bare array [], not wrapped in an object
	body, err = mylar3Get(apiURL, apiKey, "getUpcoming", nil, skipTLS)
	if err != nil {
		log.Printf("[MYLAR3] getUpcoming error: %v", err)
	} else {
		var upcomingArr []map[string]interface{}
		if json.Unmarshal(body, &upcomingArr) == nil {
			for _, m := range upcomingArr {
				issue := Mylar3Issue{
					ComicID:     stringVal(m, "ComicID"),
					ComicName:   stringVal(m, "ComicName"),
					IssueNumber: mylar3StringOrNum(m, "Issue_Number"),
					IssueName:   stringVal(m, "IssueName"),
					Date:        stringVal(m, "ReleaseDate"),
				}
				if issue.ComicName != "" {
					data.Upcoming = append(data.Upcoming, issue)
				}
			}
			data.UpcomingCount = len(data.Upcoming)
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
