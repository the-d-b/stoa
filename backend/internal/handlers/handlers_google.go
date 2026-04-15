package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

// ── Google OAuth config ───────────────────────────────────────────────────────

type GoogleOAuthConfig struct {
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
}

func GetGoogleOAuthConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var clientID string
		db.QueryRow("SELECT client_id FROM google_oauth_config WHERE id='singleton'").Scan(&clientID)
		// Never return the secret to the frontend
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"clientId":    clientID,
			"configured":  clientID != "",
		})
	}
}

func SaveGoogleOAuthConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ClientID     string `json:"clientId"`
			ClientSecret string `json:"clientSecret"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		_, err := db.Exec(
			"UPDATE google_oauth_config SET client_id=?, client_secret=? WHERE id='singleton'",
			req.ClientID, req.ClientSecret,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── OAuth flow ────────────────────────────────────────────────────────────────

func GoogleOAuthRedirect(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clientID, _, err := getGoogleCreds(db)
		if err != nil || clientID == "" {
			writeError(w, http.StatusBadRequest, "Google OAuth not configured")
			return
		}

		// scope param: "system" or "personal"
		scope := r.URL.Query().Get("scope")
		if scope != "system" {
			scope = "personal"
		}

		// Embed scope in state so callback knows where to store token
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		state := fmt.Sprintf("%s:%s", scope, claims.UserID)

		redirectURI := googleRedirectURI(r)
		authURL := "https://accounts.google.com/o/oauth2/v2/auth?" + url.Values{
			"client_id":     {clientID},
			"redirect_uri":  {redirectURI},
			"response_type": {"code"},
			"scope":         {"https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email"},
			"access_type":   {"offline"},
			"prompt":        {"consent"}, // force refresh_token every time
			"state":         {state},
		}.Encode()

		http.Redirect(w, r, authURL, http.StatusTemporaryRedirect)
	}
}

func GoogleOAuthCallback(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		code := r.URL.Query().Get("code")
		state := r.URL.Query().Get("state")
		if code == "" {
			writeError(w, http.StatusBadRequest, "missing code")
			return
		}

		// Parse state: "scope:userID"
		parts := strings.SplitN(state, ":", 2)
		if len(parts) != 2 {
			writeError(w, http.StatusBadRequest, "invalid state")
			return
		}
		scope, userID := parts[0], parts[1]

		clientID, clientSecret, err := getGoogleCreds(db)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Google OAuth not configured")
			return
		}

		redirectURI := googleRedirectURI(r)

		// Exchange code for tokens
		token, err := googleExchangeCode(clientID, clientSecret, redirectURI, code)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "token exchange failed: "+err.Error())
			return
		}

		// Get user email
		email, err := googleGetEmail(token.AccessToken)
		if err != nil {
			email = "unknown"
		}

		// Store token
		id := generateID()
		storedUserID := sql.NullString{}
		if scope == "personal" {
			storedUserID = sql.NullString{String: userID, Valid: true}
		}
		_, err = db.Exec(`
			INSERT OR REPLACE INTO google_oauth_tokens
				(id, scope, user_id, email, access_token, refresh_token, expires_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			id, scope, storedUserID,
			email, token.AccessToken, token.RefreshToken,
			time.Now().Add(time.Duration(token.ExpiresIn)*time.Second),
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		// Redirect back to settings page with success indicator
		http.Redirect(w, r, "/settings?google=connected&email="+url.QueryEscape(email), http.StatusTemporaryRedirect)
	}
}

// ── Token management ──────────────────────────────────────────────────────────

type googleTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	TokenType    string `json:"token_type"`
}

func googleExchangeCode(clientID, clientSecret, redirectURI, code string) (*googleTokenResponse, error) {
	resp, err := http.PostForm("https://oauth2.googleapis.com/token", url.Values{
		"code":          {code},
		"client_id":     {clientID},
		"client_secret": {clientSecret},
		"redirect_uri":  {redirectURI},
		"grant_type":    {"authorization_code"},
	})
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var token googleTokenResponse
	if err := json.Unmarshal(body, &token); err != nil {
		return nil, fmt.Errorf("parse error: %s", string(body))
	}
	if token.AccessToken == "" {
		return nil, fmt.Errorf("no access token: %s", string(body))
	}
	return &token, nil
}

func googleRefreshToken(db *sql.DB, tokenID string) (string, error) {
	var refreshToken, clientID, clientSecret string
	err := db.QueryRow(
		"SELECT refresh_token FROM google_oauth_tokens WHERE id=?", tokenID,
	).Scan(&refreshToken)
	if err != nil {
		return "", err
	}
	clientID, clientSecret, err = getGoogleCreds(db)
	if err != nil {
		return "", err
	}

	resp, err := http.PostForm("https://oauth2.googleapis.com/token", url.Values{
		"refresh_token": {refreshToken},
		"client_id":     {clientID},
		"client_secret": {clientSecret},
		"grant_type":    {"refresh_token"},
	})
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var token googleTokenResponse
	if err := json.Unmarshal(body, &token); err != nil || token.AccessToken == "" {
		return "", fmt.Errorf("refresh failed: %s", string(body))
	}

	// Update stored token
	db.Exec(
		"UPDATE google_oauth_tokens SET access_token=?, expires_at=? WHERE id=?",
		token.AccessToken,
		time.Now().Add(time.Duration(token.ExpiresIn)*time.Second),
		tokenID,
	)
	return token.AccessToken, nil
}

// GetValidAccessToken returns a valid access token, refreshing if needed
func GetValidAccessToken(db *sql.DB, tokenID string) (string, error) {
	var accessToken string
	var expiresAt time.Time
	err := db.QueryRow(
		"SELECT access_token, expires_at FROM google_oauth_tokens WHERE id=?", tokenID,
	).Scan(&accessToken, &expiresAt)
	if err != nil {
		return "", fmt.Errorf("token not found")
	}
	// Refresh if expiring within 5 minutes
	if time.Now().Add(5 * time.Minute).After(expiresAt) {
		return googleRefreshToken(db, tokenID)
	}
	return accessToken, nil
}

// ── Google Calendar API ───────────────────────────────────────────────────────

type GoogleCalendar struct {
	ID      string `json:"id"`
	Summary string `json:"summary"`
	Primary bool   `json:"primary"`
}

func GoogleListCalendars(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tokenID := r.URL.Query().Get("tokenId")
		if tokenID == "" {
			writeError(w, http.StatusBadRequest, "tokenId required")
			return
		}
		accessToken, err := GetValidAccessToken(db, tokenID)
		if err != nil {
			writeError(w, http.StatusUnauthorized, err.Error())
			return
		}
		calendars, err := googleFetchCalendarList(accessToken)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, calendars)
	}
}

func googleFetchCalendarList(accessToken string) ([]GoogleCalendar, error) {
	req, _ := http.NewRequest("GET", "https://www.googleapis.com/calendar/v3/users/me/calendarList", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Items []struct {
			ID      string `json:"id"`
			Summary string `json:"summary"`
			Primary bool   `json:"primary"`
		} `json:"items"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	var cals []GoogleCalendar
	for _, item := range result.Items {
		cals = append(cals, GoogleCalendar{
			ID:      item.ID,
			Summary: item.Summary,
			Primary: item.Primary,
		})
	}
	return cals, nil
}

// FetchGoogleCalendarEvents fetches events for a calendar within a date range
func FetchGoogleCalendarEvents(accessToken, calendarID string, timeMin, timeMax time.Time) ([]map[string]interface{}, error) {
	params := url.Values{
		"timeMin":      {timeMin.UTC().Format(time.RFC3339)},
		"timeMax":      {timeMax.UTC().Format(time.RFC3339)},
		"singleEvents": {"true"},
		"orderBy":      {"startTime"},
		"maxResults":   {"250"},
	}
	apiURL := "https://www.googleapis.com/calendar/v3/calendars/" +
		url.PathEscape(calendarID) + "/events?" + params.Encode()
	req, _ := http.NewRequest("GET", apiURL, nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Items []map[string]interface{} `json:"items"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	return result.Items, nil
}

func GoogleListTokens(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		scope := r.URL.Query().Get("scope")

		var rows *sql.Rows
		var err error
		if scope == "system" && claims.Role == "admin" {
			rows, err = db.Query(
				"SELECT id, email, scope, expires_at FROM google_oauth_tokens WHERE scope='system'",
			)
		} else {
			rows, err = db.Query(
				"SELECT id, email, scope, expires_at FROM google_oauth_tokens WHERE user_id=?",
				claims.UserID,
			)
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		defer rows.Close()
		type tokenRow struct {
			ID        string `json:"id"`
			Email     string `json:"email"`
			Scope     string `json:"scope"`
			ExpiresAt string `json:"expiresAt"`
		}
		var tokens []tokenRow
		for rows.Next() {
			var t tokenRow
			rows.Scan(&t.ID, &t.Email, &t.Scope, &t.ExpiresAt)
			tokens = append(tokens, t)
		}
		if tokens == nil {
			tokens = []tokenRow{}
		}
		writeJSON(w, http.StatusOK, tokens)
	}
}

func GoogleDeleteToken(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := r.URL.Query().Get("id")
		if id == "" {
			writeError(w, http.StatusBadRequest, "id required")
			return
		}
		if claims.Role == "admin" {
			db.Exec("DELETE FROM google_oauth_tokens WHERE id=?", id)
		} else {
			db.Exec("DELETE FROM google_oauth_tokens WHERE id=? AND user_id=?", id, claims.UserID)
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func getGoogleCreds(db *sql.DB) (clientID, clientSecret string, err error) {
	err = db.QueryRow(
		"SELECT client_id, client_secret FROM google_oauth_config WHERE id='singleton'",
	).Scan(&clientID, &clientSecret)
	return
}

func googleGetEmail(accessToken string) (string, error) {
	req, _ := http.NewRequest("GET", "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var info struct {
		Email string `json:"email"`
	}
	json.Unmarshal(body, &info)
	return info.Email, nil
}

func googleRedirectURI(r *http.Request) string {
	scheme := "https"
	return scheme + "://" + r.Host + "/api/auth/google/callback"
}
