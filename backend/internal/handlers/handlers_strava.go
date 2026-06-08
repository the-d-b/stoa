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

func stravaRedirectURI(r *http.Request) string {
	scheme := "https"
	host := r.Host
	if strings.HasPrefix(host, "localhost") || strings.HasPrefix(host, "127.") || strings.HasPrefix(host, "[::1]") {
		scheme = "http"
	}
	return scheme + "://" + host + "/api/strava/callback"
}

func stravaParseCreds(apiKey string) (clientID, clientSecret string, err error) {
	idx := strings.Index(apiKey, ":")
	if idx < 0 {
		return "", "", fmt.Errorf("strava: API key must be clientId:clientSecret")
	}
	return apiKey[:idx], apiKey[idx+1:], nil
}

// ── OAuth routes ──────────────────────────────────────────────────────────────

func StravaOAuthRedirect(db *sql.DB) http.HandlerFunc {
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
		clientID, _, err := stravaParseCreds(apiKey)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		authURL := "https://www.strava.com/oauth/authorize?" + url.Values{
			"client_id":     {clientID},
			"response_type": {"code"},
			"redirect_uri":  {stravaRedirectURI(r)},
			"scope":         {"read,activity:read,activity:read_all"},
			"state":         {integrationID},
		}.Encode()

		http.Redirect(w, r, authURL, http.StatusTemporaryRedirect)
	}
}

func StravaOAuthCallback(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if errParam := r.URL.Query().Get("error"); errParam != "" {
			http.Redirect(w, r, "/settings?strava=denied", http.StatusTemporaryRedirect)
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
		clientID, clientSecret, err := stravaParseCreds(apiKey)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		token, err := stravaExchangeCode(clientID, clientSecret, stravaRedirectURI(r), code)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "token exchange failed: "+err.Error())
			return
		}

		expiresAt := time.Unix(token.ExpiresAt, 0)
		name := strings.TrimSpace(token.Athlete.FirstName + " " + token.Athlete.LastName)
		_, err = db.Exec(`
			INSERT OR REPLACE INTO strava_tokens
				(integration_id, access_token, refresh_token, expires_at, athlete_id, athlete_name)
			VALUES (?, ?, ?, ?, ?, ?)`,
			integrationID, token.AccessToken, token.RefreshToken, expiresAt,
			token.Athlete.ID, name,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		http.Redirect(w, r,
			"/settings?strava=connected&name="+url.QueryEscape(name),
			http.StatusTemporaryRedirect,
		)
	}
}

func StravaGetStatus(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := r.URL.Query().Get("integrationId")
		if integrationID == "" {
			writeError(w, http.StatusBadRequest, "integrationId required")
			return
		}
		var athleteName string
		var athleteID int64
		err := db.QueryRow(
			"SELECT athlete_name, athlete_id FROM strava_tokens WHERE integration_id=?",
			integrationID,
		).Scan(&athleteName, &athleteID)
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
			"athleteName": athleteName,
			"athleteId":   athleteID,
		})
	}
}

func StravaDisconnect(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := r.URL.Query().Get("integrationId")
		if integrationID == "" {
			writeError(w, http.StatusBadRequest, "integrationId required")
			return
		}
		db.Exec("DELETE FROM strava_tokens WHERE integration_id=?", integrationID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Token management ──────────────────────────────────────────────────────────

type stravaTokenResp struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresAt    int64  `json:"expires_at"`
	Athlete      struct {
		ID        int64  `json:"id"`
		FirstName string `json:"firstname"`
		LastName  string `json:"lastname"`
	} `json:"athlete"`
}

func stravaExchangeCode(clientID, clientSecret, redirectURI, code string) (*stravaTokenResp, error) {
	resp, err := http.PostForm("https://www.strava.com/oauth/token", url.Values{
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
	var token stravaTokenResp
	if json.Unmarshal(b, &token) != nil || token.AccessToken == "" {
		return nil, fmt.Errorf("bad response: %s", string(b))
	}
	return &token, nil
}

func stravaGetValidToken(db *sql.DB, integrationID string) (string, error) {
	var accessToken, refreshToken string
	var expiresAt time.Time
	err := db.QueryRow(
		"SELECT access_token, refresh_token, expires_at FROM strava_tokens WHERE integration_id=?",
		integrationID,
	).Scan(&accessToken, &refreshToken, &expiresAt)
	if err != nil {
		return "", fmt.Errorf("strava: not connected — authorize via integration settings")
	}
	if time.Now().Add(5 * time.Minute).After(expiresAt) {
		return stravaRefreshAccessToken(db, integrationID, refreshToken)
	}
	return accessToken, nil
}

func stravaRefreshAccessToken(db *sql.DB, integrationID, refreshToken string) (string, error) {
	_, _, apiKey, _, err := resolveIntegration(db, integrationID)
	if err != nil {
		return "", err
	}
	clientID, clientSecret, err := stravaParseCreds(apiKey)
	if err != nil {
		return "", err
	}

	resp, err := http.PostForm("https://www.strava.com/oauth/token", url.Values{
		"client_id":     {clientID},
		"client_secret": {clientSecret},
		"refresh_token": {refreshToken},
		"grant_type":    {"refresh_token"},
	})
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	var token stravaTokenResp
	if json.Unmarshal(b, &token) != nil || token.AccessToken == "" {
		return "", fmt.Errorf("strava: refresh failed: %s", string(b))
	}

	expiresAt := time.Unix(token.ExpiresAt, 0)
	if token.RefreshToken != "" {
		db.Exec(`UPDATE strava_tokens SET access_token=?, refresh_token=?, expires_at=? WHERE integration_id=?`,
			token.AccessToken, token.RefreshToken, expiresAt, integrationID)
	} else {
		db.Exec(`UPDATE strava_tokens SET access_token=?, expires_at=? WHERE integration_id=?`,
			token.AccessToken, expiresAt, integrationID)
	}
	return token.AccessToken, nil
}

// testStravaConnection validates that clientId:clientSecret can be parsed.
// Full credential validation happens during the OAuth authorization step.
func testStravaConnection(apiKey string) error {
	clientID, clientSecret, err := stravaParseCreds(apiKey)
	if err != nil {
		return err
	}
	if clientID == "" || clientSecret == "" {
		return fmt.Errorf("strava: clientId and clientSecret cannot be empty")
	}
	return nil
}
