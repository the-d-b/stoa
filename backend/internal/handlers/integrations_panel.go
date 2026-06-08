package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"
)

// timeNow is a package-level var so tests can override it.
var timeNow = time.Now

// PANEL_RENDERERS maps panel types to their fetch functions.
// Add new integrations here.
var panelFetchers = map[string]func(*sql.DB, map[string]interface{}) (interface{}, error){
	"sonarr":   func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchSonarrPanelData(db, cfg) },
	"radarr":   func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchRadarrPanelData(db, cfg) },
	"lidarr":   func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchLidarrPanelData(db, cfg) },
	"customapi":  func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchCustomAPIPanelData(db, cfg) },
	"calendar": func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchCalendarData(db, cfg) },
	"plex":     func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchPlexPanelData(db, cfg) },
	"tautulli": func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchTautulliPanelData(db, cfg) },
	"truenas":  func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchTrueNASPanelData(db, cfg) },
	"proxmox":  func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchProxmoxPanelData(db, cfg) },
	"kuma":     func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchKumaPanelData(db, cfg) },
	"gluetun":  func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchGluetunPanelData(db, cfg) },
	"opnsense":      func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchOPNsensePanelData(db, cfg) },
	"transmission":  func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchTransmissionPanelData(db, cfg) },
	"photoprism":   func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchPhotoPrismPanelData(db, cfg) },
	"authentik":    func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchAuthentikPanelData(db, cfg) },
	"rss":          func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchRSSPanelData(db, cfg) },
	"sports":       func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchSportsPanelData(db, cfg) },
	"stocks":       func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchStocksPanelData(db, cfg) },
	"crypto":       func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchCryptoPanelData(db, cfg) },
	"readarr":      func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchReadarrPanelData(db, cfg) },
	"jellyfin":        func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchJellyfinPanelData(db, cfg) },
	"homeassistant":   func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchHAPanelData(db, cfg) },
	"weather":         func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return FetchWeatherForIntegration(db, cfg) },
	"steam":        func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return FetchSteamForIntegration(db, cfg) },
	"overseerr":    func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchOverseerrPanelData(db, cfg) },
	"unraid":       func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchUnraidPanelData(db, cfg) },
	"omv":          func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchOMVPanelData(db, cfg) },
	"synology":     func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchSynologyPanelData(db, cfg) },
	"qnap":         func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchQNAPPanelData(db, cfg) },
	"qbittorrent":  func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchQBTPanelData(db, cfg) },
	"deluge":       func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchDelugePanelData(db, cfg) },
	"rutorrent":    func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchRTorrentPanelData(db, cfg) },
	"emby":         func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchEmbyPanelData(db, cfg) },
	"jellystat":    func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchJellystatPanelData(db, cfg) },
	"tracearr":     func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchTracearrPanelData(db, cfg) },
	"immich":       func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchImmichPanelData(db, cfg) },
	"kavita":       func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchKavitaPanelData(db, cfg) },
	"komga":        func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchKomgaPanelData(db, cfg) },
	"lychee":       func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchLycheePanelData(db, cfg) },
	"audiobookshelf": func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchABSPanelData(db, cfg) },
	"navidrome":      func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchNavidromePanelData(db, cfg) },
	"pfsense":        func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchPfSensePanelData(db, cfg) },
	"openwrt":        func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchOpenWrtPanelData(db, cfg) },
	"omada":          func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchOmadaPanelData(db, cfg) },
	"unifi":          func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchUniFiPanelData(db, cfg) },
	"traefik":        func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchTraefikPanelData(db, cfg) },
	"cloudflare":     func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchCloudflarePanelData(db, cfg) },
	"pihole":         func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchPiHolePanelData(db, cfg) },
	"adguard":        func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchAdGuardPanelData(db, cfg) },
	"nextdns":        func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchNextDNSPanelData(db, cfg) },
	"nginxpm":        func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchNPMPanelData(db, cfg) },
	"wgeasy":         func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchWGEasyPanelData(db, cfg) },
	"tailscale":      func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchTailscalePanelData(db, cfg) },
	"prometheus":     func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchPrometheusPanelData(db, cfg) },
	"grafana":        func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchGrafanaPanelData(db, cfg) },
	"autobrr":        func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchAutobrrrPanelData(db, cfg) },
	"bazarr":         func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchBazarrPanelData(db, cfg) },
	"prowlarr":       func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchProwlarrPanelData(db, cfg) },
	"frigate":        func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchFrigatePanelData(db, cfg) },
	"blueiris":       func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchBlueIrisPanelData(db, cfg) },
	"nextcloud":      func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchNextcloudPanelData(db, cfg) },
	"fireflyiii":     func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchFireflyPanelData(db, cfg) },
	"netbird":        func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchNetbirdPanelData(db, cfg) },
	"actualbudget":   func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchActualBudgetPanelData(db, cfg) },
	"scrutiny":       func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchScrutinyPanelData(db, cfg) },
	"paperless":      func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchPaperlessPanelData(db, cfg) },
	"mealie":         func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchMealiePanelData(db, cfg) },
	"grocy":          func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchGrocyPanelData(db, cfg) },
	"ghostfolio":     func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchGhostfolioPanelData(db, cfg) },
	"coinbase":       func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchCoinbasePanelData(db, cfg) },
	"sabnzbd":        func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchSABnzbdPanelData(db, cfg) },
	"nzbget":         func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchNZBGetPanelData(db, cfg) },
	"tandoor":        func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchTandoorPanelData(db, cfg) },
	"lubelogger":     func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchLubeLoggerPanelData(db, cfg) },
	"tdarr":          func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchTdarrPanelData(db, cfg) },
	"docspell":       func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchDocspellPanelData(db, cfg) },
	"romm":           func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchRommPanelData(db, cfg) },
	"pterodactyl":    func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchPterodactylPanelData(db, cfg) },
	"maintainerr":    func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchMaintainerrPanelData(db, cfg) },
	"monica":         func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchMonicaPanelData(db, cfg) },
	"homebox":        func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchHomeboxPanelData(db, cfg) },
	"wger":           func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchWgerPanelData(db, cfg) },
	"fittrackee":     func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchFittrackeePanelData(db, cfg) },
	"spotify":        func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchSpotifyPanelData(db, cfg) },
	"lastfm":         func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchLastFmPanelData(db, cfg) },
	"strava":         func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchStravaPanelData(db, cfg) },
	"duolingo":       func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchDuolingoPanelData(db, cfg) },
	"github":         func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchGitHubPanelData(db, cfg) },
	"trakt":          func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchTraktPanelData(db, cfg) },
	"twitch":         func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchTwitchPanelData(db, cfg) },
	"kanban":         func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchKanbanPanelData(db, cfg) },
}

func GetPanelData(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]

		var panelType, configStr string
		if err := db.QueryRow("SELECT type, COALESCE(config,'{}') FROM panels WHERE id=?", id).
			Scan(&panelType, &configStr); err != nil {
			writeError(w, http.StatusNotFound, "panel not found")
			return
		}

		var config map[string]interface{}
		json.Unmarshal([]byte(configStr), &config)
		if config == nil {
			config = map[string]interface{}{}
		}
		// Inject panel's own ID so local-data panel types (e.g. kanban) can query by it
		config["_panelId"] = id
		// Allow query params to override config values (e.g. ?days=7 for time range)
		// Track whether any override was applied — overridden requests bypass cache
		// so filters like 1d/7d/30d always return fresh data, not stale cached data.
		hasOverride := false
		if r.URL.Query().Get("nocache") == "1" {
			hasOverride = true
			config["forceRefresh"] = true
		}
		if d := r.URL.Query().Get("days"); d != "" {
			var daysVal float64
			if _, err := fmt.Sscanf(d, "%f", &daysVal); err == nil {
				config["days"] = daysVal
				hasOverride = true
			}
		}
		if pl := r.URL.Query().Get("playlistId"); pl != "" {
			config["playlistId"] = pl
			hasOverride = true
		}
		if tr := r.URL.Query().Get("timeRange"); tr != "" {
			var trVal float64
			if _, err := fmt.Sscanf(tr, "%f", &trVal); err == nil {
				config["timeRange"] = trVal
				hasOverride = true
			}
		}

		fetcher, ok := panelFetchers[panelType]
		if !ok {
			writeError(w, http.StatusBadRequest, "unsupported panel type: "+panelType)
			return
		}

		// Serve from cache only when no query param overrides are active.
		// Filtered requests (1d/7d/30d) always bypass cache for fresh data.
		integrationID, _ := config["integrationId"].(string)
		allowedRatings, _ := config["allowedRatings"].(string)

		// Plex session panels with a rating filter always fetch live —
		// "who's watching" data must be fresh; stale filtered cache causes
		// stopped streams to persist indefinitely since worker only refreshes
		// the unfiltered integration cache key, not per-panel filtered keys.
		plexFiltered := panelType == "plex" && allowedRatings != ""

		// Cache key includes allowedRatings so panels with different filters
		// get separate cache entries even when sharing the same integration
		cacheKey := integrationID
		if allowedRatings != "" {
			cacheKey = integrationID + "|" + allowedRatings
		}
		// Home Assistant: the cache stores the full entity list (fetched by the worker
		// with no panel-level filter). Each panel request applies its own entity/domain
		// filter at serve time so multiple HA panels can share a single cache entry.
		haPanel := panelType == "homeassistant"

		if cacheKey != "" && !hasOverride && !plexFiltered {
			if cached, ok := cacheGet(cacheKey); ok {
				log.Printf("[CACHE] panel hit %s (%s)", cacheKey, panelType)
				if haPanel {
					if haFull, ok := cached.(*HAFullData); ok {
						writeJSON(w, http.StatusOK, filterHAData(haFull, config))
						return
					}
				}
				writeJSON(w, http.StatusOK, cached)
				return
			}
		}

		// Cache miss (or plex filtered — always live) — fetch and optionally store
		data, err := fetcher(db, config)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if cacheKey != "" && !plexFiltered {
			cacheSet(cacheKey, data)
		}
		// For HA: cache holds the full entity list; serve the filtered view to the client.
		if haPanel {
			if haFull, ok := data.(*HAFullData); ok {
				writeJSON(w, http.StatusOK, filterHAData(haFull, config))
				return
			}
		}
		writeJSON(w, http.StatusOK, data)
	}
}
