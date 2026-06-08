package handlers

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ── Helpers ───────────────────────────────────────────────────────────────────

func spotifyRedirectURI(r *http.Request) string {
	scheme := "https"
	host := r.Host
	if strings.HasPrefix(host, "localhost") || strings.HasPrefix(host, "127.") || strings.HasPrefix(host, "[::1]") {
		scheme = "http"
	}
	return scheme + "://" + host + "/api/spotify/callback"
}

func spotifyBasicAuth(clientID, clientSecret string) string {
	return "Basic " + base64.StdEncoding.EncodeToString([]byte(clientID+":"+clientSecret))
}

func spotifyParseCreds(apiKey string) (clientID, clientSecret string, err error) {
	idx := strings.Index(apiKey, ":")
	if idx < 0 {
		return "", "", fmt.Errorf("spotify: API key must be clientId:clientSecret")
	}
	return apiKey[:idx], apiKey[idx+1:], nil
}

// ── OAuth routes ──────────────────────────────────────────────────────────────

func SpotifyOAuthRedirect(db *sql.DB) http.HandlerFunc {
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
		clientID, _, err := spotifyParseCreds(apiKey)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		scopes := strings.Join([]string{
			"user-read-private",
			"user-read-currently-playing",
			"user-read-playback-state",
			"user-read-recently-played",
			"user-top-read",
			"user-modify-playback-state",
			"streaming",
		}, " ")

		authURL := "https://accounts.spotify.com/authorize?" + url.Values{
			"client_id":     {clientID},
			"response_type": {"code"},
			"redirect_uri":  {spotifyRedirectURI(r)},
			"scope":         {scopes},
			"state":         {integrationID},
		}.Encode()

		http.Redirect(w, r, authURL, http.StatusTemporaryRedirect)
	}
}

func SpotifyOAuthCallback(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if errParam := r.URL.Query().Get("error"); errParam != "" {
			http.Redirect(w, r, "/settings?spotify=denied", http.StatusTemporaryRedirect)
			return
		}
		code := r.URL.Query().Get("code")
		integrationID := r.URL.Query().Get("state")
		if code == "" || integrationID == "" {
			writeError(w, http.StatusBadRequest, "missing code or state")
			return
		}

		_, _, apiKey, _, err := resolveIntegration(db, integrationID)
		if err != nil {
			writeError(w, http.StatusNotFound, "integration not found")
			return
		}
		clientID, clientSecret, err := spotifyParseCreds(apiKey)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		token, err := spotifyExchangeCode(clientID, clientSecret, spotifyRedirectURI(r), code)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "token exchange failed: "+err.Error())
			return
		}

		displayName, product := spotifyFetchProfile(token.AccessToken)
		expiresAt := time.Now().Add(time.Duration(token.ExpiresIn) * time.Second)

		_, err = db.Exec(`
			INSERT OR REPLACE INTO spotify_tokens
				(integration_id, access_token, refresh_token, expires_at, display_name, product)
			VALUES (?, ?, ?, ?, ?, ?)`,
			integrationID, token.AccessToken, token.RefreshToken, expiresAt, displayName, product,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		http.Redirect(w, r,
			"/settings?spotify=connected&name="+url.QueryEscape(displayName),
			http.StatusTemporaryRedirect,
		)
	}
}

func SpotifyGetStatus(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := r.URL.Query().Get("integrationId")
		if integrationID == "" {
			writeError(w, http.StatusBadRequest, "integrationId required")
			return
		}
		var displayName, product string
		var expiresAt time.Time
		err := db.QueryRow(
			"SELECT display_name, product, expires_at FROM spotify_tokens WHERE integration_id=?",
			integrationID,
		).Scan(&displayName, &product, &expiresAt)
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusOK, map[string]interface{}{"connected": false})
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"connected":   true,
			"displayName": displayName,
			"product":     product,
		})
	}
}

func SpotifyDisconnect(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := r.URL.Query().Get("integrationId")
		if integrationID == "" {
			writeError(w, http.StatusBadRequest, "integrationId required")
			return
		}
		db.Exec("DELETE FROM spotify_tokens WHERE integration_id=?", integrationID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// SpotifyGetToken returns a fresh access token — called by the frontend Web Playback SDK
func SpotifyGetToken(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := r.URL.Query().Get("integrationId")
		if integrationID == "" {
			writeError(w, http.StatusBadRequest, "integrationId required")
			return
		}
		token, err := spotifyGetValidToken(db, integrationID)
		if err != nil {
			writeError(w, http.StatusUnauthorized, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"accessToken": token})
	}
}

// ── Token management ──────────────────────────────────────────────────────────

type spotifyTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

func spotifyExchangeCode(clientID, clientSecret, redirectURI, code string) (*spotifyTokenResponse, error) {
	body := url.Values{
		"grant_type":   {"authorization_code"},
		"code":         {code},
		"redirect_uri": {redirectURI},
	}
	req, _ := http.NewRequest("POST", "https://accounts.spotify.com/api/token",
		strings.NewReader(body.Encode()))
	req.Header.Set("Authorization", spotifyBasicAuth(clientID, clientSecret))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)

	var token spotifyTokenResponse
	if json.Unmarshal(b, &token) != nil || token.AccessToken == "" {
		return nil, fmt.Errorf("bad response: %s", string(b))
	}
	return &token, nil
}

func spotifyGetValidToken(db *sql.DB, integrationID string) (string, error) {
	var accessToken string
	var expiresAt time.Time
	err := db.QueryRow(
		"SELECT access_token, expires_at FROM spotify_tokens WHERE integration_id=?",
		integrationID,
	).Scan(&accessToken, &expiresAt)
	if err != nil {
		return "", fmt.Errorf("spotify: not connected — authorize via integration settings")
	}
	if time.Now().Add(5 * time.Minute).After(expiresAt) {
		return spotifyRefreshToken(db, integrationID)
	}
	return accessToken, nil
}

func spotifyRefreshToken(db *sql.DB, integrationID string) (string, error) {
	var refreshToken string
	db.QueryRow(
		"SELECT refresh_token FROM spotify_tokens WHERE integration_id=?", integrationID,
	).Scan(&refreshToken)

	_, _, apiKey, _, err := resolveIntegration(db, integrationID)
	if err != nil {
		return "", err
	}
	clientID, clientSecret, err := spotifyParseCreds(apiKey)
	if err != nil {
		return "", err
	}

	body := url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
	}
	req, _ := http.NewRequest("POST", "https://accounts.spotify.com/api/token",
		strings.NewReader(body.Encode()))
	req.Header.Set("Authorization", spotifyBasicAuth(clientID, clientSecret))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)

	var token spotifyTokenResponse
	if json.Unmarshal(b, &token) != nil || token.AccessToken == "" {
		return "", fmt.Errorf("spotify: refresh failed: %s", string(b))
	}

	expiresAt := time.Now().Add(time.Duration(token.ExpiresIn) * time.Second)
	if token.RefreshToken != "" {
		db.Exec(`UPDATE spotify_tokens SET access_token=?, refresh_token=?, expires_at=? WHERE integration_id=?`,
			token.AccessToken, token.RefreshToken, expiresAt, integrationID)
	} else {
		db.Exec(`UPDATE spotify_tokens SET access_token=?, expires_at=? WHERE integration_id=?`,
			token.AccessToken, expiresAt, integrationID)
	}
	return token.AccessToken, nil
}

func spotifyFetchProfile(accessToken string) (displayName, product string) {
	req, _ := http.NewRequest("GET", "https://api.spotify.com/v1/me", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "free"
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	var profile struct {
		DisplayName string `json:"display_name"`
		Product     string `json:"product"`
	}
	json.Unmarshal(b, &profile)
	if profile.Product == "" {
		profile.Product = "free"
	}
	return profile.DisplayName, profile.Product
}

// testSpotifyConnection validates client credentials using the client_credentials grant
// (no user auth required — just confirms the clientId/clientSecret are valid)
func testSpotifyConnection(apiKey string) error {
	clientID, clientSecret, err := spotifyParseCreds(apiKey)
	if err != nil {
		return err
	}
	body := url.Values{"grant_type": {"client_credentials"}}
	req, _ := http.NewRequest("POST", "https://accounts.spotify.com/api/token",
		strings.NewReader(body.Encode()))
	req.Header.Set("Authorization", spotifyBasicAuth(clientID, clientSecret))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("invalid client credentials (HTTP %d) — check clientId and clientSecret", resp.StatusCode)
	}
	var token struct {
		AccessToken string `json:"access_token"`
	}
	if json.Unmarshal(b, &token) != nil || token.AccessToken == "" {
		return fmt.Errorf("credentials rejected by Spotify")
	}
	return nil
}
