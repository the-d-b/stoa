package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// ── Jellyfin types ────────────────────────────────────────────────────────────

type JellyfinPanelData struct {
	UIURL          string             `json:"uiUrl"`
	ServerName     string             `json:"serverName"`
	Version        string             `json:"version"`
	Libraries      []JellyfinLibrary  `json:"libraries"`
	Sessions       []JellyfinSession  `json:"sessions"`
	TranscodeCount int                `json:"transcodeCount"`
	DirectCount    int                `json:"directCount"`
}

type JellyfinLibrary struct {
	Title string `json:"title"`
	Type  string `json:"type"`
	Count int    `json:"count"`
}

type JellyfinSession struct {
	User              string  `json:"user"`
	Title             string  `json:"title"`
	GrandparentTitle  string  `json:"grandparentTitle"`
	Type              string  `json:"type"`
	State             string  `json:"state"`
	Progress          float64 `json:"progress"`
	TranscodeDecision string  `json:"transcodeDecision"`
	Player            string  `json:"player"`
}

// ── Jellyfin JSON response types ──────────────────────────────────────────────

type jellyfinSystemInfo struct {
	ServerName string `json:"ServerName"`
	Version    string `json:"Version"`
}

type jellyfinVirtualFolder struct {
	Name           string `json:"Name"`
	CollectionType string `json:"CollectionType"`
	ItemId         string `json:"ItemId"`
}

type jellyfinItemsResponse struct {
	TotalRecordCount int `json:"TotalRecordCount"`
}

type jellyfinSessionResponse struct {
	UserName       string              `json:"UserName"`
	Client         string              `json:"Client"`
	NowPlayingItem *jellyfinNowPlaying `json:"NowPlayingItem"`
	PlayState      *jellyfinPlayState  `json:"PlayState"`
	TranscodingInfo *jellyfinTranscode `json:"TranscodingInfo"`
}

type jellyfinNowPlaying struct {
	Name         string `json:"Name"`
	Type         string `json:"Type"`
	SeriesName   string `json:"SeriesName"`
	RunTimeTicks int64  `json:"RunTimeTicks"`
}

type jellyfinPlayState struct {
	PositionTicks int64 `json:"PositionTicks"`
	IsPaused      bool  `json:"IsPaused"`
}

type jellyfinTranscode struct {
	IsVideoDirect bool `json:"IsVideoDirect"`
	IsAudioDirect bool `json:"IsAudioDirect"`
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

func fetchJellyfinPanelData(db *sql.DB, config map[string]interface{}) (*JellyfinPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &JellyfinPanelData{UIURL: uiURL}

	// Server identity + version
	body, err := jellyfinGet(apiURL, apiKey, "/System/Info", skipTLS)
	if err == nil {
		var info jellyfinSystemInfo
		if json.Unmarshal(body, &info) == nil {
			data.ServerName = info.ServerName
			data.Version = info.Version
		}
	}

	// Libraries + counts
	libBody, err := jellyfinGet(apiURL, apiKey, "/Library/VirtualFolders", skipTLS)
	if err == nil {
		var folders []jellyfinVirtualFolder
		if json.Unmarshal(libBody, &folders) == nil {
			for _, f := range folders {
				count := 0
				countBody, cerr := jellyfinGet(apiURL, apiKey,
					fmt.Sprintf("/Items?ParentId=%s&Recursive=true&Limit=0", f.ItemId), skipTLS)
				if cerr == nil {
					var items jellyfinItemsResponse
					if json.Unmarshal(countBody, &items) == nil {
						count = items.TotalRecordCount
					}
				}
				data.Libraries = append(data.Libraries, JellyfinLibrary{
					Title: f.Name,
					Type:  jellyfinCollectionType(f.CollectionType),
					Count: count,
				})
			}
		}
	}

	// Active sessions — only those with NowPlayingItem
	sessBody, err := jellyfinGet(apiURL, apiKey, "/Sessions", skipTLS)
	if err == nil {
		var sessions []jellyfinSessionResponse
		if json.Unmarshal(sessBody, &sessions) == nil {
			for _, s := range sessions {
				if s.NowPlayingItem == nil {
					continue
				}
				data.Sessions = append(data.Sessions, jellyfinSessionToPanel(s))
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

func jellyfinSessionToPanel(s jellyfinSessionResponse) JellyfinSession {
	sess := JellyfinSession{
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
	if s.TranscodingInfo == nil {
		sess.TranscodeDecision = "directplay"
	} else if s.TranscodingInfo.IsVideoDirect && s.TranscodingInfo.IsAudioDirect {
		sess.TranscodeDecision = "directplay"
	} else {
		sess.TranscodeDecision = "transcode"
	}
	return sess
}

func jellyfinCollectionType(ct string) string {
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

func jellyfinGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	url := strings.TrimRight(baseURL, "/") + path
	if strings.Contains(url, "?") {
		url += "&api_key=" + apiKey
	} else {
		url += "?api_key=" + apiKey
	}
	client := httpClient(skipTLS)
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Jellyfin", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func testJellyfinConnection(apiURL, apiKey string, skipTLS bool) error {
	// Use /System/Info which requires auth — validates both connectivity and API key
	body, err := jellyfinGet(apiURL, apiKey, "/System/Info", skipTLS)
	if err != nil {
		return err
	}
	var info jellyfinSystemInfo
	if json.Unmarshal(body, &info) != nil || info.Version == "" {
		return fmt.Errorf("unexpected response from Jellyfin API")
	}
	return nil
}
