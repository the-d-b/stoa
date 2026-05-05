package handlers

import (
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type RSSItem struct {
	Title   string `json:"title"`
	Link    string `json:"link"`
	PubDate string `json:"pubDate,omitempty"`
}

type RSSPanelData struct {
	FeedURL string    `json:"feedUrl"`
	UIURL   string    `json:"uiUrl,omitempty"`
	Items   []RSSItem `json:"items"`
}

func fetchRSSPanelData(db *sql.DB, config map[string]interface{}) (*RSSPanelData, error) {
	integrationID, _ := config["integrationId"].(string)
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	// api_url stores the RSS feed URL; ui_url is optional link target
	var feedURL, uiURL string
	db.QueryRow(`SELECT api_url, ui_url FROM integrations WHERE id=? AND enabled=1`,
		integrationID).Scan(&feedURL, &uiURL)
	if feedURL == "" {
		return nil, fmt.Errorf("feed URL not configured")
	}

	items, err := fetchAndParseRSS(feedURL)
	if err != nil {
		return nil, fmt.Errorf("feed fetch failed: %w", err)
	}
	return &RSSPanelData{FeedURL: feedURL, UIURL: uiURL, Items: items}, nil
}

func fetchAndParseRSS(feedURL string) ([]RSSItem, error) {
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get(feedURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	bodyStr := string(body)

	extractTag := func(s, tag string) string {
		open := "<" + tag
		i := strings.Index(s, open)
		if i < 0 { return "" }
		gt := strings.Index(s[i:], ">")
		if gt < 0 { return "" }
		start := i + gt + 1
		close := "</" + tag + ">"
		end := strings.Index(s[start:], close)
		if end < 0 { return "" }
		v := strings.TrimSpace(s[start : start+end])
		if strings.HasPrefix(v, "<![CDATA[") {
			v = strings.TrimSuffix(strings.TrimPrefix(v, "<![CDATA["), "]]>")
		}
		return decodeHTMLEntities(strings.TrimSpace(v))
	}

	itemTag, closeTag := "<item>", "</item>"
	if !strings.Contains(bodyStr, "<item>") {
		itemTag, closeTag = "<entry>", "</entry>"
	}

	var items []RSSItem
	pos := 0
	for len(items) < 50 {
		start := strings.Index(bodyStr[pos:], itemTag)
		if start < 0 { break }
		start += pos
		end := strings.Index(bodyStr[start:], closeTag)
		if end < 0 { break }
		end += start + len(closeTag)
		block := bodyStr[start:end]

		title := extractTag(block, "title")
		if title == "" { pos = end; continue }

		link := extractTag(block, "link")
		if link == "" {
			li := strings.Index(block, "<link ")
			if li >= 0 {
				hrefAttr := `href="`
				hi := strings.Index(block[li:], hrefAttr)
				if hi >= 0 {
					hi += li + len(hrefAttr)
					he := strings.Index(block[hi:], `"`)
					if he >= 0 { link = block[hi : hi+he] }
				}
			}
		}
		if link == "" {
			guid := extractTag(block, "guid")
			if strings.HasPrefix(guid, "http") { link = guid }
		}

		pubDate := extractTag(block, "pubDate")
		if pubDate == "" { pubDate = extractTag(block, "published") }
		items = append(items, RSSItem{Title: title, Link: link, PubDate: pubDate})
		pos = end
	}

	if items == nil { items = []RSSItem{} }
	return items, nil
}
