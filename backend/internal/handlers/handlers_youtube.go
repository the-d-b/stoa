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

func youtubeRedirectURI(r *http.Request) string {
	scheme := "https"
	host := r.Host
	if strings.HasPrefix(host, "localhost") || strings.HasPrefix(host, "127.") || strings.HasPrefix(host, "[::1]") {
		scheme = "http"
	}
	return scheme + "://" + host + "/api/youtube/callback"
}

func youtubeParseCreds(apiKey string) (clientID, clientSecret string, err error) {
	idx := strings.Index(apiKey, ":")
	if idx < 0 {
		return "", "", fmt.Errorf("youtube: API key must be clientId:clientSecret")
	}
	return apiKey[:idx], apiKey[idx+1:], nil
}

// ── OAuth routes ──────────────────────────────────────────────────────────────

func YouTubeOAuthRedirect(db *sql.DB) http.HandlerFunc {
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
		clientID, _, err := youtubeParseCreds(apiKey)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		authURL := "https://accounts.google.com/o/oauth2/v2/auth?" + url.Values{
			"client_id":     {clientID},
			"redirect_uri":  {youtubeRedirectURI(r)},
			"response_type": {"code"},
			"scope":         {"https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile"},
			"access_type":   {"offline"},
			"prompt":        {"consent"},
			"state":         {integrationID},
		}.Encode()

		http.Redirect(w, r, authURL, http.StatusTemporaryRedirect)
	}
}

func YouTubeOAuthCallback(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if errParam := r.URL.Query().Get("error"); errParam != "" {
			http.Redirect(w, r, "/settings?youtube=denied", http.StatusTemporaryRedirect)
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
		clientID, clientSecret, err := youtubeParseCreds(apiKey)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		token, err := youtubeExchangeCode(clientID, clientSecret, youtubeRedirectURI(r), code)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "token exchange failed: "+err.Error())
			return
		}

		channelTitle, channelID, profileImageURL, err := youtubeFetchChannelInfo(token.AccessToken)
		if err != nil {
			channelTitle = "Unknown"
			channelID = ""
			profileImageURL = ""
		}

		expiresAt := time.Now().Add(time.Duration(token.ExpiresIn) * time.Second)
		_, err = db.Exec(`
			INSERT OR REPLACE INTO youtube_tokens
				(integration_id, access_token, refresh_token, expires_at, channel_id, channel_title, profile_image_url)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			integrationID, token.AccessToken, token.RefreshToken, expiresAt,
			channelID, channelTitle, profileImageURL,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		http.Redirect(w, r,
			"/settings?youtube=connected&name="+url.QueryEscape(channelTitle),
			http.StatusTemporaryRedirect,
		)
	}
}

func YouTubeGetStatus(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := r.URL.Query().Get("integrationId")
		if integrationID == "" {
			writeError(w, http.StatusBadRequest, "integrationId required")
			return
		}
		var channelTitle, profileImageURL string
		err := db.QueryRow(
			"SELECT channel_title, profile_image_url FROM youtube_tokens WHERE integration_id=?",
			integrationID,
		).Scan(&channelTitle, &profileImageURL)
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusOK, map[string]interface{}{"connected": false})
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"connected":       true,
			"channelTitle":    channelTitle,
			"profileImageUrl": profileImageURL,
		})
	}
}

func YouTubeDisconnect(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := r.URL.Query().Get("integrationId")
		if integrationID == "" {
			writeError(w, http.StatusBadRequest, "integrationId required")
			return
		}
		db.Exec("DELETE FROM youtube_tokens WHERE integration_id=?", integrationID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Token management ──────────────────────────────────────────────────────────

type youtubeTokenResp struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

func youtubeExchangeCode(clientID, clientSecret, redirectURI, code string) (*youtubeTokenResp, error) {
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
	b, _ := io.ReadAll(resp.Body)
	var token youtubeTokenResp
	if json.Unmarshal(b, &token) != nil || token.AccessToken == "" {
		return nil, fmt.Errorf("bad response: %s", string(b))
	}
	return &token, nil
}

func youtubeGetValidToken(db *sql.DB, integrationID string) (string, error) {
	var accessToken, refreshToken string
	var expiresAt time.Time

	err := db.QueryRow(
		"SELECT access_token, refresh_token, expires_at FROM youtube_tokens WHERE integration_id=?",
		integrationID,
	).Scan(&accessToken, &refreshToken, &expiresAt)
	if err != nil {
		return "", fmt.Errorf("youtube: not connected — authorize via integration settings")
	}

	if time.Now().Add(5 * time.Minute).Before(expiresAt) {
		return accessToken, nil
	}

	_, _, apiKey, _, err := resolveIntegration(db, integrationID)
	if err != nil {
		return "", err
	}
	clientID, clientSecret, err := youtubeParseCreds(apiKey)
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
	b, _ := io.ReadAll(resp.Body)
	var token youtubeTokenResp
	if json.Unmarshal(b, &token) != nil || token.AccessToken == "" {
		return "", fmt.Errorf("youtube: token refresh failed: %s", string(b))
	}
	newExpiry := time.Now().Add(time.Duration(token.ExpiresIn) * time.Second)
	db.Exec(`UPDATE youtube_tokens SET access_token=?, expires_at=? WHERE integration_id=?`,
		token.AccessToken, newExpiry, integrationID)
	return token.AccessToken, nil
}

func youtubeFetchChannelInfo(accessToken string) (title, channelID, profileImageURL string, err error) {
	req, _ := http.NewRequest("GET",
		"https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
		nil,
	)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	var r struct {
		Items []struct {
			ID      string `json:"id"`
			Snippet struct {
				Title      string `json:"title"`
				Thumbnails struct {
					Default struct{ URL string `json:"url"` } `json:"default"`
				} `json:"thumbnails"`
			} `json:"snippet"`
		} `json:"items"`
	}
	if json.Unmarshal(b, &r) != nil || len(r.Items) == 0 {
		err = fmt.Errorf("youtube: could not fetch channel info")
		return
	}
	ch := r.Items[0]
	return ch.Snippet.Title, ch.ID, ch.Snippet.Thumbnails.Default.URL, nil
}

func testYouTubeConnection(apiKey string) error {
	clientID, clientSecret, err := youtubeParseCreds(apiKey)
	if err != nil {
		return err
	}
	if clientID == "" || clientSecret == "" {
		return fmt.Errorf("youtube: clientId and clientSecret cannot be empty")
	}
	return nil
}
