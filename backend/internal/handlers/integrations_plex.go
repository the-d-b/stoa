package handlers

import (
	"database/sql"
	"encoding/xml"
	"fmt"
	"io"
	"strings"
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
	TranscodeCount int           `json:"transcodeCount"`
	DirectCount    int           `json:"directCount"`
}

type PlexLibrary struct {
	Title     string `json:"title"`
	Type      string `json:"type"`
	Count     int    `json:"count"`
	SizeBytes int64  `json:"sizeBytes"`
}

type PlexSession struct {
	User              string  `json:"user"`
	Title             string  `json:"title"`
	GrandparentTitle  string  `json:"grandparentTitle"`
	Type              string  `json:"type"`
	State             string  `json:"state"`
	Progress          float64 `json:"progress"`
	TranscodeDecision string  `json:"transcodeDecision"`
	Quality           string  `json:"quality"`
	Player            string  `json:"player"`
	ContentRating     string  `json:"contentRating,omitempty"`
}



// ── Plex XML response types ───────────────────────────────────────────────────

type plexMediaContainer struct {
	XMLName         xml.Name     `xml:"MediaContainer"`
	Size            int          `xml:"size,attr"`
	TotalSize       int          `xml:"totalSize,attr"`
	Version         string       `xml:"version,attr"`
	FriendlyName    string       `xml:"friendlyName,attr"`
	CanInstallUpdate string      `xml:"canInstallUpdate,attr"`
	Directories     []plexDir    `xml:"Directory"`
	Videos          []plexVideo  `xml:"Video"`
	Tracks          []plexTrack  `xml:"Track"`
	Releases        []plexRelease `xml:"Release"`
}

type plexRelease struct {
	Version string `xml:"version,attr"`
	Fixed   string `xml:"fixed,attr"`
}

type plexDir struct {
	Title  string `xml:"title,attr"`
	Type   string `xml:"type,attr"`
	Count  int    `xml:"count,attr"`
	Key    string `xml:"key,attr"`
}

type plexVideo struct {
	Title            string         `xml:"title,attr"`
	GrandparentTitle string         `xml:"grandparentTitle,attr"`
	Type             string         `xml:"type,attr"`
	AddedAt          int64          `xml:"addedAt,attr"`
	Year             int            `xml:"year,attr"`
	Thumb            string         `xml:"thumb,attr"`
	ContentRating    string         `xml:"contentRating,attr"`

	ViewOffset       int64          `xml:"viewOffset,attr"`
	Duration         int64          `xml:"duration,attr"`
	User             *plexUser      `xml:"User"`
	Player           *plexPlayer    `xml:"Player"`
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

func allowedPlexRatings(config map[string]interface{}) map[string]bool {
	raw, _ := config["allowedRatings"].(string)
	if raw == "" { return nil }
	set := map[string]bool{}
	for _, r := range strings.Split(raw, ",") {
		r = strings.TrimSpace(strings.ToUpper(r))
		if r != "" { set[r] = true }
	}
	if len(set) == 0 { return nil }
	return set
}

func plexRatingAllowed(rating string, filter map[string]bool) bool {
	if filter == nil { return true }
	c := strings.TrimSpace(strings.ToUpper(rating))
	if c == "" || c == "NR" || c == "NOT RATED" { return false }
	return filter[c]
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

	// Check for updates via Plex updater API
	updateBody, err := plexGet(apiURL, apiKey, "/updater/status", skipTLS)
	if err == nil {
		var uc plexMediaContainer
		if xml.Unmarshal(updateBody, &uc) == nil {
			// Plex returns <Release version="x.y.z"> elements when updates are available
			if len(uc.Releases) > 0 {
				data.LatestVersion = uc.Releases[0].Version
				data.UpdateAvail = data.LatestVersion != "" && data.LatestVersion != data.Version
			} else if uc.CanInstallUpdate == "1" {
				// canInstallUpdate=1 means update is available even if we can't parse the version
				data.UpdateAvail = true
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
						count = sc.TotalSize
						if count == 0 {
							count = sc.Size // fallback
						}
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
			plexRatings := allowedPlexRatings(config)
			for _, v := range mc.Videos {
				sess := plexSessionFromVideo(v)
				if plexRatingAllowed(sess.ContentRating, plexRatings) {
					data.Sessions = append(data.Sessions, sess)
				}
			}
			for _, t := range mc.Tracks {
				// Music tracks rarely have content ratings — pass through when filter active
				sess := plexSessionFromTrack(t)
				data.Sessions = append(data.Sessions, sess)
			}
		}
	}

	// Tally transcode vs direct from sessions
	for _, s := range data.Sessions {
		if s.TranscodeDecision == "directplay" || s.TranscodeDecision == "copy" {
			data.DirectCount++
		} else {
			data.TranscodeCount++
		}
	}
	return data, nil
}

func plexSessionFromVideo(v plexVideo) PlexSession {
	sess := PlexSession{
		Title:            v.Title,
		GrandparentTitle: v.GrandparentTitle,
		Type:             v.Type,
		ContentRating:    v.ContentRating,
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
