package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

// ── Walls ─────────────────────────────────────────────────────────────────────

func ListWalls(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)

		rows, err := db.Query(`
			SELECT id, user_id, name, is_default, created_at
			FROM walls WHERE user_id = ? ORDER BY is_default DESC, created_at ASC
		`, claims.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query walls")
			return
		}
		defer rows.Close()

		walls := []models.Wall{}
		for rows.Next() {
			var wall models.Wall
			rows.Scan(&wall.ID, &wall.UserID, &wall.Name, &wall.IsDefault, &wall.CreatedAt)
			wall.Tags = loadWallTags(db, wall.ID)
			walls = append(walls, wall)
		}
		writeJSON(w, http.StatusOK, walls)
	}
}

func CreateWall(db *sql.DB) http.HandlerFunc {
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

		// If setting as default, unset others
		if req.IsDefault {
			db.Exec("UPDATE walls SET is_default=0 WHERE user_id=?", claims.UserID)
		}

		id := generateID()
		db.Exec(`
			INSERT INTO walls (id, user_id, name, is_default) VALUES (?,?,?,?)
		`, id, claims.UserID, req.Name, boolToInt(req.IsDefault))

		writeJSON(w, http.StatusCreated, models.Wall{
			ID: id, UserID: claims.UserID, Name: req.Name,
			IsDefault: req.IsDefault, CreatedAt: time.Now(),
		})
	}
}

func DeleteWall(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		db.Exec("DELETE FROM walls WHERE id=? AND user_id=?", id, claims.UserID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func SetWallTagActive(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		var req struct{ Active bool `json:"active"` }
		json.NewDecoder(r.Body).Decode(&req)
		db.Exec(`
			INSERT INTO wall_tags (wall_id, tag_id, active) VALUES (?,?,?)
			ON CONFLICT(wall_id, tag_id) DO UPDATE SET active=excluded.active
		`, vars["id"], vars["tagId"], boolToInt(req.Active))
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func loadWallTags(db *sql.DB, wallID string) []models.WallTag {
	rows, err := db.Query(`
		SELECT t.id, t.name, t.color, wt.active
		FROM tags t JOIN wall_tags wt ON t.id = wt.tag_id
		WHERE wt.wall_id = ?
	`, wallID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var tags []models.WallTag
	for rows.Next() {
		var t models.WallTag
		var active int
		rows.Scan(&t.TagID, &t.Name, &t.Color, &active)
		t.Active = active == 1
		tags = append(tags, t)
	}
	return tags
}

// ── User Preferences ──────────────────────────────────────────────────────────

func GetPreferences(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)

		var prefs models.UserPreferences
		err := db.QueryRow(`
			SELECT user_id, theme, date_format, COALESCE(avatar_url,'')
			FROM user_preferences WHERE user_id = ?
		`, claims.UserID).Scan(&prefs.UserID, &prefs.Theme, &prefs.DateFormat, &prefs.AvatarURL)

		if err == sql.ErrNoRows {
			// Return defaults
			prefs = models.UserPreferences{
				UserID:     claims.UserID,
				Theme:      "void",
				DateFormat: "long",
			}
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to load preferences")
			return
		}

		writeJSON(w, http.StatusOK, prefs)
	}
}

func SavePreferences(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)

		var req models.UserPreferences
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}

		validThemes := map[string]bool{
			"void": true, "slate": true, "carbon": true,
			"paper": true, "fog": true, "linen": true,
		}
		if req.Theme != "" && !validThemes[req.Theme] {
			writeError(w, http.StatusBadRequest, "invalid theme")
			return
		}
		if req.Theme == "" {
			req.Theme = "void"
		}
		if req.DateFormat == "" {
			req.DateFormat = "long"
		}

		db.Exec(`
			INSERT INTO user_preferences (user_id, theme, date_format, avatar_url, updated_at)
			VALUES (?,?,?,?,CURRENT_TIMESTAMP)
			ON CONFLICT(user_id) DO UPDATE SET
				theme=excluded.theme,
				date_format=excluded.date_format,
				avatar_url=COALESCE(excluded.avatar_url, avatar_url),
				updated_at=CURRENT_TIMESTAMP
		`, claims.UserID, req.Theme, req.DateFormat, nullStr(req.AvatarURL))

		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
