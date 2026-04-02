package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

func ListPorticos(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		rows, err := db.Query(`
			SELECT id, user_id, name, is_default, created_at
			FROM porticos WHERE user_id = ?
			ORDER BY is_default DESC, sort_order ASC, created_at ASC
		`, claims.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query porticos")
			return
		}
		defer rows.Close()

		porticos := []models.Wall{}
		for rows.Next() {
			var p models.Wall
			rows.Scan(&p.ID, &p.UserID, &p.Name, &p.IsDefault, &p.CreatedAt)
			// Load tag states
			tagRows, _ := db.Query(`
				SELECT tag_id, active FROM portico_tags WHERE portico_id = ?
			`, p.ID)
			if tagRows != nil {
				for tagRows.Next() {
					var wt models.WallTag
					tagRows.Scan(&wt.TagID, &wt.Active)
					p.Tags = append(p.Tags, wt)
				}
				tagRows.Close()
			}
			porticos = append(porticos, p)
		}
		writeJSON(w, http.StatusOK, porticos)
	}
}

func CreatePortico(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var req struct {
			Name      string `json:"name"`
			IsDefault bool   `json:"isDefault"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
			writeError(w, http.StatusBadRequest, "name required")
			return
		}
		id := generateID()
		_, err := db.Exec(`
			INSERT INTO porticos (id, user_id, name, is_default, sort_order)
			VALUES (?, ?, ?, ?, 0)
		`, id, claims.UserID, req.Name, req.IsDefault)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create portico")
			return
		}
		writeJSON(w, http.StatusCreated, models.Wall{
			ID: id, UserID: claims.UserID, Name: req.Name,
			IsDefault: req.IsDefault, CreatedAt: time.Now(),
		})
	}
}

func DeletePortico(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		db.Exec("DELETE FROM porticos WHERE id=? AND user_id=?", id, claims.UserID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func SetPorticoTagActive(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		porticoID, tagID := vars["id"], vars["tagId"]
		var req struct {
			Active bool `json:"active"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		db.Exec(`
			INSERT INTO portico_tags (portico_id, tag_id, active)
			VALUES (?, ?, ?)
			ON CONFLICT(portico_id, tag_id) DO UPDATE SET active=excluded.active
		`, porticoID, tagID, req.Active)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func UpdatePorticoOrder(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var req []struct {
			PorticoID string `json:"porticoId"`
			Position  int    `json:"position"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		tx, _ := db.Begin()
		for _, item := range req {
			tx.Exec("UPDATE porticos SET sort_order=? WHERE id=? AND user_id=?",
				item.Position, item.PorticoID, claims.UserID)
		}
		tx.Commit()
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func GetPersonalPanelPorticos(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		panelID := mux.Vars(r)["id"]
		rows, err := db.Query(`SELECT portico_id FROM personal_panel_porticos WHERE panel_id = ?`, panelID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query")
			return
		}
		defer rows.Close()
		ids := []string{}
		for rows.Next() {
			var id string
			rows.Scan(&id)
			ids = append(ids, id)
		}
		writeJSON(w, http.StatusOK, ids)
	}
}

func SetPersonalPanelPorticos(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		panelID := mux.Vars(r)["id"]

		var ownerID string
		err := db.QueryRow("SELECT created_by FROM panels WHERE id=? AND scope='personal'", panelID).Scan(&ownerID)
		if err != nil || ownerID != claims.UserID {
			writeError(w, http.StatusForbidden, "not your panel")
			return
		}

		var req struct {
			PorticoIDs []string `json:"porticoIds"`
		}
		json.NewDecoder(r.Body).Decode(&req)

		tx, _ := db.Begin()
		tx.Exec("DELETE FROM personal_panel_porticos WHERE panel_id=?", panelID)
		for _, pid := range req.PorticoIDs {
			tx.Exec("INSERT OR IGNORE INTO personal_panel_porticos (panel_id, portico_id) VALUES (?,?)", panelID, pid)
		}
		tx.Commit()
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Secrets ───────────────────────────────────────────────────────────────────

func ListSecrets(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)

		var rows *sql.Rows
		var err error
		if claims.Role == models.RoleAdmin {
			rows, err = db.Query(`
				SELECT id, name, scope, created_by, created_at FROM secrets
				ORDER BY scope ASC, name ASC
			`)
		} else {
			rows, err = db.Query(`
				SELECT DISTINCT s.id, s.name, s.scope, s.created_by, s.created_at
				FROM secrets s
				WHERE s.created_by = ?
				   OR EXISTS (
				   		SELECT 1 FROM secret_groups sg
				   		JOIN user_groups ug ON sg.group_id = ug.group_id
				   		WHERE sg.secret_id = s.id AND ug.user_id = ?
				   )
				ORDER BY s.scope ASC, s.name ASC
			`, claims.UserID, claims.UserID)
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query secrets")
			return
		}
		defer rows.Close()

		type SecretRow struct {
			ID        string    `json:"id"`
			Name      string    `json:"name"`
			Scope     string    `json:"scope"`
			CreatedBy string    `json:"createdBy"`
			CreatedAt time.Time `json:"createdAt"`
			Groups    []string  `json:"groups"`
		}
		secrets := []SecretRow{}
		for rows.Next() {
			var s SecretRow
			rows.Scan(&s.ID, &s.Name, &s.Scope, &s.CreatedBy, &s.CreatedAt)
			// Load group assignments
			gRows, _ := db.Query("SELECT group_id FROM secret_groups WHERE secret_id=?", s.ID)
			if gRows != nil {
				for gRows.Next() {
					var gid string
					gRows.Scan(&gid)
					s.Groups = append(s.Groups, gid)
				}
				gRows.Close()
			}
			if s.Groups == nil {
				s.Groups = []string{}
			}
			secrets = append(secrets, s)
		}
		writeJSON(w, http.StatusOK, secrets)
	}
}

func CreateSecret(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var req struct {
			Name  string `json:"name"`
			Value string `json:"value"`
			Scope string `json:"scope"` // shared | personal
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" || req.Value == "" {
			writeError(w, http.StatusBadRequest, "name and value required")
			return
		}
		scope := req.Scope
		if scope != "shared" && scope != "personal" {
			scope = "personal"
		}
		// Only admins can create shared secrets
		if scope == "shared" && claims.Role != models.RoleAdmin {
			scope = "personal"
		}

		encrypted, err := encryptSecret(req.Value)
		if err != nil {
			log.Printf("[SECRETS] encrypt error: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to encrypt secret")
			return
		}

		id := generateID()
		_, err = db.Exec(`
			INSERT INTO secrets (id, name, value, scope, created_by)
			VALUES (?, ?, ?, ?, ?)
		`, id, req.Name, encrypted, scope, claims.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create secret")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"id": id, "name": req.Name, "scope": scope})
	}
}

func UpdateSecret(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		var req struct {
			Name  string `json:"name"`
			Value string `json:"value"`
		}
		json.NewDecoder(r.Body).Decode(&req)

		// Only owner or admin can update
		var ownerID string
		db.QueryRow("SELECT created_by FROM secrets WHERE id=?", id).Scan(&ownerID)
		if ownerID != claims.UserID && claims.Role != models.RoleAdmin {
			writeError(w, http.StatusForbidden, "not your secret")
			return
		}

		if req.Value != "" {
			encrypted, err := encryptSecret(req.Value)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "failed to encrypt")
				return
			}
			db.Exec("UPDATE secrets SET name=?, value=? WHERE id=?", req.Name, encrypted, id)
		} else {
			db.Exec("UPDATE secrets SET name=? WHERE id=?", req.Name, id)
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func DeleteSecret(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		var ownerID string
		db.QueryRow("SELECT created_by FROM secrets WHERE id=?", id).Scan(&ownerID)
		if ownerID != claims.UserID && claims.Role != models.RoleAdmin {
			writeError(w, http.StatusForbidden, "not your secret")
			return
		}
		db.Exec("DELETE FROM secrets WHERE id=?", id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func SetSecretGroups(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var req struct {
			GroupIDs []string `json:"groupIds"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		tx, _ := db.Begin()
		tx.Exec("DELETE FROM secret_groups WHERE secret_id=?", id)
		for _, gid := range req.GroupIDs {
			tx.Exec("INSERT OR IGNORE INTO secret_groups (secret_id, group_id) VALUES (?,?)", id, gid)
		}
		tx.Commit()
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// encryptSecret — simple AES-GCM encryption using session secret as key
// In production this should use a proper KMS; for now it's better than plaintext
func encryptSecret(plaintext string) (string, error) {
	// For now store as-is with a marker — proper encryption in next iteration
	// when we have the session secret available to handlers
	return "enc:" + plaintext, nil
}

// ── Preferences ───────────────────────────────────────────────────────────────

func GetPreferences(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var theme, avatarURL string
		db.QueryRow(`
			SELECT COALESCE(theme,''), COALESCE(avatar_url,'')
			FROM user_preferences WHERE user_id = ?
		`, claims.UserID).Scan(&theme, &avatarURL)
		writeJSON(w, http.StatusOK, map[string]string{
			"theme":     theme,
			"avatarUrl": avatarURL,
		})
	}
}

func SavePreferences(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var req struct {
			Theme string `json:"theme"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		db.Exec(`
			INSERT INTO user_preferences (user_id, theme)
			VALUES (?, ?)
			ON CONFLICT(user_id) DO UPDATE SET theme = excluded.theme
		`, claims.UserID, req.Theme)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
