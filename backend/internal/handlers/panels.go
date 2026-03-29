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

// ── Panels ────────────────────────────────────────────────────────────────────

func ListPanels(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)

		// Admins see all panels
		// Regular users see panels where:
		//   - panel has no tags (untagged = public)
		//   - panel has a tag matching one of the user's group tags
		var rows *sql.Rows
		var err error

		if claims.Role == models.RoleAdmin {
			rows, err = db.Query(`
				SELECT id, type, title, config, scope, COALESCE(created_by,''), created_at
				FROM panels ORDER BY created_at ASC
			`)
		} else {
			// A panel is visible to a user if:
			// 1. It has no tags (untagged = public), OR
			// 2. At least one of its tags is accessible via the user's groups
			rows, err = db.Query(`
				SELECT DISTINCT p.id, p.type, p.title, p.config, p.scope,
				       COALESCE(p.created_by,''), p.created_at
				FROM panels p
				WHERE
					-- Untagged panels: no entries in panel_tags
					(SELECT COUNT(*) FROM panel_tags WHERE panel_id = p.id) = 0
					OR
					-- Tagged panels: user's groups grant access to at least one of the panel's tags
					EXISTS (
						SELECT 1
						FROM panel_tags pt
						JOIN group_tags gt ON pt.tag_id = gt.tag_id
						JOIN user_groups ug ON gt.group_id = ug.group_id
						WHERE pt.panel_id = p.id AND ug.user_id = ?
					)
				ORDER BY p.created_at ASC
			`, claims.UserID)
		}
		if err != nil {
			log.Printf("[PANELS] list error: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to query panels")
			return
		}
		defer rows.Close()

		panels := []models.Panel{}
		for rows.Next() {
			var p models.Panel
			rows.Scan(&p.ID, &p.Type, &p.Title, &p.Config, &p.Scope, &p.CreatedBy, &p.CreatedAt)
			// Load tags
			p.Tags = loadPanelTags(db, p.ID)
			// Load user position
			db.QueryRow("SELECT position FROM user_panel_order WHERE user_id=? AND panel_id=?",
				claims.UserID, p.ID).Scan(&p.Position)
			panels = append(panels, p)
		}
		writeJSON(w, http.StatusOK, panels)
	}
}

func CreatePanel(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)

		var req models.CreatePanelRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Title == "" {
			writeError(w, http.StatusBadRequest, "title required")
			return
		}
		if req.Type == "" {
			req.Type = "bookmarks"
		}
		if req.Config == "" {
			req.Config = "{}"
		}

		id := generateID()
		_, err := db.Exec(`
			INSERT INTO panels (id, type, title, config, scope, created_by)
			VALUES (?, ?, ?, ?, 'shared', ?)
		`, id, req.Type, req.Title, req.Config, claims.UserID)
		if err != nil {
			log.Printf("[PANELS] create error: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to create panel")
			return
		}

		writeJSON(w, http.StatusCreated, models.Panel{
			ID: id, Type: req.Type, Title: req.Title,
			Config: req.Config, Scope: models.ScopeShared, CreatedAt: time.Now(),
		})
	}
}

func UpdatePanel(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var req struct {
			Title  string `json:"title"`
			Config string `json:"config"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		db.Exec("UPDATE panels SET title=?, config=? WHERE id=?", req.Title, req.Config, id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func DeletePanel(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		db.Exec("DELETE FROM panels WHERE id=?", id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func AddTagToPanel(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		panelID := mux.Vars(r)["id"]
		var req struct{ TagID string `json:"tagId"` }
		json.NewDecoder(r.Body).Decode(&req)
		db.Exec("INSERT OR IGNORE INTO panel_tags (panel_id, tag_id) VALUES (?,?)", panelID, req.TagID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func RemoveTagFromPanel(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		db.Exec("DELETE FROM panel_tags WHERE panel_id=? AND tag_id=?", vars["id"], vars["tagId"])
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func UpdatePanelOrder(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var req []struct {
			PanelID  string `json:"panelId"`
			Position int    `json:"position"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}

		tx, _ := db.Begin()
		for _, item := range req {
			tx.Exec(`
				INSERT INTO user_panel_order (user_id, panel_id, position) VALUES (?,?,?)
				ON CONFLICT(user_id, panel_id) DO UPDATE SET position=excluded.position
			`, claims.UserID, item.PanelID, item.Position)
		}
		tx.Commit()
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func loadPanelTags(db *sql.DB, panelID string) []models.Tag {
	rows, err := db.Query(`
		SELECT t.id, t.name, t.color FROM tags t
		JOIN panel_tags pt ON t.id = pt.tag_id
		WHERE pt.panel_id = ?
	`, panelID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var tags []models.Tag
	for rows.Next() {
		var t models.Tag
		rows.Scan(&t.ID, &t.Name, &t.Color)
		tags = append(tags, t)
	}
	return tags
}
