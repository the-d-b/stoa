package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

type Note struct {
	ID        string `json:"id"`
	PanelID   string `json:"panelId"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

func noteID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)[:16]
}

func ListNotes(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		panelID := mux.Vars(r)["panelId"]
		sort := r.URL.Query().Get("sort") // "asc" or "desc"
		if sort != "asc" { sort = "desc" }
		rows, err := db.Query(`
			SELECT id, panel_id, title, body, created_at, updated_at
			FROM notes WHERE panel_id = ?
			ORDER BY created_at `+sort, panelID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()
		var notes []Note
		for rows.Next() {
			var n Note
			rows.Scan(&n.ID, &n.PanelID, &n.Title, &n.Body, &n.CreatedAt, &n.UpdatedAt)
			notes = append(notes, n)
		}
		if notes == nil { notes = []Note{} }
		writeJSON(w, http.StatusOK, notes)
	}
}

func GetNote(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var n Note
		var lockedBy sql.NullString
		var lockedAt sql.NullString
		err := db.QueryRow(`
			SELECT id, panel_id, title, body, created_at, updated_at,
				COALESCE(locked_by,''), COALESCE(locked_at,'')
			FROM notes WHERE id=?`, id).Scan(
			&n.ID, &n.PanelID, &n.Title, &n.Body, &n.CreatedAt, &n.UpdatedAt,
			&lockedBy, &lockedAt)
		if err != nil {
			writeError(w, http.StatusNotFound, "note not found")
			return
		}
		// Check if locked by someone else and within TTL
		result := map[string]interface{}{
			"id": n.ID, "panelId": n.PanelID, "title": n.Title, "body": n.Body,
			"createdAt": n.CreatedAt, "updatedAt": n.UpdatedAt,
		}
		if lockedBy.Valid && lockedBy.String != "" {
			lockedAtTime, _ := time.Parse(time.RFC3339, lockedAt.String)
			if time.Since(lockedAtTime).Seconds() < noteLockTTL {
				var username string
				db.QueryRow("SELECT username FROM users WHERE id=?", lockedBy.String).Scan(&username)
				result["lockedBy"] = lockedBy.String
				result["lockedByName"] = username
			}
		}
		writeJSON(w, http.StatusOK, result)
	}
}

func CreateNote(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		_ = r.Context().Value(auth.UserContextKey).(*models.Claims)
		panelID := mux.Vars(r)["panelId"]
		id := noteID()
		_, err := db.Exec(`
			INSERT INTO notes (id, panel_id, title, body) VALUES (?, ?, '', '')
		`, id, panelID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "insert failed")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"id": id})
	}
}

func UpdateNote(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		var req struct {
			Title string `json:"title"`
			Body  string `json:"body"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		now := time.Now().UTC().Format(time.RFC3339)
		db.Exec(`UPDATE notes SET title=?, body=?, updated_at=?, updated_by=? WHERE id=?`,
			req.Title, req.Body, now, claims.UserID, id)
		// Track edit activity
		db.Exec(`
			INSERT INTO note_activity (note_id, user_id, last_edit_at)
			VALUES (?, ?, ?)
			ON CONFLICT(note_id, user_id) DO UPDATE SET last_edit_at = excluded.last_edit_at
		`, id, claims.UserID, now)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func DeleteNote(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		db.Exec("DELETE FROM notes WHERE id=?", id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// NoteActivityUser is a user's avatar + activity for a note
type NoteActivityUser struct {
	UserID     string  `json:"userId"`
	Username   string  `json:"username"`
	AvatarURL  *string `json:"avatarUrl"`
	LastReadAt *string `json:"lastReadAt"`
	LastEditAt *string `json:"lastEditAt"`
}

// GetNoteActivity returns all users with panel access + their activity on this note
func GetNoteActivity(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		noteID := mux.Vars(r)["id"]

		// Get panel_id for this note
		var panelID string
		if err := db.QueryRow("SELECT panel_id FROM notes WHERE id=?", noteID).Scan(&panelID); err != nil {
			writeError(w, http.StatusNotFound, "note not found")
			return
		}

		// Get all users with access to this panel:
		// 1. Users in groups that have this panel assigned
		// 2. Owner if it's a personal panel
		// 3. All users if it's a system panel with no group assignment (visible to all)
		// 4. Always include the requesting user
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		rows, err := db.Query(`
			SELECT DISTINCT u.id, u.username, up.avatar_url,
				na.last_read_at, na.last_edit_at
			FROM users u
			LEFT JOIN user_preferences up ON up.user_id = u.id
			LEFT JOIN note_activity na ON na.user_id = u.id AND na.note_id = ?
			WHERE u.id IN (
				-- via group membership
				SELECT ug.user_id FROM user_groups ug
				JOIN panel_groups pg ON pg.group_id = ug.group_id
				WHERE pg.panel_id = ?
				UNION
				-- panel owner (personal panels)
				SELECT created_by FROM panels WHERE id = ? AND scope = 'personal'
				UNION
				-- system panel with no groups: visible to all users
				SELECT id FROM users WHERE EXISTS (
					SELECT 1 FROM panels WHERE id = ? AND scope != 'personal'
					AND NOT EXISTS (SELECT 1 FROM panel_groups WHERE panel_id = ?)
				)
				UNION
				-- always include requesting user
				SELECT ?
			)
			ORDER BY u.username ASC
		`, noteID, panelID, panelID, panelID, panelID, claims.UserID)
		if err != nil {
			log.Printf("[NOTES] activity query error: %v", err)
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()

		var users []NoteActivityUser
		for rows.Next() {
			var u NoteActivityUser
			var avatarURL, lastRead, lastEdit sql.NullString
			rows.Scan(&u.UserID, &u.Username, &avatarURL, &lastRead, &lastEdit)
			if avatarURL.Valid { u.AvatarURL = &avatarURL.String }
			if lastRead.Valid { u.LastReadAt = &lastRead.String }
			if lastEdit.Valid { u.LastEditAt = &lastEdit.String }
			users = append(users, u)
		}
		if users == nil { users = []NoteActivityUser{} }
		writeJSON(w, http.StatusOK, users)
	}
}

// TrackNoteRead records that the current user opened this note
func TrackNoteRead(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		noteID := mux.Vars(r)["id"]
		now := time.Now().UTC().Format(time.RFC3339)
		db.Exec(`
			INSERT INTO note_activity (note_id, user_id, last_read_at)
			VALUES (?, ?, ?)
			ON CONFLICT(note_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at
		`, noteID, claims.UserID, now)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

const noteLockTTL = 90 // seconds — lock expires after this many seconds of no heartbeat

// AcquireNoteLock tries to lock a note for the requesting user.
// Returns 409 if locked by someone else and still within TTL.
func AcquireNoteLock(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		now := time.Now().UTC()

		// Check current lock state
		var lockedBy sql.NullString
		var lockedAt sql.NullTime
		db.QueryRow("SELECT locked_by, locked_at FROM notes WHERE id=?", id).Scan(&lockedBy, &lockedAt)

		// If locked by someone else and within TTL — reject
		if lockedBy.Valid && lockedBy.String != claims.UserID {
			if lockedAt.Valid && now.Sub(lockedAt.Time).Seconds() < noteLockTTL {
				// Get locker's username for the message
				var username string
				db.QueryRow("SELECT username FROM users WHERE id=?", lockedBy.String).Scan(&username)
				if username == "" { username = "another user" }
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusConflict)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"error":      "locked",
					"lockedBy":   username,
					"lockedById": lockedBy.String,
				})
				return
			}
		}

		// Acquire or refresh lock
		db.Exec("UPDATE notes SET locked_by=?, locked_at=? WHERE id=?",
			claims.UserID, now.Format(time.RFC3339), id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "locked"})
	}
}

// ReleaseNoteLock clears the lock if held by the requesting user.
func ReleaseNoteLock(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		// Only release if we own the lock
		db.Exec("UPDATE notes SET locked_by=NULL, locked_at=NULL WHERE id=? AND locked_by=?",
			id, claims.UserID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
