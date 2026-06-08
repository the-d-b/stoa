package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ── API types (private) ───────────────────────────────────────────────────────

type spotifyArtist struct {
	Name string `json:"name"`
}

type spotifyImage struct {
	URL   string `json:"url"`
	Width int    `json:"width"`
}

type spotifyAlbum struct {
	Name   string         `json:"name"`
	Images []spotifyImage `json:"images"`
}

type spotifyTrackItem struct {
	ID         string          `json:"id"`
	Name       string          `json:"name"`
	Artists    []spotifyArtist `json:"artists"`
	Album      spotifyAlbum    `json:"album"`
	DurationMs int             `json:"duration_ms"`
}

func (t spotifyTrackItem) joinArtists() string {
	names := make([]string, len(t.Artists))
	for i, a := range t.Artists {
		names[i] = a.Name
	}
	return strings.Join(names, ", ")
}

func (t spotifyTrackItem) bestImage() string {
	for _, img := range t.Album.Images {
		if img.Width >= 300 {
			return img.URL
		}
	}
	if len(t.Album.Images) > 0 {
		return t.Album.Images[0].URL
	}
	return ""
}

type spotifyCurrentlyPlayingRaw struct {
	Item       *spotifyTrackItem `json:"item"`
	ProgressMs int               `json:"progress_ms"`
	IsPlaying  bool              `json:"is_playing"`
}

type spotifyHistoryItem struct {
	Track    spotifyTrackItem `json:"track"`
	PlayedAt string           `json:"played_at"`
}

type spotifyHistoryResponse struct {
	Items []spotifyHistoryItem `json:"items"`
}

// ── Panel output types ────────────────────────────────────────────────────────

type SpotifyNowPlaying struct {
	TrackID    string `json:"trackId"`
	TrackName  string `json:"trackName"`
	ArtistName string `json:"artistName"`
	AlbumName  string `json:"albumName"`
	AlbumArt   string `json:"albumArt"`
	ProgressMs int    `json:"progressMs"`
	DurationMs int    `json:"durationMs"`
	IsPlaying  bool   `json:"isPlaying"`
}

type SpotifyRecentTrack struct {
	TrackID    string `json:"trackId"`
	TrackName  string `json:"trackName"`
	ArtistName string `json:"artistName"`
	AlbumName  string `json:"albumName"`
	AlbumArt   string `json:"albumArt"`
	PlayedAt   string `json:"playedAt"`
}

type SpotifyPanelData struct {
	IntegrationID string               `json:"integrationId"`
	DisplayName   string               `json:"displayName"`
	IsPremium     bool                 `json:"isPremium"`
	NowPlaying    *SpotifyNowPlaying   `json:"nowPlaying"`
	RecentTracks  []SpotifyRecentTrack `json:"recentTracks"`
}

// ── API helper ────────────────────────────────────────────────────────────────

func spotifyAPIGet(accessToken, path string) ([]byte, int, error) {
	req, _ := http.NewRequest("GET", "https://api.spotify.com"+path, nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 204 {
		return nil, 204, nil
	}
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, resp.StatusCode, fmt.Errorf("spotify API %d: %s", resp.StatusCode, string(b))
	}
	return b, resp.StatusCode, nil
}

// ── Playback control ──────────────────────────────────────────────────────────

func SpotifyPlaybackControl(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := r.URL.Query().Get("integrationId")
		action := r.URL.Query().Get("action")
		if integrationID == "" || action == "" {
			writeError(w, http.StatusBadRequest, "integrationId and action required")
			return
		}
		token, err := spotifyGetValidToken(db, integrationID)
		if err != nil {
			writeError(w, http.StatusUnauthorized, err.Error())
			return
		}

		var method, path string
		switch action {
		case "play":
			method, path = "PUT", "/v1/me/player/play"
		case "pause":
			method, path = "PUT", "/v1/me/player/pause"
		case "next":
			method, path = "POST", "/v1/me/player/next"
		case "previous":
			method, path = "POST", "/v1/me/player/previous"
		default:
			writeError(w, http.StatusBadRequest, "unknown action: "+action)
			return
		}

		req, _ := http.NewRequest(method, "https://api.spotify.com"+path, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		resp.Body.Close()
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Panel data fetcher ────────────────────────────────────────────────────────

func fetchSpotifyPanelData(db *sql.DB, config map[string]interface{}) (*SpotifyPanelData, error) {
	integrationID, _ := config["integrationId"].(string)
	if integrationID == "" {
		return nil, fmt.Errorf("spotify: integrationId required in panel config")
	}

	accessToken, err := spotifyGetValidToken(db, integrationID)
	if err != nil {
		return nil, fmt.Errorf("spotify: not connected — authorize via integration settings")
	}

	var displayName, product string
	db.QueryRow(
		"SELECT display_name, product FROM spotify_tokens WHERE integration_id=?",
		integrationID,
	).Scan(&displayName, &product)

	data := &SpotifyPanelData{
		IntegrationID: integrationID,
		DisplayName:   displayName,
		IsPremium:     product == "premium",
		RecentTracks:  []SpotifyRecentTrack{},
	}

	// Currently playing (204 = nothing playing, handled gracefully)
	if b, status, err := spotifyAPIGet(accessToken, "/v1/me/player/currently-playing"); err == nil && status == 200 && b != nil {
		var raw spotifyCurrentlyPlayingRaw
		if json.Unmarshal(b, &raw) == nil && raw.Item != nil {
			data.NowPlaying = &SpotifyNowPlaying{
				TrackID:    raw.Item.ID,
				TrackName:  raw.Item.Name,
				ArtistName: raw.Item.joinArtists(),
				AlbumName:  raw.Item.Album.Name,
				AlbumArt:   raw.Item.bestImage(),
				ProgressMs: raw.ProgressMs,
				DurationMs: raw.Item.DurationMs,
				IsPlaying:  raw.IsPlaying,
			}
		}
	}

	// Recently played
	if rb, _, err := spotifyAPIGet(accessToken, "/v1/me/player/recently-played?limit=10"); err == nil && rb != nil {
		var hist spotifyHistoryResponse
		if json.Unmarshal(rb, &hist) == nil {
			for _, item := range hist.Items {
				data.RecentTracks = append(data.RecentTracks, SpotifyRecentTrack{
					TrackID:    item.Track.ID,
					TrackName:  item.Track.Name,
					ArtistName: item.Track.joinArtists(),
					AlbumName:  item.Track.Album.Name,
					AlbumArt:   item.Track.bestImage(),
					PlayedAt:   item.PlayedAt,
				})
			}
		}
	}

	return data, nil
}
