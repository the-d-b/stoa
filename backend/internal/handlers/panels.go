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
		wallID := r.URL.Query().Get("wall_id")

		log.Printf("[PANELS] list request user=%s role=%s portico=%s", claims.UserID, claims.Role, wallID)

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
					-- Shared panels: no group restrictions (visible to all)
					(p.scope = 'shared' AND NOT EXISTS (
						SELECT 1 FROM panel_groups WHERE panel_id = p.id
					))
					OR
					-- Shared panels: user is in an assigned group
					(p.scope = 'shared' AND EXISTS (
						SELECT 1 FROM panel_groups pg
						JOIN user_groups ug ON pg.group_id = ug.group_id
						WHERE pg.panel_id = p.id AND ug.user_id = ?
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

			// Load saved position for this user + wall combination
			if wallID != "" {
				db.QueryRow(`
					SELECT position FROM user_panel_order_v3
					WHERE user_id = ? AND panel_id = ? AND portico_id = ?
				`, claims.UserID, p.ID, wallID).Scan(&p.Position)
			} else {
				db.QueryRow(`
					SELECT position FROM user_panel_order_v3
					WHERE user_id = ? AND panel_id = ? AND portico_id IS NULL
				`, claims.UserID, p.ID).Scan(&p.Position)
			}
			log.Printf("[PANELS]   panel %s %q pos=%d scope=%s", p.ID, p.Title, p.Position, p.Scope)

			panels = append(panels, p)
			panelCount++
		}

		// Sort by saved position — panels with no saved position (0) go to end
		// Use stable sort: panels with position > 0 sorted first by position,
		// then remaining panels in creation order
		ordered := make([]models.Panel, 0, len(panels))
		positioned := []models.Panel{}
		unpositioned := []models.Panel{}

		for _, p := range panels {
			if p.Position > 0 {
				positioned = append(positioned, p)
			} else {
				unpositioned = append(unpositioned, p)
			}
		}

		// Sort positioned panels
		for i := 0; i < len(positioned)-1; i++ {
			for j := i + 1; j < len(positioned); j++ {
				if positioned[j].Position < positioned[i].Position {
					positioned[i], positioned[j] = positioned[j], positioned[i]
				}
			}
		}

		ordered = append(ordered, positioned...)
		ordered = append(ordered, unpositioned...)

		log.Printf("[PANELS] returning %d panels for user=%s role=%s", panelCount, claims.UserID, claims.Role)
		writeJSON(w, http.StatusOK, ordered)
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
			PorticoID *string `json:"porticoId"` // null = Home, string = named wall
			Order  []struct {
				PanelID  string `json:"panelId"`
				Position int    `json:"position"`
			} `json:"order"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}

		isHome := req.PorticoID == nil || *req.PorticoID == ""
		porticoIDStr := ""
		if !isHome {
			porticoIDStr = *req.PorticoID
		}

		log.Printf("[PANELS] UpdateOrder user=%s porticoId=%v isHome=%v panels=%d",
			claims.UserID, req.PorticoID, isHome, len(req.Order))

		tx, err := db.Begin()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to begin transaction")
			return
		}

		for _, item := range req.Order {
			if !isHome {
				// Named wall
				rowID := claims.UserID + "-" + item.PanelID + "-" + porticoIDStr
				tx.Exec(`
					INSERT INTO user_panel_order_v3 (id, user_id, panel_id, portico_id, position)
					VALUES (?, ?, ?, ?, ?)
					ON CONFLICT(id) DO UPDATE SET position = excluded.position
				`, rowID, claims.UserID, item.PanelID, porticoIDStr, item.Position)
			} else {
				// Home wall — portico_id IS NULL, use DELETE+INSERT to avoid NULL issues
				rowID := claims.UserID + "-" + item.PanelID + "-home"
				tx.Exec(`
					DELETE FROM user_panel_order_v3
					WHERE user_id = ? AND panel_id = ? AND portico_id IS NULL
				`, claims.UserID, item.PanelID)
				tx.Exec(`
					INSERT INTO user_panel_order_v3 (id, user_id, panel_id, portico_id, position)
					VALUES (?, ?, ?, NULL, ?)
				`, rowID, claims.UserID, item.PanelID, item.Position)
			}
		}

		if err := tx.Commit(); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save order")
			return
		}

		for _, item := range req.Order {
			log.Printf("[PANELS] saved panelId=%s position=%d porticoId=%q isHome=%v", item.PanelID, item.Position, porticoIDStr, isHome)
		}
		log.Printf("[PANELS] order saved user=%s porticoId=%q isHome=%v panels=%d", claims.UserID, porticoIDStr, isHome, len(req.Order))
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

// ── Panel group access ────────────────────────────────────────────────────────

func GetPanelGroups(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		rows, _ := db.Query("SELECT group_id FROM panel_groups WHERE panel_id=?", id)
		defer rows.Close()
		ids := []string{}
		for rows.Next() {
			var gid string
			rows.Scan(&gid)
			ids = append(ids, gid)
		}
		writeJSON(w, http.StatusOK, ids)
	}
}

func SetPanelGroups(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var req struct {
			GroupIDs []string `json:"groupIds"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		tx, _ := db.Begin()
		tx.Exec("DELETE FROM panel_groups WHERE panel_id=?", id)
		for _, gid := range req.GroupIDs {
			tx.Exec("INSERT OR IGNORE INTO panel_groups (panel_id, group_id) VALUES (?,?)", id, gid)
		}
		tx.Commit()
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
