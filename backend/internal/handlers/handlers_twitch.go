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
)

func twitchRedirectURI(r *http.Request) string {
	scheme := "https"
	host := r.Host
	if strings.HasPrefix(host, "localhost") || strings.HasPrefix(host, "127.") || strings.HasPrefix(host, "[::1]") {
		scheme = "http"
	}
	return scheme + "://" + host + "/api/twitch/callback"
}

func twitchParseCreds(apiKey string) (clientID, clientSecret string, err error) {
	idx := strings.Index(apiKey, ":")
	if idx < 0 {
		return "", "", fmt.Errorf("twitch: API key must be clientId:clientSecret")
	}
	return apiKey[:idx], apiKey[idx+1:], nil
}

// ── OAuth routes ──────────────────────────────────────────────────────────────

func TwitchOAuthRedirect(db *sql.DB) http.HandlerFunc {
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
		clientID, _, err := twitchParseCreds(apiKey)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		authURL := "https://id.twitch.tv/oauth2/authorize?" + url.Values{
			"client_id":     {clientID},
			"redirect_uri":  {twitchRedirectURI(r)},
			"response_type": {"code"},
			"scope":         {"user:read:follows"},
			"state":         {integrationID},
		}.Encode()

		http.Redirect(w, r, authURL, http.StatusTemporaryRedirect)
	}
}

func TwitchOAuthCallback(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if errParam := r.URL.Query().Get("error"); errParam != "" {
			http.Redirect(w, r, "/settings?twitch=denied", http.StatusTemporaryRedirect)
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
		clientID, clientSecret, err := twitchParseCreds(apiKey)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		token, err := twitchExchangeCode(clientID, clientSecret, twitchRedirectURI(r), code)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "token exchange failed: "+err.Error())
			return
		}

		userLogin, userName, userID, profileImageURL, err := twitchFetchUser(clientID, token.AccessToken)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch user: "+err.Error())
			return
		}

		expiresAt := time.Now().Add(time.Duration(token.ExpiresIn) * time.Second)
		_, err = db.Exec(`
			INSERT OR REPLACE INTO twitch_tokens
				(integration_id, access_token, refresh_token, expires_at, user_id, user_login, user_name, profile_image_url)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			integrationID, token.AccessToken, token.RefreshToken, expiresAt,
			userID, userLogin, userName, profileImageURL,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		http.Redirect(w, r,
			"/settings?twitch=connected&name="+url.QueryEscape(userName),
			http.StatusTemporaryRedirect,
		)
	}
}

func TwitchGetStatus(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := r.URL.Query().Get("integrationId")
		if integrationID == "" {
			writeError(w, http.StatusBadRequest, "integrationId required")
			return
		}
		var userLogin, userName string
		err := db.QueryRow(
			"SELECT user_login, user_name FROM twitch_tokens WHERE integration_id=?",
			integrationID,
		).Scan(&userLogin, &userName)
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusOK, map[string]interface{}{"connected": false})
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"connected": true,
			"userLogin": userLogin,
			"userName":  userName,
		})
	}
}

func TwitchDisconnect(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := r.URL.Query().Get("integrationId")
		if integrationID == "" {
			writeError(w, http.StatusBadRequest, "integrationId required")
			return
		}
		db.Exec("DELETE FROM twitch_tokens WHERE integration_id=?", integrationID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Token management ──────────────────────────────────────────────────────────

type twitchTokenResp struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

func twitchExchangeCode(clientID, clientSecret, redirectURI, code string) (*twitchTokenResp, error) {
	resp, err := http.PostForm("https://id.twitch.tv/oauth2/token", url.Values{
		"client_id":     {clientID},
		"client_secret": {clientSecret},
		"code":          {code},
		"grant_type":    {"authorization_code"},
		"redirect_uri":  {redirectURI},
	})
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	var token twitchTokenResp
	if json.Unmarshal(b, &token) != nil || token.AccessToken == "" {
		return nil, fmt.Errorf("bad response: %s", string(b))
	}
	return &token, nil
}

// twitchGetValidToken returns the clientID and a valid access token, refreshing if needed.
func twitchGetValidToken(db *sql.DB, integrationID string) (clientID, accessToken string, err error) {
	var refreshToken string
	var expiresAt time.Time

	err = db.QueryRow(
		"SELECT access_token, refresh_token, expires_at FROM twitch_tokens WHERE integration_id=?",
		integrationID,
	).Scan(&accessToken, &refreshToken, &expiresAt)
	if err != nil {
		return "", "", fmt.Errorf("twitch: not connected — authorize via integration settings")
	}

	var apiKey string
	_, _, apiKey, _, err = resolveIntegration(db, integrationID)
	if err != nil {
		return "", "", err
	}
	var clientSecret string
	clientID, clientSecret, err = twitchParseCreds(apiKey)
	if err != nil {
		return "", "", err
	}

	// Token still valid
	if time.Now().Add(5 * time.Minute).Before(expiresAt) {
		return clientID, accessToken, nil
	}

	// Refresh
	resp, refreshErr := http.PostForm("https://id.twitch.tv/oauth2/token", url.Values{
		"client_id":     {clientID},
		"client_secret": {clientSecret},
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
	})
	if refreshErr != nil {
		return "", "", refreshErr
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	var token twitchTokenResp
	if json.Unmarshal(b, &token) != nil || token.AccessToken == "" {
		return "", "", fmt.Errorf("twitch: token refresh failed: %s", string(b))
	}
	newExpiry := time.Now().Add(time.Duration(token.ExpiresIn) * time.Second)
	db.Exec(`UPDATE twitch_tokens SET access_token=?, refresh_token=?, expires_at=? WHERE integration_id=?`,
		token.AccessToken, token.RefreshToken, newExpiry, integrationID)
	return clientID, token.AccessToken, nil
}

func twitchFetchUser(clientID, accessToken string) (login, displayName, userID, profileImageURL string, err error) {
	req, _ := http.NewRequest("GET", "https://api.twitch.tv/helix/users", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Client-Id", clientID)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	var r struct {
		Data []struct {
			ID              string `json:"id"`
			Login           string `json:"login"`
			DisplayName     string `json:"display_name"`
			ProfileImageURL string `json:"profile_image_url"`
		} `json:"data"`
	}
	if json.Unmarshal(b, &r) != nil || len(r.Data) == 0 {
		err = fmt.Errorf("twitch: unexpected user response")
		return
	}
	u := r.Data[0]
	return u.Login, u.DisplayName, u.ID, u.ProfileImageURL, nil
}

func testTwitchConnection(apiKey string) error {
	clientID, clientSecret, err := twitchParseCreds(apiKey)
	if err != nil {
		return err
	}
	if clientID == "" || clientSecret == "" {
		return fmt.Errorf("twitch: clientId and clientSecret cannot be empty")
	}
	return nil
}
