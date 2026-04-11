package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
)

type ReadarrPanelData struct {
	UIURL       string         `json:"uiUrl"`
	Upcoming    []ReadarrBook  `json:"upcoming"`
	History     []ReadarrBook  `json:"history"`
	Missing     []ReadarrBook  `json:"missing"`
	BookCount   int            `json:"bookCount"`
	OnDiskCount int            `json:"onDiskCount"`
}

type ReadarrBook struct {
	ID          int    `json:"id"`
	Title       string `json:"title"`
	AuthorName  string `json:"authorName"`
	ReleaseDate string `json:"releaseDate,omitempty"`
	HasFile     bool   `json:"hasFile"`
	Date        string `json:"date,omitempty"`
}

func fetchReadarrPanelData(db *sql.DB, config map[string]interface{}) (*ReadarrPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &ReadarrPanelData{UIURL: uiURL}

	// Upcoming
	upcStart := timeNow().Format("2006-01-02")
	upcEnd := timeNow().AddDate(0, 0, 90).Format("2006-01-02")
	upcoming, err := arrGet(apiURL, apiKey,
		fmt.Sprintf("/api/v1/calendar?start=%s&end=%s&unmonitored=true&includeAuthor=true", upcStart, upcEnd))
	if err == nil {
		var books []map[string]interface{}
		json.Unmarshal(upcoming, &books)
		for _, b := range books {
			data.Upcoming = append(data.Upcoming, readarrBookFromMap(b))
		}
	}

	// Recent history
	hist, err := arrGet(apiURL, apiKey,
		"/api/v1/history?pageSize=5&sortKey=date&sortDirection=descending&eventType=3&includeBook=true&includeAuthor=true")
	if err == nil {
		var histResp map[string]interface{}
		json.Unmarshal(hist, &histResp)
		if records, ok := histResp["records"].([]interface{}); ok {
			for _, r := range records {
				rec, _ := r.(map[string]interface{})
				if rec == nil { continue }
				book, _ := rec["book"].(map[string]interface{})
				if book == nil { continue }
				b := readarrBookFromMap(book)
				b.Date = stringVal(rec, "date")
				data.History = append(data.History, b)
			}
		}
	}

	// Book counts via cache
	books, err := getCachedArr(apiURL, apiKey, "readarr")
	if err != nil {
		log.Printf("[READARR] book fetch error: %v", err)
	} else {
		data.BookCount = len(books)
		for _, b := range books {
			if b["bookFileCount"] != nil {
				if v, ok := b["bookFileCount"].(float64); ok && v > 0 {
					data.OnDiskCount++
				}
			}
		}
	}

	// Missing
	missing, err := arrGet(apiURL, apiKey, "/api/v1/wanted/missing?pageSize=10&sortKey=releaseDate&sortDirection=descending")
	if err == nil {
		var wantedResp map[string]interface{}
		json.Unmarshal(missing, &wantedResp)
		if records, ok := wantedResp["records"].([]interface{}); ok {
			for _, r := range records {
				rec, _ := r.(map[string]interface{})
				if rec == nil { continue }
				data.Missing = append(data.Missing, readarrBookFromMap(rec))
			}
		}
	}
	return data, nil
}

func readarrBookFromMap(b map[string]interface{}) ReadarrBook {
	bk := ReadarrBook{}
	bk.Title, _ = b["title"].(string)
	bk.ReleaseDate, _ = b["releaseDate"].(string)
	if i, ok := b["id"].(float64); ok { bk.ID = int(i) }
	author, _ := b["author"].(map[string]interface{})
	if author != nil {
		bk.AuthorName, _ = author["authorName"].(string)
	}
	return bk
}
