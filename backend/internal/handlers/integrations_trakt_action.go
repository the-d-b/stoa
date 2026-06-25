package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gorilla/mux"
)

func radarrAddMovie(apiURL, apiKey string, skipTLS bool, tmdbID int64, title string) error {
	b, err := arrGet(apiURL, apiKey, "/api/v3/qualityprofile", skipTLS)
	if err != nil {
		return fmt.Errorf("radarr qualityprofile: %w", err)
	}
	var profiles []struct {
		ID int `json:"id"`
	}
	if json.Unmarshal(b, &profiles) != nil || len(profiles) == 0 {
		return fmt.Errorf("radarr: no quality profiles configured")
	}

	b, err = arrGet(apiURL, apiKey, "/api/v3/rootfolder", skipTLS)
	if err != nil {
		return fmt.Errorf("radarr rootfolder: %w", err)
	}
	var folders []struct {
		Path string `json:"path"`
	}
	if json.Unmarshal(b, &folders) != nil || len(folders) == 0 {
		return fmt.Errorf("radarr: no root folders configured")
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"tmdbId":           tmdbID,
		"title":            title,
		"qualityProfileId": profiles[0].ID,
		"rootFolderPath":   folders[0].Path,
		"monitored":        true,
		"addOptions":       map[string]bool{"searchForMovie": true},
	})
	_, err = arrPost(apiURL, apiKey, "/api/v3/movie", skipTLS, payload)
	return err
}

func sonarrAddShow(apiURL, apiKey string, skipTLS bool, tvdbID int64) error {
	b, err := arrGet(apiURL, apiKey, fmt.Sprintf("/api/v3/series/lookup?term=tvdb%%3A%d", tvdbID), skipTLS)
	if err != nil {
		return fmt.Errorf("sonarr lookup: %w", err)
	}
	var results []map[string]interface{}
	if json.Unmarshal(b, &results) != nil || len(results) == 0 {
		return fmt.Errorf("sonarr: series not found for TVDB ID %d", tvdbID)
	}
	series := results[0]

	b, err = arrGet(apiURL, apiKey, "/api/v3/qualityprofile", skipTLS)
	if err != nil {
		return fmt.Errorf("sonarr qualityprofile: %w", err)
	}
	var profiles []struct {
		ID int `json:"id"`
	}
	if json.Unmarshal(b, &profiles) != nil || len(profiles) == 0 {
		return fmt.Errorf("sonarr: no quality profiles configured")
	}

	b, err = arrGet(apiURL, apiKey, "/api/v3/rootfolder", skipTLS)
	if err != nil {
		return fmt.Errorf("sonarr rootfolder: %w", err)
	}
	var folders []struct {
		Path string `json:"path"`
	}
	if json.Unmarshal(b, &folders) != nil || len(folders) == 0 {
		return fmt.Errorf("sonarr: no root folders configured")
	}

	series["qualityProfileId"] = profiles[0].ID
	series["rootFolderPath"] = folders[0].Path
	series["monitored"] = true
	series["addOptions"] = map[string]interface{}{"searchForMissingEpisodes": true}

	payload, _ := json.Marshal(series)
	_, err = arrPost(apiURL, apiKey, "/api/v3/series", skipTLS, payload)
	return err
}

func lidarrAddAlbum(apiURL, apiKey string, skipTLS bool, mbid string) error {
	b, err := arrGet(apiURL, apiKey, fmt.Sprintf("/api/v1/album/lookup?term=lidarr:%s", mbid), skipTLS)
	if err != nil {
		return fmt.Errorf("lidarr lookup: %w", err)
	}
	var results []map[string]interface{}
	if json.Unmarshal(b, &results) != nil || len(results) == 0 {
		return fmt.Errorf("lidarr: album not found for MusicBrainz ID %s", mbid)
	}
	album := results[0]

	b, err = arrGet(apiURL, apiKey, "/api/v1/qualityprofile", skipTLS)
	if err != nil {
		return fmt.Errorf("lidarr qualityprofile: %w", err)
	}
	var profiles []struct {
		ID int `json:"id"`
	}
	if json.Unmarshal(b, &profiles) != nil || len(profiles) == 0 {
		return fmt.Errorf("lidarr: no quality profiles configured")
	}

	b, err = arrGet(apiURL, apiKey, "/api/v1/rootfolder", skipTLS)
	if err != nil {
		return fmt.Errorf("lidarr rootfolder: %w", err)
	}
	var folders []struct {
		Path string `json:"path"`
	}
	if json.Unmarshal(b, &folders) != nil || len(folders) == 0 {
		return fmt.Errorf("lidarr: no root folders configured")
	}

	metaProfileID := 1
	if b, err2 := arrGet(apiURL, apiKey, "/api/v1/metadataprofile", skipTLS); err2 == nil {
		var mps []struct {
			ID int `json:"id"`
		}
		if json.Unmarshal(b, &mps) == nil && len(mps) > 0 {
			metaProfileID = mps[0].ID
		}
	}

	album["monitored"] = true
	album["qualityProfileId"] = profiles[0].ID
	album["rootFolderPath"] = folders[0].Path
	album["addOptions"] = map[string]interface{}{"searchForNewAlbum": true}

	if artist, ok := album["artist"].(map[string]interface{}); ok {
		artist["monitored"] = true
		artist["qualityProfileId"] = profiles[0].ID
		artist["metadataProfileId"] = metaProfileID
		artist["rootFolderPath"] = folders[0].Path
		album["artist"] = artist
	}

	payload, _ := json.Marshal(album)
	_, err = arrPost(apiURL, apiKey, "/api/v1/album", skipTLS, payload)
	return err
}

func TraktPanelAction(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		panelID := mux.Vars(r)["id"]

		var configStr string
		if err := db.QueryRow(`SELECT COALESCE(config, '{}') FROM panels WHERE id = ?`, panelID).Scan(&configStr); err != nil {
			writeError(w, http.StatusNotFound, "panel not found")
			return
		}
		var panelCfg map[string]interface{}
		json.Unmarshal([]byte(configStr), &panelCfg) //nolint:errcheck

		var req struct {
			Action string `json:"action"`
			TMDbID int64  `json:"tmdbId"`
			TVDbID int64  `json:"tvdbId"`
			Title  string `json:"title"`
			MBID   string `json:"mbid"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		switch req.Action {
		case "add_to_radarr":
			iid, _ := panelCfg["radarrIntegrationId"].(string)
			if iid == "" {
				writeError(w, http.StatusBadRequest, "Radarr integration not configured on this panel")
				return
			}
			apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, iid)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "Radarr integration not found")
				return
			}
			if err := radarrAddMovie(apiURL, apiKey, skipTLS, req.TMDbID, req.Title); err != nil {
				writeError(w, http.StatusBadGateway, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, map[string]string{"status": "added"})

		case "add_to_sonarr":
			iid, _ := panelCfg["sonarrIntegrationId"].(string)
			if iid == "" {
				writeError(w, http.StatusBadRequest, "Sonarr integration not configured on this panel")
				return
			}
			apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, iid)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "Sonarr integration not found")
				return
			}
			if err := sonarrAddShow(apiURL, apiKey, skipTLS, req.TVDbID); err != nil {
				writeError(w, http.StatusBadGateway, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, map[string]string{"status": "added"})

		case "add_to_lidarr":
			iid, _ := panelCfg["lidarrIntegrationId"].(string)
			if iid == "" {
				writeError(w, http.StatusBadRequest, "Lidarr integration not configured on this panel")
				return
			}
			if req.MBID == "" {
				writeError(w, http.StatusBadRequest, "MusicBrainz ID required to add album to Lidarr")
				return
			}
			apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, iid)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "Lidarr integration not found")
				return
			}
			if err := lidarrAddAlbum(apiURL, apiKey, skipTLS, req.MBID); err != nil {
				writeError(w, http.StatusBadGateway, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, map[string]string{"status": "added"})

		default:
			writeError(w, http.StatusBadRequest, "unknown action: "+req.Action)
		}
	}
}
