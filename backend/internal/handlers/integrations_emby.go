package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type EmbyPanelData struct {
	UIURL          string        `json:"uiUrl"`
	ServerName     string        `json:"serverName"`
	Version        string        `json:"version"`
	Libraries      []EmbyLibrary `json:"libraries"`
	Sessions       []EmbySession `json:"sessions"`
	TranscodeCount int           `json:"transcodeCount"`
	DirectCount    int           `json:"directCount"`
}

type EmbyLibrary struct {
	Title string `json:"title"`
	Type  string `json:"type"`
	Count int    `json:"count"`
}

type EmbySession struct {
	User              string  `json:"user"`
	Title             string  `json:"title"`
	GrandparentTitle  string  `json:"grandparentTitle"`
	Type              string  `json:"type"`
	State             string  `json:"state"`
	Progress          float64 `json:"progress"`
	TranscodeDecision string  `json:"transcodeDecision"`
	Player            string  `json:"player"`
}

// ── Emby JSON response types ──────────────────────────────────────────────────

type embySystemInfo struct {
	ServerName string `json:"ServerName"`
	Version    string `json:"Version"`
}

type embyVirtualFolder struct {
	Name           string `json:"Name"`
	CollectionType string `json:"CollectionType"`
	ItemId         string `json:"ItemId"`
}

type embyItemsResponse struct {
	TotalRecordCount int `json:"TotalRecordCount"`
}

type embySessionResponse struct {
	UserName        string           `json:"UserName"`
	Client          string           `json:"Client"`
	NowPlayingItem  *embyNowPlaying  `json:"NowPlayingItem"`
	PlayState       *embyPlayState   `json:"PlayState"`
	TranscodingInfo *embyTranscode   `json:"TranscodingInfo"`
}

type embyNowPlaying struct {
	Name         string `json:"Name"`
	Type         string `json:"Type"`
	SeriesName   string `json:"SeriesName"`
	RunTimeTicks int64  `json:"RunTimeTicks"`
}

type embyPlayState struct {
	PositionTicks int64 `json:"PositionTicks"`
	IsPaused      bool  `json:"IsPaused"`
}

type embyTranscode struct {
	IsVideoDirect bool `json:"IsVideoDirect"`
	IsAudioDirect bool `json:"IsAudioDirect"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

// embyGet performs an authenticated GET using the X-Emby-Token header.
// Emby's canonical API path is /emby/{endpoint} but the un-prefixed path also
// works, so we let users provide whatever base URL they have configured.
func embyGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	u := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Emby-Token", apiKey)
	req.Header.Set("Accept", "application/json")

	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Emby", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Data fetch ────────────────────────────────────────────────────────────────

func fetchEmbyPanelData(db *sql.DB, config map[string]interface{}) (*EmbyPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &EmbyPanelData{UIURL: uiURL}

	// Server identity + version
	if body, err := embyGet(apiURL, apiKey, "/System/Info", skipTLS); err == nil {
		var info embySystemInfo
		if json.Unmarshal(body, &info) == nil {
			data.ServerName = info.ServerName
			data.Version = info.Version
		}
	}

	// Libraries — iterate virtual folders and count each one individually
	// so we show per-library names and counts (same approach as Jellyfin/Plex)
	if libBody, err := embyGet(apiURL, apiKey, "/Library/VirtualFolders", skipTLS); err == nil {
		var folders []embyVirtualFolder
		if json.Unmarshal(libBody, &folders) == nil {
			for _, f := range folders {
				count := 0
				countPath := fmt.Sprintf("/Items?ParentId=%s&Recursive=true&Limit=0", f.ItemId)
				if countBody, cerr := embyGet(apiURL, apiKey, countPath, skipTLS); cerr == nil {
					var items embyItemsResponse
					if json.Unmarshal(countBody, &items) == nil {
						count = items.TotalRecordCount
					}
				}
				data.Libraries = append(data.Libraries, EmbyLibrary{
					Title: f.Name,
					Type:  embyCollectionType(f.CollectionType),
					Count: count,
				})
			}
		}
	}

	// Active sessions — only those with NowPlayingItem (i.e. actually streaming)
	if sessBody, err := embyGet(apiURL, apiKey, "/Sessions", skipTLS); err == nil {
		var sessions []embySessionResponse
		if json.Unmarshal(sessBody, &sessions) == nil {
			for _, s := range sessions {
				if s.NowPlayingItem == nil {
					continue
				}
				data.Sessions = append(data.Sessions, embySessionToPanel(s))
			}
		}
	}

	// Tally transcode vs direct
	for _, s := range data.Sessions {
		if s.TranscodeDecision == "directplay" {
			data.DirectCount++
		} else {
			data.TranscodeCount++
		}
	}
	return data, nil
}

func embySessionToPanel(s embySessionResponse) EmbySession {
	sess := EmbySession{
		User:   s.UserName,
		Player: s.Client,
	}
	if s.NowPlayingItem != nil {
		sess.Title = s.NowPlayingItem.Name
		sess.Type = strings.ToLower(s.NowPlayingItem.Type)
		if s.NowPlayingItem.Type == "Episode" {
			sess.GrandparentTitle = s.NowPlayingItem.SeriesName
		}
		if s.PlayState != nil && s.NowPlayingItem.RunTimeTicks > 0 {
			sess.Progress = float64(s.PlayState.PositionTicks) / float64(s.NowPlayingItem.RunTimeTicks) * 100
		}
	}
	if s.PlayState != nil {
		if s.PlayState.IsPaused {
			sess.State = "paused"
		} else {
			sess.State = "playing"
		}
	}
	// TranscodingInfo is nil for direct play; presence with both audio+video direct = direct play
	if s.TranscodingInfo == nil || (s.TranscodingInfo.IsVideoDirect && s.TranscodingInfo.IsAudioDirect) {
		sess.TranscodeDecision = "directplay"
	} else {
		sess.TranscodeDecision = "transcode"
	}
	return sess
}

func embyCollectionType(ct string) string {
	switch ct {
	case "movies":
		return "movie"
	case "tvshows":
		return "show"
	case "music":
		return "artist"
	case "photos":
		return "photo"
	case "books":
		return "book"
	default:
		return "other"
	}
}

func testEmbyConnection(apiURL, apiKey string, skipTLS bool) error {
	body, err := embyGet(apiURL, apiKey, "/System/Info", skipTLS)
	if err != nil {
		return err
	}
	var info embySystemInfo
	if json.Unmarshal(body, &info) != nil || info.Version == "" {
		return fmt.Errorf("unexpected response from Emby — check URL and API key")
	}
	return nil
}
