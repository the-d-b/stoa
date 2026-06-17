package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
)

type ImmichPhoto struct {
	ID    string `json:"id"`
	Title string `json:"title,omitempty"`
}

type ImmichPanelData struct {
	UIURL         string        `json:"uiUrl"`
	IntegrationID string        `json:"integrationId"`
	Photos        int           `json:"photos"`
	Videos        int           `json:"videos"`
	Usage         int64         `json:"usage"` // bytes
	Version       string        `json:"version"`
	Users         int           `json:"users"`
	Albums        int           `json:"albums"`
	People        int           `json:"people"`
	Preview       []ImmichPhoto `json:"preview,omitempty"`
}

// ── Photo cache (24h) ─────────────────────────────────────────────────────────

var (
	immichPhotoCache   = map[string]immichPhotoCacheEntry{}
	immichPhotoCacheMu sync.Mutex
)

type immichPhotoCacheEntry struct {
	Photos    []ImmichPhoto
	ExpiresAt time.Time
}

// ── Main fetch ────────────────────────────────────────────────────────────────

func fetchImmichPanelData(db *sql.DB, config map[string]interface{}) (*ImmichPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}

	data := &ImmichPanelData{UIURL: uiURL, IntegrationID: integrationID}

	// Server stats (admin key) — graceful fallback to per-user stats
	statsBody, statsErr := immichGet(apiURL, apiKey, "/api/server/statistics", skipTLS)
	if statsErr == nil {
		var stats struct {
			Photos        int   `json:"photos"`
			Videos        int   `json:"videos"`
			Usage         int64 `json:"usage"`
			UsageByUser   []struct {
				UserName string `json:"userName"`
				Photos   int    `json:"photos"`
				Videos   int    `json:"videos"`
				Usage    int64  `json:"usage"`
			} `json:"usageByUser"`
		}
		if json.Unmarshal(statsBody, &stats) == nil {
			data.Photos = stats.Photos
			data.Videos = stats.Videos
			data.Usage  = stats.Usage
			data.Users  = len(stats.UsageByUser)
		}
	} else {
		// Fallback: user-scoped asset statistics
		userBody, _ := immichGet(apiURL, apiKey, "/api/assets/statistics", skipTLS)
		if userBody != nil {
			var us struct {
				Images int `json:"images"`
				Videos int `json:"videos"`
			}
			if json.Unmarshal(userBody, &us) == nil {
				data.Photos = us.Images
				data.Videos = us.Videos
			}
		}
	}

	// Albums
	if albumsBody, aerr := immichGet(apiURL, apiKey, "/api/albums", skipTLS); aerr == nil {
		var albums []json.RawMessage
		if json.Unmarshal(albumsBody, &albums) == nil {
			data.Albums = len(albums)
		}
	}

	// People (face recognition groups)
	if peopleBody, perr := immichGet(apiURL, apiKey, "/api/people", skipTLS); perr == nil {
		var people struct {
			Total int `json:"total"`
		}
		if json.Unmarshal(peopleBody, &people) == nil && people.Total > 0 {
			data.People = people.Total
		}
	}

	// Server version
	aboutBody, _ := immichGet(apiURL, apiKey, "/api/server/about", skipTLS)
	if aboutBody != nil {
		var about struct {
			Version string `json:"version"`
		}
		if json.Unmarshal(aboutBody, &about) == nil {
			data.Version = about.Version
		}
	}

	// Preview photos (24h cache)
	if forceRefresh, _ := config["forceRefresh"].(bool); forceRefresh {
		immichPhotoCacheMu.Lock()
		delete(immichPhotoCache, integrationID)
		immichPhotoCacheMu.Unlock()
	}
	data.Preview = immichGetPreviewPhotos(apiURL, apiKey, integrationID, skipTLS)

	return data, nil
}

// immichGetPreviewPhotos returns up to 6 random photos, cached 24 hours.
func immichGetPreviewPhotos(apiURL, apiKey, integID string, skipTLS bool) []ImmichPhoto {
	immichPhotoCacheMu.Lock()
	entry, ok := immichPhotoCache[integID]
	if ok && time.Now().Before(entry.ExpiresAt) {
		immichPhotoCacheMu.Unlock()
		return entry.Photos
	}
	immichPhotoCacheMu.Unlock()

	body := []byte(`{"size":6,"type":"IMAGE"}`)
	resp, err := immichPost(apiURL, apiKey, "/api/search/random", body, skipTLS)
	if err != nil {
		log.Printf("[Immich] random photo fetch error: %v", err)
		return nil
	}

	var raw []struct {
		ID               string `json:"id"`
		OriginalFileName string `json:"originalFileName"`
	}
	if err := json.Unmarshal(resp, &raw); err != nil {
		return nil
	}

	photos := make([]ImmichPhoto, 0, len(raw))
	for _, p := range raw {
		if p.ID == "" {
			continue
		}
		title := strings.TrimSuffix(p.OriginalFileName,
			"."+strings.ToLower(p.OriginalFileName[strings.LastIndex(p.OriginalFileName, ".")+1:]))
		if idx := strings.LastIndex(p.OriginalFileName, "."); idx >= 0 {
			title = p.OriginalFileName[:idx]
		} else {
			title = p.OriginalFileName
		}
		photos = append(photos, ImmichPhoto{ID: p.ID, Title: title})
	}

	immichPhotoCacheMu.Lock()
	immichPhotoCache[integID] = immichPhotoCacheEntry{
		Photos:    photos,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	immichPhotoCacheMu.Unlock()

	return photos
}

// ── Thumbnail proxy ───────────────────────────────────────────────────────────

// ProxyImmichThumbnail proxies a thumbnail request to Immich, keeping
// credentials on the backend and caching in the browser for 24h.
func ProxyImmichThumbnail(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		integID := vars["integrationId"]
		assetID := vars["assetId"]

		apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, integID)
		if err != nil {
			http.Error(w, "integration not found", http.StatusNotFound)
			return
		}

		thumbURL := strings.TrimRight(apiURL, "/") + "/api/assets/" + assetID + "/thumbnail?size=preview"
		req, err := http.NewRequest("GET", thumbURL, nil)
		if err != nil {
			http.Error(w, "request error", http.StatusBadGateway)
			return
		}
		req.Header.Set("x-api-key", apiKey)

		resp, err := httpClient(skipTLS).Do(req)
		if err != nil {
			http.Error(w, "thumbnail fetch failed", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 400 {
			http.Error(w, "thumbnail unavailable", resp.StatusCode)
			return
		}

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			http.Error(w, "read error", http.StatusBadGateway)
			return
		}

		ct := resp.Header.Get("Content-Type")
		if ct == "" {
			ct = http.DetectContentType(body)
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.Write(body)
	}
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

func immichGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	u := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("Accept", "application/json")
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Immich", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func immichPost(baseURL, apiKey, path string, body []byte, skipTLS bool) ([]byte, error) {
	u := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("POST", u, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Immich", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func testImmichConnection(apiURL, apiKey string, skipTLS ...bool) error {
	skip := len(skipTLS) > 0 && skipTLS[0]
	_, err := immichGet(apiURL, apiKey, "/api/server/about", skip)
	return err
}
