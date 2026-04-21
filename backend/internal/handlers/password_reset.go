package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"golang.org/x/crypto/bcrypt"
)

// ── Password reset request ────────────────────────────────────────────────────
// POST /api/auth/reset-request   { "email": "..." }
// Always returns 200 to avoid email enumeration.

func ResetRequest(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Email string `json:"email"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
			writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
			return
		}

		// Look up user by email
		var userID, username string
		err := db.QueryRow(
			"SELECT id, username FROM users WHERE LOWER(email) = LOWER(?)", req.Email,
		).Scan(&userID, &username)
		if err != nil {
			// No user found — return 200 silently (don't reveal email existence)
			writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
			return
		}

		// Generate token
		b := make([]byte, 32)
		if _, err := rand.Read(b); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to generate token")
			return
		}
		token := hex.EncodeToString(b)
		expiresAt := time.Now().Add(30 * time.Minute)

		// Invalidate any existing tokens for this user
		db.Exec("UPDATE password_reset_tokens SET used=1 WHERE user_id=?", userID)

		// Store new token
		_, err = db.Exec(
			"INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)",
			token, userID, expiresAt.UTC().Format(time.RFC3339),
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to store token")
			return
		}

		// Build reset URL — prefer app_url from config, fall back to Origin then Host
		appURL := ""
		db.QueryRow("SELECT value FROM app_config WHERE key='app_url'").Scan(&appURL)
		appURL = strings.TrimRight(appURL, "/")
		if appURL == "" {
			appURL = strings.TrimRight(r.Header.Get("Origin"), "/")
		}
		if appURL == "" {
			scheme := "http"
			if r.TLS != nil { scheme = "https" }
			appURL = scheme + "://" + r.Host
		}
		resetURL := appURL + "/reset-password?token=" + token

		// Send email (fire and forget — don't expose internal errors to client)
		go func() {
			html := resetEmailHTML(resetURL, username)
			sendMail(db, req.Email, "Reset your Stoa password", html)
		}()

		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Password reset confirm ────────────────────────────────────────────────────
// POST /api/auth/reset-confirm   { "token": "...", "password": "..." }

func ResetConfirm(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Token    string `json:"token"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" || req.Password == "" {
			writeError(w, http.StatusBadRequest, "token and password required")
			return
		}
		if len(req.Password) < 8 {
			writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
			return
		}

		// Validate token
		var userID string
		var expiresAt time.Time
		var used int
		err := db.QueryRow(
			"SELECT user_id, expires_at, used FROM password_reset_tokens WHERE token=?",
			req.Token,
		).Scan(&userID, &expiresAt, &used)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid or expired reset link")
			return
		}
		if used == 1 {
			writeError(w, http.StatusBadRequest, "this reset link has already been used")
			return
		}
		if time.Now().After(expiresAt) {
			writeError(w, http.StatusBadRequest, "reset link has expired — please request a new one")
			return
		}

		// Hash new password
		hashBytes, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		hash := string(hashBytes)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to hash password")
			return
		}

		// Update password and mark token used — atomic
		tx, err := db.Begin()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "transaction error")
			return
		}
		tx.Exec("UPDATE users SET password_hash=? WHERE id=?", hash, userID)
		tx.Exec("UPDATE password_reset_tokens SET used=1 WHERE token=?", req.Token)
		if err := tx.Commit(); err != nil {
			tx.Rollback()
			writeError(w, http.StatusInternalServerError, "failed to update password")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Admin: send reset link to user ───────────────────────────────────────────
// POST /api/admin/users/{id}/reset-password
// Admin doesn't set the password — generates a reset link and emails it.

func AdminSendResetLink(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		if id == "" {
			writeError(w, http.StatusBadRequest, "user id required")
			return
		}

		var username, email string
		err := db.QueryRow("SELECT username, COALESCE(email,'') FROM users WHERE id=?", id).
			Scan(&username, &email)
		if err != nil {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		if email == "" {
			writeError(w, http.StatusBadRequest, "user has no email address — edit their profile first")
			return
		}

		// Generate token
		b := make([]byte, 32)
		rand.Read(b)
		token := hex.EncodeToString(b)
		expiresAt := time.Now().Add(30 * time.Minute)

		db.Exec("UPDATE password_reset_tokens SET used=1 WHERE user_id=?", id)
		db.Exec(
			"INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)",
			token, id, expiresAt.UTC().Format(time.RFC3339),
		)

		appURL := ""
		db.QueryRow("SELECT value FROM app_config WHERE key='app_url'").Scan(&appURL)
		appURL = strings.TrimRight(appURL, "/")
		if appURL == "" {
			appURL = strings.TrimRight(r.Header.Get("Origin"), "/")
		}
		if appURL == "" {
			scheme := "http"
			if r.TLS != nil { scheme = "https" }
			appURL = scheme + "://" + r.Host
		}
		resetURL := appURL + "/reset-password?token=" + token

		go func() {
			html := resetEmailHTML(resetURL, username)
			sendMail(db, email, "Reset your Stoa password", html)
		}()

		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "email": email})
	}
}
