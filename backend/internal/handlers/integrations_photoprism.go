package handlers

import (
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

// ── PhotoPrism types ──────────────────────────────────────────────────────────

type PhotoPrismPhoto struct {
	Hash  string `json:"hash"`
	Title string `json:"title,omitempty"`
}

type PhotoPrismPanelData struct {
	UIURL         string            `json:"uiUrl"`
	IntegrationID string            `json:"integrationId"`
	Photos        int               `json:"photos"`
	Videos        int               `json:"videos"`
	Albums        int               `json:"albums"`
	Folders       int               `json:"folders"`
	Moments       int               `json:"moments"`
	People        int               `json:"people"`
	Places        int               `json:"places"`
	Labels        int               `json:"labels"`
	Version       string            `json:"version"`
	Preview       []PhotoPrismPhoto `json:"preview,omitempty"`
}

// ── Caches ────────────────────────────────────────────────────────────────────

var (
	ppSessionTokens   = map[string]string{}
	ppSessionTokensMu sync.Mutex

	ppPreviewTokens   = map[string]string{}
	ppPreviewTokensMu sync.Mutex

	ppPhotoCache   = map[string]ppPhotoCacheEntry{}
	ppPhotoCacheMu sync.Mutex
)

type ppPhotoCacheEntry struct {
	Photos    []PhotoPrismPhoto
	ExpiresAt time.Time
}

// ppClearIntegCache clears all cached state for an integration (called on 401).
func ppClearIntegCache(integID string) {
	ppSessionTokensMu.Lock()
	delete(ppSessionTokens, integID)
	ppSessionTokensMu.Unlock()

	ppPreviewTokensMu.Lock()
	delete(ppPreviewTokens, integID)
	ppPreviewTokensMu.Unlock()
}

// ── Main fetch ────────────────────────────────────────────────────────────────

func fetchPhotoPrismPanelData(db *sql.DB, config map[string]interface{}) (*PhotoPrismPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &PhotoPrismPanelData{UIURL: uiURL, IntegrationID: integrationID}

	var token string
	if apiKey != "" {
		var err2 error
		token, err2 = ppGetToken(apiURL, apiKey, integrationID, skipTLS)
		if err2 != nil {
			return nil, fmt.Errorf("PhotoPrism auth failed: %v", err2)
		}
	}

	cfgBody, err := ppGet(apiURL, token, "/api/v1/config", skipTLS)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch PhotoPrism config: %v", err)
	}
	var cfg struct {
		Version      string `json:"version"`
		PreviewToken string `json:"previewToken"`
		DownloadToken string `json:"downloadToken"`
		Count        struct {
			Photos  int `json:"photos"`
			Videos  int `json:"videos"`
			Albums  int `json:"albums"`
			Folders int `json:"folders"`
			Moments int `json:"moments"`
			People  int `json:"people"`
			Places  int `json:"places"`
			Labels  int `json:"labels"`
		} `json:"count"`
	}
	if err := json.Unmarshal(cfgBody, &cfg); err == nil {
		data.Version  = cfg.Version
		data.Photos   = cfg.Count.Photos
		data.Videos   = cfg.Count.Videos
		data.Albums   = cfg.Count.Albums
		data.Folders  = cfg.Count.Folders
		data.Moments  = cfg.Count.Moments
		data.People   = cfg.Count.People
		data.Places   = cfg.Count.Places
		data.Labels   = cfg.Count.Labels

		// Cache the preview token
		pt := cfg.PreviewToken
		if pt == "" {
			pt = cfg.DownloadToken
		}
		if pt == "" {
			pt = "public"
		}
		ppPreviewTokensMu.Lock()
		ppPreviewTokens[integrationID] = pt
		ppPreviewTokensMu.Unlock()
	}

	// Fetch preview photos (24h cache — stable carousel across frequent refreshes).
	// forceRefresh is set by the "Refresh now" context menu to pick a new random set.
	if forceRefresh, _ := config["forceRefresh"].(bool); forceRefresh {
		ppPhotoCacheMu.Lock()
		delete(ppPhotoCache, integrationID)
		ppPhotoCacheMu.Unlock()
	}
	data.Preview = ppGetPreviewPhotos(apiURL, token, integrationID, skipTLS)

	return data, nil
}

// ppGetPreviewPhotos returns up to 6 random photos, cached 24 hours per integration.
func ppGetPreviewPhotos(apiURL, token, integID string, skipTLS bool) []PhotoPrismPhoto {
	ppPhotoCacheMu.Lock()
	entry, ok := ppPhotoCache[integID]
	if ok && time.Now().Before(entry.ExpiresAt) {
		ppPhotoCacheMu.Unlock()
		return entry.Photos
	}
	ppPhotoCacheMu.Unlock()

	body, err := ppGet(apiURL, token, "/api/v1/photos?count=6&order=random&photos=true&merged=true", skipTLS)
	if err != nil {
		log.Printf("[PhotoPrism] photo fetch error: %v", err)
		return nil
	}

	var raw []struct {
		Hash  string `json:"Hash"`
		Title string `json:"Title"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil
	}

	photos := make([]PhotoPrismPhoto, 0, len(raw))
	for _, p := range raw {
		if p.Hash != "" {
			photos = append(photos, PhotoPrismPhoto{Hash: p.Hash, Title: p.Title})
		}
	}

	ppPhotoCacheMu.Lock()
	ppPhotoCache[integID] = ppPhotoCacheEntry{
		Photos:    photos,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	ppPhotoCacheMu.Unlock()

	return photos
}

// ── Thumbnail proxy ───────────────────────────────────────────────────────────

// ProxyPhotoPrismThumbnail proxies a thumbnail request to PhotoPrism,
// keeping credentials on the backend and caching in the browser for 24h.
func ProxyPhotoPrismThumbnail(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		integID := vars["integrationId"]
		hash := vars["hash"]

		apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, integID)
		if err != nil {
			http.Error(w, "integration not found", http.StatusNotFound)
			return
		}

		var token string
		if apiKey != "" {
			token, err = ppGetToken(apiURL, apiKey, integID, skipTLS)
			if err != nil {
				http.Error(w, "auth failed", http.StatusBadGateway)
				return
			}
		}

		ppPreviewTokensMu.Lock()
		previewToken := ppPreviewTokens[integID]
		ppPreviewTokensMu.Unlock()
		if previewToken == "" {
			previewToken = "public"
		}

		thumbBody, contentType, err := ppFetchThumb(apiURL, token, previewToken, hash, skipTLS)
		if err != nil {
			// Token may have expired — clear and retry once
			ppClearIntegCache(integID)
			if apiKey != "" {
				token, err = ppGetToken(apiURL, apiKey, integID, skipTLS)
				if err != nil {
					http.Error(w, "auth refresh failed", http.StatusBadGateway)
					return
				}
			}
			thumbBody, contentType, err = ppFetchThumb(apiURL, token, previewToken, hash, skipTLS)
			if err != nil {
				http.Error(w, "thumbnail fetch failed", http.StatusBadGateway)
				return
			}
		}

		if contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}
		// Tell the browser to cache the image for 24 hours
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.Write(thumbBody)
	}
}

func ppFetchThumb(baseURL, sessionToken, previewToken, hash string, skipTLS bool) ([]byte, string, error) {
	// tile_500 gives ~500px tiles — good balance for a carousel
	thumbPath := "/api/v1/t/" + hash + "/" + previewToken + "/tile_500"
	body, err := ppGet(baseURL, sessionToken, thumbPath, skipTLS)
	if err != nil {
		return nil, "", err
	}
	// Detect content type from magic bytes
	ct := http.DetectContentType(body)
	return body, ct, nil
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

func ppGetToken(baseURL, apiKey, integID string, skipTLS bool) (string, error) {
	ppSessionTokensMu.Lock()
	token := ppSessionTokens[integID]
	ppSessionTokensMu.Unlock()

	if token != "" {
		return token, nil
	}

	username, password := "", ""
	colonIdx := strings.Index(apiKey, ":")
	if colonIdx >= 0 {
		username = apiKey[:colonIdx]
		password = apiKey[colonIdx+1:]
	} else {
		username = apiKey
	}

	loginBody := fmt.Sprintf(`{"username":%q,"password":%q}`, username, password)
	url := strings.TrimRight(baseURL, "/") + "/api/v1/session"
	req, err := http.NewRequest("POST", url, strings.NewReader(loginBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var result struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &result); err != nil || result.ID == "" {
		return "", fmt.Errorf("no session token in response")
	}

	ppSessionTokensMu.Lock()
	ppSessionTokens[integID] = result.ID
	ppSessionTokensMu.Unlock()

	return result.ID, nil
}

func ppGet(baseURL, token, path string, skipTLS bool) ([]byte, error) {
	url := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	if token != "" {
		req.Header.Set("X-Auth-Token", token)
	}
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 {
		return nil, fmt.Errorf("unauthorized — token expired")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from PhotoPrism", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func testPhotoPrismConnection(apiURL, apiKey string, skipTLS bool) error {
	token := ""
	if apiKey != "" {
		var err error
		token, err = ppGetToken(apiURL, apiKey, "test", skipTLS)
		if err != nil {
			return err
		}
	}
	_, err := ppGet(apiURL, token, "/api/v1/config", skipTLS)
	return err
}
