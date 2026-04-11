package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ── Shared arr HTTP helper ────────────────────────────────────────────────────

func arrGet(apiURL, apiKey, path string) ([]byte, error) {
	url := strings.TrimRight(apiURL, "/") + path
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	if apiKey != "" {
		req.Header.Set("X-Api-Key", apiKey)
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from %s", resp.StatusCode, url)
	}
	return io.ReadAll(resp.Body)
}

// ── Series/movie cache ────────────────────────────────────────────────────────
// The full library list is large (2-3MB for big libraries).
// Cache it per (apiURL+type) with a 5-minute TTL.

type arrCacheEntry struct {
	items     []map[string]interface{}
	fetchedAt time.Time
}

var (
	arrCacheMu sync.Mutex
	arrCache   = map[string]*arrCacheEntry{}
)

const arrCacheTTL = 5 * time.Minute

func getCachedArr(apiURL, apiKey, itemType string) ([]map[string]interface{}, error) {
	key := apiURL + "|" + itemType
	arrCacheMu.Lock()
	entry := arrCache[key]
	arrCacheMu.Unlock()

	if entry != nil && time.Since(entry.fetchedAt) < arrCacheTTL {
		log.Printf("[%s] cache hit (age=%s)", strings.ToUpper(itemType), time.Since(entry.fetchedAt).Round(time.Second))
		return entry.items, nil
	}

	log.Printf("[%s] cache miss — fetching from API", strings.ToUpper(itemType))

	var path string
	switch itemType {
	case "radarr":
		path = "/api/v3/movie"
	case "lidarr":
		path = "/api/v1/artist"
	case "readarr":
		path = "/api/v1/book"
	default: // sonarr
		path = "/api/v3/series"
	}

	data, err := arrGet(apiURL, apiKey, path)
	if err != nil {
		if entry != nil {
			log.Printf("[%s] fetch failed, using stale cache: %v", strings.ToUpper(itemType), err)
			return entry.items, nil
		}
		return nil, err
	}

	var items []map[string]interface{}
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, fmt.Errorf("unmarshal error: %v", err)
	}

	arrCacheMu.Lock()
	arrCache[key] = &arrCacheEntry{items: items, fetchedAt: time.Now()}
	arrCacheMu.Unlock()

	log.Printf("[%s] fetched %d items", strings.ToUpper(itemType), len(items))
	return items, nil
}

// stringVal safely extracts a string from a map.
func stringVal(m map[string]interface{}, key string) string {
	v, _ := m[key].(string)
	return v
}
