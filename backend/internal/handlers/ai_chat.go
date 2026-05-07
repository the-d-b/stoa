package handlers

import (
	"bufio"
	"log"
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

const aiSystemPrompt = `You are a helpful assistant embedded in Stoa, a personal homelab dashboard. 
Be concise and practical. You can help with homelab topics, general questions, and anything else the user needs.`

const maxAIHistory = 40 // max messages to include in context (20 exchanges)

type aiMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// GetAIHistory returns the user's AI chat history for a provider
func GetAIHistory(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		provider := r.URL.Query().Get("provider")
		if provider == "" { provider = "claude" }
		rows, err := db.Query(`
			SELECT id, role, content, created_at
			FROM ai_messages WHERE user_id = ? AND provider = ?
			ORDER BY rowid ASC
			LIMIT 200
		`, claims.UserID, provider)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "db error")
			return
		}
		defer rows.Close()
		type msg struct {
			ID        string `json:"id"`
			Role      string `json:"role"`
			Content   string `json:"content"`
			CreatedAt string `json:"createdAt"`
		}
		var msgs []msg
		for rows.Next() {
			var m msg
			rows.Scan(&m.ID, &m.Role, &m.Content, &m.CreatedAt)
			msgs = append(msgs, m)
		}
		if msgs == nil { msgs = []msg{} }
		writeJSON(w, http.StatusOK, msgs)
	}
}

// ClearAIHistory deletes the user's AI chat history for a provider
func ClearAIHistory(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		provider := r.URL.Query().Get("provider")
		if provider == "" { provider = "claude" }
		db.Exec(`DELETE FROM ai_messages WHERE user_id = ? AND provider = ?`, claims.UserID, provider)
		writeJSON(w, http.StatusOK, map[string]string{"status": "cleared"})
	}
}

// SendAIMessage sends a message to Claude or Gemini and streams the response
func SendAIMessage(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)

		var req struct {
			Message  string `json:"message"`
			Provider string `json:"provider"` // "claude" or "gemini"
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Message == "" {
			writeError(w, http.StatusBadRequest, "message required")
			return
		}
		if req.Provider == "" { req.Provider = "claude" }

		// Get API key for the requested provider
		var secretName, friendlyName string
		switch req.Provider {
		case "gemini":
			secretName = "GEMINI_API_KEY"
			friendlyName = "Gemini"
		default:
			secretName = "ANTHROPIC_API_KEY"
			friendlyName = "Anthropic"
		}
		var apiKey string
		db.QueryRow(`SELECT value FROM secrets WHERE name = ? AND created_by = 'SYSTEM' LIMIT 1`, secretName).Scan(&apiKey)
		if apiKey == "" {
			db.QueryRow(`SELECT value FROM secrets WHERE LOWER(name) LIKE ? LIMIT 1`,
				"%"+strings.ToLower(req.Provider)+"%").Scan(&apiKey)
		}
		if apiKey == "" {
			writeError(w, http.StatusServiceUnavailable,
				friendlyName+" API key not configured. Add a secret named "+secretName+" in system settings.")
			return
		}
		apiKey = strings.TrimSpace(decryptSecret(apiKey))
		log.Printf("[AI] provider=%s secretName=%s keyLen=%d", req.Provider, secretName, len(apiKey))

		// Save user message
		userMsgID := generateID()
		db.Exec(`INSERT INTO ai_messages (id, user_id, role, content, provider, created_at) VALUES (?, ?, 'user', ?, ?, ?)`,
			userMsgID, claims.UserID, req.Message, req.Provider, time.Now().UTC().Format("2006-01-02T15:04:05.000Z"))

		// Load recent history for context (provider-scoped)
		rows, _ := db.Query(`
			SELECT role, content FROM ai_messages
			WHERE user_id = ? AND provider = ?
			ORDER BY rowid ASC
			LIMIT ?
		`, claims.UserID, req.Provider, maxAIHistory)
		var history []aiMessage
		if rows != nil {
			defer rows.Close()
			for rows.Next() {
				var m aiMessage
				rows.Scan(&m.Role, &m.Content)
				history = append(history, m)
			}
		}

		// Set up streaming response headers
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("X-Accel-Buffering", "no")
		flusher, _ := w.(http.Flusher)

		var fullContent strings.Builder

		if req.Provider == "gemini" {
			// ── Gemini API ───────────────────────────────────────────────────────
			// Convert history to Gemini format (role: user/model, parts array)
			type geminiPart struct { Text string `json:"text"` }
			type geminiContent struct {
				Role  string       `json:"role"`
				Parts []geminiPart `json:"parts"`
			}
			var geminiHistory []geminiContent
			for _, m := range history {
				role := m.Role
				if role == "assistant" { role = "model" }
				geminiHistory = append(geminiHistory, geminiContent{
					Role:  role,
					Parts: []geminiPart{{Text: m.Content}},
				})
			}
			body, _ := json.Marshal(map[string]interface{}{
				"contents":          geminiHistory,
				"systemInstruction": map[string]interface{}{
					"parts": []geminiPart{{Text: aiSystemPrompt}},
				},
				"generationConfig": map[string]interface{}{"maxOutputTokens": 1024},
			})
			apiURL := "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse"
			apiReq, _ := http.NewRequestWithContext(r.Context(), "POST", apiURL, bytes.NewReader(body))
			apiReq.Header.Set("Content-Type", "application/json")
			apiReq.Header.Set("x-goog-api-key", apiKey)
			resp, err := http.DefaultClient.Do(apiReq)
			if err != nil {
				writeError(w, http.StatusBadGateway, "Gemini API unreachable")
				return
			}
			defer resp.Body.Close()
			if resp.StatusCode != 200 {
				body, _ := io.ReadAll(resp.Body)
				writeError(w, http.StatusBadGateway, fmt.Sprintf("Gemini error: %s", string(body)))
				return
			}
			scanner := bufio.NewScanner(resp.Body)
			for scanner.Scan() {
				line := scanner.Text()
				if !strings.HasPrefix(line, "data: ") { continue }
				data := strings.TrimPrefix(line, "data: ")
				var event map[string]interface{}
				if json.Unmarshal([]byte(data), &event) != nil { continue }
				if candidates, ok := event["candidates"].([]interface{}); ok && len(candidates) > 0 {
					if c, ok := candidates[0].(map[string]interface{}); ok {
						if content, ok := c["content"].(map[string]interface{}); ok {
							if parts, ok := content["parts"].([]interface{}); ok && len(parts) > 0 {
								if part, ok := parts[0].(map[string]interface{}); ok {
									if text, ok := part["text"].(string); ok && text != "" {
										fullContent.WriteString(text)
										chunk, _ := json.Marshal(map[string]string{"text": text})
										fmt.Fprintf(w, "data: %s\n\n", chunk)
										if flusher != nil { flusher.Flush() }
									}
								}
							}
						}
					}
				}
			}
		} else {
			// ── Anthropic API ────────────────────────────────────────────────────
			body, _ := json.Marshal(map[string]interface{}{
				"model":      "claude-sonnet-4-20250514",
				"max_tokens": 1024,
				"system":     aiSystemPrompt,
				"messages":   history,
				"stream":     true,
			})
			apiReq, _ := http.NewRequestWithContext(r.Context(), "POST",
				"https://api.anthropic.com/v1/messages", bytes.NewReader(body))
			apiReq.Header.Set("Content-Type", "application/json")
			apiReq.Header.Set("x-api-key", apiKey)
			apiReq.Header.Set("anthropic-version", "2023-06-01")
			resp, err := http.DefaultClient.Do(apiReq)
			if err != nil {
				writeError(w, http.StatusBadGateway, "Anthropic API unreachable")
				return
			}
			defer resp.Body.Close()
			if resp.StatusCode != 200 {
				body, _ := io.ReadAll(resp.Body)
				writeError(w, http.StatusBadGateway, fmt.Sprintf("Anthropic error: %s", string(body)))
				return
			}
			scanner := bufio.NewScanner(resp.Body)
			for scanner.Scan() {
				line := scanner.Text()
				if !strings.HasPrefix(line, "data: ") { continue }
				data := strings.TrimPrefix(line, "data: ")
				if data == "[DONE]" { break }
				var event map[string]interface{}
				if json.Unmarshal([]byte(data), &event) != nil { continue }
				evType, _ := event["type"].(string)
				if evType == "content_block_delta" {
					if delta, ok := event["delta"].(map[string]interface{}); ok {
						if text, ok := delta["text"].(string); ok {
							fullContent.WriteString(text)
							chunk, _ := json.Marshal(map[string]string{"text": text})
							fmt.Fprintf(w, "data: %s\n\n", chunk)
							if flusher != nil { flusher.Flush() }
						}
					}
				}
			}
		}

		// Save assistant response
		if fullContent.Len() > 0 {
			db.Exec(`INSERT INTO ai_messages (id, user_id, role, content, provider, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)`,
				generateID(), claims.UserID, fullContent.String(), req.Provider, time.Now().UTC().Format("2006-01-02T15:04:05.000Z"))
		}

		fmt.Fprintf(w, "data: %s\n\n", `{"done":true}`)
		if flusher != nil { flusher.Flush() }
	}
}
