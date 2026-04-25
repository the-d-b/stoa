package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

// Integration is the shared struct used across all integration handlers.
type Integration struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Type        string    `json:"type"`
	APIURL      string    `json:"apiUrl"`
	UIURL       string    `json:"uiUrl"`
	SecretID    *string   `json:"secretId,omitempty"`
	SkipTLS     bool      `json:"skipTls"`
	Enabled     bool      `json:"enabled"`
	RefreshSecs int       `json:"refreshSecs"`
	CreatedBy   string    `json:"createdBy"`
	CreatedAt   time.Time `json:"createdAt"`
}

func ListIntegrations(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var rows *sql.Rows
		var err error
		if claims.Role == models.RoleAdmin {
			// Admin sees SYSTEM integrations + their own personal integrations
			rows, err = db.Query(`
				SELECT id, name, type, api_url, ui_url, secret_id, enabled, skip_tls, refresh_secs, created_by, created_at
				FROM integrations
				WHERE created_by = 'SYSTEM' OR created_by = ?
				ORDER BY CASE WHEN created_by = 'SYSTEM' THEN 0 ELSE 1 END ASC, name ASC
			`, claims.UserID)
		} else {
			rows, err = db.Query(`
				SELECT DISTINCT i.id, i.name, i.type, i.api_url, i.ui_url,
				       i.secret_id, i.enabled, i.skip_tls, i.refresh_secs, i.created_by, i.created_at
				FROM integrations i
				WHERE
					i.created_by = ?
					OR (i.created_by = 'SYSTEM' AND NOT EXISTS (
						SELECT 1 FROM integration_groups WHERE integration_id = i.id
					))
					OR (i.created_by = 'SYSTEM' AND EXISTS (
						SELECT 1 FROM integration_groups ig
						JOIN user_groups ug ON ig.group_id = ug.group_id
						WHERE ig.integration_id = i.id AND ug.user_id = ?
					))
				ORDER BY CASE WHEN i.created_by = 'SYSTEM' THEN 0 ELSE 1 END ASC, i.name ASC
			`, claims.UserID, claims.UserID)
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query integrations")
			return
		}
		defer rows.Close()
		integrations := []Integration{}
		for rows.Next() {
			var ig Integration
			var enabled int
			var secretID sql.NullString
			var skipTLS int
			rows.Scan(&ig.ID, &ig.Name, &ig.Type, &ig.APIURL, &ig.UIURL,
				&secretID, &enabled, &skipTLS, &ig.RefreshSecs, &ig.CreatedBy, &ig.CreatedAt)
			ig.Enabled = enabled == 1
			ig.SkipTLS = skipTLS == 1
			if secretID.Valid {
				ig.SecretID = &secretID.String
			}
			integrations = append(integrations, ig)
		}
		writeJSON(w, http.StatusOK, integrations)
	}
}

func CreateIntegration(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var req struct {
			Name        string  `json:"name"`
			Type        string  `json:"type"`
			APIURL      string  `json:"apiUrl"`
			UIURL       string  `json:"uiUrl"`
			SecretID    *string `json:"secretId"`
			SkipTLS     bool    `json:"skipTls"`
			Scope       string  `json:"scope"`
			RefreshSecs int     `json:"refreshSecs"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil ||
			req.Name == "" || req.Type == "" || req.APIURL == "" {
			writeError(w, http.StatusBadRequest, "name, type and apiUrl required")
			return
		}
		ownerID := "SYSTEM"
		if req.Scope == "personal" || claims.Role != models.RoleAdmin {
			ownerID = claims.UserID
		}
		req.APIURL = strings.TrimSpace(req.APIURL)
		req.UIURL = strings.TrimSpace(req.UIURL)
		if req.RefreshSecs < 15 { req.RefreshSecs = defaultRefreshSecs(req.Type) }
		id := generateID()
		var secretID interface{} = nil
		if req.SecretID != nil && *req.SecretID != "" {
			secretID = *req.SecretID
		}
		skipTLSInt := 0
		if req.SkipTLS { skipTLSInt = 1 }
		_, err := db.Exec(`
			INSERT INTO integrations (id, name, type, api_url, ui_url, secret_id, skip_tls, refresh_secs, created_by)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, id, req.Name, req.Type, req.APIURL, req.UIURL, secretID, skipTLSInt, req.RefreshSecs, ownerID)
		if err != nil {
			log.Printf("[INTEGRATIONS] create error: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to create integration")
			return
		}
		go StartWorkerForIntegration(db, id)
		writeJSON(w, http.StatusCreated, map[string]string{"id": id})
	}
}

func UpdateIntegration(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var req struct {
			Name        string  `json:"name"`
			APIURL      string  `json:"apiUrl"`
			UIURL       string  `json:"uiUrl"`
			SecretID    *string `json:"secretId"`
			SkipTLS     bool    `json:"skipTls"`
			RefreshSecs int     `json:"refreshSecs"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		req.APIURL = strings.TrimSpace(req.APIURL)
		req.UIURL = strings.TrimSpace(req.UIURL)
		if req.RefreshSecs < 15 { req.RefreshSecs = defaultRefreshSecs("") }
		var secretID interface{} = nil
		if req.SecretID != nil && *req.SecretID != "" {
			secretID = *req.SecretID
		}
		skipTLSInt := 0
		if req.SkipTLS { skipTLSInt = 1 }
		_, uerr := db.Exec(`UPDATE integrations SET name=?, api_url=?, ui_url=?, secret_id=?, skip_tls=?, refresh_secs=? WHERE id=?`,
			req.Name, req.APIURL, req.UIURL, secretID, skipTLSInt, req.RefreshSecs, id)
		if uerr != nil {
			log.Printf("[INTEGRATIONS] update error: %v", uerr)
			writeError(w, http.StatusInternalServerError, "update failed")
			return
		}
		go StartWorkerForIntegration(db, id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func DeleteIntegration(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		StopWorkerForIntegration(id)
		db.Exec("DELETE FROM integrations WHERE id=?", id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func TestIntegration(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Type     string `json:"type"`
			APIURL   string `json:"apiUrl"`
			SecretID string `json:"secretId"`
			SkipTLS  bool   `json:"skipTls"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.APIURL == "" {
			writeError(w, http.StatusBadRequest, "apiUrl required")
			return
		}
		req.APIURL = strings.TrimSpace(req.APIURL)
		apiKey := ""
		if req.SecretID != "" {
			var enc string
			if err := db.QueryRow("SELECT value FROM secrets WHERE id=?", req.SecretID).Scan(&enc); err == nil {
				apiKey = decryptSecret(enc)
			}
		}
		var err error
		switch req.Type {
		case "sonarr", "radarr", "lidarr":
			err = testArrConnection(req.APIURL, apiKey, req.Type, req.SkipTLS)
		case "plex":
			err = testPlexConnection(req.APIURL, apiKey, req.SkipTLS)
		case "tautulli":
			err = testTautulliConnection(req.APIURL, apiKey, req.SkipTLS)
		case "truenas":
			err = testTrueNASConnection(req.APIURL, apiKey, req.SkipTLS)
		case "proxmox":
			err = testProxmoxConnection(req.APIURL, apiKey, req.SkipTLS)
		case "kuma":
			err = testKumaConnection(req.APIURL, apiKey, req.SkipTLS)
		case "gluetun":
			err = testGluetunConnection(req.APIURL, apiKey, req.SkipTLS)
		case "opnsense":
			err = testOPNsenseConnection(req.APIURL, apiKey, req.SkipTLS)
		case "transmission":
			err = testTransmissionConnection(req.APIURL, apiKey, req.SkipTLS)
		case "photoprism":
			err = testPhotoPrismConnection(req.APIURL, apiKey, req.SkipTLS)
		case "authentik":
			err = testAuthentikConnection(req.APIURL, apiKey, req.SkipTLS)
		default:
			err = testGenericConnection(req.APIURL)
		}
		if err != nil {
			// If TLS failed and we weren't already skipping — retry with skipTLS
			// to detect self-signed cert issues
			if !req.SkipTLS && isTLSError(err) {
				writeJSON(w, http.StatusOK, map[string]interface{}{
					"ok":          false,
					"error":       err.Error(),
					"tlsError":    true,
					"skipTlsWorks": func() bool {
						var retryErr error
						switch req.Type {
						case "sonarr", "radarr", "lidarr":
							retryErr = testArrConnection(req.APIURL, apiKey, req.Type, true)
						case "plex":
							retryErr = testPlexConnection(req.APIURL, apiKey, true)
						case "tautulli":
							retryErr = testTautulliConnection(req.APIURL, apiKey, true)
						case "truenas":
							retryErr = testTrueNASConnection(req.APIURL, apiKey, true)
						case "proxmox":
							retryErr = testProxmoxConnection(req.APIURL, apiKey, true)
						case "kuma":
							retryErr = testKumaConnection(req.APIURL, apiKey, true)
						case "gluetun":
							retryErr = testGluetunConnection(req.APIURL, apiKey, true)
						case "opnsense":
							retryErr = testOPNsenseConnection(req.APIURL, apiKey, true)
						case "transmission":
							retryErr = testTransmissionConnection(req.APIURL, apiKey, true)
						case "photoprism":
							retryErr = testPhotoPrismConnection(req.APIURL, apiKey, true)
						case "authentik":
							retryErr = testAuthentikConnection(req.APIURL, apiKey, true)
						}
						return retryErr == nil
					}(),
				})
				return
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{"ok": false, "error": err.Error()})
		} else {
			writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true})
		}
	}
}

func GetIntegrationGroups(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		rows, err := db.Query("SELECT group_id FROM integration_groups WHERE integration_id=?", id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query groups")
			return
		}
		defer rows.Close()
		groupIDs := []string{}
		for rows.Next() {
			var gid string
			rows.Scan(&gid)
			groupIDs = append(groupIDs, gid)
		}
		writeJSON(w, http.StatusOK, groupIDs)
	}
}

func SetIntegrationGroups(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var req struct {
			GroupIDs []string `json:"groupIds"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		tx, _ := db.Begin()
		tx.Exec("DELETE FROM integration_groups WHERE integration_id=?", id)
		for _, gid := range req.GroupIDs {
			tx.Exec("INSERT OR IGNORE INTO integration_groups (integration_id, group_id) VALUES (?,?)", id, gid)
		}
		tx.Commit()
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func ListMyIntegrations(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		rows, err := db.Query(`
			SELECT id, name, type, api_url, ui_url, secret_id, enabled, skip_tls, refresh_secs, created_by, created_at
			FROM integrations WHERE created_by = ? ORDER BY name ASC
		`, claims.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query integrations")
			return
		}
		defer rows.Close()
		integrations := []Integration{}
		for rows.Next() {
			var ig Integration
			var enabled int
			var secretID sql.NullString
			var skipTLS int
			rows.Scan(&ig.ID, &ig.Name, &ig.Type, &ig.APIURL, &ig.UIURL,
				&secretID, &enabled, &skipTLS, &ig.RefreshSecs, &ig.CreatedBy, &ig.CreatedAt)
			ig.Enabled = enabled == 1
			ig.SkipTLS = skipTLS == 1
			if secretID.Valid {
				ig.SecretID = &secretID.String
			}
			integrations = append(integrations, ig)
		}
		writeJSON(w, http.StatusOK, integrations)
	}
}

func UpdateMyIntegration(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		// Verify ownership
		var owner string
		db.QueryRow("SELECT created_by FROM integrations WHERE id=?", id).Scan(&owner)
		if owner != claims.UserID {
			writeError(w, http.StatusForbidden, "not your integration")
			return
		}
		var req struct {
			Name        string  `json:"name"`
			APIURL      string  `json:"apiUrl"`
			UIURL       string  `json:"uiUrl"`
			SecretID    *string `json:"secretId"`
			SkipTLS     bool    `json:"skipTls"`
			RefreshSecs int     `json:"refreshSecs"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		req.APIURL = strings.TrimSpace(req.APIURL)
		req.UIURL = strings.TrimSpace(req.UIURL)
		if req.RefreshSecs < 15 { req.RefreshSecs = defaultRefreshSecs("") }
		var secretID interface{} = nil
		if req.SecretID != nil && *req.SecretID != "" { secretID = *req.SecretID }
		skipTLSInt := 0
		if req.SkipTLS { skipTLSInt = 1 }
		_, uerr := db.Exec(`UPDATE integrations SET name=?, api_url=?, ui_url=?, secret_id=?, skip_tls=?, refresh_secs=? WHERE id=? AND created_by=?`,
			req.Name, req.APIURL, req.UIURL, secretID, skipTLSInt, req.RefreshSecs, id, claims.UserID)
		if uerr != nil {
			writeError(w, http.StatusInternalServerError, "update failed")
			return
		}
		// Restart any running worker so it picks up the new config (e.g. skipTLS change)
		StartWorkerForIntegration(db, id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func DeleteMyIntegration(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		db.Exec("DELETE FROM integrations WHERE id=? AND created_by=?", id, claims.UserID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// resolveIntegration fetches the API URL, UI URL, and decrypted API key for an integration.
func resolveIntegration(db *sql.DB, id string) (apiURL, uiURL, apiKey string, skipTLS bool, err error) {
	var secretID sql.NullString
	var skipTLSInt int
	err = db.QueryRow(`
		SELECT api_url, ui_url, secret_id, skip_tls FROM integrations WHERE id=? AND enabled=1
	`, id).Scan(&apiURL, &uiURL, &secretID, &skipTLSInt)
	if err != nil {
		return "", "", "", false, fmt.Errorf("integration not found")
	}
	skipTLS = skipTLSInt == 1
	if secretID.Valid {
		var enc string
		if dbErr := db.QueryRow("SELECT value FROM secrets WHERE id=?", secretID.String).Scan(&enc); dbErr == nil {
			apiKey = decryptSecret(enc)
		}
	}
	return
}

func testArrConnection(apiURL, apiKey, intType string, skipTLS ...bool) error {
	// Sonarr/Radarr use v3, Lidarr uses v1
	apiVersion := "v3"
	if intType == "lidarr" {
		apiVersion = "v1"
	}
	body, err := arrGet(apiURL, apiKey, "/api/"+apiVersion+"/system/status", len(skipTLS) > 0 && skipTLS[0])
	if err != nil {
		return err
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(body, &resp); err != nil || resp["version"] == nil {
		return fmt.Errorf("unexpected response from API")
	}
	return nil
}

func testGenericConnection(apiURL string, skipTLS ...bool) error {
	client := httpClient(len(skipTLS) > 0 && skipTLS[0])
	resp, err := client.Get(apiURL)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return nil
}

// defaultRefreshSecs returns a sensible default TTL for each integration type.
func isTLSError(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "certificate") ||
		strings.Contains(s, "tls") ||
		strings.Contains(s, "x509") ||
		strings.Contains(s, "TLS")
}

func defaultRefreshSecs(igType string) int {
	switch igType {
	case "opnsense", "truenas", "proxmox", "transmission":
		return 30
	case "plex", "tautulli", "kuma", "gluetun":
		return 60
	case "authentik", "customapi":
		return 300
	case "sonarr", "radarr", "lidarr", "photoprism":
		return 1800
	case "calendar":
		return 3600
	default:
		return 60
	}
}
