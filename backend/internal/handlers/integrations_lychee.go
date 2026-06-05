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
	"sync"
	"time"

	"github.com/gorilla/mux"
)

// ── Lychee types ──────────────────────────────────────────────────────────────

type LycheePhoto struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	ThumbURL string `json:"thumbUrl"`
}

type LycheePanelData struct {
	UIURL         string        `json:"uiUrl"`
	IntegrationID string        `json:"integrationId"`
	Photos        int           `json:"photos"`
	Albums        int           `json:"albums"`
	Users         int           `json:"users"`
	Storage       int64         `json:"storage"`
	Preview       []LycheePhoto `json:"preview,omitempty"`
}

// ── Caches ────────────────────────────────────────────────────────────────────

var (
	lycheeSessionTokens   = map[string]string{}
	lycheeSessionTokensMu sync.Mutex

	lycheePhotoCache   = map[string]lycheePhotoCacheEntry{}
	lycheePhotoCacheMu sync.Mutex
)

type lycheePhotoCacheEntry struct {
	Photos    []LycheePhoto
	ExpiresAt time.Time
}

func lycheeClearSession(integID string) {
	lycheeSessionTokensMu.Lock()
	delete(lycheeSessionTokens, integID)
	lycheeSessionTokensMu.Unlock()
}

// ── Auth ──────────────────────────────────────────────────────────────────────

// lycheeLogin logs in with username:password and caches the lychee_session cookie.
func lycheeGetSession(baseURL, apiKey, integID string, skipTLS bool) (string, error) {
	lycheeSessionTokensMu.Lock()
	tok := lycheeSessionTokens[integID]
	lycheeSessionTokensMu.Unlock()
	if tok != "" {
		return tok, nil
	}

	username, password := "", ""
	if idx := strings.Index(apiKey, ":"); idx >= 0 {
		username = apiKey[:idx]
		password = apiKey[idx+1:]
	} else {
		return "", fmt.Errorf("Lychee API key must be in username:password format")
	}

	loginBody := fmt.Sprintf(`{"username":%q,"password":%q}`, username, password)
	loginURL := strings.TrimRight(baseURL, "/") + "/api/v2/Auth::login"
	req, err := http.NewRequest("POST", loginURL, strings.NewReader(loginBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	io.ReadAll(resp.Body) // drain
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("Lychee login failed: HTTP %d", resp.StatusCode)
	}

	session := ""
	for _, c := range resp.Cookies() {
		if c.Name == "lychee_session" {
			session = c.Value
			break
		}
	}
	// Also check XSRF/laravel_session as fallback names
	if session == "" {
		for _, c := range resp.Cookies() {
			if strings.Contains(strings.ToLower(c.Name), "session") {
				session = c.Name + "=" + c.Value
				break
			}
		}
	}
	if session == "" {
		return "", fmt.Errorf("no session cookie returned from Lychee login")
	}

	lycheeSessionTokensMu.Lock()
	lycheeSessionTokens[integID] = session
	lycheeSessionTokensMu.Unlock()
	return session, nil
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func lycheeGet(baseURL, session, path string, skipTLS bool) ([]byte, error) {
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Cookie", "lychee_session="+session)
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("unauthorized")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Lychee", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Main fetch ────────────────────────────────────────────────────────────────

func fetchLycheePanelData(db *sql.DB, config map[string]interface{}) (*LycheePanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &LycheePanelData{UIURL: uiURL, IntegrationID: integrationID}

	session, err := lycheeGetSession(apiURL, apiKey, integrationID, skipTLS)
	if err != nil {
		return nil, fmt.Errorf("Lychee auth failed: %v", err)
	}

	// Retry helper — clears session and re-auths on 401.
	get := func(path string) ([]byte, error) {
		body, gerr := lycheeGet(apiURL, session, path, skipTLS)
		if gerr != nil && strings.Contains(gerr.Error(), "unauthorized") {
			lycheeClearSession(integrationID)
			session, err = lycheeGetSession(apiURL, apiKey, integrationID, skipTLS)
			if err != nil {
				return nil, err
			}
			return lycheeGet(apiURL, session, path, skipTLS)
		}
		return body, gerr
	}

	// Server stats (admin endpoint)
	if statsBody, serr := get("/api/v2/Admin/Stats"); serr == nil {
		var stats struct {
			PhotosCount int   `json:"photos_count"`
			AlbumsCount int   `json:"albums_count"`
			UsersCount  int   `json:"users_count"`
			StorageBytes int64 `json:"storage_bytes"`
		}
		if json.Unmarshal(statsBody, &stats) == nil {
			data.Photos  = stats.PhotosCount
			data.Albums  = stats.AlbumsCount
			data.Users   = stats.UsersCount
			data.Storage = stats.StorageBytes
		}
	} else {
		log.Printf("[Lychee] stats error: %v", serr)
	}

	// Preview photos (24h cache)
	if forceRefresh, _ := config["forceRefresh"].(bool); forceRefresh {
		lycheePhotoCacheMu.Lock()
		delete(lycheePhotoCache, integrationID)
		lycheePhotoCacheMu.Unlock()
	}
	data.Preview = lycheeGetPreviewPhotos(apiURL, session, integrationID, skipTLS)

	return data, nil
}

// lycheeGetPreviewPhotos returns up to 6 photos from the recent smart album, cached 24h.
func lycheeGetPreviewPhotos(baseURL, session, integID string, skipTLS bool) []LycheePhoto {
	lycheePhotoCacheMu.Lock()
	entry, ok := lycheePhotoCache[integID]
	if ok && time.Now().Before(entry.ExpiresAt) {
		lycheePhotoCacheMu.Unlock()
		return entry.Photos
	}
	lycheePhotoCacheMu.Unlock()

	body, err := lycheeGet(baseURL, session, "/api/v2/Album::photos?album_id=recent&page=1", skipTLS)
	if err != nil {
		log.Printf("[Lychee] preview fetch error: %v", err)
		return nil
	}

	var resp struct {
		Photos []struct {
			ID    string `json:"id"`
			Title string `json:"title"`
			SizeVariants struct {
				Small *struct{ URL string `json:"url"` } `json:"small"`
				Thumb *struct{ URL string `json:"url"` } `json:"thumb"`
			} `json:"size_variants"`
		} `json:"photos"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil
	}

	photos := make([]LycheePhoto, 0, 6)
	for _, p := range resp.Photos {
		if len(photos) >= 6 {
			break
		}
		thumbURL := ""
		if p.SizeVariants.Small != nil && p.SizeVariants.Small.URL != "" {
			thumbURL = lycheeURLPath(baseURL, p.SizeVariants.Small.URL)
		} else if p.SizeVariants.Thumb != nil && p.SizeVariants.Thumb.URL != "" {
			thumbURL = lycheeURLPath(baseURL, p.SizeVariants.Thumb.URL)
		}
		if thumbURL == "" || p.ID == "" {
			continue
		}
		photos = append(photos, LycheePhoto{ID: p.ID, Title: p.Title, ThumbURL: thumbURL})
	}

	lycheePhotoCacheMu.Lock()
	lycheePhotoCache[integID] = lycheePhotoCacheEntry{
		Photos:    photos,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	lycheePhotoCacheMu.Unlock()

	return photos
}

// lycheeURLPath extracts the path (and query) from a full URL, stripping the base.
// If the full URL starts with baseURL, strip it; otherwise assume it's already a path.
func lycheeURLPath(baseURL, fullURL string) string {
	base := strings.TrimRight(baseURL, "/")
	if strings.HasPrefix(fullURL, base) {
		return fullURL[len(base):]
	}
	// Parse and return path+query only
	if u, err := url.Parse(fullURL); err == nil {
		p := u.Path
		if u.RawQuery != "" {
			p += "?" + u.RawQuery
		}
		return p
	}
	return fullURL
}

// ── Thumbnail proxy ───────────────────────────────────────────────────────────

// ProxyLycheeThumbnail proxies image requests to Lychee, keeping the session
// cookie on the backend and caching the result in the browser for 24h.
// The image path is passed via the ?src= query parameter.
func ProxyLycheeThumbnail(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integID := mux.Vars(r)["integrationId"]
		srcPath := r.URL.Query().Get("src")
		if srcPath == "" {
			http.Error(w, "src required", http.StatusBadRequest)
			return
		}

		apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, integID)
		if err != nil {
			http.Error(w, "integration not found", http.StatusNotFound)
			return
		}

		session, err := lycheeGetSession(apiURL, apiKey, integID, skipTLS)
		if err != nil {
			http.Error(w, "auth failed", http.StatusBadGateway)
			return
		}

		body, err := lycheeGet(apiURL, session, srcPath, skipTLS)
		if err != nil {
			lycheeClearSession(integID)
			session, err = lycheeGetSession(apiURL, apiKey, integID, skipTLS)
			if err != nil {
				http.Error(w, "auth refresh failed", http.StatusBadGateway)
				return
			}
			body, err = lycheeGet(apiURL, session, srcPath, skipTLS)
			if err != nil {
				http.Error(w, "image fetch failed", http.StatusBadGateway)
				return
			}
		}

		w.Header().Set("Content-Type", http.DetectContentType(body))
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.Write(body)
	}
}

// ── Test ──────────────────────────────────────────────────────────────────────

func testLycheeConnection(apiURL, apiKey string, skipTLS bool) error {
	_, err := lycheeGetSession(apiURL, apiKey, "test", skipTLS)
	return err
}
