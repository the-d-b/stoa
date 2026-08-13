package handlers

import (
	"database/sql"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/gorilla/mux"
	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

// Plex Music is a personal (per-user) companion to the system Plex
// integration — see handlers_plexmusic_auth.go for the home-user connect
// flow. Once connected, everything here uses the *personal* token, not the
// admin's, so results (now playing filtered to this person, their own
// Watchlist) are genuinely per-user rather than server-wide.

const plexDiscoverBase = "https://discover.provider.plex.tv"

// ── Output types ─────────────────────────────────────────────────────────────

type PlexMusicPanelData struct {
	Username    string              `json:"username"`
	ThumbURL    string              `json:"thumbUrl"`
	NowPlaying  *PlexSession        `json:"nowPlaying,omitempty"`
	ArtistCount int                 `json:"artistCount"`
	AlbumCount  int                 `json:"albumCount"`
	TrackCount  int                 `json:"trackCount"`
	Playlists   []PlexMusicPlaylist `json:"playlists"`
	Stations    []PlexMusicPlaylist `json:"stations"`
	PlaylistID  string              `json:"playlistId"`
	Queue       []PlexMusicTrack    `json:"queue"`
	Watchlist   []PlexWatchlistItem `json:"watchlist"`
}

type PlexMusicPlaylist struct {
	RatingKey string `json:"ratingKey"`
	Title     string `json:"title"`
	ItemCount int    `json:"itemCount"`
	ThumbURL  string `json:"thumbUrl,omitempty"`
}

// PlexMusicTrack is one track in the currently-selected playlist's queue.
// StreamKey is the Plex Part path (e.g. /library/parts/123/456/file.mp3) the
// frontend passes back to the stream proxy — it's already a fully-resolved
// per-track path, no extra server-side lookup needed at play time.
type PlexMusicTrack struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Artist    string `json:"artist"`
	Album     string `json:"album"`
	Duration  int    `json:"duration"` // seconds
	ThumbURL  string `json:"thumbUrl,omitempty"`
	StreamKey string `json:"streamKey"`
}

type PlexWatchlistItem struct {
	Title    string `json:"title"`
	Year     int    `json:"year,omitempty"`
	Type     string `json:"type"` // "movie" or "show"
	ThumbURL string `json:"thumbUrl,omitempty"`
	Link     string `json:"link,omitempty"` // Plex's own public deep link (watch.plex.tv)
}

// ── Raw XML shapes not already covered by integrations_plex.go ───────────────

type plexPlaylistsResponse struct {
	XMLName   xml.Name          `xml:"MediaContainer"`
	Playlists []plexPlaylistXML `xml:"Playlist"`
}

type plexPlaylistXML struct {
	RatingKey string `xml:"ratingKey,attr"`
	// Key is only populated for radio stations, which — confirmed via a live
	// hubs response — carry no ratingKey at all; they're identified by their
	// own section-relative path instead (e.g. /library/sections/13/stations/1).
	Key       string `xml:"key,attr"`
	Title     string `xml:"title,attr"`
	LeafCount int    `xml:"leafCount,attr"`
	Composite string `xml:"composite,attr"`
}

// Plex models radio stations (genre/mood/decade "sonic" stations) as smart
// Playlist objects surfaced through a library section's hubs, not through a
// separate stations endpoint — confirmed against python-plexapi's
// MusicSection.stations(), which calls /hubs/sections/{key}?includeStations=1
// and picks out the hub whose context is "hub.music.stations". Once found,
// a station's ratingKey works through the exact same /playlists/{id}/items
// and stream-proxy paths a regular playlist does — no separate playback
// mechanism needed.
type plexHubsResponse struct {
	XMLName xml.Name     `xml:"MediaContainer"`
	Hubs    []plexHubXML `xml:"Hub"`
}

type plexHubXML struct {
	Context   string            `xml:"context,attr"`
	Playlists []plexPlaylistXML `xml:"Playlist"`
}

type plexPlaylistItemsResponse struct {
	XMLName xml.Name               `xml:"MediaContainer"`
	Tracks  []plexPlaylistTrackXML `xml:"Track"`
}

type plexPlaylistTrackXML struct {
	RatingKey        string              `xml:"ratingKey,attr"`
	Title            string              `xml:"title,attr"`
	GrandparentTitle string              `xml:"grandparentTitle,attr"` // artist
	ParentTitle      string              `xml:"parentTitle,attr"`      // album
	Thumb            string              `xml:"thumb,attr"`
	ParentThumb      string              `xml:"parentThumb,attr"`
	Duration         int64               `xml:"duration,attr"` // ms
	Media            []plexTrackMediaXML `xml:"Media"`
}

type plexTrackMediaXML struct {
	Parts []plexTrackPartXML `xml:"Part"`
}

type plexTrackPartXML struct {
	Key string `xml:"key,attr"`
}

// Confirmed against a live response: Watchlist items aren't wrapped in
// <Metadata> — movies come back as <Video type="movie"> and shows as
// <Directory type="show">, the same split Plex uses everywhere else (a show
// is a container of seasons/episodes, a movie is a single playable item).
type plexWatchlistResponse struct {
	XMLName xml.Name               `xml:"MediaContainer"`
	Videos  []plexWatchlistItemXML `xml:"Video"`
	Shows   []plexWatchlistItemXML `xml:"Directory"`
}

type plexWatchlistItemXML struct {
	Title          string `xml:"title,attr"`
	Year           int    `xml:"year,attr"`
	Type           string `xml:"type,attr"`
	Thumb          string `xml:"thumb,attr"` // confirmed always a full absolute URL in practice
	PublicPagesURL string `xml:"publicPagesURL,attr"` // Plex's own ready-made public deep link, e.g. https://watch.plex.tv/movie/leviticus-2026
}

// ── Panel data ────────────────────────────────────────────────────────────────

func fetchPlexMusicPanelData(db *sql.DB, config map[string]interface{}) (*PlexMusicPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("plexmusic: integrationId required in panel config")
	}

	var personalToken, accountToken, plexUserID, plexUsername, thumbURL string
	if err := db.QueryRow(
		"SELECT plex_token, account_token, plex_user_id, plex_username, thumb_url FROM plex_music_tokens WHERE integration_id=?",
		integrationID,
	).Scan(&personalToken, &accountToken, &plexUserID, &plexUsername, &thumbURL); err != nil {
		return nil, fmt.Errorf("plexmusic: not connected — connect your Plex account in integration settings")
	}

	cfgJSON, _ := readIntegrationConfig(db, integrationID)
	var cfg struct {
		SourceIntegrationID string `json:"sourceIntegrationId"`
	}
	json.Unmarshal([]byte(cfgJSON), &cfg) //nolint:errcheck
	if cfg.SourceIntegrationID == "" {
		return nil, fmt.Errorf("plexmusic: no source Plex integration configured")
	}
	serverURL, _, adminToken, skipTLS, err := resolveIntegration(db, cfg.SourceIntegrationID)
	if err != nil {
		return nil, fmt.Errorf("plexmusic: source Plex integration not found")
	}

	out := &PlexMusicPanelData{
		Username: plexUsername, ThumbURL: thumbURL,
		Playlists: []PlexMusicPlaylist{}, Stations: []PlexMusicPlaylist{}, Watchlist: []PlexWatchlistItem{}, Queue: []PlexMusicTrack{},
	}
	anyOK := false

	// Now playing — /status/sessions is server-wide (everyone's activity),
	// and confirmed via testing that Plex rejects it for a restricted/Home
	// user's own token with 403 even though that same token works fine for
	// library/playlist reads — it's an admin-only view, presumably a
	// deliberate privacy boundary (a shared user shouldn't see what other
	// users are doing). So this one call uses the admin token, then filters
	// down to this person's own session server-side. Match by Plex account
	// ID first (stable, unambiguous) — a Home profile's display title can
	// differ from what a session actually reports for that account, so
	// title is only a fallback for servers/responses that don't carry a
	// user id.
	if body, err := plexGet(serverURL, adminToken, "/status/sessions", skipTLS); err == nil {
		anyOK = true
		var mc plexMediaContainer
		if xml.Unmarshal(body, &mc) == nil {
			logErrorf("PLEXMUSIC", "sessions: %d video + %d track session(s) found, matching against userID=%q username=%q",
				len(mc.Videos), len(mc.Tracks), plexUserID, plexUsername)
			for _, t := range mc.Tracks {
				sess := plexSessionFromTrack(t, cfg.SourceIntegrationID)
				logErrorf("PLEXMUSIC", "sessions: track session title=%q sessionUserID=%q sessionUser=%q", sess.Title, sess.UserID, sess.User)
				matched := (plexUserID != "" && sess.UserID == plexUserID) ||
					(sess.UserID == "" && strings.EqualFold(sess.User, plexUsername))
				if matched {
					out.NowPlaying = &sess
					break
				}
			}
		} else {
			logErrorf("PLEXMUSIC", "sessions: unexpected response: %s", strings.TrimSpace(string(body)))
		}
	} else {
		logErrorf("PLEXMUSIC", "sessions error: %v", err)
	}

	// Music library stats — sum counts across every music-type ("artist")
	// library section, same section-count pattern integrations_plex.go
	// already uses for video libraries.
	if body, err := plexGet(serverURL, personalToken, "/library/sections", skipTLS); err == nil {
		anyOK = true
		var mc plexMediaContainer
		if xml.Unmarshal(body, &mc) == nil {
			logDebugf("PLEXMUSIC", "library sections: %d total, types=%v", len(mc.Directories), plexDirTypes(mc.Directories))
			for _, dir := range mc.Directories {
				if dir.Type != "artist" {
					continue
				}
				// Audiobooks libraries are also type="artist" in Plex (they
				// piggyback on the music library type) but use the audnexus
				// agent instead of a real music agent — confirmed live via
				// an audiobook library's stations/stats incorrectly showing
				// up here. Skip them; only real music libraries belong here.
				if strings.Contains(strings.ToLower(dir.Agent), "audnexus") {
					continue
				}
				out.ArtistCount += plexLibraryTypeCount(serverURL, personalToken, skipTLS, dir.Key, 8)
				out.AlbumCount += plexLibraryTypeCount(serverURL, personalToken, skipTLS, dir.Key, 9)
				out.TrackCount += plexLibraryTypeCount(serverURL, personalToken, skipTLS, dir.Key, 10)
				out.Stations = append(out.Stations, fetchPlexMusicStations(serverURL, personalToken, skipTLS, dir.Key, cfg.SourceIntegrationID)...)
			}
		} else {
			logErrorf("PLEXMUSIC", "library sections: unexpected response: %s", strings.TrimSpace(string(body)))
		}
	} else {
		logErrorf("PLEXMUSIC", "library sections error: %v", err)
	}

	// Playlists — audio playlists visible to this token. Unverified whether
	// Plex scopes this to "mine" or returns everything visible on the
	// server; if the latter, this list may include playlists you didn't
	// create yourself.
	if body, err := plexGet(serverURL, personalToken, "/playlists?playlistType=audio", skipTLS); err == nil {
		anyOK = true
		var pr plexPlaylistsResponse
		if xml.Unmarshal(body, &pr) == nil {
			for _, p := range pr.Playlists {
				out.Playlists = append(out.Playlists, PlexMusicPlaylist{
					RatingKey: p.RatingKey,
					Title:     p.Title,
					ItemCount: p.LeafCount,
					ThumbURL:  plexThumbURL(cfg.SourceIntegrationID, p.Composite),
				})
			}
		}
	} else {
		logErrorf("PLEXMUSIC", "playlists error: %v", err)
	}

	// Selected playlist's tracks — the actual playable queue. playlistId is
	// panel-level config (like Navidrome's), not integration-level, since
	// different panels/users may want different playlists playing. Defaults
	// to the first playlist so there's always something to play.
	playlistID := stringVal(config, "playlistId")
	if playlistID == "" && len(out.Playlists) > 0 {
		playlistID = out.Playlists[0].RatingKey
	}
	out.PlaylistID = playlistID
	if playlistID != "" {
		out.Queue = fetchPlexMusicPlaylistTracks(serverURL, personalToken, skipTLS, playlistID, cfg.SourceIntegrationID)
	}

	// Watchlist (bonus) — a plex.tv cloud/account feature, not a server
	// feature, so this hits discover.provider.plex.tv with the account
	// token, not the server-specific personalToken used above — confirmed
	// the two aren't interchangeable (the server rejects the account token
	// with 401). Endpoint confirmed against python-plexapi's current source
	// (the older metadata.provider.plex.tv path was deprecated in 2026 and
	// now 404s). Thumb URLs confirmed always absolute in practice.
	if body, err := plexGet(plexDiscoverBase, accountToken, "/library/sections/watchlist/all?includeCollections=1&includeExternalMedia=1", false); err == nil {
		anyOK = true
		var wr plexWatchlistResponse
		if xml.Unmarshal(body, &wr) == nil {
			items := append(append([]plexWatchlistItemXML{}, wr.Videos...), wr.Shows...)
			if len(items) == 0 {
				logErrorf("PLEXMUSIC", "watchlist: request succeeded but parsed 0 items, raw response: %s", strings.TrimSpace(string(body)))
			}
			for _, m := range items {
				out.Watchlist = append(out.Watchlist, PlexWatchlistItem{
					Title: m.Title, Year: m.Year, Type: m.Type, ThumbURL: m.Thumb, Link: m.PublicPagesURL,
				})
			}
		} else {
			logErrorf("PLEXMUSIC", "watchlist: unexpected response: %s", strings.TrimSpace(string(body)))
		}
	} else {
		logErrorf("PLEXMUSIC", "watchlist error: %v", err)
	}

	if !anyOK {
		return nil, fmt.Errorf("plexmusic: Plex unreachable or token invalid — try reconnecting your account")
	}
	return out, nil
}

func plexDirTypes(dirs []plexDir) []string {
	out := make([]string, len(dirs))
	for i, d := range dirs {
		out[i] = d.Type
	}
	return out
}

func plexLibraryTypeCount(baseURL, token string, skipTLS bool, sectionKey string, mediaType int) int {
	path := fmt.Sprintf("/library/sections/%s/all?type=%d&X-Plex-Container-Start=0&X-Plex-Container-Size=0", sectionKey, mediaType)
	body, err := plexGet(baseURL, token, path, skipTLS)
	if err != nil {
		logErrorf("PLEXMUSIC", "library count error (section=%s type=%d): %v", sectionKey, mediaType, err)
		return 0
	}
	var mc plexMediaContainer
	if xml.Unmarshal(body, &mc) != nil {
		logErrorf("PLEXMUSIC", "library count: unexpected response (section=%s type=%d): %s", sectionKey, mediaType, strings.TrimSpace(string(body)))
		return 0
	}
	if mc.TotalSize > 0 {
		return mc.TotalSize
	}
	return mc.Size
}

// fetchPlexMusicStations returns this section's sonic radio stations
// (genre/mood/decade "stations" Plex surfaces in its own UI) as playlist-
// shaped entries — each is backed by a smart Playlist object server-side, so
// it plays through the exact same /playlists/{id}/items + stream-proxy path
// a regular playlist does.
func fetchPlexMusicStations(baseURL, token string, skipTLS bool, sectionKey, sourceIntegrationID string) []PlexMusicPlaylist {
	path := fmt.Sprintf("/hubs/sections/%s?includeStations=1", sectionKey)
	body, err := plexGet(baseURL, token, path, skipTLS)
	if err != nil {
		logErrorf("PLEXMUSIC", "stations error (section=%s): %v", sectionKey, err)
		return nil
	}
	var hr plexHubsResponse
	if xml.Unmarshal(body, &hr) != nil {
		logErrorf("PLEXMUSIC", "stations: unexpected response (section=%s): %s", sectionKey, strings.TrimSpace(string(body)))
		return nil
	}
	for _, hub := range hr.Hubs {
		if hub.Context != "hub.music.stations" {
			continue
		}
		if len(hub.Playlists) == 0 {
			logErrorf("PLEXMUSIC", "stations: hub.music.stations found but 0 playlist entries (section=%s), raw response: %s", sectionKey, strings.TrimSpace(string(body)))
		}
		out := make([]PlexMusicPlaylist, 0, len(hub.Playlists))
		for _, p := range hub.Playlists {
			// Confirmed via a live response: station Playlist stubs carry no
			// ratingKey at all — fall back to their own key path, which also
			// doubles as the fetch endpoint for their (dynamically generated)
			// tracks. leafCount is always 0 for stations too (no fixed count).
			id := p.RatingKey
			if id == "" {
				id = p.Key
			}
			out = append(out, PlexMusicPlaylist{
				RatingKey: id,
				Title:     p.Title,
				ItemCount: p.LeafCount,
				ThumbURL:  plexThumbURL(sourceIntegrationID, p.Composite),
			})
		}
		return out
	}
	logErrorf("PLEXMUSIC", "stations: no hub.music.stations hub found (section=%s), raw response: %s", sectionKey, strings.TrimSpace(string(body)))
	return nil
}

// fetchPlexMusicPlaylistTracks fetches the tracks of one playlist or radio
// station, mirroring Navidrome's getPlaylist.view fetch
// (integrations_navidrome.go). Tracks with no playable Part are skipped —
// nothing to stream for them.
func fetchPlexMusicPlaylistTracks(baseURL, token string, skipTLS bool, playlistID, sourceIntegrationID string) []PlexMusicTrack {
	if strings.HasPrefix(playlistID, "/") {
		// Radio stations have no ratingKey — they're identified by their own
		// section-relative path (e.g. /library/sections/13/stations/1).
		// Confirmed (via python-plexapi's own Playlist._fetchItems, which
		// returns [] immediately for radio=1 playlists — even the reference
		// client doesn't try to list a station's items directly) and via two
		// live 404s of our own (bare key, key+/items) that stations have no
		// listable items endpoint at all — they only generate tracks when
		// actually "played" via a PlayQueue.
		return fetchPlexMusicStationTracks(baseURL, token, skipTLS, playlistID, sourceIntegrationID)
	}
	path := fmt.Sprintf("/playlists/%s/items", url.QueryEscape(playlistID))
	body, err := plexGet(baseURL, token, path, skipTLS)
	if err != nil {
		logErrorf("PLEXMUSIC", "playlist items error: %v", err)
		return nil
	}
	var pr plexPlaylistItemsResponse
	if xml.Unmarshal(body, &pr) != nil {
		logErrorf("PLEXMUSIC", "playlist items: unexpected response: %s", strings.TrimSpace(string(body)))
		return nil
	}
	if len(pr.Tracks) == 0 {
		logErrorf("PLEXMUSIC", "playlist items: parsed OK but 0 tracks (id=%s), raw response: %s", playlistID, strings.TrimSpace(string(body)))
	}
	return mapPlexMusicTracks(pr.Tracks, sourceIntegrationID)
}

// fetchPlexMusicStationTracks generates a radio station's track list by
// creating a Plex PlayQueue — confirmed against python-plexapi's
// PlayQueue.create(), which for a Playlist-type item (stations are
// type="playlist" with radio="1") POSTs to /playQueues with
// uri=server://{machineIdentifier}/com.plexapp.plugins.library{stationKey}.
// The PlayQueue response uses the same <Track> shape as a regular playlist's
// /items response, so it reuses the same parsing struct and track mapper.
func fetchPlexMusicStationTracks(baseURL, token string, skipTLS bool, stationKey, sourceIntegrationID string) []PlexMusicTrack {
	idBody, err := plexGet(baseURL, token, "/", skipTLS)
	if err != nil {
		logErrorf("PLEXMUSIC", "station playqueue: could not identify server: %v", err)
		return nil
	}
	var idmc plexMediaContainer
	if xml.Unmarshal(idBody, &idmc) != nil || idmc.MachineIdentifier == "" {
		logErrorf("PLEXMUSIC", "station playqueue: could not identify server (missing machineIdentifier)")
		return nil
	}
	uri := fmt.Sprintf("server://%s/com.plexapp.plugins.library%s", idmc.MachineIdentifier, stationKey)
	path := fmt.Sprintf("/playQueues?type=audio&uri=%s&shuffle=0&repeat=0", url.QueryEscape(uri))
	// A PlayQueue is a stateful, client-owned object — unlike the plain reads
	// used everywhere else in this file, Plex rejects this one with HTTP 400
	// unless the request identifies which client it belongs to (confirmed
	// live: adding X-Plex-Client-Identifier, the same one used for the
	// plex.tv account-level connect flow, is what this endpoint requires).
	reqURL := strings.TrimRight(baseURL, "/") + path + "&X-Plex-Token=" + token
	httpReq, herr := http.NewRequest("POST", reqURL, nil)
	if herr != nil {
		logErrorf("PLEXMUSIC", "station playqueue: bad request: %v", herr)
		return nil
	}
	httpReq.Header.Set("X-Plex-Client-Identifier", plexClientIdentifier)
	resp, err := httpClient(skipTLS).Do(httpReq)
	if err != nil {
		logErrorf("PLEXMUSIC", "station playqueue error: %v", err)
		return nil
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		logErrorf("PLEXMUSIC", "station playqueue: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
		return nil
	}
	var pq plexPlaylistItemsResponse
	if xml.Unmarshal(body, &pq) != nil {
		logErrorf("PLEXMUSIC", "station playqueue: unexpected response: %s", strings.TrimSpace(string(body)))
		return nil
	}
	if len(pq.Tracks) == 0 {
		logErrorf("PLEXMUSIC", "station playqueue: parsed OK but 0 tracks, raw response: %s", strings.TrimSpace(string(body)))
	}
	return mapPlexMusicTracks(pq.Tracks, sourceIntegrationID)
}

// mapPlexMusicTracks converts raw <Track> XML (shared by both the regular
// /playlists/{id}/items response and the /playQueues response) into playable
// track entries. Tracks with no playable Part are skipped.
func mapPlexMusicTracks(tracks []plexPlaylistTrackXML, sourceIntegrationID string) []PlexMusicTrack {
	out := make([]PlexMusicTrack, 0, len(tracks))
	for _, t := range tracks {
		var streamKey string
		if len(t.Media) > 0 && len(t.Media[0].Parts) > 0 {
			streamKey = t.Media[0].Parts[0].Key
		}
		if streamKey == "" {
			continue
		}
		thumb := t.Thumb
		if thumb == "" {
			thumb = t.ParentThumb
		}
		out = append(out, PlexMusicTrack{
			ID:        t.RatingKey,
			Title:     t.Title,
			Artist:    t.GrandparentTitle,
			Album:     t.ParentTitle,
			Duration:  int(t.Duration / 1000),
			ThumbURL:  plexThumbURL(sourceIntegrationID, thumb),
			StreamKey: streamKey,
		})
	}
	return out
}

// ── Stream proxy ──────────────────────────────────────────────────────────────

// PlexMusicStream proxies audio streaming for in-browser playback, forwarding
// Range headers so the browser can seek within a track — same pattern as
// ProxyNavidromeStream (integrations_navidrome.go). Uses the personal
// (server-specific) token, not the admin token — confirmed library/playlist
// reads work fine with it; only /status/sessions needed elevated access.
func PlexMusicStream(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := mux.Vars(r)["integrationId"]
		key := r.URL.Query().Get("key")
		if integrationID == "" || key == "" {
			http.Error(w, "integrationId and key required", http.StatusBadRequest)
			return
		}
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		if !userCanAccessIntegration(db, claims, integrationID) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}
		var personalToken string
		if err := db.QueryRow("SELECT plex_token FROM plex_music_tokens WHERE integration_id=?", integrationID).
			Scan(&personalToken); err != nil {
			http.Error(w, "not connected", http.StatusNotFound)
			return
		}
		cfgJSON, _ := readIntegrationConfig(db, integrationID)
		var cfg struct {
			SourceIntegrationID string `json:"sourceIntegrationId"`
		}
		json.Unmarshal([]byte(cfgJSON), &cfg) //nolint:errcheck
		serverURL, _, _, skipTLS, err := resolveIntegration(db, cfg.SourceIntegrationID)
		if err != nil {
			http.Error(w, "source Plex integration not found", http.StatusNotFound)
			return
		}

		sep := "?"
		if strings.Contains(key, "?") {
			sep = "&"
		}
		streamURL := strings.TrimRight(serverURL, "/") + key + sep + "X-Plex-Token=" + url.QueryEscape(personalToken)

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
