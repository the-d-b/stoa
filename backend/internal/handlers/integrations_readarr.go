package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
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
	data := &ReadarrPanelData{
		UIURL:   uiURL,
		History: []ReadarrBook{},
		Missing: []ReadarrBook{},
	}

	// ── Recent history ────────────────────────────────────────────────────────
	hist, err := arrGet(apiURL, apiKey,
		"/api/v1/history?pageSize=20&sortKey=date&sortDirection=descending", skipTLS)
	if err == nil {
		var histResp map[string]interface{}
		json.Unmarshal(hist, &histResp)
		if records, ok := histResp["records"].([]interface{}); ok {
			seenBookId := map[int]bool{}
			for _, r := range records {
				rec, _ := r.(map[string]interface{})
				if rec == nil { continue }
				// History records have bookId + sourceTitle but no nested book object
				bookId := 0
				if bid, ok := rec["bookId"].(float64); ok { bookId = int(bid) }
				if bookId == 0 { continue }
				if seenBookId[bookId] { continue } // deduplicate same book
				seenBookId[bookId] = true
				b := ReadarrBook{
					ID:    bookId,
					Title: stringVal(rec, "sourceTitle"),
					Date:  stringVal(rec, "date"),
				}
				// Look up full book details for author name and cover
				if bookRaw, berr := arrGet(apiURL, apiKey,
					fmt.Sprintf("/api/v1/book/%d", bookId), skipTLS); berr == nil {
					var bookMap map[string]interface{}
					if json.Unmarshal(bookRaw, &bookMap) == nil {
						full := readarrBookFromMap(bookMap)
						b.AuthorName = full.AuthorName
						b.CoverURL = full.CoverURL
						b.TitleSlug = full.TitleSlug
						if full.Title != "" { b.Title = full.Title }
					}
				}
				data.History = append(data.History, b)
				if len(data.History) >= 10 { break }
			}
		} else {
			}
	} else {
		log.Printf("[READARR] history fetch error: %v", err)
	}

	// ── Book library — all books, monitored and unmonitored ─────────────────
	bookRaw, err := arrGet(apiURL, apiKey, "/api/v1/book", skipTLS)
	if err != nil {
		return nil, err
	}
	var bookList []map[string]interface{}
	json.Unmarshal(bookRaw, &bookList)
	data.BookCount = len(bookList)
	for _, b := range bookList {
			bk := readarrBookFromMap(b)
			// Use statistics.bookFileCount to determine if file exists
			hasFile := false
			if stats, ok := b["statistics"].(map[string]interface{}); ok {
				if bfc, ok := stats["bookFileCount"].(float64); ok {
					hasFile = bfc > 0
				}
			}
			// Also check top-level grabbed as fallback
			if !hasFile {
				if grabbed, ok := b["grabbed"].(bool); ok && grabbed {
					hasFile = true
				}
			}
			bk.HasFile = hasFile
			if hasFile {
				data.OnDiskCount++
			} else {
				data.Missing = append(data.Missing, bk)
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
	if y, ok := m["releaseDate"].(string); ok && len(y) >= 4 {
		fmt.Sscanf(y[:4], "%d", &bk.Year)
	}
	if i, ok := m["id"].(float64); ok { bk.ID = int(i) }
	// Cover image — Readarr uses images array with coverType="cover"
	if images, ok := m["images"].([]interface{}); ok {
		for _, img := range images {
			if imgMap, ok := img.(map[string]interface{}); ok {
				ct, _ := imgMap["coverType"].(string)
				if ct == "cover" || ct == "Cover" {
					// remoteUrl is the full URL, url is the proxy
					if u, ok := imgMap["remoteUrl"].(string); ok && u != "" {
						bk.CoverURL = u
					} else if u, ok := imgMap["url"].(string); ok && u != "" {
						// relative URL — prefix with apiURL later if needed
						if !strings.HasPrefix(u, "http") {
							bk.CoverURL = "" // skip relative URLs
						} else {
							bk.CoverURL = u
						}
					}
					break
				}
			}
		}
	}
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
