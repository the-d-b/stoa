package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Simple 5-minute in-memory cache for RSS panel feeds
type rssCacheEntry struct {
	items     []rssPanelItem
	fetchedAt time.Time
}

type rssPanelItem struct {
	Title   string `json:"title"`
	Link    string `json:"link"`
	PubDate string `json:"pubDate,omitempty"`
}

var (
	rssPanelCache   = map[string]rssCacheEntry{}
	rssPanelCacheMu sync.Mutex
)

func fetchRSSPanel(feedURL string) ([]rssPanelItem, error) {
	rssPanelCacheMu.Lock()
	if e, ok := rssPanelCache[feedURL]; ok && time.Since(e.fetchedAt) < 5*time.Minute {
		rssPanelCacheMu.Unlock()
		return e.items, nil
	}
	rssPanelCacheMu.Unlock()

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

	var items []rssPanelItem
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
		items = append(items, rssPanelItem{Title: title, Link: link, PubDate: pubDate})
		pos = end
	}

	rssPanelCacheMu.Lock()
	rssPanelCache[feedURL] = rssCacheEntry{items: items, fetchedAt: time.Now()}
	rssPanelCacheMu.Unlock()

	return items, nil
}

func GetRSSPanelData(w http.ResponseWriter, r *http.Request) {
	feedURL := r.URL.Query().Get("url")
	if feedURL == "" {
		writeError(w, http.StatusBadRequest, "url required")
		return
	}
	items, err := fetchRSSPanel(feedURL)
	if err != nil {
		writeError(w, http.StatusBadGateway, "feed unreachable")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"items": items})
}
