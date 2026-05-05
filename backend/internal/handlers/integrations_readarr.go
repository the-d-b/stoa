package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
)

// ── Readarr types ─────────────────────────────────────────────────────────────

type ReadarrPanelData struct {
	UIURL      string        `json:"uiUrl"`
	History    []ReadarrBook `json:"history"`
	Missing    []ReadarrBook `json:"missing"`
	MissingCount int         `json:"missingCount"`
	BookCount  int           `json:"bookCount"`
	OnDiskCount int          `json:"onDiskCount"`
	AuthorCount int          `json:"authorCount"`
}

type ReadarrBook struct {
	ID          int    `json:"id"`
	Title       string `json:"title"`
	TitleSlug   string `json:"titleSlug"`
	AuthorName  string `json:"authorName"`
	AuthorSlug  string `json:"authorSlug"`
	Year        int    `json:"year"`
	HasFile     bool   `json:"hasFile"`
	Date        string `json:"date,omitempty"`
	CoverURL    string `json:"coverUrl,omitempty"`
	Isbn        string `json:"isbn,omitempty"`
}

// ── Fetcher ───────────────────────────────────────────────────────────────────

func fetchReadarrPanelData(db *sql.DB, config map[string]interface{}) (*ReadarrPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &ReadarrPanelData{UIURL: uiURL}

	// ── Recent history ────────────────────────────────────────────────────────
	hist, err := arrGet(apiURL, apiKey,
		"/api/v1/history?pageSize=10&sortKey=date&sortDirection=descending&eventType=3", skipTLS)
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
	} else {
		log.Printf("[READARR] history fetch error: %v", err)
	}

	// ── Book library ──────────────────────────────────────────────────────────
	bookRaw, err := arrGet(apiURL, apiKey, "/api/v1/book", skipTLS)
	if err != nil {
		log.Printf("[READARR] book fetch error: %v", err)
	} else {
		var bookList []map[string]interface{}
		json.Unmarshal(bookRaw, &bookList)
		data.BookCount = len(bookList)
		for _, b := range bookList {
			bk := readarrBookFromMap(b)
			if b["grabbed"] == true || bk.HasFile {
				data.OnDiskCount++
			} else {
				data.Missing = append(data.Missing, bk)
			}
		}
	}
	data.MissingCount = len(data.Missing)

	// ── Author count ──────────────────────────────────────────────────────────
	authorRaw, err := arrGet(apiURL, apiKey, "/api/v1/author", skipTLS)
	if err == nil {
		var authorList []interface{}
		json.Unmarshal(authorRaw, &authorList)
		data.AuthorCount = len(authorList)
	}

	return data, nil
}

func readarrBookFromMap(m map[string]interface{}) ReadarrBook {
	bk := ReadarrBook{}
	bk.Title, _ = m["title"].(string)
	bk.TitleSlug, _ = m["titleSlug"].(string)
	bk.HasFile = m["grabbed"] == true
	if y, ok := m["releaseDate"].(string); ok && len(y) >= 4 {
		fmt.Sscanf(y[:4], "%d", &bk.Year)
	}
	if i, ok := m["id"].(float64); ok { bk.ID = int(i) }
	// Author info
	if author, ok := m["author"].(map[string]interface{}); ok {
		bk.AuthorName, _ = author["authorName"].(string)
		bk.AuthorSlug, _ = author["nameSlug"].(string)
	}
	// ISBN
	if editions, ok := m["editions"].([]interface{}); ok && len(editions) > 0 {
		if ed, ok := editions[0].(map[string]interface{}); ok {
			bk.Isbn, _ = ed["isbn13"].(string)
		}
	}
	// Cover from images array
	if images, ok := m["images"].([]interface{}); ok {
		for _, img := range images {
			if im, ok := img.(map[string]interface{}); ok {
				if ct, _ := im["coverType"].(string); ct == "cover" {
					if ru, _ := im["remoteUrl"].(string); ru != "" {
						bk.CoverURL = ru
						break
					}
					if ru, _ := im["url"].(string); ru != "" {
						bk.CoverURL = ru
						break
					}
				}
			}
		}
	}
	return bk
}
