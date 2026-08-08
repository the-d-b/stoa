package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/gorilla/mux"
)

// TMDB's "personal account" connect flow — not standard OAuth2. There's no
// client_secret or redirect_uri registration with TMDB: you create a request
// token with the app's own API key, send the user to approve it on
// themoviedb.org, then exchange the approved token for a session_id. That
// session_id (not a bearer/refresh token pair) is what's used on subsequent
// account-specific calls, and it doesn't expire the way OAuth tokens do, so
// there's no youtubeGetValidToken-style refresh logic needed here.

func tmdbRedirectURI(r *http.Request) string {
	scheme := "https"
	host := r.Host
	if strings.HasPrefix(host, "localhost") || strings.HasPrefix(host, "127.") || strings.HasPrefix(host, "[::1]") {
		scheme = "http"
	}
	return scheme + "://" + host + "/api/tmdb/callback"
}

// ── Connect routes ────────────────────────────────────────────────────────────

func TMDBAuthRedirect(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := r.URL.Query().Get("integrationId")
		if integrationID == "" {
			writeError(w, http.StatusBadRequest, "integrationId required")
			return
		}
		_, _, apiKey, _, err := resolveIntegration(db, integrationID)
		if err != nil {
			writeError(w, http.StatusNotFound, "integration not found")
			return
		}
		if apiKey == "" {
			writeError(w, http.StatusBadRequest, "tmdb: API key required")
			return
		}

		code, b, err := tmdbGet("/authentication/token/new", apiKey)
		if err != nil || code != 200 {
			writeError(w, http.StatusBadGateway, "tmdb: failed to create request token")
			return
		}
		var tok struct {
			Success      bool   `json:"success"`
			RequestToken string `json:"request_token"`
		}
		if json.Unmarshal(b, &tok) != nil || !tok.Success || tok.RequestToken == "" {
			writeError(w, http.StatusBadGateway, "tmdb: failed to create request token")
			return
		}

		// TMDB appends its own approved/request_token params to whatever
		// redirect_to URL we give it — put integrationId in there ourselves
		// as our own "state" equivalent, since there's no state param here.
		callback := tmdbRedirectURI(r) + "?state=" + url.QueryEscape(integrationID)
		approveURL := "https://www.themoviedb.org/authenticate/" + tok.RequestToken +
			"?redirect_to=" + url.QueryEscape(callback)
		http.Redirect(w, r, approveURL, http.StatusTemporaryRedirect)
	}
}

func TMDBAuthCallback(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := r.URL.Query().Get("state")
		requestToken := r.URL.Query().Get("request_token")
		approved := r.URL.Query().Get("approved")
		if integrationID == "" || requestToken == "" || approved != "true" {
			http.Redirect(w, r, "/settings?tmdb=denied", http.StatusTemporaryRedirect)
			return
		}
		_, _, apiKey, _, err := resolveIntegration(db, integrationID)
		if err != nil {
			writeError(w, http.StatusNotFound, "integration not found")
			return
		}

		code, b, err := tmdbPost("/authentication/session/new", apiKey, map[string]string{"request_token": requestToken})
		if err != nil || code != 200 {
			http.Redirect(w, r, "/settings?tmdb=error", http.StatusTemporaryRedirect)
			return
		}
		var sess struct {
			Success   bool   `json:"success"`
			SessionID string `json:"session_id"`
		}
		if json.Unmarshal(b, &sess) != nil || !sess.Success || sess.SessionID == "" {
			http.Redirect(w, r, "/settings?tmdb=error", http.StatusTemporaryRedirect)
			return
		}

		accountID, username := tmdbFetchAccountInfo(sess.SessionID, apiKey)

		_, err = db.Exec(`
			INSERT OR REPLACE INTO tmdb_sessions (integration_id, session_id, account_id, username)
			VALUES (?, ?, ?, ?)`,
			integrationID, sess.SessionID, accountID, username,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		http.Redirect(w, r, "/settings?tmdb=connected&name="+url.QueryEscape(username), http.StatusTemporaryRedirect)
	}
}

func TMDBGetStatus(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := r.URL.Query().Get("integrationId")
		if integrationID == "" {
			writeError(w, http.StatusBadRequest, "integrationId required")
			return
		}
		var username string
		err := db.QueryRow("SELECT username FROM tmdb_sessions WHERE integration_id=?", integrationID).Scan(&username)
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusOK, map[string]interface{}{"connected": false})
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"connected": true, "username": username})
	}
}

func TMDBDisconnect(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := r.URL.Query().Get("integrationId")
		if integrationID == "" {
			writeError(w, http.StatusBadRequest, "integrationId required")
			return
		}
		db.Exec("DELETE FROM tmdb_sessions WHERE integration_id=?", integrationID) //nolint:errcheck
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func tmdbFetchAccountInfo(sessionID, apiKey string) (accountID, username string) {
	code, b, err := tmdbGet("/account?session_id="+url.QueryEscape(sessionID), apiKey)
	if err != nil || code != 200 {
		return "", ""
	}
	var acc struct {
		ID       int64  `json:"id"`
		Username string `json:"username"`
	}
	if json.Unmarshal(b, &acc) != nil {
		return "", ""
	}
	return fmt.Sprintf("%d", acc.ID), acc.Username
}

// tmdbFetchAccountData returns whether an account is connected, its
// username, and its personal lists' metadata (not their items — those are
// fetched on demand via TMDBListItems below). Called from
// fetchTMDBPanelData (integrations_tmdb.go).
func tmdbFetchAccountData(db *sql.DB, integrationID, apiKey string) (connected bool, username string, lists []TMDBList) {
	var sessionID, accountID string
	err := db.QueryRow("SELECT session_id, account_id, username FROM tmdb_sessions WHERE integration_id=?", integrationID).
		Scan(&sessionID, &accountID, &username)
	if err != nil {
		return false, "", nil
	}
	code, b, err := tmdbGet(fmt.Sprintf("/account/%s/lists?session_id=%s", accountID, url.QueryEscape(sessionID)), apiKey)
	if err != nil || code != 200 {
		return true, username, nil
	}
	var raw struct {
		Results []struct {
			ID        int64  `json:"id"`
			Name      string `json:"name"`
			ItemCount int    `json:"item_count"`
		} `json:"results"`
	}
	if json.Unmarshal(b, &raw) != nil {
		return true, username, nil
	}
	out := make([]TMDBList, 0, len(raw.Results))
	for _, r := range raw.Results {
		out = append(out, TMDBList{ID: r.ID, Name: r.Name, ItemCount: r.ItemCount})
	}
	return true, username, out
}

// ── On-demand list item fetch ──────────────────────────────────────────────────

// TMDBListItems handles GET /api/tmdb/list/{listId}?integrationId= . Public
// TMDB lists are readable with just the app's API key (no session_id
// needed), so this also works for a public list ID a user pastes in
// directly, whether or not an account is connected. Fetched on demand rather
// than eagerly for every list on every panel refresh — a user's account can
// have many lists, most of which won't be opened on a given visit.
func TMDBListItems(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		listID := mux.Vars(r)["listId"]
		integrationID := r.URL.Query().Get("integrationId")
		if listID == "" || integrationID == "" {
			writeError(w, http.StatusBadRequest, "listId and integrationId required")
			return
		}
		_, _, apiKey, _, err := resolveIntegration(db, integrationID)
		if err != nil {
			writeError(w, http.StatusNotFound, "integration not found")
			return
		}
		code, b, err := tmdbGet("/list/"+listID, apiKey)
		if err != nil || code != 200 {
			writeError(w, http.StatusBadGateway, "tmdb: failed to fetch list")
			return
		}
		var raw struct {
			Items []struct {
				MediaType    string `json:"media_type"` // "movie" or "tv"
				ID           int64  `json:"id"`
				Title        string `json:"title"`
				Name         string `json:"name"`
				ReleaseDate  string `json:"release_date"`
				FirstAirDate string `json:"first_air_date"`
				PosterPath   string `json:"poster_path"`
			} `json:"items"`
		}
		if json.Unmarshal(b, &raw) != nil {
			writeError(w, http.StatusBadGateway, "tmdb: unexpected list response")
			return
		}
		out := make([]TraktCard, 0, len(raw.Items))
		for _, it := range raw.Items {
			switch it.MediaType {
			case "movie":
				out = append(out, TraktCard{Type: "movie", Title: it.Title, Year: tmdbYearFromDate(it.ReleaseDate), TMDBID: it.ID, PosterURL: tmdbPosterURL(it.PosterPath)})
			case "tv":
				out = append(out, TraktCard{Type: "show", Title: it.Name, Year: tmdbYearFromDate(it.FirstAirDate), TMDBID: it.ID, PosterURL: tmdbPosterURL(it.PosterPath)})
			}
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": out})
	}
}
