package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

var validStatuses = map[string]bool{
	"available": true,
	"away":      true,
	"busy":      true,
	"dnd":       true,
}

func SetPresenceStatus(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var req struct {
			Status    string `json:"status"`
			ExpiresAt string `json:"expiresAt"` // ISO string or empty
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || !validStatuses[req.Status] {
			writeError(w, http.StatusBadRequest, "valid status required: available, away, busy, dnd")
			return
		}
		db.Exec(`INSERT INTO user_preferences (user_id) VALUES (?) ON CONFLICT(user_id) DO NOTHING`,
			claims.UserID)
		if req.ExpiresAt != "" {
			db.Exec(`UPDATE user_preferences SET chat_status = ?, chat_status_expires_at = ? WHERE user_id = ?`,
				req.Status, req.ExpiresAt, claims.UserID)
		} else {
			db.Exec(`UPDATE user_preferences SET chat_status = ?, chat_status_expires_at = NULL WHERE user_id = ?`,
				req.Status, claims.UserID)
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": req.Status})
	}
}

// effectiveStatus returns the status, falling back to "available" if the expiry has passed.
func effectiveStatus(status string, expiresAt sql.NullString) string {
	if status == "" {
		return "available"
	}
	if expiresAt.Valid && expiresAt.String != "" {
		t, err := time.Parse(time.RFC3339, expiresAt.String)
		if err == nil && time.Now().UTC().After(t) {
			return "available"
		}
	}
	return status
}
