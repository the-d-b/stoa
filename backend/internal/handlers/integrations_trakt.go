package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ── Credentials ───────────────────────────────────────────────────────────────

func traktParseCreds(apiKey string) (clientID, username, tmdbKey string, err error) {
	parts := strings.SplitN(apiKey, ":", 3)
	if len(parts) < 2 {
		return "", "", "", fmt.Errorf("trakt: secret must be clientId:username or clientId:username:tmdbApiKey")
	}
	clientID = strings.TrimSpace(parts[0])
	username = strings.TrimSpace(parts[1])
	if len(parts) == 3 {
		tmdbKey = strings.TrimSpace(parts[2])
	}
	if clientID == "" || username == "" {
		return "", "", "", fmt.Errorf("trakt: clientId and username cannot be empty")
	}
	return
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func traktGet(clientID, path string) (int, []byte, error) {
	req, _ := http.NewRequest("GET", "https://api.trakt.tv"+path, nil)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("trakt-api-version", "2")
	req.Header.Set("trakt-api-key", clientID)
	req.Header.Set("User-Agent", "StoaDashboard/1.0")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, b, nil
}

// ── TMDB poster cache ─────────────────────────────────────────────────────────

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
	// Support both v3 API key (?api_key=) and v4 Read Access Token (Bearer JWT).
	apiURL := fmt.Sprintf("https://api.themoviedb.org/3/%s/%d", mediaType, tmdbID)
	var req *http.Request
	if strings.HasPrefix(apiKey, "eyJ") {
		req, _ = http.NewRequest("GET", apiURL, nil)
		req.Header.Set("Authorization", "Bearer "+apiKey)
	} else {
		req, _ = http.NewRequest("GET", apiURL+"?api_key="+apiKey, nil)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode != 200 {
		if resp != nil {
			resp.Body.Close()
		}
		return ""
	}
	defer resp.Body.Close()
	var v struct {
		PosterPath string `json:"poster_path"`
	}
	if json.NewDecoder(resp.Body).Decode(&v) != nil || v.PosterPath == "" {
		return ""
	}
	posterURL := "https://image.tmdb.org/t/p/w342" + v.PosterPath
	tmdbPosterCache.Store(cacheKey, tmdbCacheEntry{url: posterURL, expires: time.Now().Add(24 * time.Hour)})
	return posterURL
}

func tmdbEnrichCards(cards []*TraktCard, apiKey string) {
	if apiKey == "" {
		return
	}
	sem := make(chan struct{}, 20)
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

// ── Output types ──────────────────────────────────────────────────────────────

type TraktCard struct {
	Type          string `json:"type"`
	Title         string `json:"title"`
	Year          int    `json:"year,omitempty"`
	Slug          string `json:"slug,omitempty"`
	PosterURL     string `json:"posterUrl,omitempty"`
	TMDBID        int64  `json:"tmdbId,omitempty"`
	TVDBID        int64  `json:"tvdbId,omitempty"`
	Certification string `json:"certification,omitempty"`
	Watchers      int    `json:"watchers,omitempty"`
	WatchedAt     string `json:"watchedAt,omitempty"`
	ShowTitle     string `json:"showTitle,omitempty"`
	Season        int    `json:"season,omitempty"`
	Episode       int    `json:"episode,omitempty"`
	EpTitle       string `json:"epTitle,omitempty"`
}

type TraktUserList struct {
	ID        int    `json:"id"`
	Slug      string `json:"slug"`
	Name      string `json:"name"`
	ItemCount int    `json:"itemCount"`
}

type TraktWatching struct {
	Type      string `json:"type"`
	Title     string `json:"title"`
	Year      int    `json:"year,omitempty"`
	ShowTitle string `json:"showTitle,omitempty"`
	Season    int    `json:"season,omitempty"`
	Episode   int    `json:"episode,omitempty"`
	EpTitle   string `json:"epTitle,omitempty"`
	ExpiresAt string `json:"expiresAt,omitempty"`
	TMDBID    int64  `json:"tmdbId,omitempty"`
	IMDBID    string `json:"imdbId,omitempty"`
}

type TraktStats struct {
	MoviesWatched   int            `json:"moviesWatched"`
	EpisodesWatched int            `json:"episodesWatched"`
	RatingsTotal    int            `json:"ratingsTotal"`
	RatingsDist     map[string]int `json:"ratingsDist,omitempty"`
}

type TraktPanelData struct {
	Username          string          `json:"username"`
	Watching          *TraktWatching  `json:"watching,omitempty"`
	Stats             TraktStats      `json:"stats"`
	TrendingMovies    []TraktCard     `json:"trendingMovies"`
	TrendingShows     []TraktCard     `json:"trendingShows"`
	PopularMovies     []TraktCard     `json:"popularMovies"`
	PopularShows      []TraktCard     `json:"popularShows"`
	AnticipatedMovies []TraktCard     `json:"anticipatedMovies"`
	AnticipatedShows  []TraktCard     `json:"anticipatedShows"`
	WatchlistMovies   []TraktCard     `json:"watchlistMovies"`
	WatchlistShows    []TraktCard     `json:"watchlistShows"`
	UserLists         []TraktUserList `json:"userLists"`
	ListsError        string          `json:"listsError,omitempty"`
	History           []TraktCard     `json:"history"`
}

// ── Raw API types ─────────────────────────────────────────────────────────────

type traktIDs struct {
	Slug string `json:"slug"`
	TMDB int64  `json:"tmdb"`
	TVDB int64  `json:"tvdb"`
	IMDB string `json:"imdb"`
}

type traktMedia struct {
	Title         string   `json:"title"`
	Year          int      `json:"year"`
	Certification string   `json:"certification"`
	IDs           traktIDs `json:"ids"`
}

type traktEpisodeRaw struct {
	Season int      `json:"season"`
	Number int      `json:"number"`
	Title  string   `json:"title"`
	IDs    traktIDs `json:"ids"`
}

// ── Section fetchers ──────────────────────────────────────────────────────────

func traktFetchTrending(clientID, mediaType string, limit int) []TraktCard {
	_, b, err := traktGet(clientID, fmt.Sprintf("/%ss/trending?limit=%d&extended=full", mediaType, limit))
	if err != nil {
		return nil
	}
	if mediaType == "movie" {
		var raw []struct {
			Watchers int        `json:"watchers"`
			Movie    traktMedia `json:"movie"`
		}
		if json.Unmarshal(b, &raw) != nil {
			return nil
		}
		out := make([]TraktCard, 0, len(raw))
		for _, r := range raw {
			out = append(out, TraktCard{Type: "movie", Title: r.Movie.Title, Year: r.Movie.Year, Slug: r.Movie.IDs.Slug, TMDBID: r.Movie.IDs.TMDB, Certification: r.Movie.Certification, Watchers: r.Watchers})
		}
		return out
	}
	var raw []struct {
		Watchers int        `json:"watchers"`
		Show     traktMedia `json:"show"`
	}
	if json.Unmarshal(b, &raw) != nil {
		return nil
	}
	out := make([]TraktCard, 0, len(raw))
	for _, r := range raw {
		out = append(out, TraktCard{Type: "show", Title: r.Show.Title, Year: r.Show.Year, Slug: r.Show.IDs.Slug, TMDBID: r.Show.IDs.TMDB, TVDBID: r.Show.IDs.TVDB, Certification: r.Show.Certification, Watchers: r.Watchers})
	}
	return out
}

func traktFetchPopular(clientID, mediaType string, limit int) []TraktCard {
	_, b, err := traktGet(clientID, fmt.Sprintf("/%ss/popular?limit=%d&extended=full", mediaType, limit))
	if err != nil {
		return nil
	}
	var raw []traktMedia
	if json.Unmarshal(b, &raw) != nil {
		return nil
	}
	out := make([]TraktCard, 0, len(raw))
	for _, r := range raw {
		out = append(out, TraktCard{Type: mediaType, Title: r.Title, Year: r.Year, Slug: r.IDs.Slug, TMDBID: r.IDs.TMDB, TVDBID: r.IDs.TVDB, Certification: r.Certification})
	}
	return out
}

func traktFetchAnticipated(clientID, mediaType string, limit int) []TraktCard {
	_, b, err := traktGet(clientID, fmt.Sprintf("/%ss/anticipated?limit=%d&extended=full", mediaType, limit))
	if err != nil {
		return nil
	}
	if mediaType == "movie" {
		var raw []struct {
			Movie traktMedia `json:"movie"`
		}
		if json.Unmarshal(b, &raw) != nil {
			return nil
		}
		out := make([]TraktCard, 0, len(raw))
		for _, r := range raw {
			out = append(out, TraktCard{Type: "movie", Title: r.Movie.Title, Year: r.Movie.Year, Slug: r.Movie.IDs.Slug, TMDBID: r.Movie.IDs.TMDB, Certification: r.Movie.Certification})
		}
		return out
	}
	var raw []struct {
		Show traktMedia `json:"show"`
	}
	if json.Unmarshal(b, &raw) != nil {
		return nil
	}
	out := make([]TraktCard, 0, len(raw))
	for _, r := range raw {
		out = append(out, TraktCard{Type: "show", Title: r.Show.Title, Year: r.Show.Year, Slug: r.Show.IDs.Slug, TMDBID: r.Show.IDs.TMDB, TVDBID: r.Show.IDs.TVDB, Certification: r.Show.Certification})
	}
	return out
}

func traktFetchWatchlist(clientID, username, mediaType string) []TraktCard {
	_, b, err := traktGet(clientID, fmt.Sprintf("/users/%s/watchlist/%ss?extended=full", username, mediaType))
	if err != nil {
		return nil
	}
	if mediaType == "movie" {
		var raw []struct {
			Movie traktMedia `json:"movie"`
		}
		if json.Unmarshal(b, &raw) != nil {
			return nil
		}
		out := make([]TraktCard, 0, len(raw))
		for _, r := range raw {
			out = append(out, TraktCard{Type: "movie", Title: r.Movie.Title, Year: r.Movie.Year, Slug: r.Movie.IDs.Slug, TMDBID: r.Movie.IDs.TMDB, Certification: r.Movie.Certification})
		}
		return out
	}
	var raw []struct {
		Show traktMedia `json:"show"`
	}
	if json.Unmarshal(b, &raw) != nil {
		return nil
	}
	out := make([]TraktCard, 0, len(raw))
	for _, r := range raw {
		out = append(out, TraktCard{Type: "show", Title: r.Show.Title, Year: r.Show.Year, Slug: r.Show.IDs.Slug, TMDBID: r.Show.IDs.TMDB, TVDBID: r.Show.IDs.TVDB, Certification: r.Show.Certification})
	}
	return out
}

func traktFetchUserLists(clientID, username string) ([]TraktUserList, string) {
	code, b, err := traktGet(clientID, fmt.Sprintf("/users/%s/lists", username))
	if err != nil {
		return nil, fmt.Sprintf("request error: %v", err)
	}
	if code != 200 {
		preview := string(b)
		if len(preview) > 120 {
			preview = preview[:120]
		}
		return nil, fmt.Sprintf("HTTP %d: %s", code, preview)
	}
	var raw []struct {
		Name      string `json:"name"`
		ItemCount int    `json:"item_count"`
		IDs       struct {
			Trakt int    `json:"trakt"`
			Slug  string `json:"slug"`
		} `json:"ids"`
	}
	if err := json.Unmarshal(b, &raw); err != nil {
		preview := string(b)
		if len(preview) > 120 {
			preview = preview[:120]
		}
		return nil, fmt.Sprintf("parse error: %v — raw: %s", err, preview)
	}
	out := make([]TraktUserList, 0, len(raw))
	for _, r := range raw {
		out = append(out, TraktUserList{ID: r.IDs.Trakt, Slug: r.IDs.Slug, Name: r.Name, ItemCount: r.ItemCount})
	}
	if len(out) == 0 {
		preview := string(b)
		if len(preview) > 200 {
			preview = preview[:200]
		}
		return out, fmt.Sprintf("HTTP 200, 0 lists parsed — raw: %s", preview)
	}
	return out, ""
}

func traktFetchHistory(clientID, username string, limit int) []TraktCard {
	_, b, err := traktGet(clientID, fmt.Sprintf("/users/%s/history?limit=%d&extended=full", username, limit))
	if err != nil {
		return nil
	}
	var raw []struct {
		Type      string          `json:"type"`
		WatchedAt string          `json:"watched_at"`
		Movie     *traktMedia     `json:"movie"`
		Episode   *traktEpisodeRaw `json:"episode"`
		Show      *traktMedia     `json:"show"`
	}
	if json.Unmarshal(b, &raw) != nil {
		return nil
	}
	seen := map[int64]bool{}
	out := make([]TraktCard, 0, len(raw))
	for _, r := range raw {
		if r.Type == "movie" && r.Movie != nil {
			if seen[r.Movie.IDs.TMDB] {
				continue
			}
			seen[r.Movie.IDs.TMDB] = true
			out = append(out, TraktCard{
				Type: "movie", Title: r.Movie.Title, Year: r.Movie.Year,
				Slug: r.Movie.IDs.Slug, TMDBID: r.Movie.IDs.TMDB,
				Certification: r.Movie.Certification, WatchedAt: r.WatchedAt,
			})
		} else if r.Type == "episode" && r.Episode != nil && r.Show != nil {
			if seen[r.Show.IDs.TMDB] {
				continue
			}
			seen[r.Show.IDs.TMDB] = true
			out = append(out, TraktCard{
				Type: "episode", Title: r.Show.Title, Year: r.Show.Year,
				Slug: r.Show.IDs.Slug, TMDBID: r.Show.IDs.TMDB, TVDBID: r.Show.IDs.TVDB,
				Certification: r.Show.Certification, WatchedAt: r.WatchedAt,
				ShowTitle: r.Show.Title, Season: r.Episode.Season,
				Episode: r.Episode.Number, EpTitle: r.Episode.Title,
			})
		}
	}
	return out
}

// ── Parsers ───────────────────────────────────────────────────────────────────

func parseTraktWatching(b []byte) *TraktWatching {
	var raw struct {
		Type      string          `json:"type"`
		ExpiresAt string          `json:"expires_at"`
		Movie     *traktMedia     `json:"movie"`
		Episode   *traktEpisodeRaw `json:"episode"`
		Show      *traktMedia     `json:"show"`
	}
	if json.Unmarshal(b, &raw) != nil {
		return nil
	}
	w := &TraktWatching{Type: raw.Type, ExpiresAt: raw.ExpiresAt}
	if raw.Type == "movie" && raw.Movie != nil {
		w.Title = raw.Movie.Title
		w.Year = raw.Movie.Year
		w.TMDBID = raw.Movie.IDs.TMDB
		w.IMDBID = raw.Movie.IDs.IMDB
	} else if raw.Type == "episode" && raw.Episode != nil {
		w.Season = raw.Episode.Season
		w.Episode = raw.Episode.Number
		w.EpTitle = raw.Episode.Title
		if raw.Show != nil {
			w.ShowTitle = raw.Show.Title
			w.Title = raw.Show.Title
			w.Year = raw.Show.Year
			w.TMDBID = raw.Show.IDs.TMDB
		}
	}
	return w
}

func parseTraktStats(b []byte) TraktStats {
	var raw struct {
		Movies struct {
			Watched int `json:"watched"`
		} `json:"movies"`
		Episodes struct {
			Watched int `json:"watched"`
		} `json:"episodes"`
		Ratings struct {
			Total        int            `json:"total"`
			Distribution map[string]int `json:"distribution"`
		} `json:"ratings"`
	}
	if json.Unmarshal(b, &raw) != nil {
		return TraktStats{}
	}
	return TraktStats{
		MoviesWatched:   raw.Movies.Watched,
		EpisodesWatched: raw.Episodes.Watched,
		RatingsTotal:    raw.Ratings.Total,
		RatingsDist:     raw.Ratings.Distribution,
	}
}

// ── Rating filter ─────────────────────────────────────────────────────────────

func traktRatingFilter(config map[string]interface{}, key string) []string {
	raw, _ := config[key].(string)
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

func traktCertAllowed(cert string, allowed []string) bool {
	if len(allowed) == 0 {
		return true
	}
	c := strings.ToUpper(strings.TrimSpace(cert))
	if c == "" || c == "NR" || c == "NOT RATED" || c == "UNRATED" {
		// Include NR/Unrated only if explicitly listed in allowed
		for _, a := range allowed {
			if a == c || a == "NR" {
				return true
			}
		}
		return false
	}
	for _, a := range allowed {
		if a == c {
			return true
		}
	}
	return false
}

func filterTraktCards(cards []TraktCard, allowed []string) []TraktCard {
	if len(allowed) == 0 {
		return cards
	}
	out := make([]TraktCard, 0, len(cards))
	for _, c := range cards {
		if traktCertAllowed(c.Certification, allowed) {
			out = append(out, c)
		}
	}
	return out
}

func filterTraktHistory(cards []TraktCard, movieRatings, showRatings []string) []TraktCard {
	if len(movieRatings) == 0 && len(showRatings) == 0 {
		return cards
	}
	out := make([]TraktCard, 0, len(cards))
	for _, c := range cards {
		allowed := showRatings
		if c.Type == "movie" {
			allowed = movieRatings
		}
		if traktCertAllowed(c.Certification, allowed) {
			out = append(out, c)
		}
	}
	return out
}

// ── Main fetch ────────────────────────────────────────────────────────────────

func fetchTraktPanelData(db *sql.DB, config map[string]interface{}) (*TraktPanelData, error) {
	integrationID, _ := config["integrationId"].(string)
	if integrationID == "" {
		return nil, fmt.Errorf("trakt: integrationId required in panel config")
	}
	_, _, apiKey, _, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	clientID, username, tmdbKey, err := traktParseCreds(apiKey)
	if err != nil {
		return nil, err
	}

	out := &TraktPanelData{Username: username}
	var mu sync.Mutex
	var wg sync.WaitGroup

	launch := func(fn func()) {
		wg.Add(1)
		go func() { defer wg.Done(); fn() }()
	}

	launch(func() {
		code, b, err2 := traktGet(clientID, "/users/"+username+"/watching")
		if err2 == nil && code == 200 {
			if w := parseTraktWatching(b); w != nil {
				mu.Lock(); out.Watching = w; mu.Unlock()
			}
		}
	})
	launch(func() {
		code, b, err2 := traktGet(clientID, "/users/"+username+"/stats")
		if err2 == nil && code == 200 {
			s := parseTraktStats(b)
			mu.Lock(); out.Stats = s; mu.Unlock()
		}
	})
	launch(func() { c := traktFetchTrending(clientID, "movie", 15); mu.Lock(); out.TrendingMovies = c; mu.Unlock() })
	launch(func() { c := traktFetchTrending(clientID, "show", 15); mu.Lock(); out.TrendingShows = c; mu.Unlock() })
	launch(func() { c := traktFetchPopular(clientID, "movie", 15); mu.Lock(); out.PopularMovies = c; mu.Unlock() })
	launch(func() { c := traktFetchPopular(clientID, "show", 15); mu.Lock(); out.PopularShows = c; mu.Unlock() })
	launch(func() { c := traktFetchAnticipated(clientID, "movie", 15); mu.Lock(); out.AnticipatedMovies = c; mu.Unlock() })
	launch(func() { c := traktFetchAnticipated(clientID, "show", 15); mu.Lock(); out.AnticipatedShows = c; mu.Unlock() })
	launch(func() { c := traktFetchWatchlist(clientID, username, "movie"); mu.Lock(); out.WatchlistMovies = c; mu.Unlock() })
	launch(func() { c := traktFetchWatchlist(clientID, username, "show"); mu.Lock(); out.WatchlistShows = c; mu.Unlock() })
	launch(func() {
		l, listsErr := traktFetchUserLists(clientID, username)
		mu.Lock(); out.UserLists = l; out.ListsError = listsErr; mu.Unlock()
	})
	launch(func() { c := traktFetchHistory(clientID, username, 40); mu.Lock(); out.History = c; mu.Unlock() })

	wg.Wait()

	// Apply rating filters before TMDB enrichment to skip poster fetches for filtered items.
	movieRatings := traktRatingFilter(config, "movieRatings")
	showRatings := traktRatingFilter(config, "showRatings")
	out.TrendingMovies    = filterTraktCards(out.TrendingMovies,    movieRatings)
	out.TrendingShows     = filterTraktCards(out.TrendingShows,     showRatings)
	out.PopularMovies     = filterTraktCards(out.PopularMovies,     movieRatings)
	out.PopularShows      = filterTraktCards(out.PopularShows,      showRatings)
	out.AnticipatedMovies = filterTraktCards(out.AnticipatedMovies, movieRatings)
	out.AnticipatedShows  = filterTraktCards(out.AnticipatedShows,  showRatings)
	out.WatchlistMovies   = filterTraktCards(out.WatchlistMovies,   movieRatings)
	out.WatchlistShows    = filterTraktCards(out.WatchlistShows,    showRatings)
	out.History           = filterTraktHistory(out.History,          movieRatings, showRatings)

	var allCards []*TraktCard
	for i := range out.TrendingMovies    { allCards = append(allCards, &out.TrendingMovies[i]) }
	for i := range out.TrendingShows     { allCards = append(allCards, &out.TrendingShows[i]) }
	for i := range out.PopularMovies     { allCards = append(allCards, &out.PopularMovies[i]) }
	for i := range out.PopularShows      { allCards = append(allCards, &out.PopularShows[i]) }
	for i := range out.AnticipatedMovies { allCards = append(allCards, &out.AnticipatedMovies[i]) }
	for i := range out.AnticipatedShows  { allCards = append(allCards, &out.AnticipatedShows[i]) }
	for i := range out.WatchlistMovies   { allCards = append(allCards, &out.WatchlistMovies[i]) }
	for i := range out.WatchlistShows    { allCards = append(allCards, &out.WatchlistShows[i]) }
	for i := range out.History           { allCards = append(allCards, &out.History[i]) }
	tmdbEnrichCards(allCards, tmdbKey)

	return out, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testTraktConnection(apiKey string) error {
	clientID, username, _, err := traktParseCreds(apiKey)
	if err != nil {
		return err
	}
	code, _, err := traktGet(clientID, "/users/"+username+"/stats")
	if err != nil {
		return err
	}
	if code == 404 {
		return fmt.Errorf("trakt: user '%s' not found — check username", username)
	}
	if code == 401 || code == 403 {
		return fmt.Errorf("trakt: unauthorized — check your Client ID")
	}
	if code == 423 {
		return fmt.Errorf("trakt: user '%s' has a private profile — set Trakt profile to public", username)
	}
	if code != 200 {
		return fmt.Errorf("trakt: HTTP %d — check credentials", code)
	}
	return nil
}
