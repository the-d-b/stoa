package handlers

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

// MaintainerrPoster is one cover in a collection's carousel: the image plus a
// deep link to the title's TMDB page (or, when no tmdbId is known, the
// Maintainerr collection page as a fallback).
type MaintainerrPoster struct {
	CoverURL string `json:"coverUrl"`
	LinkURL  string `json:"linkUrl,omitempty"`
	Title    string `json:"title,omitempty"`
}

type MaintainerrCollection struct {
	ID              int                 `json:"id"`
	Title           string              `json:"title"`
	Type            string              `json:"type"` // "movie", "show", "season", "episode"
	IsActive        bool                `json:"isActive"`
	DeleteAfterDays int                 `json:"deleteAfterDays"`
	ArrAction       int                 `json:"arrAction"` // 0=delete 1=unmonitor+delete 2=unmonitor
	MediaCount      int                 `json:"mediaCount"`
	TotalSizeBytes  int64               `json:"totalSizeBytes"`
	Posters         []MaintainerrPoster `json:"posters"` // covers from media items, with deep links
}

// maintainerrTMDBLink builds a themoviedb.org deep link for a media item, or ""
// when the tmdbId is unknown. Movies go to /movie/, everything else (show,
// season, episode) resolves to the parent show's /tv/ page.
func maintainerrTMDBLink(tmdbID int, mediaType string) string {
	if tmdbID <= 0 {
		return ""
	}
	kind := "tv"
	if mediaType == "movie" {
		kind = "movie"
	}
	return fmt.Sprintf("https://www.themoviedb.org/%s/%d", kind, tmdbID)
}

type MaintainerrPanelData struct {
	Collections      []MaintainerrCollection `json:"collections"`
	ActiveCount      int                     `json:"activeCount"`
	TotalMediaCount  int                     `json:"totalMediaCount"`
	ReclaimableBytes int64                   `json:"reclaimableBytes"`
	ItemsHandled     int                     `json:"itemsHandled"`
	BytesHandled     int64                   `json:"bytesHandled"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func maintainerrGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	if strings.Contains(apiKey, ":") {
		enc := base64.StdEncoding.EncodeToString([]byte(apiKey))
		req.Header.Set("Authorization", "Basic "+enc)
	} else if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("maintainerr: HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Scheduled actions (calendar source) ───────────────────────────────────────

// maintainerrActionLabel maps a collection's arrAction (ServarrAction enum in
// Maintainerr's contracts) to a short label, mirroring Maintainerr's own
// calendar page.
func maintainerrActionLabel(action int) string {
	switch action {
	case 0:
		return "Delete"
	case 1:
		return "Unmonitor/Delete"
	case 2:
		return "Unmonitor/Delete Existing"
	case 3:
		return "Unmonitor/Keep"
	case 5:
		return "Delete Empty Show"
	case 6:
		return "Unmonitor Empty Show"
	case 7:
		return "Change Quality"
	}
	return "Scheduled Action"
}

// maintainerrParseAddDate parses the addDate timestamp, tolerating the ISO
// and SQL-ish formats Maintainerr may emit.
func maintainerrParseAddDate(raw string) (time.Time, bool) {
	for _, layout := range []string{time.RFC3339, "2006-01-02 15:04:05", "2006-01-02"} {
		if t, err := time.Parse(layout, raw); err == nil {
			return t, true
		}
	}
	if len(raw) >= 10 {
		if t, err := time.Parse("2006-01-02", raw[:10]); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// maintainerrFetchActionItems builds upcoming scheduled-action items from
// /api/collections/overlay-data — the same endpoint and date math Maintainerr's
// own calendar page uses: each media item's action date is its addDate (start
// of day) plus the collection's deleteAfterDays. Items are aggregated per
// collection per day ("Old Movies: 3 items (Delete)"); collections with action
// "Do nothing" or without deleteAfterDays are skipped.
func maintainerrFetchActionItems(baseURL, uiURL, apiKey string, skipTLS bool) ([]dueItem, error) {
	body, err := maintainerrGet(baseURL, apiKey, "/api/collections/overlay-data", skipTLS)
	if err != nil {
		return nil, err
	}
	return parseMaintainerrActionItems(body, uiURL)
}

// parseMaintainerrActionItems shapes an /api/collections/overlay-data
// response into aggregated dueItems, one per collection per action day
// ("Old Movies: 3 items (Delete)"). Split out from maintainerrFetchActionItems
// for testability.
func parseMaintainerrActionItems(body []byte, uiURL string) ([]dueItem, error) {
	var cols []struct {
		ID              int    `json:"id"`
		Title           string `json:"title"`
		ArrAction       int    `json:"arrAction"`
		DeleteAfterDays *int   `json:"deleteAfterDays"`
		Media           []struct {
			AddDate string `json:"addDate"`
		} `json:"media"`
	}
	if err := json.Unmarshal(body, &cols); err != nil {
		return nil, fmt.Errorf("parsing overlay-data: %w", err)
	}

	type dayKey struct {
		colID int
		date  string
	}
	counts := map[dayKey]int{}
	titles := map[int]string{}
	actions := map[int]int{}
	var order []dayKey

	for _, c := range cols {
		if c.ArrAction == 4 || c.DeleteAfterDays == nil { // 4 = DO_NOTHING
			continue
		}
		titles[c.ID] = c.Title
		actions[c.ID] = c.ArrAction
		for _, m := range c.Media {
			if m.AddDate == "" {
				continue
			}
			added, ok := maintainerrParseAddDate(m.AddDate)
			if !ok {
				continue
			}
			date := added.Local().AddDate(0, 0, *c.DeleteAfterDays).Format("2006-01-02")
			k := dayKey{c.ID, date}
			if counts[k] == 0 {
				order = append(order, k)
			}
			counts[k]++
		}
	}

	var items []dueItem
	for _, k := range order {
		n := counts[k]
		noun := "items"
		if n == 1 {
			noun = "item"
		}
		items = append(items, dueItem{
			Title:   fmt.Sprintf("%s: %d %s (%s)", titles[k.colID], n, noun, maintainerrActionLabel(actions[k.colID])),
			DueDate: k.date,
			Link:    strings.TrimRight(uiURL, "/") + fmt.Sprintf("/collections/%d", k.colID),
		})
	}
	return items, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testMaintainerrConnection(baseURL, apiKey string, skipTLS bool) error {
	b, err := maintainerrGet(baseURL, apiKey, "/api/health", skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		Status string `json:"status"`
	}
	if json.Unmarshal(b, &r) != nil || r.Status == "" {
		return fmt.Errorf("maintainerr: unexpected health response")
	}
	return nil
}

// maintainerrPosterMaxItems is the collection size above which posters are
// fetched on a slow, cached cycle instead of every poll. Maintainerr's
// content endpoint sorts the whole collection by deleteSoonest before
// paginating, so the request cost scales with collection size regardless of
// how few items are actually requested (size=25) — on multi-thousand-item
// collections that sort alone can run slow enough to back up subsequent
// polls and eventually time out the cheap /api/collections call too. See
// maintainerrLargeCollectionPosters.
const maintainerrPosterMaxItems = 300

// maintainerrLargePosterRefreshInterval is how often the expensive
// server-side sort is paid for a single large collection. Between
// refreshes, the previous poster set (however stale) keeps being served
// from cache rather than re-fetched every poll.
const maintainerrLargePosterRefreshInterval = 24 * time.Hour

type maintainerrPosterCacheEntry struct {
	posters   []MaintainerrPoster
	fetchedAt time.Time
}

var maintainerrPosterCache sync.Map // key: collection ID (int) -> maintainerrPosterCacheEntry

// maintainerrLargeCollectionPosters serves posters for a large collection
// from cache, only paying the expensive fetch once per
// maintainerrLargePosterRefreshInterval. A cold cache (first time this
// collection is seen, or after a restart) still fetches immediately so the
// panel doesn't sit empty for a full day on first load.
func maintainerrLargeCollectionPosters(baseURL, apiKey string, skipTLS bool, collectionID int, collectionLink string) []MaintainerrPoster {
	if v, ok := maintainerrPosterCache.Load(collectionID); ok {
		entry := v.(maintainerrPosterCacheEntry)
		if time.Since(entry.fetchedAt) < maintainerrLargePosterRefreshInterval {
			return entry.posters
		}
	}
	posters := maintainerrFetchPosters(baseURL, apiKey, skipTLS, collectionID, collectionLink)
	maintainerrPosterCache.Store(collectionID, maintainerrPosterCacheEntry{posters: posters, fetchedAt: time.Now()})
	return posters
}

// maintainerrFetchPosters fetches and parses the poster/content page for one
// collection. image_path is populated here for all media types (movies and
// shows), unlike the collections list. Each item also carries the tmdbId and
// media type used to build a TMDB deep link (falling back to the
// Maintainerr collection page).
func maintainerrFetchPosters(baseURL, apiKey string, skipTLS bool, collectionID int, collectionLink string) []MaintainerrPoster {
	posters := []MaintainerrPoster{}
	path := fmt.Sprintf("/api/collections/media/%d/content/1?size=25&sort=deleteSoonest&sortOrder=asc", collectionID)
	cb, cerr := maintainerrGet(baseURL, apiKey, path, skipTLS)
	if cerr != nil {
		return posters
	}
	var content struct {
		Items []struct {
			TmdbID    int    `json:"tmdbId"`
			ImagePath string `json:"image_path"`
			MediaData struct {
				Title string `json:"title"`
				Type  string `json:"type"`
			} `json:"mediaData"`
		} `json:"items"`
	}
	if json.Unmarshal(cb, &content) != nil {
		return posters
	}
	for _, m := range content.Items {
		if m.ImagePath == "" {
			continue
		}
		imgPath := m.ImagePath
		// Some items come back as a bare TMDB image hash rather than a full
		// URL — Maintainerr's own UI reconstructs the TMDB URL client-side
		// the same way; confirmed against a live instance that there's no
		// other prefix or path involved, just the CDN base + size.
		if !strings.HasPrefix(imgPath, "http://") && !strings.HasPrefix(imgPath, "https://") {
			imgPath = "https://image.tmdb.org/t/p/w500/" + strings.TrimPrefix(imgPath, "/")
		}
		link := maintainerrTMDBLink(m.TmdbID, m.MediaData.Type)
		if link == "" {
			link = collectionLink
		}
		posters = append(posters, MaintainerrPoster{
			CoverURL: imgPath,
			LinkURL:  link,
			Title:    m.MediaData.Title,
		})
	}
	return posters
}

// ── Panel data ────────────────────────────────────────────────────────────────

func fetchMaintainerrPanelData(db *sql.DB, config map[string]interface{}) (*MaintainerrPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("maintainerr: no integration configured")
	}
	baseURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if baseURL == "" {
		return nil, fmt.Errorf("maintainerr: baseURL not configured")
	}

	out := &MaintainerrPanelData{Collections: []MaintainerrCollection{}}
	anyOK := false

	// Collections — metadata (counts, sizes, active state)
	if b, err := maintainerrGet(baseURL, apiKey, "/api/collections", skipTLS); err == nil {
		anyOK = true
		var cols []struct {
			ID              int    `json:"id"`
			Title           string `json:"title"`
			Type            string `json:"type"`
			IsActive        bool   `json:"isActive"`
			DeleteAfterDays int    `json:"deleteAfterDays"`
			ArrAction       int    `json:"arrAction"`
			MediaCount      int    `json:"mediaCount"`
			TotalSizeBytes  int64  `json:"totalSizeBytes"`
		}
		if json.Unmarshal(b, &cols) == nil {
			for _, c := range cols {
				out.TotalMediaCount += c.MediaCount
				out.ReclaimableBytes += c.TotalSizeBytes
				if c.IsActive {
					out.ActiveCount++
				}

				// Fetch posters via content endpoint — image_path is populated here
				// for all media types (movies and shows), unlike the collections list.
				collectionLink := ""
				if uiURL != "" {
					collectionLink = strings.TrimRight(uiURL, "/") + fmt.Sprintf("/collections/%d", c.ID)
				}
				var posters []MaintainerrPoster
				if c.MediaCount > maintainerrPosterMaxItems {
					// Large collections still get posters, just on a slower,
					// cached cycle — see maintainerrLargeCollectionPosters.
					posters = maintainerrLargeCollectionPosters(baseURL, apiKey, skipTLS, c.ID, collectionLink)
				} else {
					posters = maintainerrFetchPosters(baseURL, apiKey, skipTLS, c.ID, collectionLink)
				}

				out.Collections = append(out.Collections, MaintainerrCollection{
					ID:              c.ID,
					Title:           c.Title,
					Type:            c.Type,
					IsActive:        c.IsActive,
					DeleteAfterDays: c.DeleteAfterDays,
					ArrAction:       c.ArrAction,
					MediaCount:      c.MediaCount,
					TotalSizeBytes:  c.TotalSizeBytes,
					Posters:         posters,
				})
			}
		}
	} else {
		logErrorf("MAINTAINERR", "collections error: %v", err)
	}

	// Lifetime cleanup stats — best-effort
	if b, err := maintainerrGet(baseURL, apiKey, "/api/storage-metrics", skipTLS); err == nil {
		anyOK = true
		var sm struct {
			CleanupTotals struct {
				ItemsHandled int   `json:"itemsHandled"`
				BytesHandled int64 `json:"bytesHandled"`
			} `json:"cleanupTotals"`
		}
		if json.Unmarshal(b, &sm) == nil {
			out.ItemsHandled = sm.CleanupTotals.ItemsHandled
			out.BytesHandled = sm.CleanupTotals.BytesHandled
		}
	} else {
		logErrorf("MAINTAINERR", "storage-metrics error: %v", err)
	}

	// Every endpoint failed — surface the error instead of rendering zeros
	if !anyOK {
		return nil, fmt.Errorf("maintainerr unreachable — check URL, credentials, and TLS settings (see server log for details)")
	}

	return out, nil
}
