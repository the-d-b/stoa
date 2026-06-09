package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"time"

	"github.com/gorilla/mux"
)

// DMAuditConversation summarises a DM conversation for the admin transcript view.
type DMAuditConversation struct {
	ID            string  `json:"id"`
	UserAID       string  `json:"userAId"`
	UserAUsername string  `json:"userAUsername"`
	UserBID       string  `json:"userBId"`
	UserBUsername string  `json:"userBUsername"`
	MessageCount  int     `json:"messageCount"`
	LastMessageAt *string `json:"lastMessageAt"`
	CreatedAt     string  `json:"createdAt"`
}

// AIAuditUser summarises one user+provider pair that has AI chat history.
type AIAuditUser struct {
	UserID        string  `json:"userId"`
	Username      string  `json:"username"`
	Provider      string  `json:"provider"`
	MessageCount  int     `json:"messageCount"`
	LastMessageAt *string `json:"lastMessageAt"`
}

// ListDMConversationsAdmin returns all DM conversations for the admin audit view.
func ListDMConversationsAdmin(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query(`
			SELECT
				c.id,
				c.user_a, ua.username,
				c.user_b, ub.username,
				COUNT(m.id),
				MAX(m.created_at),
				c.created_at
			FROM dm_conversations c
			JOIN users ua ON ua.id = c.user_a
			JOIN users ub ON ub.id = c.user_b
			LEFT JOIN dm_messages m ON m.conversation_id = c.id
			GROUP BY c.id
			ORDER BY COALESCE(MAX(m.created_at), c.created_at) DESC
		`)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()

		list := []DMAuditConversation{}
		for rows.Next() {
			var c DMAuditConversation
			var lastMsg sql.NullString
			rows.Scan(&c.ID, &c.UserAID, &c.UserAUsername, &c.UserBID, &c.UserBUsername,
				&c.MessageCount, &lastMsg, &c.CreatedAt)
			if lastMsg.Valid {
				c.LastMessageAt = &lastMsg.String
			}
			list = append(list, c)
		}
		writeJSON(w, http.StatusOK, list)
	}
}

// DownloadDMConversation streams a plain-text transcript of one DM conversation.
func DownloadDMConversation(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]

		var userA, userB string
		err := db.QueryRow(`
			SELECT ua.username, ub.username
			FROM dm_conversations c
			JOIN users ua ON ua.id = c.user_a
			JOIN users ub ON ub.id = c.user_b
			WHERE c.id = ?
		`, id).Scan(&userA, &userB)
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "conversation not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "db error")
			return
		}

		rows, err := db.Query(`
			SELECT u.username, m.text, m.created_at
			FROM dm_messages m
			JOIN users u ON u.id = m.sender_id
			WHERE m.conversation_id = ?
			ORDER BY m.created_at ASC, m.rowid ASC
		`, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "db error")
			return
		}
		defer rows.Close()

		type dmMsg struct{ Username, Text, CreatedAt string }
		var msgs []dmMsg
		for rows.Next() {
			var m dmMsg
			rows.Scan(&m.Username, &m.Text, &m.CreatedAt)
			msgs = append(msgs, m)
		}

		filename := fmt.Sprintf("dm_%s_%s_%s.txt", userA, userB, time.Now().UTC().Format("20060102"))
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))

		fmt.Fprintf(w, "=== STOA DIRECT MESSAGE TRANSCRIPT ===\n")
		fmt.Fprintf(w, "Between:    %s <-> %s\n", userA, userB)
		fmt.Fprintf(w, "Downloaded: %s UTC\n", time.Now().UTC().Format("2006-01-02 15:04:05"))
		fmt.Fprintf(w, "Messages:   %d\n", len(msgs))
		fmt.Fprintf(w, "\n")

		for _, m := range msgs {
			fmt.Fprintf(w, "[%s] %s:\n%s\n\n", fmtAuditTime(m.CreatedAt), m.Username, m.Text)
		}
	}
}

// ListAIUsersAdmin returns all user+provider pairs that have AI chat history.
func ListAIUsersAdmin(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query(`
			SELECT m.user_id, u.username, m.provider, COUNT(*), MAX(m.created_at)
			FROM ai_messages m
			JOIN users u ON u.id = m.user_id
			GROUP BY m.user_id, m.provider
			ORDER BY MAX(m.created_at) DESC
		`)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()

		list := []AIAuditUser{}
		for rows.Next() {
			var a AIAuditUser
			var lastMsg sql.NullString
			rows.Scan(&a.UserID, &a.Username, &a.Provider, &a.MessageCount, &lastMsg)
			if lastMsg.Valid {
				a.LastMessageAt = &lastMsg.String
			}
			list = append(list, a)
		}
		writeJSON(w, http.StatusOK, list)
	}
}

// DownloadAIConversation streams a plain-text transcript of a user's AI chat history.
func DownloadAIConversation(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := r.URL.Query().Get("userId")
		provider := r.URL.Query().Get("provider")
		if provider == "" {
			provider = "claude"
		}
		if userID == "" {
			writeError(w, http.StatusBadRequest, "userId required")
			return
		}

		var username string
		err := db.QueryRow(`SELECT username FROM users WHERE id = ?`, userID).Scan(&username)
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "db error")
			return
		}

		rows, err := db.Query(`
			SELECT role, content, created_at
			FROM ai_messages
			WHERE user_id = ? AND provider = ?
			ORDER BY rowid ASC
		`, userID, provider)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "db error")
			return
		}
		defer rows.Close()

		type aiMsg struct{ Role, Content, CreatedAt string }
		var msgs []aiMsg
		for rows.Next() {
			var m aiMsg
			rows.Scan(&m.Role, &m.Content, &m.CreatedAt)
			msgs = append(msgs, m)
		}

		filename := fmt.Sprintf("ai_%s_%s_%s.txt", username, provider, time.Now().UTC().Format("20060102"))
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))

		fmt.Fprintf(w, "=== STOA AI CHAT TRANSCRIPT ===\n")
		fmt.Fprintf(w, "User:       %s\n", username)
		fmt.Fprintf(w, "Provider:   %s\n", provider)
		fmt.Fprintf(w, "Downloaded: %s UTC\n", time.Now().UTC().Format("2006-01-02 15:04:05"))
		fmt.Fprintf(w, "Messages:   %d\n", len(msgs))
		fmt.Fprintf(w, "\n")

		for _, m := range msgs {
			speaker := username
			if m.Role == "assistant" {
				speaker = provider
			}
			fmt.Fprintf(w, "[%s] %s:\n%s\n\n", fmtAuditTime(m.CreatedAt), speaker, m.Content)
		}
	}
}

// fmtAuditTime normalises a stored timestamp to "2006-01-02 15:04:05 UTC".
func fmtAuditTime(s string) string {
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05Z", "2006-01-02 15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC().Format("2006-01-02 15:04:05 UTC")
		}
	}
	return s
}
