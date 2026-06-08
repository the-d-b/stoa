package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
)

// ── Output types ──────────────────────────────────────────────────────────────

type TwitchStream struct {
	UserID       string   `json:"userId"`
	UserLogin    string   `json:"userLogin"`
	UserName     string   `json:"userName"`
	GameName     string   `json:"gameName"`
	Title        string   `json:"title"`
	ViewerCount  int      `json:"viewerCount"`
	StartedAt    string   `json:"startedAt"`
	ThumbnailURL string   `json:"thumbnailUrl"`
	Tags         []string `json:"tags,omitempty"`
	IsMature     bool     `json:"isMature"`
}

type TwitchPanelData struct {
	UserLogin       string         `json:"userLogin"`
	UserName        string         `json:"userName"`
	ProfileImageURL string         `json:"profileImageUrl"`
	LiveCount       int            `json:"liveCount"`
	Streams         []TwitchStream `json:"streams"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func twitchAPIGet(clientID, accessToken, path string) ([]byte, error) {
	req, _ := http.NewRequest("GET", "https://api.twitch.tv/helix"+path, nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Client-Id", clientID)
	req.Header.Set("User-Agent", "StoaDashboard/1.0")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == 401 {
		return nil, fmt.Errorf("twitch: session expired — reconnect your Twitch account from integration settings")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("twitch: HTTP %d", resp.StatusCode)
	}
	return b, nil
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

func fetchTwitchPanelData(db *sql.DB, config map[string]interface{}) (*TwitchPanelData, error) {
	integrationID, _ := config["integrationId"].(string)
	if integrationID == "" {
		return nil, fmt.Errorf("twitch: integrationId required in panel config")
	}

	clientID, accessToken, err := twitchGetValidToken(db, integrationID)
	if err != nil {
		return nil, err
	}

	// Load stored user info
	var userLogin, userName, userID, profileImageURL string
	err = db.QueryRow(
		"SELECT user_login, user_name, user_id, profile_image_url FROM twitch_tokens WHERE integration_id=?",
		integrationID,
	).Scan(&userLogin, &userName, &userID, &profileImageURL)
	if err != nil {
		return nil, fmt.Errorf("twitch: not connected — authorize via integration settings")
	}

	// Fetch live followed streams
	b, err := twitchAPIGet(clientID, accessToken, "/streams/followed?user_id="+userID+"&first=20")
	if err != nil {
		return nil, err
	}
	var streamsResp struct {
		Data []struct {
			UserID       string   `json:"user_id"`
			UserLogin    string   `json:"user_login"`
			UserName     string   `json:"user_name"`
			GameName     string   `json:"game_name"`
			Title        string   `json:"title"`
			ViewerCount  int      `json:"viewer_count"`
			StartedAt    string   `json:"started_at"`
			ThumbnailURL string   `json:"thumbnail_url"`
			Tags         []string `json:"tags"`
			IsMature     bool     `json:"is_mature"`
		} `json:"data"`
	}
	json.Unmarshal(b, &streamsResp)

	streams := make([]TwitchStream, 0, len(streamsResp.Data))
	for _, s := range streamsResp.Data {
		// Replace Twitch thumbnail placeholders with concrete dimensions
		thumb := strings.Replace(s.ThumbnailURL, "{width}", "440", 1)
		thumb = strings.Replace(thumb, "{height}", "248", 1)
		title := s.Title
		if len(title) > 120 {
			title = title[:120] + "…"
		}
		streams = append(streams, TwitchStream{
			UserID:       s.UserID,
			UserLogin:    s.UserLogin,
			UserName:     s.UserName,
			GameName:     s.GameName,
			Title:        title,
			ViewerCount:  s.ViewerCount,
			StartedAt:    s.StartedAt,
			ThumbnailURL: thumb,
			Tags:         s.Tags,
			IsMature:     s.IsMature,
		})
	}
	// Sort by viewer count descending
	sort.Slice(streams, func(i, j int) bool {
		return streams[i].ViewerCount > streams[j].ViewerCount
	})

	return &TwitchPanelData{
		UserLogin:       userLogin,
		UserName:        userName,
		ProfileImageURL: profileImageURL,
		LiveCount:       len(streams),
		Streams:         streams,
	}, nil
}
