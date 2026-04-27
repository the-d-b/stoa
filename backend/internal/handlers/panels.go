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

		var rows *sql.Rows
		var err error

		scopeFilter := r.URL.Query().Get("scope")
		if claims.Role == models.RoleAdmin && scopeFilter == "system" {
			// Admin screens: only system panels (no owner)
			rows, err = db.Query(`
				SELECT p.id, p.type, p.title, p.config, p.scope,
				       COALESCE(p.created_by,''), p.created_at
				FROM panels p
				WHERE p.created_by = 'SYSTEM'
				ORDER BY p.created_at ASC
			`)
		} else if claims.Role == models.RoleAdmin {
			// Admin viewing their own dashboard / panel order: system + personal
			rows, err = db.Query(`
				SELECT DISTINCT p.id, p.type, p.title, p.config, p.scope,
				       COALESCE(p.created_by,''), p.created_at
				FROM panels p
				WHERE p.created_by = 'SYSTEM' OR p.created_by = ?
				ORDER BY CASE WHEN p.created_by = 'SYSTEM' THEN 0 ELSE 1 END ASC, p.created_at ASC
			`, claims.UserID)
		} else {
			rows, err = db.Query(`
				SELECT DISTINCT p.id, p.type, p.title, p.config, p.scope,
				       COALESCE(p.created_by,''), p.created_at
				FROM panels p
				WHERE
					-- User's own panels
					p.created_by = ?
					OR
					-- System panels with no group restrictions
					(p.created_by = 'SYSTEM' AND NOT EXISTS (
						SELECT 1 FROM panel_groups WHERE panel_id = p.id
					))
					OR
					-- System panels restricted to groups user belongs to
					(p.created_by = 'SYSTEM' AND EXISTS (
						SELECT 1 FROM panel_groups pg
						JOIN user_groups ug ON pg.group_id = ug.group_id
						WHERE pg.panel_id = p.id AND ug.user_id = ?
					))
				ORDER BY CASE WHEN p.created_by = 'SYSTEM' THEN 0 ELSE 1 END ASC, p.created_at ASC
			`, claims.UserID, claims.UserID)
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
			p.Tags = loadPanelTags(db, p.ID)
			// Enrich with uiUrl from integration or directly from config (e.g. RSS panels)
			if cfg := parsePanelConfig(p.Config); cfg != nil {
				if iid, _ := cfg["integrationId"].(string); iid != "" {
					var uiURL string
					db.QueryRow("SELECT ui_url FROM integrations WHERE id=?", iid).Scan(&uiURL)
					p.UIUrl = uiURL
				} else if u, _ := cfg["uiUrl"].(string); u != "" {
					p.UIUrl = u
				}
			}

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
			panels = append(panels, p)
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

		// Admin creating from admin page = system panel (NULL owner)
		// Admin via profile (scope=personal) or non-admin = owned panel
		ownerID := "SYSTEM"
		if req.Scope == "personal" || claims.Role != models.RoleAdmin {
			ownerID = claims.UserID
		}

		id := generateID()
		_, err := db.Exec(`
			INSERT INTO panels (id, type, title, config, created_by)
			VALUES (?, ?, ?, ?, ?)
		`, id, req.Type, req.Title, req.Config, ownerID)
		if err != nil {
			log.Printf("[PANELS] create error: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to create panel")
			return
		}

		writeJSON(w, http.StatusCreated, models.Panel{
			ID: id, Type: req.Type, Title: req.Title,
			Config: req.Config, CreatedBy: ownerID, CreatedAt: time.Now(),
		})
	}
}

func UpdatePanel(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		var req struct {
			Title  string `json:"title"`
			Config string `json:"config"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		// Admins can update SYSTEM-owned panels; users can only update their own
		var result sql.Result
		var err error
		if claims.Role == models.RoleAdmin {
			result, err = db.Exec(
				"UPDATE panels SET title=?, config=? WHERE id=? AND (created_by='SYSTEM' OR created_by=?)",
				req.Title, req.Config, id, claims.UserID)
		} else {
			result, err = db.Exec(
				"UPDATE panels SET title=?, config=? WHERE id=? AND created_by=?",
				req.Title, req.Config, id, claims.UserID)
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "update failed")
			return
		}
		if rows, _ := result.RowsAffected(); rows == 0 {
			writeError(w, http.StatusForbidden, "panel not found or permission denied")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func DeletePanel(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		if claims.Role == models.RoleAdmin {
			db.Exec("DELETE FROM panels WHERE id=? AND created_by='SYSTEM'", id)
		} else {
			db.Exec("DELETE FROM panels WHERE id=? AND created_by=?", id, claims.UserID)
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func DeleteMyPanel(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		db.Exec("DELETE FROM panels WHERE id=? AND created_by=?", id, claims.UserID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func AddTagToPanel(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		panelID := mux.Vars(r)["id"]
		var req struct {
			TagID string `json:"tagId"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		// Check ownership: admin can tag SYSTEM panels, users can tag their own
		var owner string
		db.QueryRow("SELECT COALESCE(created_by,'') FROM panels WHERE id=?", panelID).Scan(&owner)
		if owner == "SYSTEM" && claims.Role != models.RoleAdmin {
			writeError(w, http.StatusForbidden, "permission denied")
			return
		}
		if owner != "SYSTEM" && owner != claims.UserID {
			writeError(w, http.StatusForbidden, "permission denied")
			return
		}
		db.Exec("INSERT OR IGNORE INTO panel_tags (panel_id, tag_id) VALUES (?,?)", panelID, req.TagID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func RemoveTagFromPanel(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		vars := mux.Vars(r)
		var owner string
		db.QueryRow("SELECT COALESCE(created_by,'') FROM panels WHERE id=?", vars["id"]).Scan(&owner)
		if owner == "SYSTEM" && claims.Role != models.RoleAdmin {
			writeError(w, http.StatusForbidden, "permission denied")
			return
		}
		if owner != "SYSTEM" && owner != claims.UserID {
			writeError(w, http.StatusForbidden, "permission denied")
			return
		}
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

		tx, err := db.Begin()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to begin transaction")
			return
		}

		for _, item := range req.Order {
			if !isHome {
				// Named portico — upsert on the actual unique index
				rowID := claims.UserID + "-" + item.PanelID + "-" + porticoIDStr
				tx.Exec(`
					INSERT INTO user_panel_order_v3 (id, user_id, panel_id, portico_id, position)
					VALUES (?, ?, ?, ?, ?)
					ON CONFLICT(user_id, panel_id, COALESCE(portico_id,''))
					DO UPDATE SET position = excluded.position
				`, rowID, claims.UserID, item.PanelID, porticoIDStr, item.Position)
			} else {
				// Home — portico_id IS NULL; DELETE+INSERT to avoid SQLite NULL conflict issues
				rowID := claims.UserID + "-" + item.PanelID + "-home"
				tx.Exec(`DELETE FROM user_panel_order_v3
					WHERE user_id = ? AND panel_id = ? AND portico_id IS NULL`,
					claims.UserID, item.PanelID)
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

		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func parsePanelConfig(configStr string) map[string]interface{} {
	if configStr == "" {
		return nil
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal([]byte(configStr), &cfg); err != nil {
		return nil
	}
	return cfg
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

// ListMyPanels returns only panels owned by the current user, regardless of role.
// Used by the profile page so admins can see their personal panels too.
func ListMyPanels(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		rows, err := db.Query(`
			SELECT p.id, p.type, p.title, p.config, p.scope,
			       COALESCE(p.created_by,''), p.created_at
			FROM panels p
			WHERE p.created_by = ?
			ORDER BY p.created_at ASC
		`, claims.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query panels")
			return
		}
		defer rows.Close()
		panels := []models.Panel{}
		for rows.Next() {
			var p models.Panel
			rows.Scan(&p.ID, &p.Type, &p.Title, &p.Config, &p.Scope, &p.CreatedBy, &p.CreatedAt)
			p.Tags = loadPanelTags(db, p.ID)
			// Enrich with uiUrl from integration or directly from config (e.g. RSS panels)
			if cfg := parsePanelConfig(p.Config); cfg != nil {
				if iid, _ := cfg["integrationId"].(string); iid != "" {
					var uiURL string
					db.QueryRow("SELECT ui_url FROM integrations WHERE id=?", iid).Scan(&uiURL)
					p.UIUrl = uiURL
				} else if u, _ := cfg["uiUrl"].(string); u != "" {
					p.UIUrl = u
				}
			}
			panels = append(panels, p)
		}
		writeJSON(w, http.StatusOK, panels)
	}
}


// GetCustomColumns returns panel→column assignments for a portico
func GetCustomColumns(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		porticoID := r.URL.Query().Get("portico_id")
		if porticoID == "" {
			writeError(w, http.StatusBadRequest, "portico_id required")
			return
		}
		rows, err := db.Query(`
			SELECT panel_id, COALESCE(custom_column, 1)
			FROM user_panel_order_v3
			WHERE user_id = ? AND portico_id = ?
			ORDER BY position ASC
		`, claims.UserID, porticoID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()

		// Read in order, then enforce monotonically non-decreasing columns.
		// If a panel was reordered and now has a column lower than its predecessor,
		// snap it down to match — keeps the breakpoint model consistent.
		type entry struct{ id string; col int }
		var entries []entry
		for rows.Next() {
			var panelID string
			var col int
			rows.Scan(&panelID, &col)
			entries = append(entries, entry{panelID, col})
		}
		result := map[string]int{}
		minCol := 1
		for _, e := range entries {
			col := e.col
			if col < minCol { col = minCol }
			if col > minCol { minCol = col }
			result[e.id] = col
		}
		writeJSON(w, http.StatusOK, result)
	}
}

// SetCustomColumns saves panel→column assignments for a portico.
// Setting a panel to column N also cascades all subsequent panels to >= N.
func SetCustomColumns(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var req struct {
			PorticoID string         `json:"porticoId"`
			Columns   map[string]int `json:"columns"` // panelId -> column
			Order     []string       `json:"order"`   // panelIds in position order
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.PorticoID == "" {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		for i, panelID := range req.Order {
			col := req.Columns[panelID]
			rowID := claims.UserID + "-" + panelID + "-" + req.PorticoID
			db.Exec(`
				INSERT INTO user_panel_order_v3 (id, user_id, panel_id, portico_id, position, custom_column)
				VALUES (?, ?, ?, ?, ?, ?)
				ON CONFLICT(user_id, panel_id, COALESCE(portico_id,'')) DO UPDATE
				SET custom_column = excluded.custom_column
			`, rowID, claims.UserID, panelID, req.PorticoID, i, col)
			_ = i // position only used for initial insert, not update
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
