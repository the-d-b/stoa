package handlers

import (
	"crypto/rand"
	"log"
	"encoding/json"
	"database/sql"
	"encoding/base64"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

// ── Online presence tracking ──────────────────────────────────────────────────
// Tracks which user IDs currently have an active SSE connection

var (
	onlineUsers   = map[string]int{} // userID -> connection count
	onlineUsersMu sync.Mutex
)

func MarkUserOnline(userID string) {
	onlineUsersMu.Lock()
	onlineUsers[userID]++
	onlineUsersMu.Unlock()
}

func MarkUserOffline(userID string) {
	onlineUsersMu.Lock()
	onlineUsers[userID]--
	if onlineUsers[userID] <= 0 {
		delete(onlineUsers, userID)
	}
	onlineUsersMu.Unlock()
}

func IsUserOnline(userID string) bool {
	onlineUsersMu.Lock()
	defer onlineUsersMu.Unlock()
	return onlineUsers[userID] > 0
}

// ── Session recording ─────────────────────────────────────────────────────────

func sessionID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)[:16]
}

func parseUserAgent(ua string) string {
	ua = strings.TrimSpace(ua)
	if ua == "" { return "Unknown" }
	// Identify browser
	browser := "Unknown"
	switch {
	case strings.Contains(ua, "Edg/"): browser = "Edge"
	case strings.Contains(ua, "Chrome"): browser = "Chrome"
	case strings.Contains(ua, "Firefox"): browser = "Firefox"
	case strings.Contains(ua, "Safari") && !strings.Contains(ua, "Chrome"): browser = "Safari"
	case strings.Contains(ua, "curl"): browser = "curl"
	case strings.Contains(ua, "Go-http-client"): browser = "Go client"
	}
	// Identify OS
	os := ""
	switch {
	case strings.Contains(ua, "Windows"): os = "Windows"
	case strings.Contains(ua, "Macintosh"): os = "macOS"
	case strings.Contains(ua, "Linux"): os = "Linux"
	case strings.Contains(ua, "iPhone"): os = "iOS"
	case strings.Contains(ua, "Android"): os = "Android"
	}
	if os != "" { return browser + " on " + os }
	return browser
}

func RecordSession(db *sql.DB, userID, ip, userAgent string, expiresAt time.Time) {
	id := sessionID()
	ua := parseUserAgent(userAgent)
	db.Exec(`
		INSERT INTO sessions (id, user_id, ip, user_agent, issued_at, expires_at, last_seen_at)
		VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
	`, id, userID, ip, ua, expiresAt.UTC().Format(time.RFC3339))
}

func UpdateLastSeen(db *sql.DB, userID string) {
	db.Exec(`
		UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP
		WHERE user_id = ? AND last_seen_at = (
			SELECT MAX(last_seen_at) FROM sessions WHERE user_id = ?
		)
	`, userID, userID)
}

// ── List sessions handler ─────────────────────────────────────────────────────

type SessionRow struct {
	ID          string  `json:"id"`
	UserID      string  `json:"userId"`
	Username    string  `json:"username"`
	AvatarURL   *string `json:"avatarUrl"`
	Role        string  `json:"role"`
	Enabled     bool    `json:"enabled"`
	IP          string  `json:"ip"`
	UserAgent   string  `json:"userAgent"`
	IssuedAt    string  `json:"issuedAt"`
	ExpiresAt   *string `json:"expiresAt"`
	LastSeenAt  string  `json:"lastSeenAt"`
	Online      bool    `json:"online"`
}

func ListSessions(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		if claims.Role != "admin" {
			writeError(w, http.StatusForbidden, "admin only")
			return
		}

		days := r.URL.Query().Get("days") // "1", "7", "30", or "" for all
		timeFilter := ""
		switch days {
		case "1":  timeFilter = "AND s.issued_at >= datetime('now', '-1 day')"
		case "7":  timeFilter = "AND s.issued_at >= datetime('now', '-7 days')"
		case "30": timeFilter = "AND s.issued_at >= datetime('now', '-30 days')"
		}

		rows, err := db.Query(`
			SELECT s.id, s.user_id, u.username,
				COALESCE(up.avatar_url,''),
				u.role, COALESCE(u.enabled, 1),
				COALESCE(s.ip,''), COALESCE(s.user_agent,''),
				s.issued_at, COALESCE(s.expires_at,''), s.last_seen_at
			FROM sessions s
			JOIN users u ON u.id = s.user_id
			LEFT JOIN user_preferences up ON up.user_id = s.user_id
			WHERE u.id != 'SYSTEM' `+timeFilter+`
			ORDER BY s.issued_at DESC
			LIMIT 500
		`)
		if err != nil {
			log.Printf("[SESSIONS] query error: %v", err)
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()

		var sessions []SessionRow
		for rows.Next() {
			var s SessionRow
			var avatarURL, expiresAt string
			var enabled int
			rows.Scan(&s.ID, &s.UserID, &s.Username, &avatarURL,
				&s.Role, &enabled,
				&s.IP, &s.UserAgent,
				&s.IssuedAt, &expiresAt, &s.LastSeenAt)
			s.Enabled = enabled == 1
			s.Online = IsUserOnline(s.UserID)
			if avatarURL != "" { s.AvatarURL = &avatarURL }
			if expiresAt != "" { s.ExpiresAt = &expiresAt }
			sessions = append(sessions, s)
		}
		if sessions == nil { sessions = []SessionRow{} }
		writeJSON(w, http.StatusOK, sessions)
	}
}

// ToggleUserEnabled allows admins to enable/disable a user account
func ToggleUserEnabled(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		if claims.Role != "admin" {
			writeError(w, http.StatusForbidden, "admin only")
			return
		}
		var req struct {
			UserID  string `json:"userId"`
			Enabled bool   `json:"enabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserID == "" {
			writeError(w, http.StatusBadRequest, "userId required")
			return
		}
		if req.UserID == claims.UserID {
			writeError(w, http.StatusBadRequest, "cannot disable your own account")
			return
		}
		db.Exec("UPDATE users SET enabled=? WHERE id=? AND id != 'SYSTEM'",
			boolToInt(req.Enabled), req.UserID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
