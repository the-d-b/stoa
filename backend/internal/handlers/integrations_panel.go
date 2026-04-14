package handlers

import (
	"database/sql"
	"encoding/json"
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
	"calendar": func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchCalendarData(db, cfg) },
	"plex":     func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchPlexPanelData(db, cfg) },
	"tautulli": func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchTautulliPanelData(db, cfg) },
	"truenas":  func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchTrueNASPanelData(db, cfg) },
	"proxmox":  func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchProxmoxPanelData(db, cfg) },
	"kuma":     func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchKumaPanelData(db, cfg) },
	"gluetun":  func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchGluetunPanelData(db, cfg) },
	"opnsense": func(db *sql.DB, cfg map[string]interface{}) (interface{}, error) { return fetchOPNsensePanelData(db, cfg) },
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

		fetcher, ok := panelFetchers[panelType]
		if !ok {
			writeError(w, http.StatusBadRequest, "unsupported panel type: "+panelType)
			return
		}

		data, err := fetcher(db, config)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, data)
	}
}
