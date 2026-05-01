package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
)

// ── GET /api/admin/mail-config ────────────────────────────────────────────────
func GetMailConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[MAIL] GET /admin/mail-config called")
		cfg := getMailConfig(db)
		log.Printf("[MAIL] config loaded: host=%q port=%q tls=%q user=%q from=%q hasPassword=%v",
			cfg.Host, cfg.Port, cfg.TLSMode, cfg.Username, cfg.From, cfg.Password != "")
		cfg.Password = "" // never expose stored password
		writeJSON(w, http.StatusOK, cfg)
	}
}

// ── PUT /api/admin/mail-config ────────────────────────────────────────────────
func SaveMailConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[MAIL] PUT /admin/mail-config called")
		var cfg MailConfig
		if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
			log.Printf("[MAIL] decode error: %v", err)
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		log.Printf("[MAIL] saving: host=%q port=%q tls=%q user=%q from=%q hasPassword=%v",
			cfg.Host, cfg.Port, cfg.TLSMode, cfg.Username, cfg.From, cfg.Password != "")
		if err := saveMailConfig(db, cfg); err != nil {
			log.Printf("[MAIL] save error: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to save: "+err.Error())
			return
		}
		log.Printf("[MAIL] save OK")
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── POST /api/admin/mail-config/test ─────────────────────────────────────────
func TestMailConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[MAIL] POST /admin/mail-config/test called")
		var req struct {
			To  string     `json:"to"`
			Cfg *MailConfig `json:"cfg"` // optional inline config — uses current form values
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.To == "" {
			log.Printf("[MAIL] test: missing recipient")
			writeError(w, http.StatusBadRequest, "recipient email required")
			return
		}
		// Use inline config if provided, fall back to saved DB config
		cfg := getMailConfig(db)
		if req.Cfg != nil {
			if req.Cfg.Host != "" { cfg.Host = req.Cfg.Host }
			if req.Cfg.Port != "" { cfg.Port = req.Cfg.Port }
			if req.Cfg.TLSMode != "" { cfg.TLSMode = req.Cfg.TLSMode }
			if req.Cfg.Username != "" { cfg.Username = req.Cfg.Username }
			if req.Cfg.Password != "" { cfg.Password = req.Cfg.Password }
			if req.Cfg.From != "" { cfg.From = req.Cfg.From }
		}
		html := `<div style="font-family:sans-serif;padding:20px">
			<h2 style="color:#7c6fff">Stoa mail test</h2>
			<p>If you're reading this, your mail configuration is working correctly.</p>
		</div>`
		log.Printf("[MAIL] test: sending to %q via %q", req.To, cfg.Host)
		if err := sendMailWithConfig(cfg, req.To, "Stoa mail test", html); err != nil {
			log.Printf("[MAIL] test send failed: %v", err)
			writeError(w, http.StatusBadRequest, "mail send failed: "+err.Error())
			return
		}
		log.Printf("[MAIL] test send OK to %q", req.To)
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
		log.Printf("[MAIL] session_duration_hours = %q", hours)
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
		hours, err := strconv.ParseFloat(req.SessionDurationHours, 64)
		if err != nil || hours <= 0 || hours > 720 {
			writeError(w, http.StatusBadRequest, "invalid session duration")
			return
		}
		log.Printf("[MAIL] saving session_duration_hours = %q", req.SessionDurationHours)
		db.Exec(`INSERT INTO app_config (key, value) VALUES ('session_duration_hours', ?)
			ON CONFLICT(key) DO UPDATE SET value=excluded.value`, req.SessionDurationHours)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
