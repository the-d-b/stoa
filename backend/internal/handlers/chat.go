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
	ID         string          `json:"id"`
	UserID     string          `json:"userId"`
	Username   string          `json:"username"`
	AvatarURL  string          `json:"avatarUrl,omitempty"`
	Text       string          `json:"text"`
	CreatedAt  string          `json:"createdAt"`
	Own        bool            `json:"own,omitempty"`
	Attachment *ChatAttachment `json:"attachment,omitempty"`
}

type TypingEvent struct {
	UserID   string `json:"userId"`
	Username string `json:"username"`
	Typing   bool   `json:"typing"`
}

var (
	chatBroadcastMu   sync.Mutex
	chatListenerSeq   uint64
	chatBroadcast     = map[uint64]func(ChatMessage){}
	typingBroadcast   = map[uint64]func(TypingEvent){}
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

func RegisterTypingListener(fn func(TypingEvent)) func() {
	chatBroadcastMu.Lock()
	chatListenerSeq++
	id := chatListenerSeq
	typingBroadcast[id] = fn
	chatBroadcastMu.Unlock()
	return func() {
		chatBroadcastMu.Lock()
		delete(typingBroadcast, id)
		chatBroadcastMu.Unlock()
	}
}

func broadcastTyping(ev TypingEvent) {
	chatBroadcastMu.Lock()
	fns := make([]func(TypingEvent), 0, len(typingBroadcast))
	for _, fn := range typingBroadcast {
		fns = append(fns, fn)
	}
	chatBroadcastMu.Unlock()
	for _, fn := range fns {
		fn(ev)
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
func SendTyping(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var req struct{ Typing bool `json:"typing"` }
		json.NewDecoder(r.Body).Decode(&req)
		var username, avatarURL string
		db.QueryRow(`SELECT username FROM users WHERE id=?`, claims.UserID).Scan(&username)
		go broadcastTyping(TypingEvent{
			UserID:   claims.UserID,
			Username: username,
			Typing:   req.Typing,
		})
		w.WriteHeader(http.StatusNoContent)
		_ = avatarURL
	}
}

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
		const msgSelect = `
			SELECT m.id, m.user_id, u.username, COALESCE(up.avatar_url,''), m.text, m.created_at,
				ca.id, ca.original_name, ca.mime_type, ca.size, ca.source, COALESCE(ca.source_url,'')
			FROM chat_messages m
			JOIN users u ON u.id = m.user_id
			LEFT JOIN user_preferences up ON up.user_id = m.user_id
			LEFT JOIN chat_attachments ca ON ca.message_id = m.id`
		var rows *sql.Rows
		var err error
		if beforeID != "" {
			rows, err = db.Query(msgSelect+`
				WHERE m.created_at < (SELECT created_at FROM chat_messages WHERE id = ?)
				ORDER BY m.created_at DESC LIMIT 100`, beforeID)
		} else {
			rows, err = db.Query(msgSelect + ` ORDER BY m.created_at DESC LIMIT 100`)
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
			var attID, attName, attMime, attSource, attSourceURL sql.NullString
			var attSize sql.NullInt64
			rows.Scan(&m.ID, &m.UserID, &m.Username, &m.AvatarURL, &m.Text, &m.CreatedAt,
				&attID, &attName, &attMime, &attSize, &attSource, &attSourceURL)
			m.Own = m.UserID == claims.UserID
			if attID.Valid {
				m.Attachment = &ChatAttachment{
					ID: attID.String, OriginalName: attName.String,
					MimeType: attMime.String, Size: attSize.Int64,
					Source: attSource.String, SourceURL: attSourceURL.String,
					URL: chatAttachmentURL(attID.String),
				}
			}
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
			Text         string `json:"text"`
			AttachmentID string `json:"attachmentId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		if req.Text == "" && req.AttachmentID == "" {
			writeError(w, http.StatusBadRequest, "text or attachmentId required")
			return
		}
		id := chatID()
		now := time.Now().UTC().Format(time.RFC3339)
		_, err := db.Exec(`INSERT INTO chat_messages (id, user_id, text, created_at) VALUES (?, ?, ?, ?)`,
			id, claims.UserID, req.Text, now)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "insert failed")
			return
		}

		var attachment *ChatAttachment
		if req.AttachmentID != "" {
			db.Exec(`UPDATE chat_attachments SET message_id = ? WHERE id = ? AND uploader_id = ? AND message_id IS NULL`,
				id, req.AttachmentID, claims.UserID)
			var att ChatAttachment
			var sourceURL sql.NullString
			err := db.QueryRow(`SELECT id, original_name, mime_type, size, source, COALESCE(source_url,'')
				FROM chat_attachments WHERE id = ? AND message_id = ?`, req.AttachmentID, id).
				Scan(&att.ID, &att.OriginalName, &att.MimeType, &att.Size, &att.Source, &sourceURL)
			if err == nil {
				att.SourceURL = sourceURL.String
				att.URL = chatAttachmentURL(att.ID)
				attachment = &att
			}
		}

		var username, avatarURL string
		db.QueryRow(`SELECT u.username, COALESCE(up.avatar_url,'')
			FROM users u LEFT JOIN user_preferences up ON up.user_id = u.id
			WHERE u.id=?`, claims.UserID).Scan(&username, &avatarURL)

		msg := ChatMessage{
			ID: id, UserID: claims.UserID, Username: username,
			AvatarURL: avatarURL, Text: req.Text, CreatedAt: now,
			Attachment: attachment,
		}
		go broadcastChat(msg)
		pushText := req.Text
		if pushText == "" && attachment != nil {
			pushText = "📎 " + attachment.OriginalName
		}
		go SendPushToOfflineUsers(db, claims.UserID, "Stoa — "+username, pushText)
		writeJSON(w, http.StatusOK, msg)
	}
}

// GetChatPresence returns all users with online status and presence status
func GetChatPresence(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query(`
			SELECT u.id, u.username, COALESCE(up.avatar_url,''),
				COALESCE(up.chat_status, 'available'),
				up.chat_status_expires_at
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
			Status    string `json:"status"`
		}
		var users []PresenceUser
		for rows.Next() {
			var u PresenceUser
			var rawStatus string
			var expiresAt sql.NullString
			rows.Scan(&u.UserID, &u.Username, &u.AvatarURL, &rawStatus, &expiresAt)
			u.Online = IsUserOnline(u.UserID)
			u.Status = effectiveStatus(rawStatus, expiresAt)
			users = append(users, u)
		}
		if users == nil {
			users = []PresenceUser{}
		}
		writeJSON(w, http.StatusOK, users)
	}
}
