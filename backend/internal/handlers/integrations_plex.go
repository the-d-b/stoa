package handlers

import (
	"database/sql"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ── Plex types ────────────────────────────────────────────────────────────────

type PlexPanelData struct {
	UIURL          string        `json:"uiUrl"`
	ServerName     string        `json:"serverName"`
	Version        string        `json:"version"`
	LatestVersion  string        `json:"latestVersion"`
	UpdateAvail    bool          `json:"updateAvail"`
	Libraries      []PlexLibrary `json:"libraries"`
	Sessions       []PlexSession `json:"sessions"`
	RecentlyAdded  []PlexMedia   `json:"recentlyAdded"`
}

type PlexLibrary struct {
	Title     string `json:"title"`
	Type      string `json:"type"`
	Count     int    `json:"count"`
	SizeBytes int64  `json:"sizeBytes"`
}

type PlexSession struct {
	User        string  `json:"user"`
	Title       string  `json:"title"`
	GrandparentTitle string `json:"grandparentTitle"` // series/artist name
	Type        string  `json:"type"`
	State       string  `json:"state"` // playing, paused, buffering
	Progress    float64 `json:"progress"` // 0-100
	TranscodeDecision string `json:"transcodeDecision"` // directplay, transcode, copy
	Quality     string  `json:"quality"`
	Player      string  `json:"player"`
}

type PlexMedia struct {
	Title            string `json:"title"`
	GrandparentTitle string `json:"grandparentTitle"`
	Type             string `json:"type"`
	AddedAt          int64  `json:"addedAt"`
	Year             int    `json:"year"`
	ThumbKey         string `json:"thumbKey"`
}

// ── Plex XML response types ───────────────────────────────────────────────────

type plexMediaContainer struct {
	XMLName   xml.Name       `xml:"MediaContainer"`
	Size      int            `xml:"size,attr"`
	Version   string         `xml:"version,attr"`
	FriendlyName string      `xml:"friendlyName,attr"`
	Directories []plexDir    `xml:"Directory"`
	Videos    []plexVideo    `xml:"Video"`
	Tracks    []plexTrack    `xml:"Track"`
}

type plexDir struct {
	Title  string `xml:"title,attr"`
	Type   string `xml:"type,attr"`
	Count  int    `xml:"count,attr"`
	Key    string `xml:"key,attr"`
}

type plexVideo struct {
	Title            string      `xml:"title,attr"`
	GrandparentTitle string      `xml:"grandparentTitle,attr"`
	Type             string      `xml:"type,attr"`
	AddedAt          int64       `xml:"addedAt,attr"`
	Year             int         `xml:"year,attr"`
	Thumb            string      `xml:"thumb,attr"`
	ViewOffset       int64       `xml:"viewOffset,attr"`
	Duration         int64       `xml:"duration,attr"`
	User             *plexUser   `xml:"User"`
	Player           *plexPlayer `xml:"Player"`
	TranscodeSession *plexTranscode `xml:"TranscodeSession"`
	Media            []plexMediaItem `xml:"Media"`
}

type plexTrack struct {
	Title            string      `xml:"title,attr"`
	GrandparentTitle string      `xml:"grandparentTitle,attr"`
	Type             string      `xml:"type,attr"`
	AddedAt          int64       `xml:"addedAt,attr"`
	ViewOffset       int64       `xml:"viewOffset,attr"`
	Duration         int64       `xml:"duration,attr"`
	User             *plexUser   `xml:"User"`
	Player           *plexPlayer `xml:"Player"`
	TranscodeSession *plexTranscode `xml:"TranscodeSession"`
}

type plexUser struct {
	Title string `xml:"title,attr"`
}

type plexPlayer struct {
	Title   string `xml:"title,attr"`
	Product string `xml:"product,attr"`
	State   string `xml:"state,attr"`
}

type plexTranscode struct {
	Decision    string `xml:"decision,attr"`
	VideoDecision string `xml:"videoDecision,attr"`
}

type plexMediaItem struct {
	VideoResolution string `xml:"videoResolution,attr"`
}

func fetchPlexPanelData(db *sql.DB, config map[string]interface{}) (*PlexPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &PlexPanelData{UIURL: uiURL}

	// Server identity + version
	body, err := plexGet(apiURL, apiKey, "/", skipTLS)
	if err == nil {
		var mc plexMediaContainer
		if xml.Unmarshal(body, &mc) == nil {
			data.ServerName = mc.FriendlyName
			data.Version = mc.Version
		}
	}

	// Check for updates — Plex embeds latest version in their update endpoint
	updateBody, err := plexGet(apiURL, apiKey, "/updater/status", skipTLS)
	if err == nil {
		var uc plexMediaContainer
		if xml.Unmarshal(updateBody, &uc) == nil && len(uc.Directories) > 0 {
			// The update container has a "release" directory with the latest version as title
			for _, d := range uc.Directories {
				if d.Type == "release" && d.Title != "" {
					data.LatestVersion = d.Title
					data.UpdateAvail = data.LatestVersion != "" && data.Version != "" && data.LatestVersion != data.Version
					break
				}
			}
		}
	}

	// Libraries
	libBody, err := plexGet(apiURL, apiKey, "/library/sections", skipTLS)
	if err == nil {
		var mc plexMediaContainer
		if xml.Unmarshal(libBody, &mc) == nil {
			for _, dir := range mc.Directories {
				// Get section size
				secBody, serr := plexGet(apiURL, apiKey, fmt.Sprintf("/library/sections/%s/all?includeCollections=0&X-Plex-Container-Start=0&X-Plex-Container-Size=0", dir.Key), skipTLS)
				count := 0
				if serr == nil {
					var sc plexMediaContainer
					if xml.Unmarshal(secBody, &sc) == nil {
						count = sc.Size
					}
				}
				data.Libraries = append(data.Libraries, PlexLibrary{
					Title: dir.Title,
					Type:  dir.Type,
					Count: count,
				})
			}
		}
	}

	// Active sessions
	sessBody, err := plexGet(apiURL, apiKey, "/status/sessions", skipTLS)
	if err == nil {
		var mc plexMediaContainer
		if xml.Unmarshal(sessBody, &mc) == nil {
			for _, v := range mc.Videos {
				sess := plexSessionFromVideo(v)
				data.Sessions = append(data.Sessions, sess)
			}
			for _, t := range mc.Tracks {
				sess := plexSessionFromTrack(t)
				data.Sessions = append(data.Sessions, sess)
			}
		}
	}

	// Recently added — last 8 items across all libraries
	recentBody, err := plexGet(apiURL, apiKey, "/library/recentlyAdded?X-Plex-Container-Start=0&X-Plex-Container-Size=8", skipTLS)
	if err == nil {
		var mc plexMediaContainer
		if xml.Unmarshal(recentBody, &mc) == nil {
			for _, v := range mc.Videos {
				data.RecentlyAdded = append(data.RecentlyAdded, PlexMedia{
					Title:            v.Title,
					GrandparentTitle: v.GrandparentTitle,
					Type:             v.Type,
					AddedAt:          v.AddedAt,
					Year:             v.Year,
				})
			}
		}
	}

	return data, nil
}

func plexSessionFromVideo(v plexVideo) PlexSession {
	sess := PlexSession{
		Title:            v.Title,
		GrandparentTitle: v.GrandparentTitle,
		Type:             v.Type,
	}
	if v.User != nil { sess.User = v.User.Title }
	if v.Player != nil {
		sess.Player = v.Player.Product
		sess.State = v.Player.State
	}
	if v.Duration > 0 {
		sess.Progress = float64(v.ViewOffset) / float64(v.Duration) * 100
	}
	if v.TranscodeSession != nil {
		sess.TranscodeDecision = v.TranscodeSession.Decision
		if sess.TranscodeDecision == "" {
			sess.TranscodeDecision = v.TranscodeSession.VideoDecision
		}
	} else {
		sess.TranscodeDecision = "directplay"
	}
	if len(v.Media) > 0 {
		sess.Quality = v.Media[0].VideoResolution
	}
	return sess
}

func plexSessionFromTrack(t plexTrack) PlexSession {
	sess := PlexSession{
		Title:            t.Title,
		GrandparentTitle: t.GrandparentTitle,
		Type:             "track",
		State:            "playing",
		TranscodeDecision: "directplay",
	}
	if t.User != nil { sess.User = t.User.Title }
	if t.Player != nil {
		sess.Player = t.Player.Product
		sess.State = t.Player.State
	}
	if t.Duration > 0 {
		sess.Progress = float64(t.ViewOffset) / float64(t.Duration) * 100
	}
	if t.TranscodeSession != nil {
		sess.TranscodeDecision = t.TranscodeSession.Decision
	}
	return sess
}

func plexGet(baseURL, token, path string, skipTLS ...bool) ([]byte, error) {
	url := strings.TrimRight(baseURL, "/") + path
	if strings.Contains(url, "?") {
		url += "&X-Plex-Token=" + token
	} else {
		url += "?X-Plex-Token=" + token
	}
	client := httpClient(len(skipTLS) > 0 && skipTLS[0])
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Plex", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func testPlexConnection(apiURL, token string, skipTLS ...bool) error {
	body, err := plexGet(apiURL, token, "/", (len(skipTLS) > 0 && skipTLS[0]))
	if err != nil {
		return err
	}
	var mc plexMediaContainer
	if err := xml.Unmarshal(body, &mc); err != nil {
		return fmt.Errorf("unexpected response from Plex")
	}
	return nil
}
