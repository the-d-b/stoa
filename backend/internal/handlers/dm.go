package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

// ── DM broadcast (per-user listeners) ─────────────────────────────────────────

type DMMessagePayload struct {
	ID              string          `json:"id"`
	ConversationID  string          `json:"conversationId"`
	SenderID        string          `json:"senderId"`
	SenderUsername  string          `json:"senderUsername"`
	SenderAvatarURL string          `json:"senderAvatarUrl,omitempty"`
	Text            string          `json:"text"`
	Attachment      *ChatAttachment `json:"attachment,omitempty"`
	CreatedAt       string          `json:"createdAt"`
	Own             bool            `json:"own,omitempty"`
}

type DMEvent struct {
	ConversationID string           `json:"conversationId"`
	Message        DMMessagePayload `json:"message"`
}

var (
	dmBroadcastMu sync.Mutex
	dmListenerSeq uint64
	dmListeners   = map[string]map[uint64]func(DMEvent){} // userID → seq → fn
)

func RegisterDMListener(userID string, fn func(DMEvent)) func() {
	dmBroadcastMu.Lock()
	dmListenerSeq++
	id := dmListenerSeq
	if dmListeners[userID] == nil {
		dmListeners[userID] = map[uint64]func(DMEvent){}
	}
	dmListeners[userID][id] = fn
	dmBroadcastMu.Unlock()
	return func() {
		dmBroadcastMu.Lock()
		if m := dmListeners[userID]; m != nil {
			delete(m, id)
		}
		dmBroadcastMu.Unlock()
	}
}

func broadcastDMToUser(userID string, ev DMEvent) {
	dmBroadcastMu.Lock()
	fns := make([]func(DMEvent), 0, len(dmListeners[userID]))
	for _, fn := range dmListeners[userID] {
		fns = append(fns, fn)
	}
	dmBroadcastMu.Unlock()
	for _, fn := range fns {
		fn(ev)
	}
}

// ── Types ─────────────────────────────────────────────────────────────────────

type DMConversationResp struct {
	ID             string            `json:"id"`
	OtherUserID    string            `json:"otherUserId"`
	OtherUsername  string            `json:"otherUsername"`
	OtherAvatarURL string            `json:"otherAvatarUrl,omitempty"`
	OtherOnline    bool              `json:"otherOnline"`
	OtherStatus    string            `json:"otherStatus"`
	LastMessage    *DMMessagePayload `json:"lastMessage,omitempty"`
	UnreadCount    int               `json:"unreadCount"`
	CreatedAt      string            `json:"createdAt"`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func normalizePair(u1, u2 string) (string, string) {
	if u1 < u2 {
		return u1, u2
	}
	return u2, u1
}

func isDMParticipant(db *sql.DB, convID, userID string) bool {
	var exists bool
	db.QueryRow(`SELECT 1 FROM dm_conversations WHERE id = ? AND (user_a = ? OR user_b = ?)`,
		convID, userID, userID).Scan(&exists)
	return exists
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func GetOrCreateDMConversation(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var req struct {
			UserID string `json:"userId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserID == "" {
			writeError(w, http.StatusBadRequest, "userId required")
			return
		}
		if req.UserID == claims.UserID {
			writeError(w, http.StatusBadRequest, "cannot DM yourself")
			return
		}
		var targetExists bool
		db.QueryRow(`SELECT 1 FROM users WHERE id = ? AND COALESCE(enabled, 1) = 1 AND id != 'SYSTEM'`,
			req.UserID).Scan(&targetExists)
		if !targetExists {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}

		userA, userB := normalizePair(claims.UserID, req.UserID)
		var convID string
		db.QueryRow(`SELECT id FROM dm_conversations WHERE user_a = ? AND user_b = ?`, userA, userB).Scan(&convID)
		if convID == "" {
			convID = generateID()
			if _, err := db.Exec(`INSERT INTO dm_conversations (id, user_a, user_b) VALUES (?, ?, ?)`,
				convID, userA, userB); err != nil {
				// Race — try to fetch the existing one
				db.QueryRow(`SELECT id FROM dm_conversations WHERE user_a = ? AND user_b = ?`, userA, userB).Scan(&convID)
				if convID == "" {
					writeError(w, http.StatusInternalServerError, "failed to create conversation")
					return
				}
			}
		}
		writeJSON(w, http.StatusOK, map[string]string{"conversationId": convID})
	}
}

func ListDMConversations(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		uid := claims.UserID

		rows, err := db.Query(`
			SELECT
				c.id,
				CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END AS other_id,
				c.created_at,
				(SELECT created_at FROM dm_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_msg_at
			FROM dm_conversations c
			WHERE c.user_a = ? OR c.user_b = ?
			ORDER BY COALESCE(last_msg_at, c.created_at) DESC
		`, uid, uid, uid)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()

		type row struct{ id, otherID, createdAt string }
		var convRows []row
		for rows.Next() {
			var x row
			var lastMsgAt sql.NullString
			rows.Scan(&x.id, &x.otherID, &x.createdAt, &lastMsgAt)
			convRows = append(convRows, x)
		}
		rows.Close()

		result := make([]DMConversationResp, 0, len(convRows))
		for _, c := range convRows {
			conv := DMConversationResp{
				ID:          c.id,
				OtherUserID: c.otherID,
				CreatedAt:   c.createdAt,
			}

			var avatarURL sql.NullString
			var rawStatus sql.NullString
			var expiresAt sql.NullString
			db.QueryRow(`
				SELECT u.username, COALESCE(up.avatar_url,''),
					COALESCE(up.chat_status,'available'), up.chat_status_expires_at
				FROM users u LEFT JOIN user_preferences up ON up.user_id = u.id WHERE u.id = ?`,
				c.otherID).Scan(&conv.OtherUsername, &avatarURL, &rawStatus, &expiresAt)
			if avatarURL.Valid {
				conv.OtherAvatarURL = avatarURL.String
			}
			conv.OtherOnline = IsUserOnline(c.otherID)
			conv.OtherStatus = effectiveStatus(rawStatus.String, expiresAt)

			// Last message
			var lmID, lmSenderID, lmText, lmCreatedAt sql.NullString
			db.QueryRow(`SELECT m.id, m.sender_id, m.text, m.created_at FROM dm_messages m WHERE m.conversation_id = ? ORDER BY m.created_at DESC LIMIT 1`,
				c.id).Scan(&lmID, &lmSenderID, &lmText, &lmCreatedAt)
			if lmID.Valid {
				var senderUsername string
				db.QueryRow(`SELECT username FROM users WHERE id = ?`, lmSenderID.String).Scan(&senderUsername)
				conv.LastMessage = &DMMessagePayload{
					ID:             lmID.String,
					ConversationID: c.id,
					SenderID:       lmSenderID.String,
					SenderUsername: senderUsername,
					Text:           lmText.String,
					CreatedAt:      lmCreatedAt.String,
					Own:            lmSenderID.String == uid,
				}
			}

			// Unread count
			var lastReadAt sql.NullString
			db.QueryRow(`SELECT last_read_at FROM dm_read_receipts WHERE user_id = ? AND conversation_id = ?`,
				uid, c.id).Scan(&lastReadAt)
			var unread int
			if lastReadAt.Valid {
				db.QueryRow(`SELECT COUNT(*) FROM dm_messages WHERE conversation_id = ? AND sender_id != ? AND created_at > ?`,
					c.id, uid, lastReadAt.String).Scan(&unread)
			} else {
				db.QueryRow(`SELECT COUNT(*) FROM dm_messages WHERE conversation_id = ? AND sender_id != ?`,
					c.id, uid).Scan(&unread)
			}
			conv.UnreadCount = unread

			result = append(result, conv)
		}
		writeJSON(w, http.StatusOK, result)
	}
}

func GetDMMessages(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		convID := mux.Vars(r)["id"]

		if !isDMParticipant(db, convID, claims.UserID) {
			writeError(w, http.StatusForbidden, "not a participant")
			return
		}

		beforeID := r.URL.Query().Get("before")
		const sel = `
			SELECT m.id, m.conversation_id, m.sender_id, u.username, COALESCE(up.avatar_url,''),
				m.text, m.created_at,
				ca.id, ca.original_name, ca.mime_type, ca.size, ca.source, COALESCE(ca.source_url,'')
			FROM dm_messages m
			JOIN users u ON u.id = m.sender_id
			LEFT JOIN user_preferences up ON up.user_id = m.sender_id
			LEFT JOIN chat_attachments ca ON ca.id = m.attachment_id`

		var rows *sql.Rows
		var err error
		if beforeID != "" {
			rows, err = db.Query(sel+` WHERE m.conversation_id = ? AND m.created_at < (SELECT created_at FROM dm_messages WHERE id = ?) ORDER BY m.created_at DESC LIMIT 100`,
				convID, beforeID)
		} else {
			rows, err = db.Query(sel+` WHERE m.conversation_id = ? ORDER BY m.created_at DESC LIMIT 100`, convID)
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()

		var msgs []DMMessagePayload
		for rows.Next() {
			var m DMMessagePayload
			var attID, attName, attMime, attSource, attSourceURL sql.NullString
			var attSize sql.NullInt64
			rows.Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.SenderUsername, &m.SenderAvatarURL,
				&m.Text, &m.CreatedAt,
				&attID, &attName, &attMime, &attSize, &attSource, &attSourceURL)
			m.Own = m.SenderID == claims.UserID
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
		for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
			msgs[i], msgs[j] = msgs[j], msgs[i]
		}
		if msgs == nil {
			msgs = []DMMessagePayload{}
		}
		writeJSON(w, http.StatusOK, msgs)
	}
}

func SendDMMessage(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		convID := mux.Vars(r)["id"]

		if !isDMParticipant(db, convID, claims.UserID) {
			writeError(w, http.StatusForbidden, "not a participant")
			return
		}

		var req struct {
			Text         string `json:"text"`
			AttachmentID string `json:"attachmentId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		req.Text = strings.TrimSpace(req.Text)
		if req.Text == "" && req.AttachmentID == "" {
			writeError(w, http.StatusBadRequest, "text or attachmentId required")
			return
		}

		msgID := generateID()
		now := time.Now().UTC().Format(time.RFC3339)
		if _, err := db.Exec(`INSERT INTO dm_messages (id, conversation_id, sender_id, text) VALUES (?, ?, ?, ?)`,
			msgID, convID, claims.UserID, req.Text); err != nil {
			writeError(w, http.StatusInternalServerError, "insert failed")
			return
		}

		var attachment *ChatAttachment
		if req.AttachmentID != "" {
			// Claim the attachment for this DM message
			db.Exec(`UPDATE chat_attachments SET message_id = ? WHERE id = ? AND uploader_id = ? AND message_id IS NULL`,
				msgID, req.AttachmentID, claims.UserID)
			db.Exec(`UPDATE dm_messages SET attachment_id = ? WHERE id = ?`, req.AttachmentID, msgID)
			var att ChatAttachment
			var sourceURL sql.NullString
			if err := db.QueryRow(`SELECT id, original_name, mime_type, size, source, COALESCE(source_url,'') FROM chat_attachments WHERE id = ? AND message_id = ?`,
				req.AttachmentID, msgID).Scan(&att.ID, &att.OriginalName, &att.MimeType, &att.Size, &att.Source, &sourceURL); err == nil {
				att.SourceURL = sourceURL.String
				att.URL = chatAttachmentURL(att.ID)
				attachment = &att
			}
		}

		var senderUsername, senderAvatar string
		db.QueryRow(`SELECT u.username, COALESCE(up.avatar_url,'') FROM users u LEFT JOIN user_preferences up ON up.user_id = u.id WHERE u.id = ?`,
			claims.UserID).Scan(&senderUsername, &senderAvatar)

		msg := DMMessagePayload{
			ID: msgID, ConversationID: convID, SenderID: claims.UserID,
			SenderUsername: senderUsername, SenderAvatarURL: senderAvatar,
			Text: req.Text, Attachment: attachment, CreatedAt: now, Own: true,
		}

		var otherUserID string
		db.QueryRow(`SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END FROM dm_conversations WHERE id = ?`,
			claims.UserID, convID).Scan(&otherUserID)

		go broadcastDMToUser(claims.UserID, DMEvent{ConversationID: convID, Message: msg})
		if otherUserID != "" {
			recipientMsg := msg
			recipientMsg.Own = false
			go broadcastDMToUser(otherUserID, DMEvent{ConversationID: convID, Message: recipientMsg})
			pushText := req.Text
			if pushText == "" && attachment != nil {
				pushText = "📎 " + attachment.OriginalName
			}
			go SendPushToUser(db, otherUserID, "Stoa — "+senderUsername, pushText)
		}

		writeJSON(w, http.StatusOK, msg)
	}
}

func MarkDMConversationRead(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		convID := mux.Vars(r)["id"]

		if !isDMParticipant(db, convID, claims.UserID) {
			writeError(w, http.StatusForbidden, "not a participant")
			return
		}

		now := time.Now().UTC().Format(time.RFC3339)
		db.Exec(`INSERT INTO dm_read_receipts (user_id, conversation_id, last_read_at) VALUES (?, ?, ?)
			ON CONFLICT(user_id, conversation_id) DO UPDATE SET last_read_at = excluded.last_read_at`,
			claims.UserID, convID, now)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func GetDMUnreadTotal(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		uid := claims.UserID

		rows, err := db.Query(`SELECT id FROM dm_conversations WHERE user_a = ? OR user_b = ?`, uid, uid)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]int{"count": 0})
			return
		}
		defer rows.Close()

		total := 0
		for rows.Next() {
			var convID string
			rows.Scan(&convID)
			var lastReadAt sql.NullString
			db.QueryRow(`SELECT last_read_at FROM dm_read_receipts WHERE user_id = ? AND conversation_id = ?`,
				uid, convID).Scan(&lastReadAt)
			var unread int
			if lastReadAt.Valid {
				db.QueryRow(`SELECT COUNT(*) FROM dm_messages WHERE conversation_id = ? AND sender_id != ? AND created_at > ?`,
					convID, uid, lastReadAt.String).Scan(&unread)
			} else {
				db.QueryRow(`SELECT COUNT(*) FROM dm_messages WHERE conversation_id = ? AND sender_id != ?`,
					convID, uid).Scan(&unread)
			}
			total += unread
		}
		writeJSON(w, http.StatusOK, map[string]int{"count": total})
	}
}
