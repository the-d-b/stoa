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
	chatBroadcastMu sync.Mutex
	chatBroadcast   []func(ChatMessage) // registered SSE senders
)

func RegisterChatListener(fn func(ChatMessage)) func() {
	chatBroadcastMu.Lock()
	chatBroadcast = append(chatBroadcast, fn)
	idx := len(chatBroadcast) - 1
	chatBroadcastMu.Unlock()
	return func() {
		chatBroadcastMu.Lock()
		chatBroadcast = append(chatBroadcast[:idx], chatBroadcast[idx+1:]...)
		chatBroadcastMu.Unlock()
	}
}

func broadcastChat(msg ChatMessage) {
	chatBroadcastMu.Lock()
	fns := make([]func(ChatMessage), len(chatBroadcast))
	copy(fns, chatBroadcast)
	chatBroadcastMu.Unlock()
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

func GetChatMessages(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		rows, err := db.Query(`
			SELECT m.id, m.user_id, u.username, COALESCE(up.avatar_url,''),
				m.text, m.created_at
			FROM chat_messages m
			JOIN users u ON u.id = m.user_id
			LEFT JOIN user_preferences up ON up.user_id = m.user_id
			ORDER BY m.created_at DESC
			LIMIT 100
		`)
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
