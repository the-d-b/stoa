package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// ── Auth ──────────────────────────────────────────────────────────────────────

func lfmParseCreds(apiKey string) (username, key string, err error) {
	idx := strings.Index(apiKey, ":")
	if idx < 0 {
		return "", "", fmt.Errorf("lastfm: API key must be username:apiKey")
	}
	return apiKey[:idx], apiKey[idx+1:], nil
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func lfmGet(method, username, apiKey string, extra url.Values) ([]byte, error) {
	params := url.Values{
		"method":  {method},
		"user":    {username},
		"api_key": {apiKey},
		"format":  {"json"},
	}
	for k, vs := range extra {
		params[k] = vs
	}
	req, _ := http.NewRequest("GET", "https://ws.audioscrobbler.com/2.0/?"+params.Encode(), nil)
	req.Header.Set("User-Agent", "Stoa/1.0 (dashboard)")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	// Last.fm can return HTTP 200 with an error body — always check
	var errCheck struct {
		Error   int    `json:"error"`
		Message string `json:"message"`
	}
	if json.Unmarshal(b, &errCheck) == nil && errCheck.Error > 0 {
		return nil, fmt.Errorf("lastfm error %d: %s", errCheck.Error, errCheck.Message)
	}
	return b, nil
}

// ── API raw types ─────────────────────────────────────────────────────────────

type lfmImage struct {
	Text string `json:"#text"`
	Size string `json:"size"`
}

// Used in getRecentTracks where artist/album are XML text-node objects
type lfmTextField struct {
	Text string `json:"#text"`
}

type lfmTrackAttr struct {
	NowPlaying string `json:"nowplaying"`
}

type lfmDate struct {
	UTS string `json:"uts"`
}

// recenttracks track item
type lfmRecentTrack struct {
	Name   string        `json:"name"`
	Artist lfmTextField  `json:"artist"`
	Album  lfmTextField  `json:"album"`
	Image  []lfmImage    `json:"image"`
	Date   *lfmDate      `json:"date"`
	Attr   *lfmTrackAttr `json:"@attr"`
	URL    string        `json:"url"`
}

// getTopArtists artist item — artist image is almost always absent since 2020
type lfmTopArtistItem struct {
	Name      string `json:"name"`
	PlayCount string `json:"playcount"`
	URL       string `json:"url"`
}

// getTopTracks track item — artist uses .name directly (not #text)
type lfmTopTrackItem struct {
	Name      string `json:"name"`
	PlayCount string `json:"playcount"`
	Duration  string `json:"duration"`
	Artist    struct {
		Name string `json:"name"`
	} `json:"artist"`
	Image []lfmImage `json:"image"`
	URL   string     `json:"url"`
}

// getTopAlbums album item
type lfmTopAlbumItem struct {
	Name      string `json:"name"`
	PlayCount string `json:"playcount"`
	MBID      string `json:"mbid"`
	Artist    struct {
		Name string `json:"name"`
	} `json:"artist"`
	Image []lfmImage `json:"image"`
	URL   string     `json:"url"`
}

// ── Normalise the "object or array" track field ───────────────────────────────

func lfmNormaliseRecentTracks(raw json.RawMessage) []lfmRecentTrack {
	var arr []lfmRecentTrack
	if json.Unmarshal(raw, &arr) == nil {
		return arr
	}
	var single lfmRecentTrack
	if json.Unmarshal(raw, &single) == nil {
		return []lfmRecentTrack{single}
	}
	return nil
}

func lfmNormaliseTopArtists(raw json.RawMessage) []lfmTopArtistItem {
	var arr []lfmTopArtistItem
	if json.Unmarshal(raw, &arr) == nil {
		return arr
	}
	var single lfmTopArtistItem
	if json.Unmarshal(raw, &single) == nil {
		return []lfmTopArtistItem{single}
	}
	return nil
}

func lfmNormaliseTopTracks(raw json.RawMessage) []lfmTopTrackItem {
	var arr []lfmTopTrackItem
	if json.Unmarshal(raw, &arr) == nil {
		return arr
	}
	var single lfmTopTrackItem
	if json.Unmarshal(raw, &single) == nil {
		return []lfmTopTrackItem{single}
	}
	return nil
}

func lfmNormaliseTopAlbums(raw json.RawMessage) []lfmTopAlbumItem {
	var arr []lfmTopAlbumItem
	if json.Unmarshal(raw, &arr) == nil {
		return arr
	}
	var single lfmTopAlbumItem
	if json.Unmarshal(raw, &single) == nil {
		return []lfmTopAlbumItem{single}
	}
	return nil
}

// ── Image helper ──────────────────────────────────────────────────────────────

func lfmBestImage(images []lfmImage) string {
	for _, size := range []string{"extralarge", "large", "medium", "small"} {
		for _, img := range images {
			if img.Size == size && img.Text != "" {
				return img.Text
			}
		}
	}
	return ""
}

// ── Panel output types ────────────────────────────────────────────────────────

type LastFmTrack struct {
	Name       string `json:"name"`
	Artist     string `json:"artist"`
	Album      string `json:"album"`
	ImageURL   string `json:"imageUrl"`
	NowPlaying bool   `json:"nowPlaying"`
	PlayedAt   string `json:"playedAt"` // RFC3339, empty if nowplaying
	TrackURL   string `json:"trackUrl"`
}

type LastFmTopArtist struct {
	Name      string `json:"name"`
	PlayCount string `json:"playCount"`
	ArtistURL string `json:"artistUrl"`
}

type LastFmTopTrack struct {
	Name      string `json:"name"`
	Artist    string `json:"artist"`
	PlayCount string `json:"playCount"`
	ImageURL  string `json:"imageUrl"`
	TrackURL  string `json:"trackUrl"`
}

type LastFmTopAlbum struct {
	Name      string `json:"name"`
	Artist    string `json:"artist"`
	PlayCount string `json:"playCount"`
	ImageURL  string `json:"imageUrl"`
	MBID      string `json:"mbid"`
}

type LastFmPanelData struct {
	Username       string            `json:"username"`
	RealName       string            `json:"realName"`
	TotalScrobbles string            `json:"totalScrobbles"`
	MemberSince    string            `json:"memberSince"` // year only, e.g. "2009"
	ProfileURL     string            `json:"profileUrl"`
	RecentTracks   []LastFmTrack     `json:"recentTracks"`
	TopArtists     []LastFmTopArtist `json:"topArtists"`
	TopTracks      []LastFmTopTrack  `json:"topTracks"`
	TopAlbums      []LastFmTopAlbum  `json:"topAlbums"`
}

// ── Panel data fetcher ────────────────────────────────────────────────────────

func fetchLastFmPanelData(db *sql.DB, config map[string]interface{}) (*LastFmPanelData, error) {
	integrationID, _ := config["integrationId"].(string)
	if integrationID == "" {
		return nil, fmt.Errorf("lastfm: integrationId required in panel config")
	}

	_, _, apiKey, _, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}

	username, key, err := lfmParseCreds(apiKey)
	if err != nil {
		return nil, err
	}

	data := &LastFmPanelData{
		Username:     username,
		ProfileURL:   "https://www.last.fm/user/" + username,
		RecentTracks: []LastFmTrack{},
		TopArtists:   []LastFmTopArtist{},
		TopTracks:    []LastFmTopTrack{},
		TopAlbums:    []LastFmTopAlbum{},
	}

	// user.getInfo — total scrobbles + member since
	if b, err := lfmGet("user.getinfo", username, key, nil); err == nil {
		var resp struct {
			User struct {
				Name       string `json:"name"`
				RealName   string `json:"realname"`
				PlayCount  string `json:"playcount"`
				URL        string `json:"url"`
				Registered struct {
					UnixTime string `json:"unixtime"`
				} `json:"registered"`
			} `json:"user"`
		}
		if json.Unmarshal(b, &resp) == nil {
			data.RealName = resp.User.RealName
			data.TotalScrobbles = resp.User.PlayCount
			if resp.User.URL != "" {
				data.ProfileURL = resp.User.URL
			}
			if ts, err := strconv.ParseInt(resp.User.Registered.UnixTime, 10, 64); err == nil {
				data.MemberSince = time.Unix(ts, 0).UTC().Format("2006")
			}
		}
	}

	// user.getRecentTracks — nowplaying + recent history
	if b, err := lfmGet("user.getrecenttracks", username, key, url.Values{"limit": {"10"}}); err == nil {
		var resp struct {
			RecentTracks struct {
				Track json.RawMessage `json:"track"`
			} `json:"recenttracks"`
		}
		if json.Unmarshal(b, &resp) == nil {
			for _, t := range lfmNormaliseRecentTracks(resp.RecentTracks.Track) {
				lt := LastFmTrack{
					Name:       t.Name,
					Artist:     t.Artist.Text,
					Album:      t.Album.Text,
					ImageURL:   lfmBestImage(t.Image),
					NowPlaying: t.Attr != nil && t.Attr.NowPlaying == "true",
					TrackURL:   t.URL,
				}
				if t.Date != nil && t.Date.UTS != "" {
					if ts, err := strconv.ParseInt(t.Date.UTS, 10, 64); err == nil {
						lt.PlayedAt = time.Unix(ts, 0).UTC().Format(time.RFC3339)
					}
				}
				data.RecentTracks = append(data.RecentTracks, lt)
			}
		}
	}

	// user.getTopArtists — 7-day chart
	if b, err := lfmGet("user.gettopartists", username, key, url.Values{"period": {"7day"}, "limit": {"5"}}); err == nil {
		var resp struct {
			TopArtists struct {
				Artist json.RawMessage `json:"artist"`
			} `json:"topartists"`
		}
		if json.Unmarshal(b, &resp) == nil {
			for _, a := range lfmNormaliseTopArtists(resp.TopArtists.Artist) {
				data.TopArtists = append(data.TopArtists, LastFmTopArtist{
					Name:      a.Name,
					PlayCount: a.PlayCount,
					ArtistURL: a.URL,
				})
			}
		}
	}

	// user.getTopTracks — 7-day chart
	if b, err := lfmGet("user.gettoptracks", username, key, url.Values{"period": {"7day"}, "limit": {"5"}}); err == nil {
		var resp struct {
			TopTracks struct {
				Track json.RawMessage `json:"track"`
			} `json:"toptracks"`
		}
		if json.Unmarshal(b, &resp) == nil {
			for _, t := range lfmNormaliseTopTracks(resp.TopTracks.Track) {
				data.TopTracks = append(data.TopTracks, LastFmTopTrack{
					Name:      t.Name,
					Artist:    t.Artist.Name,
					PlayCount: t.PlayCount,
					ImageURL:  lfmBestImage(t.Image),
					TrackURL:  t.URL,
				})
			}
		}
	}

	// user.getTopAlbums — 7-day chart
	if b, err := lfmGet("user.gettopalbums", username, key, url.Values{"period": {"7day"}, "limit": {"5"}}); err == nil {
		var resp struct {
			TopAlbums struct {
				Album json.RawMessage `json:"album"`
			} `json:"topalbums"`
		}
		if json.Unmarshal(b, &resp) == nil {
			for _, a := range lfmNormaliseTopAlbums(resp.TopAlbums.Album) {
				data.TopAlbums = append(data.TopAlbums, LastFmTopAlbum{
					Name:      a.Name,
					Artist:    a.Artist.Name,
					PlayCount: a.PlayCount,
					ImageURL:  lfmBestImage(a.Image),
					MBID:      a.MBID,
				})
			}
		}
	}

	return data, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testLastFmConnection(apiKey string) error {
	username, key, err := lfmParseCreds(apiKey)
	if err != nil {
		return err
	}
	b, err := lfmGet("user.getinfo", username, key, nil)
	if err != nil {
		return err
	}
	var resp struct {
		User struct {
			Name string `json:"name"`
		} `json:"user"`
	}
	if json.Unmarshal(b, &resp) != nil || resp.User.Name == "" {
		return fmt.Errorf("lastfm: user not found or invalid API key")
	}
	return nil
}
