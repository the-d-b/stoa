package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"
)

// TMDB replaces the Trakt discovery panel — Trakt ended free API-application
// access in 2026 (existing apps deactivated, new ones require a paid VIP
// subscription), so Stoa is no longer developing that integration. TMDB is
// the same underlying metadata source Trakt itself used for posters, sourced
// directly instead of through a third party that can change its terms at any
// time.
//
// Unlike Trakt, TMDB's list endpoints (trending/popular/upcoming/top_rated)
// already embed a poster path, so no per-title poster lookup is needed here
// the way Trakt required (see tmdbGetPoster in tmdb_shared.go, still used by
// the legacy Trakt integration). Certification is the one thing that does
// require a per-title lookup — TMDB only exposes it via
// /movie/{id}/release_dates and /tv/{id}/content_ratings, and /discover/tv
// (unlike /discover/movie) has no certification query params at all, so
// there's no way to filter TV shows server-side regardless of which
// endpoints are used.

// ── Output types ─────────────────────────────────────────────────────────────

// TMDBList is the metadata for one of the connected account's personal
// lists — item_count only, not the items themselves (fetched on demand via
// GET /api/tmdb/list/{listId}, see handlers_tmdb_oauth.go).
type TMDBList struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	ItemCount int    `json:"itemCount"`
}

type TMDBPanelData struct {
	TrendingMovies   []TraktCard `json:"trendingMovies"`
	TrendingShows    []TraktCard `json:"trendingShows"`
	PopularMovies    []TraktCard `json:"popularMovies"`
	PopularShows     []TraktCard `json:"popularShows"`
	UpcomingMovies   []TraktCard `json:"upcomingMovies"`
	UpcomingShows    []TraktCard `json:"upcomingShows"` // TMDB has no TV "upcoming" — nearest equivalent is on_the_air
	TopRatedMovies   []TraktCard `json:"topRatedMovies"`
	TopRatedShows    []TraktCard `json:"topRatedShows"`
	AccountConnected bool        `json:"accountConnected"`
	AccountUsername  string      `json:"accountUsername,omitempty"`
	Lists            []TMDBList  `json:"lists,omitempty"`
}

// ── Integration-level config (ratings ceiling) ────────────────────────────────
//
// Unlike Trakt (movieRatings/showRatings live on the panel), TMDB's rating
// ceiling lives on the integration itself — one API key/integration = one
// fixed ceiling. Multiple ceilings for different audiences means multiple
// integrations, each with its own key.

type tmdbIntegrationConfig struct {
	MovieRatings string `json:"movieRatings"`
	ShowRatings  string `json:"showRatings"`
}

func tmdbParseConfig(cfgJSON string) tmdbIntegrationConfig {
	var c tmdbIntegrationConfig
	json.Unmarshal([]byte(cfgJSON), &c) //nolint:errcheck
	return c
}

// ── Raw API shapes ─────────────────────────────────────────────────────────────

type tmdbMovieResult struct {
	ID          int64  `json:"id"`
	Title       string `json:"title"`
	ReleaseDate string `json:"release_date"`
	PosterPath  string `json:"poster_path"`
}

type tmdbTVResult struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	FirstAirDate string `json:"first_air_date"`
	PosterPath   string `json:"poster_path"`
}

func tmdbPosterURL(path string) string {
	if path == "" {
		return ""
	}
	return "https://image.tmdb.org/t/p/w342" + path
}

func tmdbYearFromDate(date string) int {
	if len(date) < 4 {
		return 0
	}
	y, _ := strconv.Atoi(date[:4])
	return y
}

// ── Section fetchers ──────────────────────────────────────────────────────────

func tmdbFetchMovies(path, apiKey string) []TraktCard {
	_, b, err := tmdbGet(path, apiKey)
	if err != nil {
		return nil
	}
	var raw struct {
		Results []tmdbMovieResult `json:"results"`
	}
	if json.Unmarshal(b, &raw) != nil {
		return nil
	}
	out := make([]TraktCard, 0, len(raw.Results))
	for _, r := range raw.Results {
		out = append(out, TraktCard{
			Type: "movie", Title: r.Title, Year: tmdbYearFromDate(r.ReleaseDate),
			TMDBID: r.ID, PosterURL: tmdbPosterURL(r.PosterPath),
		})
	}
	return out
}

func tmdbFetchTV(path, apiKey string) []TraktCard {
	_, b, err := tmdbGet(path, apiKey)
	if err != nil {
		return nil
	}
	var raw struct {
		Results []tmdbTVResult `json:"results"`
	}
	if json.Unmarshal(b, &raw) != nil {
		return nil
	}
	out := make([]TraktCard, 0, len(raw.Results))
	for _, r := range raw.Results {
		out = append(out, TraktCard{
			Type: "show", Title: r.Name, Year: tmdbYearFromDate(r.FirstAirDate),
			TMDBID: r.ID, PosterURL: tmdbPosterURL(r.PosterPath),
		})
	}
	return out
}

// ── Certification enrichment ──────────────────────────────────────────────────

func tmdbFetchMovieCertification(tmdbID int64, apiKey string) string {
	_, b, err := tmdbGet(fmt.Sprintf("/movie/%d/release_dates", tmdbID), apiKey)
	if err != nil {
		return ""
	}
	var raw struct {
		Results []struct {
			ISO31661     string `json:"iso_3166_1"`
			ReleaseDates []struct {
				Certification string `json:"certification"`
			} `json:"release_dates"`
		} `json:"results"`
	}
	if json.Unmarshal(b, &raw) != nil {
		return ""
	}
	for _, r := range raw.Results {
		if r.ISO31661 != "US" {
			continue
		}
		for _, rd := range r.ReleaseDates {
			if rd.Certification != "" {
				return rd.Certification
			}
		}
	}
	return ""
}

func tmdbFetchTVCertification(tmdbID int64, apiKey string) string {
	_, b, err := tmdbGet(fmt.Sprintf("/tv/%d/content_ratings", tmdbID), apiKey)
	if err != nil {
		return ""
	}
	var raw struct {
		Results []struct {
			ISO31661 string `json:"iso_3166_1"`
			Rating   string `json:"rating"`
		} `json:"results"`
	}
	if json.Unmarshal(b, &raw) != nil {
		return ""
	}
	for _, r := range raw.Results {
		if r.ISO31661 == "US" && r.Rating != "" {
			return r.Rating
		}
	}
	return ""
}

// tmdbEnrichCertifications fills in Certification for every card, bounded to
// tmdbEnrichConcurrency simultaneous lookups. Only worth calling when a
// rating filter is actually configured — otherwise this is pure wasted cost.
func tmdbEnrichCertifications(cards []*TraktCard, apiKey string) {
	sem := make(chan struct{}, tmdbEnrichConcurrency)
	var wg sync.WaitGroup
	for _, c := range cards {
		wg.Add(1)
		go func(card *TraktCard) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			if card.Type == "movie" {
				card.Certification = tmdbFetchMovieCertification(card.TMDBID, apiKey)
			} else {
				card.Certification = tmdbFetchTVCertification(card.TMDBID, apiKey)
			}
		}(c)
	}
	wg.Wait()
}

// ── Main fetch ────────────────────────────────────────────────────────────────

func fetchTMDBPanelData(db *sql.DB, config map[string]interface{}) (*TMDBPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("tmdb: integrationId required in panel config")
	}
	_, _, apiKey, _, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if apiKey == "" {
		return nil, fmt.Errorf("tmdb: API key required")
	}

	cfgJSON, _ := readIntegrationConfig(db, integrationID)
	cfg := tmdbParseConfig(cfgJSON)
	movieRatings := parseCommaRatingList(cfg.MovieRatings)
	showRatings := parseCommaRatingList(cfg.ShowRatings)

	out := &TMDBPanelData{}
	var mu sync.Mutex
	var wg sync.WaitGroup
	launch := func(fn func()) {
		wg.Add(1)
		go func() { defer wg.Done(); fn() }()
	}

	launch(func() { c := tmdbFetchMovies("/trending/movie/week", apiKey); mu.Lock(); out.TrendingMovies = c; mu.Unlock() })
	launch(func() { c := tmdbFetchTV("/trending/tv/week", apiKey); mu.Lock(); out.TrendingShows = c; mu.Unlock() })
	launch(func() { c := tmdbFetchMovies("/movie/popular", apiKey); mu.Lock(); out.PopularMovies = c; mu.Unlock() })
	launch(func() { c := tmdbFetchTV("/tv/popular", apiKey); mu.Lock(); out.PopularShows = c; mu.Unlock() })
	launch(func() { c := tmdbFetchMovies("/movie/upcoming", apiKey); mu.Lock(); out.UpcomingMovies = c; mu.Unlock() })
	launch(func() { c := tmdbFetchTV("/tv/on_the_air", apiKey); mu.Lock(); out.UpcomingShows = c; mu.Unlock() })
	launch(func() { c := tmdbFetchMovies("/movie/top_rated", apiKey); mu.Lock(); out.TopRatedMovies = c; mu.Unlock() })
	launch(func() { c := tmdbFetchTV("/tv/top_rated", apiKey); mu.Lock(); out.TopRatedShows = c; mu.Unlock() })
	launch(func() {
		connected, username, lists := tmdbFetchAccountData(db, integrationID, apiKey)
		mu.Lock()
		out.AccountConnected = connected
		out.AccountUsername = username
		out.Lists = lists
		mu.Unlock()
	})
	wg.Wait()

	// Certification filtering — only pay the per-title lookup cost when a
	// filter is actually configured.
	if len(movieRatings) > 0 || len(showRatings) > 0 {
		var allCards []*TraktCard
		for i := range out.TrendingMovies {
			allCards = append(allCards, &out.TrendingMovies[i])
		}
		for i := range out.TrendingShows {
			allCards = append(allCards, &out.TrendingShows[i])
		}
		for i := range out.PopularMovies {
			allCards = append(allCards, &out.PopularMovies[i])
		}
		for i := range out.PopularShows {
			allCards = append(allCards, &out.PopularShows[i])
		}
		for i := range out.UpcomingMovies {
			allCards = append(allCards, &out.UpcomingMovies[i])
		}
		for i := range out.UpcomingShows {
			allCards = append(allCards, &out.UpcomingShows[i])
		}
		for i := range out.TopRatedMovies {
			allCards = append(allCards, &out.TopRatedMovies[i])
		}
		for i := range out.TopRatedShows {
			allCards = append(allCards, &out.TopRatedShows[i])
		}
		tmdbEnrichCertifications(allCards, apiKey)

		out.TrendingMovies = filterTraktCards(out.TrendingMovies, movieRatings)
		out.TrendingShows = filterTraktCards(out.TrendingShows, showRatings)
		out.PopularMovies = filterTraktCards(out.PopularMovies, movieRatings)
		out.PopularShows = filterTraktCards(out.PopularShows, showRatings)
		out.UpcomingMovies = filterTraktCards(out.UpcomingMovies, movieRatings)
		out.UpcomingShows = filterTraktCards(out.UpcomingShows, showRatings)
		out.TopRatedMovies = filterTraktCards(out.TopRatedMovies, movieRatings)
		out.TopRatedShows = filterTraktCards(out.TopRatedShows, showRatings)
	}

	return out, nil
}

// tmdbResolveTVDBID looks up a TV show's TVDB ID from its TMDB ID. Needed
// because Sonarr adds by TVDB ID while TMDB's TV endpoints don't include one
// by default — Radarr avoids this since it adds by TMDB ID natively. Called
// on demand from panel_actions.go's add_to_sonarr, not eagerly for every
// discovered show.
func tmdbResolveTVDBID(tmdbID int64, apiKey string) (int64, error) {
	code, b, err := tmdbGet(fmt.Sprintf("/tv/%d/external_ids", tmdbID), apiKey)
	if err != nil {
		return 0, err
	}
	if code != 200 {
		return 0, fmt.Errorf("tmdb: HTTP %d looking up external IDs", code)
	}
	var raw struct {
		TVDBID int64 `json:"tvdb_id"`
	}
	if json.Unmarshal(b, &raw) != nil || raw.TVDBID == 0 {
		return 0, fmt.Errorf("tmdb: no TVDB ID found for this show")
	}
	return raw.TVDBID, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testTMDBConnection(apiKey string) error {
	if apiKey == "" {
		return fmt.Errorf("tmdb: API key required")
	}
	code, b, err := tmdbGet("/movie/popular?page=1", apiKey)
	if err != nil {
		return err
	}
	if code == 401 {
		return fmt.Errorf("tmdb: unauthorized — check your API key or read access token")
	}
	if code != 200 {
		preview := strings.TrimSpace(string(b))
		if len(preview) > 150 {
			preview = preview[:150]
		}
		return fmt.Errorf("tmdb: HTTP %d — %s", code, preview)
	}
	return nil
}
