package handlers

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Package-level HTTP clients with connection pooling and TLS session reuse.
// Creating a new client per request defeats keep-alive and TLS resumption.
var (
	_httpClient *http.Client
	_httpClientSkipTLS *http.Client
	_httpClientOnce    sync.Once
	_httpClientSkipTLSOnce sync.Once
)

func httpClient(skipTLS bool) *http.Client {
	if skipTLS {
		_httpClientSkipTLSOnce.Do(func() {
			_httpClientSkipTLS = &http.Client{
				Timeout: 15 * time.Second,
				Transport: &http.Transport{
					TLSClientConfig:     &tls.Config{InsecureSkipVerify: true}, //nolint:gosec
					MaxIdleConns:        50,
					MaxIdleConnsPerHost: 10,
					IdleConnTimeout:     90 * time.Second,
					TLSHandshakeTimeout: 10 * time.Second,
				},
			}
		})
		return _httpClientSkipTLS
	}
	_httpClientOnce.Do(func() {
		_httpClient = &http.Client{
			Timeout: 15 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        50,
				MaxIdleConnsPerHost: 10,
				IdleConnTimeout:     90 * time.Second,
				TLSHandshakeTimeout: 10 * time.Second,
			},
		}
	})
	return _httpClient
}

// ── Shared arr HTTP helper ────────────────────────────────────────────────────

func arrGet(apiURL, apiKey, path string, skipTLS ...bool) ([]byte, error) {
	url := strings.TrimRight(apiURL, "/") + path
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	if apiKey != "" {
		req.Header.Set("X-Api-Key", apiKey)
	}
	client := httpClient(len(skipTLS) > 0 && skipTLS[0])
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

func getCachedArr(apiURL, apiKey, itemType string, skipTLS ...bool) ([]map[string]interface{}, error) {
	skip := len(skipTLS) > 0 && skipTLS[0]
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
	default: // sonarr
		path = "/api/v3/series"
	}

	data, err := arrGet(apiURL, apiKey, path, skip)
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

