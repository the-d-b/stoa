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
		// Allow query params to override config values (e.g. ?days=7 for time range)
		// Track whether any override was applied — overridden requests bypass cache
		// so filters like 1d/7d/30d always return fresh data, not stale cached data.
		hasOverride := false
		if d := r.URL.Query().Get("days"); d != "" {
			var daysVal float64
			if _, err := fmt.Sscanf(d, "%f", &daysVal); err == nil {
				config["days"] = daysVal
				hasOverride = true
			}
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
		if cacheKey != "" && !hasOverride && !plexFiltered {
			if cached, ok := cacheGet(cacheKey); ok {
				log.Printf("[CACHE] panel hit %s (%s)", cacheKey, panelType)
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
		writeJSON(w, http.StatusOK, data)
	}
}
