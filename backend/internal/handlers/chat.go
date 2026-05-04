package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

// ── Chat message broadcast ────────────────────────────────────────────────────

type ChatMessage struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Username  string `json:"username"`
	AvatarURL string `json:"avatarUrl,omitempty"`
	Text      string `json:"text"`
	CreatedAt string `json:"createdAt"`
	Own       bool   `json:"own,omitempty"` // set per-request, not stored
}

var (
	chatBroadcastMu  sync.Mutex
	chatListenerSeq  uint64
	chatBroadcast    = map[uint64]func(ChatMessage){} // map avoids slice-index panic on concurrent remove
)

func RegisterChatListener(fn func(ChatMessage)) func() {
	chatBroadcastMu.Lock()
	chatListenerSeq++
	id := chatListenerSeq
	chatBroadcast[id] = fn
	chatBroadcastMu.Unlock()
	return func() {
		chatBroadcastMu.Lock()
		delete(chatBroadcast, id)
		chatBroadcastMu.Unlock()
	}
}

func broadcastChat(msg ChatMessage) {
	chatBroadcastMu.Lock()
	fns := make([]func(ChatMessage), 0, len(chatBroadcast))
	for _, fn := range chatBroadcast {
		fns = append(fns, fn)
	}
	chatBroadcastMu.Unlock()
	log.Printf("[CHAT] broadcasting to %d listeners", len(fns))
	for _, fn := range fns {
		fn(msg)
	}
}

func chatID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)[:16]
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// MarkChatRead saves the current timestamp as the user's last-read point.
// Simple and reliable — no subquery needed, no message ID dependency.
func MarkChatRead(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		now := time.Now().UTC().Format(time.RFC3339)
		// Ensure row exists first
		db.Exec(`INSERT INTO user_preferences (user_id) VALUES (?) ON CONFLICT(user_id) DO NOTHING`,
			claims.UserID)
		if _, err := db.Exec(`UPDATE user_preferences SET last_chat_read_message_id = ? WHERE user_id = ?`,
			now, claims.UserID); err != nil {
			log.Printf("[CHAT] markRead error: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to mark read")
			return
		}
		log.Printf("[CHAT] markRead user=%s at=%s", claims.UserID, now)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// GetUnreadCount returns messages from others sent after the user last opened chat.
func GetUnreadCount(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)

		var lastReadAt string
		db.QueryRow(`SELECT COALESCE(last_chat_read_message_id, '') FROM user_preferences WHERE user_id = ?`,
			claims.UserID).Scan(&lastReadAt)

		var count int
		if lastReadAt == "" {
			// Never opened chat — count all messages from others
			db.QueryRow(`SELECT COUNT(*) FROM chat_messages WHERE user_id != ?`,
				claims.UserID).Scan(&count)
		} else {
			// Count messages from others sent after last read timestamp
			db.QueryRow(`SELECT COUNT(*) FROM chat_messages WHERE user_id != ? AND created_at > ?`,
				claims.UserID, lastReadAt).Scan(&count)
		}

		log.Printf("[CHAT] unreadCount user=%s lastReadAt=%q count=%d", claims.UserID, lastReadAt, count)
		writeJSON(w, http.StatusOK, map[string]int{"count": count})
	}
}

func GetChatMessages(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		// Optional cursor: ?before=<message_id> loads older messages
		beforeID := r.URL.Query().Get("before")
		var rows *sql.Rows
		var err error
		if beforeID != "" {
			rows, err = db.Query(`
				SELECT m.id, m.user_id, u.username, COALESCE(up.avatar_url,''),
					m.text, m.created_at
				FROM chat_messages m
				JOIN users u ON u.id = m.user_id
				LEFT JOIN user_preferences up ON up.user_id = m.user_id
				WHERE m.created_at < (SELECT created_at FROM chat_messages WHERE id = ?)
				ORDER BY m.created_at DESC
				LIMIT 100
			`, beforeID)
		} else {
			rows, err = db.Query(`
				SELECT m.id, m.user_id, u.username, COALESCE(up.avatar_url,''),
					m.text, m.created_at
				FROM chat_messages m
				JOIN users u ON u.id = m.user_id
				LEFT JOIN user_preferences up ON up.user_id = m.user_id
				ORDER BY m.created_at DESC
				LIMIT 100
			`)
		}
		if err != nil {
			log.Printf("[CHAT] list error: %v", err)
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()
		var msgs []ChatMessage
		for rows.Next() {
			var m ChatMessage
			rows.Scan(&m.ID, &m.UserID, &m.Username, &m.AvatarURL, &m.Text, &m.CreatedAt)
			m.Own = m.UserID == claims.UserID
			msgs = append(msgs, m)
		}
		// Reverse so oldest first
		for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
			msgs[i], msgs[j] = msgs[j], msgs[i]
		}
		if msgs == nil { msgs = []ChatMessage{} }
		writeJSON(w, http.StatusOK, msgs)
	}
}

func SendChatMessage(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var req struct {
			Text string `json:"text"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Text == "" {
			writeError(w, http.StatusBadRequest, "text required")
			return
		}
		id := chatID()
		now := time.Now().UTC().Format(time.RFC3339)
		_, err := db.Exec(`
			INSERT INTO chat_messages (id, user_id, text, created_at)
			VALUES (?, ?, ?, ?)
		`, id, claims.UserID, req.Text, now)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "insert failed")
			return
		}
		// Look up avatar for broadcast
		var username, avatarURL string
		db.QueryRow(`SELECT u.username, COALESCE(up.avatar_url,'')
			FROM users u LEFT JOIN user_preferences up ON up.user_id = u.id
			WHERE u.id=?`, claims.UserID).Scan(&username, &avatarURL)

		msg := ChatMessage{
			ID: id, UserID: claims.UserID, Username: username,
			AvatarURL: avatarURL, Text: req.Text, CreatedAt: now,
		}
		go broadcastChat(msg)
		writeJSON(w, http.StatusOK, msg)
	}
}

// GetChatPresence returns all users with online status
func GetChatPresence(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query(`
			SELECT u.id, u.username, COALESCE(up.avatar_url,'')
			FROM users u
			LEFT JOIN user_preferences up ON up.user_id = u.id
			WHERE u.id != 'SYSTEM' AND COALESCE(u.enabled, 1) = 1
			ORDER BY u.username ASC
		`)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()
		type PresenceUser struct {
			UserID    string `json:"userId"`
			Username  string `json:"username"`
			AvatarURL string `json:"avatarUrl,omitempty"`
			Online    bool   `json:"online"`
		}
		var users []PresenceUser
		for rows.Next() {
			var u PresenceUser
			rows.Scan(&u.UserID, &u.Username, &u.AvatarURL)
			u.Online = IsUserOnline(u.UserID)
			users = append(users, u)
		}
		if users == nil { users = []PresenceUser{} }
		writeJSON(w, http.StatusOK, users)
	}
}
