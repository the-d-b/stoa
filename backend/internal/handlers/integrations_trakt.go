package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ── Output types ──────────────────────────────────────────────────────────────

type TraktWatching struct {
	Type      string `json:"type"`               // "movie" or "episode"
	Title     string `json:"title"`              // movie title or show title
	Year      int    `json:"year,omitempty"`
	ShowTitle string `json:"showTitle,omitempty"` // for episodes
	Season    int    `json:"season,omitempty"`
	Episode   int    `json:"episode,omitempty"`
	EpTitle   string `json:"epTitle,omitempty"`
	ExpiresAt string `json:"expiresAt,omitempty"`
	TMDBID    int64  `json:"tmdbId,omitempty"`
	IMDBID    string `json:"imdbId,omitempty"`
}

type TraktHistoryItem struct {
	Type      string `json:"type"`
	Title     string `json:"title"`
	Year      int    `json:"year,omitempty"`
	WatchedAt string `json:"watchedAt"`
	ShowTitle string `json:"showTitle,omitempty"`
	Season    int    `json:"season,omitempty"`
	Episode   int    `json:"episode,omitempty"`
	EpTitle   string `json:"epTitle,omitempty"`
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
	Username string             `json:"username"`
	Watching *TraktWatching     `json:"watching,omitempty"`
	History  []TraktHistoryItem `json:"history"`
	Stats    TraktStats         `json:"stats"`
}

// ── Raw API sub-types ─────────────────────────────────────────────────────────

type traktMedia struct {
	Title string `json:"title"`
	Year  int    `json:"year"`
	IDs   struct {
		TMDB int64  `json:"tmdb"`
		IMDB string `json:"imdb"`
	} `json:"ids"`
}

type traktEpisode struct {
	Season int    `json:"season"`
	Number int    `json:"number"`
	Title  string `json:"title"`
	IDs    struct {
		TMDB int64  `json:"tmdb"`
		IMDB string `json:"imdb"`
	} `json:"ids"`
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

func traktParseCreds(apiKey string) (clientID, username string, err error) {
	idx := strings.Index(apiKey, ":")
	if idx < 0 {
		return "", "", fmt.Errorf("trakt: API key must be clientId:username")
	}
	return apiKey[:idx], apiKey[idx+1:], nil
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

func fetchTraktPanelData(db *sql.DB, config map[string]interface{}) (*TraktPanelData, error) {
	integrationID, _ := config["integrationId"].(string)
	if integrationID == "" {
		return nil, fmt.Errorf("trakt: integrationId required in panel config")
	}
	_, _, apiKey, _, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	clientID, username, err := traktParseCreds(apiKey)
	if err != nil {
		return nil, err
	}

	// Currently watching (204 = nothing playing)
	var watching *TraktWatching
	code, b, err := traktGet(clientID, "/users/"+username+"/watching")
	if err != nil {
		return nil, err
	}
	if code == 200 {
		watching = parseTraktWatching(b)
	} else if code == 401 || code == 403 {
		return nil, fmt.Errorf("trakt: unauthorized — check API key (client ID)")
	} else if code == 423 {
		return nil, fmt.Errorf("trakt: user '%s' has a private profile", username)
	} else if code != 204 && code != 200 {
		return nil, fmt.Errorf("trakt: HTTP %d for user '%s'", code, username)
	}

	// Watch history (last 20 items, all types)
	var history []TraktHistoryItem
	code, b, err = traktGet(clientID, "/users/"+username+"/history?limit=20")
	if err != nil {
		return nil, err
	}
	if code == 200 {
		history = parseTraktHistory(b)
	}

	// Stats
	var stats TraktStats
	code, b, err = traktGet(clientID, "/users/"+username+"/stats")
	if err == nil && code == 200 {
		stats = parseTraktStats(b)
	}

	return &TraktPanelData{
		Username: username,
		Watching: watching,
		History:  history,
		Stats:    stats,
	}, nil
}

// ── Parsers ───────────────────────────────────────────────────────────────────

func parseTraktWatching(b []byte) *TraktWatching {
	var raw struct {
		Type      string        `json:"type"`
		ExpiresAt string        `json:"expires_at"`
		Movie     *traktMedia   `json:"movie"`
		Episode   *traktEpisode `json:"episode"`
		Show      *traktMedia   `json:"show"`
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

func parseTraktHistory(b []byte) []TraktHistoryItem {
	var raw []struct {
		Type      string        `json:"type"`
		WatchedAt string        `json:"watched_at"`
		Movie     *traktMedia   `json:"movie"`
		Episode   *traktEpisode `json:"episode"`
		Show      *traktMedia   `json:"show"`
	}
	if json.Unmarshal(b, &raw) != nil {
		return nil
	}
	items := make([]TraktHistoryItem, 0, len(raw))
	for _, r := range raw {
		item := TraktHistoryItem{Type: r.Type, WatchedAt: r.WatchedAt}
		if r.Type == "movie" && r.Movie != nil {
			item.Title = r.Movie.Title
			item.Year = r.Movie.Year
			item.TMDBID = r.Movie.IDs.TMDB
			item.IMDBID = r.Movie.IDs.IMDB
		} else if r.Type == "episode" && r.Episode != nil {
			item.Season = r.Episode.Season
			item.Episode = r.Episode.Number
			item.EpTitle = r.Episode.Title
			if r.Show != nil {
				item.ShowTitle = r.Show.Title
				item.Title = r.Show.Title
				item.Year = r.Show.Year
			}
		}
		items = append(items, item)
	}
	return items
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

func testTraktConnection(apiKey string) error {
	clientID, username, err := traktParseCreds(apiKey)
	if err != nil {
		return err
	}
	if clientID == "" || username == "" {
		return fmt.Errorf("trakt: clientId and username cannot be empty")
	}
	code, _, err := traktGet(clientID, "/users/"+username+"/stats")
	if err != nil {
		return err
	}
	if code == 404 {
		return fmt.Errorf("trakt: user '%s' not found — check username", username)
	}
	if code == 401 || code == 403 {
		return fmt.Errorf("trakt: unauthorized — check your Client ID (API key)")
	}
	if code == 423 {
		return fmt.Errorf("trakt: user '%s' has a private profile — stats require a public Trakt profile", username)
	}
	if code != 200 {
		return fmt.Errorf("trakt: HTTP %d — check credentials", code)
	}
	return nil
}
