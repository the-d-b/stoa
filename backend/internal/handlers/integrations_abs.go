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

	"github.com/gorilla/mux"
)

// ── ABS types ─────────────────────────────────────────────────────────────────

type ABSTrack struct {
	Filename    string  `json:"filename"`
	StartOffset float64 `json:"startOffset"`
	Duration    float64 `json:"duration"`
}

type ABSInProgressItem struct {
	ID             string  `json:"id"`
	MediaType      string  `json:"mediaType"`
	Title          string  `json:"title"`
	Author         string  `json:"author"`
	CurrentTime    float64 `json:"currentTime"`
	Duration       float64 `json:"duration"`
	Progress       float64 `json:"progress"`
	TrackFile      string  `json:"trackFile"`
	TrackLocalTime float64 `json:"trackLocalTime"`
}

type ABSPanelData struct {
	UIURL              string              `json:"uiUrl"`
	IntegrationID      string              `json:"integrationId"`
	BookCount          int                 `json:"bookCount"`
	PodcastCount       int                 `json:"podcastCount"`
	TotalListeningTime float64             `json:"totalListeningTime"`
	ItemsFinished      int                 `json:"itemsFinished"`
	InProgress         []ABSInProgressItem `json:"inProgress"`
}

// ── Token cache ───────────────────────────────────────────────────────────────

var (
	absTokens   = map[string]string{} // integID → JWT
	absTokensMu sync.Mutex

	// integID+itemID → []ABSTrack (item track info, 24h not needed — cleared on re-fetch)
	absTrackCache   = map[string][]ABSTrack{}
	absTrackCacheMu sync.Mutex
)

func absGetToken(baseURL, apiKey, integID string, skipTLS bool) (string, error) {
	absTokensMu.Lock()
	tok := absTokens[integID]
	absTokensMu.Unlock()
	if tok != "" {
		return tok, nil
	}

	// Support both "username:password" and bare API key
	var body string
	if colonIdx := strings.Index(apiKey, ":"); colonIdx >= 0 {
		username := apiKey[:colonIdx]
		password := apiKey[colonIdx+1:]
		body = fmt.Sprintf(`{"username":%q,"password":%q}`, username, password)
	} else {
		// Treat bare value as an API key (ABS API keys work as Bearer tokens directly)
		absTokensMu.Lock()
		absTokens[integID] = apiKey
		absTokensMu.Unlock()
		return apiKey, nil
	}

	loginURL := strings.TrimRight(baseURL, "/") + "/login"
	req, err := http.NewRequest("POST", loginURL, strings.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("ABS login failed: HTTP %d", resp.StatusCode)
	}
	respBody, _ := io.ReadAll(resp.Body)

	var result struct {
		User struct {
			Token string `json:"token"`
		} `json:"user"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil || result.User.Token == "" {
		return "", fmt.Errorf("no token in ABS login response")
	}

	absTokensMu.Lock()
	absTokens[integID] = result.User.Token
	absTokensMu.Unlock()
	return result.User.Token, nil
}

func absClearToken(integID string) {
	absTokensMu.Lock()
	delete(absTokens, integID)
	absTokensMu.Unlock()
}

func absGet(baseURL, token, path string, skipTLS bool) ([]byte, error) {
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("unauthorized")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from ABS", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Track resolution ──────────────────────────────────────────────────────────

// absGetTracks returns the audio tracks for an item (cached per item).
func absGetTracks(apiURL, token, itemID string, skipTLS bool) []ABSTrack {
	absTrackCacheMu.Lock()
	cached, ok := absTrackCache[itemID]
	absTrackCacheMu.Unlock()
	if ok {
		return cached
	}

	body, err := absGet(apiURL, token, "/api/items/"+itemID, skipTLS)
	if err != nil {
		return nil
	}

	var item struct {
		Media struct {
			AudioFiles []struct {
				Ino      string  `json:"ino"`
				Duration float64 `json:"duration"`
				Metadata struct {
					Filename string `json:"filename"`
				} `json:"metadata"`
			} `json:"audioFiles"`
			Tracks []struct {
				Filename    string  `json:"filename"`
				StartOffset float64 `json:"startOffset"`
				Duration    float64 `json:"duration"`
			} `json:"tracks"`
		} `json:"media"`
	}
	if err := json.Unmarshal(body, &item); err != nil {
		return nil
	}

	var tracks []ABSTrack

	// Prefer media.tracks (pre-calculated offsets); fall back to audioFiles
	if len(item.Media.Tracks) > 0 {
		for _, t := range item.Media.Tracks {
			tracks = append(tracks, ABSTrack{
				Filename:    t.Filename,
				StartOffset: t.StartOffset,
				Duration:    t.Duration,
			})
		}
	} else if len(item.Media.AudioFiles) > 0 {
		var offset float64
		for _, af := range item.Media.AudioFiles {
			tracks = append(tracks, ABSTrack{
				Filename:    af.Metadata.Filename,
				StartOffset: offset,
				Duration:    af.Duration,
			})
			offset += af.Duration
		}
	}

	absTrackCacheMu.Lock()
	absTrackCache[itemID] = tracks
	absTrackCacheMu.Unlock()
	return tracks
}

// absTrackForTime finds the track file and local time for a global position.
func absTrackForTime(tracks []ABSTrack, currentTime float64) (filename string, localTime float64) {
	if len(tracks) == 0 {
		return "", currentTime
	}
	for _, t := range tracks {
		if currentTime <= t.StartOffset+t.Duration {
			return t.Filename, currentTime - t.StartOffset
		}
	}
	last := tracks[len(tracks)-1]
	return last.Filename, last.Duration
}

// ── Main fetch ────────────────────────────────────────────────────────────────

func fetchABSPanelData(db *sql.DB, config map[string]interface{}) (*ABSPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &ABSPanelData{
		UIURL:         uiURL,
		IntegrationID: integrationID,
		InProgress:    []ABSInProgressItem{},
	}

	token, err := absGetToken(apiURL, apiKey, integrationID, skipTLS)
	if err != nil {
		return nil, fmt.Errorf("ABS auth failed: %v", err)
	}

	get := func(path string) ([]byte, error) {
		body, gerr := absGet(apiURL, token, path, skipTLS)
		if gerr != nil && strings.Contains(gerr.Error(), "unauthorized") {
			absClearToken(integrationID)
			token, err = absGetToken(apiURL, apiKey, integrationID, skipTLS)
			if err != nil {
				return nil, err
			}
			return absGet(apiURL, token, path, skipTLS)
		}
		return body, gerr
	}

	// Libraries — count books and podcasts
	if libBody, lerr := get("/api/libraries"); lerr == nil {
		var resp struct {
			Libraries []struct {
				MediaType string `json:"mediaType"`
				Stats     struct {
					TotalItems int `json:"totalItems"`
				} `json:"stats"`
			} `json:"libraries"`
		}
		if json.Unmarshal(libBody, &resp) == nil {
			for _, lib := range resp.Libraries {
				switch lib.MediaType {
				case "book":
					data.BookCount += lib.Stats.TotalItems
				case "podcast":
					data.PodcastCount += lib.Stats.TotalItems
				}
			}
		}
	} else {
		log.Printf("[ABS] libraries error: %v", lerr)
	}

	// User — current user ID for stats
	userID := ""
	if meBody, merr := get("/api/me"); merr == nil {
		var me struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(meBody, &me) == nil {
			userID = me.ID
		}
	}

	// User listening stats
	if userID != "" {
		if statsBody, serr := get("/api/users/" + userID + "/listening-stats"); serr == nil {
			var stats struct {
				TotalListeningTime float64 `json:"totalListeningTime"`
				ItemsFinished      int     `json:"itemsFinished"`
			}
			if json.Unmarshal(statsBody, &stats) == nil {
				data.TotalListeningTime = stats.TotalListeningTime
				data.ItemsFinished = stats.ItemsFinished
			}
		}
	}

	// In-progress items
	if progBody, perr := get("/api/me/items-in-progress?limit=5"); perr == nil {
		var resp struct {
			Results []struct {
				ID        string `json:"id"`
				MediaType string `json:"mediaType"`
				Media     struct {
					Metadata struct {
						Title    string `json:"title"`
						Author   string `json:"author"`
						Duration float64 `json:"duration"`
					} `json:"metadata"`
				} `json:"media"`
				Progress struct {
					CurrentTime float64 `json:"currentTime"`
					Duration    float64 `json:"duration"`
					Progress    float64 `json:"progress"`
					IsFinished  bool    `json:"isFinished"`
				} `json:"progress"`
			} `json:"results"`
		}
		if json.Unmarshal(progBody, &resp) == nil {
			for _, r := range resp.Results {
				if r.Progress.IsFinished {
					continue
				}
				item := ABSInProgressItem{
					ID:          r.ID,
					MediaType:   r.MediaType,
					Title:       r.Media.Metadata.Title,
					Author:      r.Media.Metadata.Author,
					CurrentTime: r.Progress.CurrentTime,
					Duration:    r.Progress.Duration,
					Progress:    r.Progress.Progress,
				}
				if item.Duration == 0 {
					item.Duration = r.Media.Metadata.Duration
				}

				// Resolve track file and local time for the stream proxy
				tracks := absGetTracks(apiURL, token, r.ID, skipTLS)
				item.TrackFile, item.TrackLocalTime = absTrackForTime(tracks, item.CurrentTime)

				data.InProgress = append(data.InProgress, item)
			}
		}
	} else {
		log.Printf("[ABS] in-progress error: %v", perr)
	}

	return data, nil
}

// ── Cover proxy ───────────────────────────────────────────────────────────────

func ProxyABSCover(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		integID := vars["integrationId"]
		itemID := vars["itemId"]

		apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, integID)
		if err != nil {
			http.Error(w, "integration not found", http.StatusNotFound)
			return
		}
		token, err := absGetToken(apiURL, apiKey, integID, skipTLS)
		if err != nil {
			http.Error(w, "auth failed", http.StatusBadGateway)
			return
		}

		body, err := absGet(apiURL, token, "/api/items/"+itemID+"/cover?width=300", skipTLS)
		if err != nil {
			absClearToken(integID)
			token, err = absGetToken(apiURL, apiKey, integID, skipTLS)
			if err != nil {
				http.Error(w, "auth refresh failed", http.StatusBadGateway)
				return
			}
			body, err = absGet(apiURL, token, "/api/items/"+itemID+"/cover?width=300", skipTLS)
			if err != nil {
				http.Error(w, "cover fetch failed", http.StatusBadGateway)
				return
			}
		}

		w.Header().Set("Content-Type", http.DetectContentType(body))
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.Write(body)
	}
}

// ── Stream proxy ──────────────────────────────────────────────────────────────

// ProxyABSStream proxies audio file streaming from ABS, forwarding Range headers
// so the browser can seek within the track. The ?track= query param selects the file.
func ProxyABSStream(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		integID := vars["integrationId"]
		itemID := vars["itemId"]
		trackFile := r.URL.Query().Get("track")

		apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, integID)
		if err != nil {
			http.Error(w, "integration not found", http.StatusNotFound)
			return
		}
		token, err := absGetToken(apiURL, apiKey, integID, skipTLS)
		if err != nil {
			http.Error(w, "auth failed", http.StatusBadGateway)
			return
		}

		// If no track specified, use the first track for the item
		if trackFile == "" {
			tracks := absGetTracks(apiURL, token, itemID, skipTLS)
			if len(tracks) > 0 {
				trackFile = tracks[0].Filename
			}
		}

		streamURL := strings.TrimRight(apiURL, "/") + "/s/item/" + itemID + "/" + trackFile

		absReq, err := http.NewRequest("GET", streamURL, nil)
		if err != nil {
			http.Error(w, "bad stream URL", http.StatusInternalServerError)
			return
		}
		absReq.Header.Set("Authorization", "Bearer "+token)

		// Forward Range header so the browser can seek
		if rangeHdr := r.Header.Get("Range"); rangeHdr != "" {
			absReq.Header.Set("Range", rangeHdr)
		}

		client := httpClient(skipTLS)
		// Disable response body auto-close so we can stream
		client.CheckRedirect = nil

		resp, err := client.Do(absReq)
		if err != nil {
			http.Error(w, "stream fetch failed", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		// Forward relevant headers
		for _, h := range []string{
			"Content-Type", "Content-Length", "Content-Range",
			"Accept-Ranges", "Last-Modified", "ETag",
		} {
			if v := resp.Header.Get(h); v != "" {
				w.Header().Set(h, v)
			}
		}
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
	}
}

// ── Progress sync ─────────────────────────────────────────────────────────────

// SyncABSProgress accepts {currentTime, duration, progress} from the frontend
// and PATCHes it to ABS so the listening position is preserved.
func SyncABSProgress(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		integID := vars["integrationId"]
		itemID := vars["itemId"]

		var req struct {
			CurrentTime float64 `json:"currentTime"`
			Duration    float64 `json:"duration"`
			Progress    float64 `json:"progress"`
			IsFinished  bool    `json:"isFinished"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "bad request")
			return
		}

		apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, integID)
		if err != nil {
			writeError(w, http.StatusNotFound, "integration not found")
			return
		}
		token, err := absGetToken(apiURL, apiKey, integID, skipTLS)
		if err != nil {
			writeError(w, http.StatusBadGateway, "auth failed")
			return
		}

		patchBody := fmt.Sprintf(`{"currentTime":%f,"duration":%f,"progress":%f,"isFinished":%v}`,
			req.CurrentTime, req.Duration, req.Progress, req.IsFinished)

		patchURL := strings.TrimRight(apiURL, "/") + "/api/me/progress/" + itemID
		patchReq, err := http.NewRequest("PATCH", patchURL, strings.NewReader(patchBody))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to build request")
			return
		}
		patchReq.Header.Set("Content-Type", "application/json")
		patchReq.Header.Set("Authorization", "Bearer "+token)

		resp, err := httpClient(skipTLS).Do(patchReq)
		if err != nil {
			writeError(w, http.StatusBadGateway, "progress sync failed")
			return
		}
		defer resp.Body.Close()
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Test ──────────────────────────────────────────────────────────────────────

func testABSConnection(apiURL, apiKey string, skipTLS bool) error {
	token, err := absGetToken(apiURL, apiKey, "test", skipTLS)
	if err != nil {
		return err
	}
	_, err = absGet(apiURL, token, "/api/libraries", skipTLS)
	return err
}
