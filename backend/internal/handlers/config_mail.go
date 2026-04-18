package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
)

// ── GET /api/admin/mail-config ────────────────────────────────────────────────
func GetMailConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cfg := getMailConfig(db)
		cfg.Password = "" // never expose stored password
		writeJSON(w, http.StatusOK, cfg)
	}
}

// ── PUT /api/admin/mail-config ────────────────────────────────────────────────
func SaveMailConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var cfg MailConfig
		if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		if err := saveMailConfig(db, cfg); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save mail config")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── POST /api/admin/mail-config/test ─────────────────────────────────────────
func TestMailConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			To string `json:"to"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.To == "" {
			writeError(w, http.StatusBadRequest, "recipient email required")
			return
		}
		html := `<div style="font-family:sans-serif;padding:20px">
			<h2 style="color:#7c6fff">Stoa mail test</h2>
			<p>If you're reading this, your mail configuration is working correctly.</p>
		</div>`
		if err := sendMail(db, req.To, "Stoa mail test", html); err != nil {
			writeError(w, http.StatusBadRequest, "mail send failed: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── GET /api/admin/session-config ────────────────────────────────────────────
func GetSessionConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var hours string
		db.QueryRow("SELECT value FROM app_config WHERE key='session_duration_hours'").Scan(&hours)
		if hours == "" {
			hours = "24"
		}
		writeJSON(w, http.StatusOK, map[string]string{"sessionDurationHours": hours})
	}
}

// ── PUT /api/admin/session-config ────────────────────────────────────────────
func SaveSessionConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			SessionDurationHours string `json:"sessionDurationHours"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		hours, err := strconv.Atoi(req.SessionDurationHours)
		if err != nil || hours < 1 || hours > 720 {
			writeError(w, http.StatusBadRequest, "session duration must be between 1 and 720 hours")
			return
		}
		db.Exec(`INSERT INTO app_config (key, value) VALUES ('session_duration_hours', ?)
			ON CONFLICT(key) DO UPDATE SET value=excluded.value`, req.SessionDurationHours)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
