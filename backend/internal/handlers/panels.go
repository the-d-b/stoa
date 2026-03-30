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

		// Optional wall_id query param for per-wall ordering
		wallID := r.URL.Query().Get("wall_id")

		log.Printf("[PANELS] list request user=%s role=%s wall=%s", claims.UserID, claims.Role, wallID)

		var rows *sql.Rows
		var err error

		if claims.Role == models.RoleAdmin {
			rows, err = db.Query(`
				SELECT p.id, p.type, p.title, p.config, p.scope,
				       COALESCE(p.created_by,''), p.created_at
				FROM panels p
				WHERE p.scope = 'shared'
				   OR (p.scope = 'personal' AND p.created_by = ?)
				ORDER BY p.created_at ASC
			`, claims.UserID)
		} else {
			rows, err = db.Query(`
				SELECT DISTINCT p.id, p.type, p.title, p.config, p.scope,
				       COALESCE(p.created_by,''), p.created_at
				FROM panels p
				WHERE
					-- Personal panels owned by this user
					(p.scope = 'personal' AND p.created_by = ?)
					OR
					-- Shared untagged panels
					(p.scope = 'shared' AND
					 (SELECT COUNT(*) FROM panel_tags WHERE panel_id = p.id) = 0)
					OR
					-- Shared tagged panels the user has group access to
					(p.scope = 'shared' AND EXISTS (
						SELECT 1
						FROM panel_tags pt
						JOIN group_tags gt ON pt.tag_id = gt.tag_id
						JOIN user_groups ug ON gt.group_id = ug.group_id
						WHERE pt.panel_id = p.id AND ug.user_id = ?
					))
				ORDER BY p.created_at ASC
			`, claims.UserID, claims.UserID)
		}

		if err != nil {
			log.Printf("[PANELS] list error: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to query panels")
			return
		}
		defer rows.Close()

		panels := []models.Panel{}
		panelCount := 0
		for rows.Next() {
			var p models.Panel
			rows.Scan(&p.ID, &p.Type, &p.Title, &p.Config, &p.Scope, &p.CreatedBy, &p.CreatedAt)
			p.Tags = loadPanelTags(db, p.ID)

			// Load user position for this wall
			var wallIDVal interface{}
			if wallID != "" {
				wallIDVal = wallID
			}
			db.QueryRow(`
				SELECT position FROM user_panel_order_v2
				WHERE user_id=? AND panel_id=? AND COALESCE(wall_id,'') = COALESCE(?,'')
			`, claims.UserID, p.ID, wallIDVal).Scan(&p.Position)

			panels = append(panels, p)
			panelCount++
		}

		log.Printf("[PANELS] returning %d panels for user=%s role=%s", panelCount, claims.UserID, claims.Role)
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

		// Scope: admins can create shared or personal, regular users only personal
		scope := "shared"
		if req.Scope == "personal" || claims.Role != models.RoleAdmin {
			scope = "personal"
		}

		id := generateID()
		_, err := db.Exec(`
			INSERT INTO panels (id, type, title, config, scope, created_by)
			VALUES (?, ?, ?, ?, ?, ?)
		`, id, req.Type, req.Title, req.Config, scope, claims.UserID)
		if err != nil {
			log.Printf("[PANELS] create error: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to create panel")
			return
		}

		writeJSON(w, http.StatusCreated, models.Panel{
			ID: id, Type: req.Type, Title: req.Title,
			Config: req.Config, Scope: models.Scope(scope),
			CreatedBy: claims.UserID, CreatedAt: time.Now(),
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
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		// Admins can delete shared panels; users can only delete their own personal panels
		if claims.Role == models.RoleAdmin {
			db.Exec("DELETE FROM panels WHERE id=?", id)
		} else {
			db.Exec("DELETE FROM panels WHERE id=? AND created_by=? AND scope='personal'", id, claims.UserID)
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func AddTagToPanel(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		panelID := mux.Vars(r)["id"]
		var req struct {
			TagID string `json:"tagId"`
		}
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

		var req struct {
			WallID string `json:"wallId"` // empty = Home order
			Order  []struct {
				PanelID  string `json:"panelId"`
				Position int    `json:"position"`
			} `json:"order"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}

		var wallIDVal interface{}
		if req.WallID != "" {
			wallIDVal = req.WallID
		}

		tx, _ := db.Begin()
		for _, item := range req.Order {
			id := claims.UserID + "-" + item.PanelID + "-" + req.WallID
			tx.Exec(`
				INSERT INTO user_panel_order_v2 (id, user_id, panel_id, wall_id, position)
				VALUES (?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET position=excluded.position
			`, id, claims.UserID, item.PanelID, wallIDVal, item.Position)
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
