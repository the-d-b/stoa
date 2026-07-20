package handlers

import (
	"crypto/md5"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/gorilla/mux"
)

// ── Navidrome types ───────────────────────────────────────────────────────────

type NavidromeSong struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Artist   string `json:"artist"`
	Album    string `json:"album"`
	Duration int    `json:"duration"`
	CoverArt string `json:"coverArt"`
	Track    int    `json:"track"`
}

type NavidromePlaylist struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	SongCount int    `json:"songCount"`
	Duration  int    `json:"duration"`
}

type NavidromePanelData struct {
	UIURL         string              `json:"uiUrl"`
	IntegrationID string              `json:"integrationId"`
	Playlists     []NavidromePlaylist `json:"playlists"`
	Queue         []NavidromeSong     `json:"queue"`
	PlaylistID    string              `json:"playlistId"`
}

// ── Auth ──────────────────────────────────────────────────────────────────────

// navidromeAuth builds the Subsonic token auth query string from "username:password".
// Uses a deterministic salt derived from the username so auth params are stable.
func navidromeAuth(apiKey string) (string, error) {
	idx := strings.Index(apiKey, ":")
	if idx < 0 {
		return "", fmt.Errorf("Navidrome API key must be username:password")
	}
	username := apiKey[:idx]
	password := apiKey[idx+1:]
	// Deterministic salt: first 8 hex chars of md5(username) — stable across calls
	salt := fmt.Sprintf("%x", md5.Sum([]byte("stoa-"+username)))[:8]
	token := fmt.Sprintf("%x", md5.Sum([]byte(password+salt)))
	return fmt.Sprintf("u=%s&t=%s&s=%s&v=1.16.1&c=stoa&f=json",
		url.QueryEscape(username), token, salt), nil
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func navidromeGet(baseURL, authQuery, path string, skipTLS bool) ([]byte, error) {
	sep := "?"
	if strings.Contains(path, "?") {
		sep = "&"
	}
	fullURL := strings.TrimRight(baseURL, "/") + path + sep + authQuery
	req, err := http.NewRequest("GET", fullURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("unauthorized (HTTP %d)", resp.StatusCode)
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Navidrome", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	// Check for Subsonic error in response
	var wrapper struct {
		Response struct {
			Status string `json:"status"`
			Error  *struct {
				Code    int    `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		} `json:"subsonic-response"`
	}
	if json.Unmarshal(body, &wrapper) == nil && wrapper.Response.Status == "failed" {
		if e := wrapper.Response.Error; e != nil {
			return nil, fmt.Errorf("Subsonic error %d: %s", e.Code, e.Message)
		}
		return nil, fmt.Errorf("Subsonic request failed")
	}
	return body, nil
}

// ── Main fetch ────────────────────────────────────────────────────────────────

func fetchNavidromePanelData(db *sql.DB, config map[string]interface{}) (*NavidromePanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &NavidromePanelData{
		UIURL:         uiURL,
		IntegrationID: integrationID,
		Playlists:     []NavidromePlaylist{},
		Queue:         []NavidromeSong{},
	}

	authQuery, err := navidromeAuth(apiKey)
	if err != nil {
		return nil, err
	}

	// All playlists
	plBody, perr := navidromeGet(apiURL, authQuery, "/rest/getPlaylists.view", skipTLS)
	if perr != nil {
		return nil, fmt.Errorf("failed to fetch playlists: %v", perr)
	}
	var plResp struct {
		Response struct {
			Playlists struct {
				Playlist []struct {
					ID        string `json:"id"`
					Name      string `json:"name"`
					SongCount int    `json:"songCount"`
					Duration  int    `json:"duration"`
				} `json:"playlist"`
			} `json:"playlists"`
		} `json:"subsonic-response"`
	}
	if err := json.Unmarshal(plBody, &plResp); err == nil {
		for _, p := range plResp.Response.Playlists.Playlist {
			data.Playlists = append(data.Playlists, NavidromePlaylist{
				ID: p.ID, Name: p.Name, SongCount: p.SongCount, Duration: p.Duration,
			})
		}
	}

	// Selected playlist songs
	playlistID := stringVal(config, "playlistId")
	if playlistID == "" && len(data.Playlists) > 0 {
		playlistID = data.Playlists[0].ID
	}
	data.PlaylistID = playlistID

	if playlistID != "" {
		songBody, serr := navidromeGet(apiURL, authQuery,
			"/rest/getPlaylist.view?id="+url.QueryEscape(playlistID), skipTLS)
		if serr != nil {
			logErrorf("Navidrome", "playlist songs error: %v", serr)
		} else {
			var songResp struct {
				Response struct {
					Playlist struct {
						Entry []struct {
							ID       string `json:"id"`
							Title    string `json:"title"`
							Artist   string `json:"artist"`
							Album    string `json:"album"`
							Duration int    `json:"duration"`
							CoverArt string `json:"coverArt"`
							Track    int    `json:"track"`
						} `json:"entry"`
					} `json:"playlist"`
				} `json:"subsonic-response"`
			}
			if err := json.Unmarshal(songBody, &songResp); err == nil {
				for _, e := range songResp.Response.Playlist.Entry {
					data.Queue = append(data.Queue, NavidromeSong{
						ID: e.ID, Title: e.Title, Artist: e.Artist,
						Album: e.Album, Duration: e.Duration,
						CoverArt: e.CoverArt, Track: e.Track,
					})
				}
			}
		}
	}

	return data, nil
}

// ── Cover art proxy ───────────────────────────────────────────────────────────

func ProxyNavidromeCover(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integID := mux.Vars(r)["integrationId"]
		artID := r.URL.Query().Get("id")
		if artID == "" {
			http.Error(w, "id required", http.StatusBadRequest)
			return
		}

		apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, integID)
		if err != nil {
			http.Error(w, "integration not found", http.StatusNotFound)
			return
		}
		authQuery, err := navidromeAuth(apiKey)
		if err != nil {
			http.Error(w, "auth error", http.StatusBadGateway)
			return
		}

		body, err := navidromeGet(apiURL, authQuery,
			"/rest/getCoverArt.view?id="+url.QueryEscape(artID)+"&size=300", skipTLS)
		if err != nil {
			http.Error(w, "cover fetch failed", http.StatusBadGateway)
			return
		}

		w.Header().Set("Content-Type", http.DetectContentType(body))
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.Write(body)
	}
}

// ── Stream proxy ──────────────────────────────────────────────────────────────

// ProxyNavidromeStream proxies audio streaming from Navidrome, forwarding Range
// headers so the browser can seek within a track.
func ProxyNavidromeStream(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integID := mux.Vars(r)["integrationId"]
		songID := r.URL.Query().Get("id")
		if songID == "" {
			http.Error(w, "id required", http.StatusBadRequest)
			return
		}

		apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, integID)
		if err != nil {
			http.Error(w, "integration not found", http.StatusNotFound)
			return
		}
		authQuery, err := navidromeAuth(apiKey)
		if err != nil {
			http.Error(w, "auth error", http.StatusBadGateway)
			return
		}

		streamURL := strings.TrimRight(apiURL, "/") +
			"/rest/stream.view?id=" + url.QueryEscape(songID) + "&format=raw&" + authQuery

		absReq, err := http.NewRequest("GET", streamURL, nil)
		if err != nil {
			http.Error(w, "bad stream URL", http.StatusInternalServerError)
			return
		}
		if rangeHdr := r.Header.Get("Range"); rangeHdr != "" {
			absReq.Header.Set("Range", rangeHdr)
		}

		resp, err := httpClient(skipTLS).Do(absReq)
		if err != nil {
			http.Error(w, "stream fetch failed", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		for _, h := range []string{
			"Content-Type", "Content-Length", "Content-Range",
			"Accept-Ranges", "Last-Modified",
		} {
			if v := resp.Header.Get(h); v != "" {
				w.Header().Set(h, v)
			}
		}
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
	}
}

// ── Test ──────────────────────────────────────────────────────────────────────

func testNavidromeConnection(apiURL, apiKey string, skipTLS bool) error {
	authQuery, err := navidromeAuth(apiKey)
	if err != nil {
		return err
	}
	_, err = navidromeGet(apiURL, authQuery, "/rest/ping.view", skipTLS)
	return err
}
