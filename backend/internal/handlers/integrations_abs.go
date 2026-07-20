package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"

	"github.com/gorilla/mux"
)

// ── ABS types ─────────────────────────────────────────────────────────────────

type ABSTrack struct {
	Index       int     `json:"index"` // 1-based track number, used in /public/session/{id}/track/N
	Filename    string  `json:"filename"`
	StartOffset float64 `json:"startOffset"` // seconds from start of book
	Duration    float64 `json:"duration"`
}

type ABSInProgressItem struct {
	ID          string     `json:"id"`
	MediaType   string     `json:"mediaType"`
	Title       string     `json:"title"`
	Author      string     `json:"author"`
	CurrentTime float64    `json:"currentTime"`
	Duration    float64    `json:"duration"`
	Progress    float64    `json:"progress"`
	EpisodeID   string     `json:"episodeId"` // non-empty for podcast items
	HasAudio    bool       `json:"hasAudio"`  // false for ebooks (no audio tracks)
	Tracks      []ABSTrack `json:"tracks"`    // non-empty for multi-track audiobooks
}

type ABSLibrary struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	MediaType string `json:"mediaType"`
	ItemCount int    `json:"itemCount"`
}

type ABSPanelData struct {
	UIURL              string              `json:"uiUrl"`
	IntegrationID      string              `json:"integrationId"`
	Libraries          []ABSLibrary        `json:"libraries"`
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

	// "integID:itemID:episodeID" → ABS playback session ID
	absSessionCache   = map[string]string{}
	absSessionCacheMu sync.Mutex
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

// ── Session management ────────────────────────────────────────────────────────

// createABSSession opens a playback session on ABS and returns the session ID.
// ABS streams audio from /public/session/{id}/track/N — no static file access needed.
func createABSSession(apiURL, token, itemID, episodeID string, skipTLS bool) (string, error) {
	path := "/api/items/" + itemID + "/play"
	if episodeID != "" {
		path += "/" + episodeID
	}
	body := `{"deviceInfo":{"deviceId":"stoa","clientName":"Stoa"},"mediaPlayer":"stoa","forceTranscode":false,"supportedMimeTypes":["audio/mpeg","audio/mp4","audio/aac","audio/ogg","audio/opus","audio/flac","audio/x-flac","audio/wav","audio/webm"]}`
	req, err := http.NewRequest("POST", strings.TrimRight(apiURL, "/")+path, strings.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		trunc := string(respBody)
		if len(trunc) > 200 {
			trunc = trunc[:200]
		}
		return "", fmt.Errorf("ABS session create HTTP %d: %s", resp.StatusCode, trunc)
	}

	var session struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(respBody, &session); err != nil || session.ID == "" {
		trunc := string(respBody)
		if len(trunc) > 200 {
			trunc = trunc[:200]
		}
		return "", fmt.Errorf("ABS session create: bad response: %s", trunc)
	}
	logDebugf("ABS", "session created: %s (item=%s episode=%s)", session.ID, itemID, episodeID)
	return session.ID, nil
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
		for i, t := range item.Media.Tracks {
			tracks = append(tracks, ABSTrack{
				Index:       i + 1,
				Filename:    t.Filename,
				StartOffset: t.StartOffset,
				Duration:    t.Duration,
			})
		}
	} else if len(item.Media.AudioFiles) > 0 {
		var offset float64
		for i, af := range item.Media.AudioFiles {
			tracks = append(tracks, ABSTrack{
				Index:       i + 1,
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
		Libraries:     []ABSLibrary{},
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

	// Libraries — list, then fetch stats per library (ABS does not embed stats in the list response)
	if libBody, lerr := get("/api/libraries"); lerr == nil {
		var libResp struct {
			Libraries []struct {
				ID        string `json:"id"`
				Name      string `json:"name"`
				MediaType string `json:"mediaType"`
			} `json:"libraries"`
		}
		if jerr := json.Unmarshal(libBody, &libResp); jerr != nil {
			logErrorf("ABS", "libraries parse error: %v", jerr)
		} else {
			logDebugf("ABS", "libraries: %d found", len(libResp.Libraries))
			for _, lib := range libResp.Libraries {
				// /api/libraries/{id}/items?limit=0 returns total count without transferring items
				if itemsBody, ierr := get("/api/libraries/" + lib.ID + "/items?limit=0"); ierr == nil {
					var page struct {
						Total int `json:"total"`
					}
					if json.Unmarshal(itemsBody, &page) == nil {
						logDebugf("ABS", "  library %q type=%q total=%d", lib.Name, lib.MediaType, page.Total)
						data.Libraries = append(data.Libraries, ABSLibrary{
							ID:        lib.ID,
							Name:      lib.Name,
							MediaType: lib.MediaType,
							ItemCount: page.Total,
						})
					}
				} else {
					logErrorf("ABS", "  library %q items error: %v", lib.Name, ierr)
				}
			}
			logDebugf("ABS", "libraries built: %d", len(data.Libraries))
		}
	} else {
		logErrorf("ABS", "libraries error: %v", lerr)
	}

	// User — current user ID for stats
	userID := ""
	if meBody, merr := get("/api/me"); merr == nil {
		logDebugf("ABS", "/api/me response (%d bytes): %.200s", len(meBody), meBody)
		var me struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(meBody, &me) == nil {
			userID = me.ID
			logDebugf("ABS", "userID=%s", userID)
		}
	} else {
		logErrorf("ABS", "/api/me error: %v", merr)
	}

	// User listening stats
	if userID != "" {
		if statsBody, serr := get("/api/users/" + userID + "/listening-stats"); serr == nil {
			logDebugf("ABS", "listening-stats response (%d bytes): %.400s", len(statsBody), statsBody)
			var stats struct {
				TotalTime     float64 `json:"totalTime"`
				ItemsFinished int     `json:"numItemsFinished"`
			}
			if jerr := json.Unmarshal(statsBody, &stats); jerr != nil {
				logErrorf("ABS", "listening-stats parse error: %v", jerr)
			} else {
				data.TotalListeningTime = stats.TotalTime
				data.ItemsFinished = stats.ItemsFinished
				logDebugf("ABS", "listening-stats: totalTime=%.0f finished=%d", stats.TotalTime, stats.ItemsFinished)
			}
		} else {
			logErrorf("ABS", "listening-stats error: %v", serr)
		}
	}

	// In-progress items — ABS returns libraryItems[] with userMediaProgress nested.
	// For podcasts, progress is per-episode and lives in recentEpisode.userEpisodeProgress.
	if progBody, perr := get("/api/me/items-in-progress?limit=5"); perr == nil {
		logDebugf("ABS", "items-in-progress response (%d bytes): %.800s", len(progBody), progBody)
		var resp struct {
			LibraryItems []struct {
				ID        string `json:"id"`
				MediaType string `json:"mediaType"`
				Media     struct {
					Metadata struct {
						Title      string  `json:"title"`
						AuthorName string  `json:"authorName"` // books
						Author     string  `json:"author"`     // podcasts
						Duration   float64 `json:"duration"`
					} `json:"metadata"`
					NumAudioFiles int `json:"numAudioFiles"` // 0 for ebooks
				} `json:"media"`
				UserMediaProgress struct {
					CurrentTime float64 `json:"currentTime"`
					Duration    float64 `json:"duration"`
					Progress    float64 `json:"progress"`
					IsFinished  bool    `json:"isFinished"`
				} `json:"userMediaProgress"`
				// Podcast-specific: most recently played episode with per-episode progress
				RecentEpisode *struct {
					ID        string `json:"id"`
					Title     string `json:"title"`
					AudioFile struct {
						Metadata struct {
							Filename string `json:"filename"`
						} `json:"metadata"`
						Duration float64 `json:"duration"`
					} `json:"audioFile"`
					UserEpisodeProgress *struct {
						CurrentTime float64 `json:"currentTime"`
						Duration    float64 `json:"duration"`
						Progress    float64 `json:"progress"`
						IsFinished  bool    `json:"isFinished"`
					} `json:"userEpisodeProgress"`
				} `json:"recentEpisode"`
			} `json:"libraryItems"`
		}
		if jerr := json.Unmarshal(progBody, &resp); jerr != nil {
			logErrorf("ABS", "items-in-progress parse error: %v", jerr)
		} else {
			logDebugf("ABS", "items-in-progress: %d items before filter", len(resp.LibraryItems))
			for _, r := range resp.LibraryItems {
				// Determine effective progress — podcasts use episode-level progress
				currentTime := r.UserMediaProgress.CurrentTime
				duration := r.UserMediaProgress.Duration
				progress := r.UserMediaProgress.Progress
				isFinished := r.UserMediaProgress.IsFinished

				var episodeID string
				if r.MediaType == "podcast" && r.RecentEpisode != nil {
					ep := r.RecentEpisode
					episodeID = ep.ID
					if ep.UserEpisodeProgress != nil {
						epProg := ep.UserEpisodeProgress
						// Only override library-level progress if the episode has meaningful data.
						// If episode progress shows 0 but library-level has a real position, keep it.
						if epProg.CurrentTime > 0 || epProg.Progress > 0 {
							currentTime = epProg.CurrentTime
							progress = epProg.Progress
							isFinished = epProg.IsFinished
						}
						if epProg.Duration > 0 {
							duration = epProg.Duration
						}
					}
					if duration == 0 {
						duration = ep.AudioFile.Duration
					}
					logDebugf("ABS", "  podcast episode: id=%s title=%q libProgress=%.1f epProgress=%.1f/%.1f",
						ep.ID, ep.Title, r.UserMediaProgress.CurrentTime, currentTime, duration)
				}

				logDebugf("ABS", "  item id=%s type=%s title=%q finished=%v progress=%.2f numAudio=%d",
					r.ID, r.MediaType, r.Media.Metadata.Title, isFinished, progress, r.Media.NumAudioFiles)
				if isFinished {
					continue
				}

				author := r.Media.Metadata.AuthorName
				if author == "" {
					author = r.Media.Metadata.Author
				}
				item := ABSInProgressItem{
					ID:          r.ID,
					MediaType:   r.MediaType,
					Title:       r.Media.Metadata.Title,
					Author:      author,
					CurrentTime: currentTime,
					Duration:    duration,
					Progress:    progress,
					EpisodeID:   episodeID,
					HasAudio:    r.MediaType == "podcast" || r.Media.NumAudioFiles > 0,
				}
				if item.Duration == 0 {
					item.Duration = r.Media.Metadata.Duration
				}

				// The items-in-progress response doesn't reliably populate userMediaProgress.
				// Fetch the authoritative progress record directly when currentTime is 0.
				if item.CurrentTime == 0 {
					progressPath := "/api/me/progress/" + r.ID
					if episodeID != "" {
						progressPath += "/" + episodeID
					}
					if pBody, perr2 := get(progressPath); perr2 == nil {
						var prog struct {
							CurrentTime   float64 `json:"currentTime"`
							Duration      float64 `json:"duration"`
							Progress      float64 `json:"progress"`
							EbookProgress float64 `json:"ebookProgress"`
							IsFinished    bool    `json:"isFinished"`
						}
						if json.Unmarshal(pBody, &prog) == nil {
							logDebugf("ABS", "  direct progress: time=%.1f/%.1f progress=%.3f ebookProgress=%.3f finished=%v",
								prog.CurrentTime, prog.Duration, prog.Progress, prog.EbookProgress, prog.IsFinished)
							if prog.IsFinished {
								continue
							}
							item.CurrentTime = prog.CurrentTime
							// Some ABS versions return currentTime=0 for multi-track books while still
							// tracking progress as a ratio. Derive position from progress×duration.
							if item.CurrentTime == 0 && prog.Progress > 0 && prog.Duration > 0 {
								item.CurrentTime = prog.Progress * prog.Duration
								logDebugf("ABS", "  derived currentTime=%.1f from progress*duration", item.CurrentTime)
							}
							// Ebooks use ebookProgress (0–1); audio items use progress.
							if !item.HasAudio && prog.EbookProgress > 0 {
								item.Progress = prog.EbookProgress
							} else {
								item.Progress = prog.Progress
							}
							if prog.Duration > 0 {
								item.Duration = prog.Duration
							}
						}
					} else {
						logErrorf("ABS", "  direct progress fetch error: %v", perr2)
					}
				}

				// Fetch track layout for multi-track audiobooks so the frontend
				// can seek to the right track when resuming.
				if item.EpisodeID == "" && r.Media.NumAudioFiles > 1 {
					item.Tracks = absGetTracks(apiURL, token, r.ID, skipTLS)
					logDebugf("ABS", "  tracks for %q: %d tracks fetched", item.Title, len(item.Tracks))
				}

				logDebugf("ABS", "  → added: %q by %q time=%.1f/%.1f hasAudio=%v episode=%q tracks=%d",
					item.Title, item.Author, item.CurrentTime, item.Duration, item.HasAudio, item.EpisodeID, len(item.Tracks))

				data.InProgress = append(data.InProgress, item)
			}
			logDebugf("ABS", "items-in-progress: %d items after filter", len(data.InProgress))
		}
	} else {
		logErrorf("ABS", "items-in-progress error: %v", perr)
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

		coverURL := strings.TrimRight(apiURL, "/") + "/api/items/" + itemID + "/cover?width=300"

		proxyABSCover := func(tok string) (*http.Response, error) {
			req, rerr := http.NewRequest("GET", coverURL, nil)
			if rerr != nil {
				return nil, rerr
			}
			req.Header.Set("Authorization", "Bearer "+tok)
			return httpClient(skipTLS).Do(req)
		}

		resp, err := proxyABSCover(token)
		if err != nil {
			logErrorf("ABS", "cover proxy error: GET %s → %v", coverURL, err)
			http.Error(w, "cover fetch failed", http.StatusBadGateway)
			return
		}
		// Retry once on auth failure
		if resp.StatusCode == 401 || resp.StatusCode == 403 {
			resp.Body.Close()
			absClearToken(integID)
			token, err = absGetToken(apiURL, apiKey, integID, skipTLS)
			if err != nil {
				http.Error(w, "auth refresh failed", http.StatusBadGateway)
				return
			}
			resp, err = proxyABSCover(token)
			if err != nil {
				logErrorf("ABS", "cover proxy error (retry): GET %s → %v", coverURL, err)
				http.Error(w, "cover fetch failed", http.StatusBadGateway)
				return
			}
		}
		defer resp.Body.Close()
		logDebugf("ABS", "cover proxy: GET %s → HTTP %d", coverURL, resp.StatusCode)

		// Forward ABS status directly (404 = no cover art, not our error)
		if resp.StatusCode >= 400 {
			w.WriteHeader(resp.StatusCode)
			return
		}

		for _, h := range []string{"Content-Type", "Content-Length"} {
			if v := resp.Header.Get(h); v != "" {
				w.Header().Set(h, v)
			}
		}
		w.Header().Set("Cache-Control", "private, max-age=86400")
		io.Copy(w, resp.Body)
	}
}

// ── Stream proxy ──────────────────────────────────────────────────────────────

// ProxyABSStream creates an ABS playback session on demand and proxies the audio
// stream. ABS serves audio from /public/session/{sessionId}/track/N; sessions are
// cached in memory and recreated automatically if they expire.
// The optional ?episode= query param selects a podcast episode within the item.
func ProxyABSStream(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		integID := vars["integrationId"]
		itemID := vars["itemId"]
		episodeID := r.URL.Query().Get("episode")
		trackNum := r.URL.Query().Get("track")
		if trackNum == "" {
			trackNum = "1"
		}

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

		cacheKey := integID + ":" + itemID + ":" + episodeID

		absSessionCacheMu.Lock()
		sessionID := absSessionCache[cacheKey]
		absSessionCacheMu.Unlock()

		if sessionID == "" {
			sessionID, err = createABSSession(apiURL, token, itemID, episodeID, skipTLS)
			if err != nil {
				logErrorf("ABS", "stream: session create failed: %v", err)
				http.Error(w, "session create failed", http.StatusBadGateway)
				return
			}
			absSessionCacheMu.Lock()
			absSessionCache[cacheKey] = sessionID
			absSessionCacheMu.Unlock()
		}

		doProxy := func(sID string) (*http.Response, error) {
			streamURL := strings.TrimRight(apiURL, "/") + "/public/session/" + sID + "/track/" + trackNum
			logDebugf("ABS", "stream proxy: GET %s (Range: %s)", streamURL, r.Header.Get("Range"))
			req, rerr := http.NewRequest("GET", streamURL, nil)
			if rerr != nil {
				return nil, rerr
			}
			req.Header.Set("Authorization", "Bearer "+token)
			if rangeHdr := r.Header.Get("Range"); rangeHdr != "" {
				req.Header.Set("Range", rangeHdr)
			}
			return httpClient(skipTLS).Do(req)
		}

		resp, err := doProxy(sessionID)
		if err != nil {
			logErrorf("ABS", "stream proxy error: %v", err)
			http.Error(w, "stream fetch failed", http.StatusBadGateway)
			return
		}

		// Session expired — clear cache, create fresh session, retry once
		if resp.StatusCode == 404 || resp.StatusCode == 410 {
			resp.Body.Close()
			absSessionCacheMu.Lock()
			delete(absSessionCache, cacheKey)
			absSessionCacheMu.Unlock()

			sessionID, err = createABSSession(apiURL, token, itemID, episodeID, skipTLS)
			if err != nil {
				logErrorf("ABS", "stream: session refresh failed: %v", err)
				http.Error(w, "session refresh failed", http.StatusBadGateway)
				return
			}
			absSessionCacheMu.Lock()
			absSessionCache[cacheKey] = sessionID
			absSessionCacheMu.Unlock()

			resp, err = doProxy(sessionID)
			if err != nil {
				http.Error(w, "stream fetch failed", http.StatusBadGateway)
				return
			}
		}
		defer resp.Body.Close()
		logDebugf("ABS", "stream proxy: HTTP %d (Content-Type: %s, Content-Length: %s)",
			resp.StatusCode, resp.Header.Get("Content-Type"), resp.Header.Get("Content-Length"))

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
			EpisodeID   string  `json:"episodeId"` // non-empty for podcast episodes
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

		// Podcast episodes use /api/me/progress/{itemId}/{episodeId}
		patchURL := strings.TrimRight(apiURL, "/") + "/api/me/progress/" + itemID
		if req.EpisodeID != "" {
			patchURL += "/" + req.EpisodeID
		}
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
