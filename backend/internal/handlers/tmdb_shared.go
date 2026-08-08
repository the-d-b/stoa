package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Common TMDB v3 API client helpers, shared by the legacy Trakt integration's
// poster enrichment (integrations_trakt.go) and the TMDB discovery
// integration (integrations_tmdb.go).

const tmdbAPIBase = "https://api.themoviedb.org/3"

// tmdbRequest builds an authenticated request to the TMDB v3 API. Accepts
// either a v3 API key (appended as ?api_key=) or a v4 Read Access Token — a
// JWT, always starting with "eyJ" — sent as a Bearer header instead.
func tmdbRequest(method, path, apiKey string) (*http.Request, error) {
	url := tmdbAPIBase + path
	if strings.HasPrefix(apiKey, "eyJ") {
		req, err := http.NewRequest(method, url, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+apiKey)
		return req, nil
	}
	sep := "?"
	if strings.Contains(path, "?") {
		sep = "&"
	}
	return http.NewRequest(method, url+sep+"api_key="+apiKey, nil)
}

// tmdbGet performs a GET against the TMDB API and returns the status code and
// raw response body.
func tmdbGet(path, apiKey string) (int, []byte, error) {
	req, err := tmdbRequest("GET", path, apiKey)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, b, nil
}

// parseCommaRatingList splits a free-text comma-separated ratings field
// (e.g. "PG, PG-13") into a normalized allow-list. Shared by Trakt's
// panel-level rating filter and TMDB's integration-level one.
func parseCommaRatingList(raw string) []string {
	if raw == "" {
		return nil
	}
	var out []string
	for _, r := range strings.Split(raw, ",") {
		if s := strings.ToUpper(strings.TrimSpace(r)); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// tmdbPost performs a POST with a JSON body against the TMDB API — used by
// the account-connect flow (authentication/session/new).
func tmdbPost(path, apiKey string, body interface{}) (int, []byte, error) {
	req, err := tmdbRequest("POST", path, apiKey)
	if err != nil {
		return 0, nil, err
	}
	b, _ := json.Marshal(body)
	req.Body = io.NopCloser(bytes.NewReader(b))
	req.ContentLength = int64(len(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, respBody, nil
}

// ── Poster cache ──────────────────────────────────────────────────────────

type tmdbCacheEntry struct {
	url     string
	expires time.Time
}

var tmdbPosterCache sync.Map // key: "movie:123" or "tv:456" → tmdbCacheEntry

func tmdbGetPoster(tmdbID int64, mediaType, apiKey string) string {
	if tmdbID == 0 || apiKey == "" {
		return ""
	}
	cacheKey := fmt.Sprintf("%s:%d", mediaType, tmdbID)
	if v, ok := tmdbPosterCache.Load(cacheKey); ok {
		if e := v.(tmdbCacheEntry); time.Now().Before(e.expires) {
			return e.url
		}
	}
	code, b, err := tmdbGet(fmt.Sprintf("/%s/%d", mediaType, tmdbID), apiKey)
	if err != nil || code != 200 {
		return ""
	}
	var v struct {
		PosterPath string `json:"poster_path"`
	}
	if json.Unmarshal(b, &v) != nil || v.PosterPath == "" {
		return ""
	}
	posterURL := "https://image.tmdb.org/t/p/w342" + v.PosterPath
	tmdbPosterCache.Store(cacheKey, tmdbCacheEntry{url: posterURL, expires: time.Now().Add(24 * time.Hour)})
	return posterURL
}

// tmdbEnrichConcurrency bounds how many simultaneous per-title TMDB lookups
// (posters, certifications) run at once during a panel refresh.
const tmdbEnrichConcurrency = 20

// tmdbEnrichCards fills in PosterURL for any card missing one. TraktCard is
// used as the generic media-card type for both the Trakt and TMDB
// integrations — not Trakt-specific despite the name.
func tmdbEnrichCards(cards []*TraktCard, apiKey string) {
	if apiKey == "" {
		return
	}
	sem := make(chan struct{}, tmdbEnrichConcurrency)
	var wg sync.WaitGroup
	for _, c := range cards {
		if c.TMDBID == 0 || c.PosterURL != "" {
			continue
		}
		mt := "movie"
		if c.Type != "movie" {
			mt = "tv"
		}
		wg.Add(1)
		go func(card *TraktCard, mediaType string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			card.PosterURL = tmdbGetPoster(card.TMDBID, mediaType, apiKey)
		}(c, mt)
	}
	wg.Wait()
}
