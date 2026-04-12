package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

// Integration is the shared struct used across all integration handlers.
type Integration struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	Type      string     `json:"type"`
	APIURL    string     `json:"apiUrl"`
	UIURL     string     `json:"uiUrl"`
	SecretID  *string    `json:"secretId,omitempty"`
	Enabled   bool       `json:"enabled"`
	CreatedBy string     `json:"createdBy"`
	CreatedAt time.Time  `json:"createdAt"`
}

func ListIntegrations(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var rows *sql.Rows
		var err error
		if claims.Role == models.RoleAdmin {
			rows, err = db.Query(`
				SELECT id, name, type, api_url, ui_url, secret_id, enabled, created_by, created_at
				FROM integrations WHERE created_by = 'SYSTEM' ORDER BY name ASC
			`)
		} else {
			rows, err = db.Query(`
				SELECT DISTINCT i.id, i.name, i.type, i.api_url, i.ui_url,
				       i.secret_id, i.enabled, i.created_by, i.created_at
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
			rows.Scan(&ig.ID, &ig.Name, &ig.Type, &ig.APIURL, &ig.UIURL,
				&secretID, &enabled, &ig.CreatedBy, &ig.CreatedAt)
			ig.Enabled = enabled == 1
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
			Name     string  `json:"name"`
			Type     string  `json:"type"`
			APIURL   string  `json:"apiUrl"`
			UIURL    string  `json:"uiUrl"`
			SecretID *string `json:"secretId"`
			Scope    string  `json:"scope"`
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
		id := generateID()
		var secretID interface{} = nil
		if req.SecretID != nil && *req.SecretID != "" {
			secretID = *req.SecretID
		}
		_, err := db.Exec(`
			INSERT INTO integrations (id, name, type, api_url, ui_url, secret_id, created_by)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`, id, req.Name, req.Type, req.APIURL, req.UIURL, secretID, ownerID)
		if err != nil {
			log.Printf("[INTEGRATIONS] create error: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to create integration")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"id": id})
	}
}

func UpdateIntegration(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var req struct {
			Name     string  `json:"name"`
			APIURL   string  `json:"apiUrl"`
			UIURL    string  `json:"uiUrl"`
			SecretID *string `json:"secretId"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		var secretID interface{} = nil
		if req.SecretID != nil && *req.SecretID != "" {
			secretID = *req.SecretID
		}
		db.Exec(`UPDATE integrations SET name=?, api_url=?, ui_url=?, secret_id=? WHERE id=?`,
			req.Name, req.APIURL, req.UIURL, secretID, id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func DeleteIntegration(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
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
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.APIURL == "" {
			writeError(w, http.StatusBadRequest, "apiUrl required")
			return
		}
		apiKey := ""
		if req.SecretID != "" {
			var enc string
			if err := db.QueryRow("SELECT value FROM secrets WHERE id=?", req.SecretID).Scan(&enc); err == nil {
				apiKey = decryptSecret(enc)
			}
		}
		var err error
		switch req.Type {
		case "sonarr", "radarr", "lidarr", "readarr":
			err = testArrConnection(req.APIURL, apiKey)
		default:
			err = testGenericConnection(req.APIURL)
		}
		if err != nil {
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
			SELECT id, name, type, api_url, ui_url, secret_id, enabled, created_by, created_at
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
			rows.Scan(&ig.ID, &ig.Name, &ig.Type, &ig.APIURL, &ig.UIURL,
				&secretID, &enabled, &ig.CreatedBy, &ig.CreatedAt)
			ig.Enabled = enabled == 1
			if secretID.Valid {
				ig.SecretID = &secretID.String
			}
			integrations = append(integrations, ig)
		}
		writeJSON(w, http.StatusOK, integrations)
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
func resolveIntegration(db *sql.DB, id string) (apiURL, uiURL, apiKey string, err error) {
	var secretID sql.NullString
	err = db.QueryRow(`
		SELECT api_url, ui_url, secret_id FROM integrations WHERE id=? AND enabled=1
	`, id).Scan(&apiURL, &uiURL, &secretID)
	if err != nil {
		return "", "", "", fmt.Errorf("integration not found")
	}
	if secretID.Valid {
		var enc string
		if dbErr := db.QueryRow("SELECT value FROM secrets WHERE id=?", secretID.String).Scan(&enc); dbErr == nil {
			apiKey = decryptSecret(enc)
		}
	}
	return
}

func testArrConnection(apiURL, apiKey string) error {
	body, err := arrGet(apiURL, apiKey, "/api/v3/system/status")
	if err != nil {
		return err
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(body, &resp); err != nil || resp["version"] == nil {
		return fmt.Errorf("unexpected response from API")
	}
	return nil
}

func testGenericConnection(apiURL string) error {
	client := &http.Client{Timeout: 10 * time.Second}
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
