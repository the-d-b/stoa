package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/config"
	"github.com/the-d-b/stoa/internal/models"
)

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func generateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)[:16]
}

// ── Setup ────────────────────────────────────────────────────────────────────

func SetupStatus(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var count int
		db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
		writeJSON(w, http.StatusOK, map[string]bool{
			"needsSetup": count == 0,
		})
	}
}

func SetupInit(db *sql.DB, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Only allowed if no users exist
		var count int
		db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
		if count > 0 {
			writeError(w, http.StatusForbidden, "setup already complete")
			return
		}

		var req models.SetupRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}

		if req.AdminUsername == "" || req.AdminPassword == "" {
			writeError(w, http.StatusBadRequest, "username and password required")
			return
		}

		authSvc := auth.New(cfg, db)
		hash, err := authSvc.HashPassword(req.AdminPassword)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to hash password")
			return
		}

		// Generate session secret if not provided
		sessionSecret := req.SessionSecret
		if sessionSecret == "" {
			b := make([]byte, 32)
			rand.Read(b)
			sessionSecret = base64.URLEncoding.EncodeToString(b)
		}

		tx, _ := db.Begin()

		// Create admin user
		userID := generateID()
		_, err = tx.Exec(`
			INSERT INTO users (id, username, role, auth_provider, password_hash, last_login)
			VALUES (?, ?, 'admin', 'local', ?, CURRENT_TIMESTAMP)
		`, userID, req.AdminUsername, hash)
		if err != nil {
			tx.Rollback()
			writeError(w, http.StatusInternalServerError, "failed to create admin user")
			return
		}

		// Save config
		configs := map[string]string{
			"session_secret": sessionSecret,
			"app_url":        req.AppURL,
			"setup_complete": "true",
			"setup_version":  "1",
		}
		for k, v := range configs {
			tx.Exec(`
				INSERT INTO app_config (key, value) VALUES (?, ?)
				ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
			`, k, v)
		}

		if err := tx.Commit(); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to commit setup")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Auth ─────────────────────────────────────────────────────────────────────

func LocalLogin(authSvc *auth.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}

		db := authSvc.DB()
		var user models.User
		var hash string
		var email sql.NullString
		err := db.QueryRow(`
			SELECT id, username, email, role, auth_provider, password_hash
			FROM users WHERE username = ? AND auth_provider = 'local'
		`, req.Username).Scan(&user.ID, &user.Username, &email, &user.Role, &user.AuthProvider, &hash)

		if err != nil {
			writeError(w, http.StatusUnauthorized, "user not found: "+err.Error())
			return
		}

		if email.Valid {
			user.Email = email.String
		}

		if !authSvc.CheckPassword(hash, req.Password) {
			writeError(w, http.StatusUnauthorized, "password mismatch")
			return
		}

		db.Exec("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", user.ID)

		token, err := authSvc.GenerateToken(&user)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to generate token")
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"token": token,
			"user":  user,
		})
	}
}

func Logout(authSvc *auth.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// JWT is stateless — client just drops the token
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func OAuthLogin(authSvc *auth.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		url, state, err := authSvc.GetOAuthLoginURL(r.Context())
		if err != nil {
			writeError(w, http.StatusServiceUnavailable, "OAuth not configured")
			return
		}

		// Store state in a short-lived cookie
		http.SetCookie(w, &http.Cookie{
			Name:     "oauth_state",
			Value:    state,
			Path:     "/",
			MaxAge:   300,
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
		})

		http.Redirect(w, r, url, http.StatusTemporaryRedirect)
	}
}

func OAuthCallback(authSvc *auth.Service, db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Validate state
		cookie, err := r.Cookie("oauth_state")
		if err != nil {
			writeError(w, http.StatusBadRequest, "state cookie missing: "+err.Error())
			return
		}
		if cookie.Value != r.URL.Query().Get("state") {
			writeError(w, http.StatusBadRequest, "state mismatch: got "+r.URL.Query().Get("state")+" want "+cookie.Value)
			return
		}

		code := r.URL.Query().Get("code")
		user, _, err := authSvc.HandleOAuthCallback(r.Context(), code)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "OAuth callback failed: "+err.Error())
			return
		}

		token, err := authSvc.GenerateToken(user)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to generate token")
			return
		}

		// Redirect to frontend with token
		http.Redirect(w, r, "/?token="+token, http.StatusTemporaryRedirect)
	}
}

func Me(authSvc *auth.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, ok := r.Context().Value(auth.UserContextKey).(*models.Claims)
		if !ok {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		db := authSvc.DB()
		var user models.User
		var lastLogin sql.NullTime
		err := db.QueryRow(`
			SELECT id, username, email, role, auth_provider, created_at, last_login
			FROM users WHERE id = ?
		`, claims.UserID).Scan(
			&user.ID, &user.Username, &user.Email,
			&user.Role, &user.AuthProvider, &user.CreatedAt, &lastLogin,
		)
		if err != nil {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}

		if lastLogin.Valid {
			user.LastLogin = &lastLogin.Time
		}

		writeJSON(w, http.StatusOK, user)
	}
}

// ── Users ─────────────────────────────────────────────────────────────────────

func ListUsers(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query(`
			SELECT id, username, email, role, auth_provider, created_at, last_login
			FROM users ORDER BY created_at ASC
		`)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query users")
			return
		}
		defer rows.Close()

		users := []models.User{}
		for rows.Next() {
			var u models.User
			var lastLogin sql.NullTime
			rows.Scan(&u.ID, &u.Username, &u.Email, &u.Role, &u.AuthProvider, &u.CreatedAt, &lastLogin)
			if lastLogin.Valid {
				u.LastLogin = &lastLogin.Time
			}
			users = append(users, u)
		}
		writeJSON(w, http.StatusOK, users)
	}
}

func GetUser(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var u models.User
		var lastLogin sql.NullTime
		err := db.QueryRow(`
			SELECT id, username, email, role, auth_provider, created_at, last_login
			FROM users WHERE id = ?
		`, id).Scan(&u.ID, &u.Username, &u.Email, &u.Role, &u.AuthProvider, &u.CreatedAt, &lastLogin)
		if err != nil {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		if lastLogin.Valid {
			u.LastLogin = &lastLogin.Time
		}
		writeJSON(w, http.StatusOK, u)
	}
}

func UpdateUserRole(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var req struct {
			Role models.Role `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		if req.Role != models.RoleAdmin && req.Role != models.RoleUser {
			writeError(w, http.StatusBadRequest, "invalid role")
			return
		}
		db.Exec("UPDATE users SET role = ? WHERE id = ?", req.Role, id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func DeleteUser(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		db.Exec("DELETE FROM users WHERE id = ? AND auth_provider != 'local'", id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Groups ────────────────────────────────────────────────────────────────────

func ListGroups(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query("SELECT id, name, description, created_at FROM groups ORDER BY name ASC")
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query groups")
			return
		}
		defer rows.Close()

		groups := []models.Group{}
		for rows.Next() {
			var g models.Group
			rows.Scan(&g.ID, &g.Name, &g.Description, &g.CreatedAt)
			groups = append(groups, g)
		}
		writeJSON(w, http.StatusOK, groups)
	}
}

func CreateGroup(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name        string `json:"name"`
			Description string `json:"description"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
			writeError(w, http.StatusBadRequest, "name required")
			return
		}
		id := generateID()
		_, err := db.Exec(
			"INSERT INTO groups (id, name, description) VALUES (?, ?, ?)",
			id, req.Name, req.Description,
		)
		if err != nil {
			writeError(w, http.StatusConflict, "group already exists")
			return
		}
		writeJSON(w, http.StatusCreated, models.Group{
			ID: id, Name: req.Name, Description: req.Description, CreatedAt: time.Now(),
		})
	}
}

func GetGroup(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var g models.Group
		err := db.QueryRow(
			"SELECT id, name, description, created_at FROM groups WHERE id = ?", id,
		).Scan(&g.ID, &g.Name, &g.Description, &g.CreatedAt)
		if err != nil {
			writeError(w, http.StatusNotFound, "group not found")
			return
		}

		// Load users
		rows, _ := db.Query(`
			SELECT u.id, u.username, u.email, u.role, u.auth_provider
			FROM users u JOIN user_groups ug ON u.id = ug.user_id
			WHERE ug.group_id = ?
		`, id)
		defer rows.Close()
		for rows.Next() {
			var u models.User
			rows.Scan(&u.ID, &u.Username, &u.Email, &u.Role, &u.AuthProvider)
			g.Users = append(g.Users, u)
		}

		// Load tags
		tagRows, _ := db.Query(`
			SELECT t.id, t.name, t.color
			FROM tags t JOIN group_tags gt ON t.id = gt.tag_id
			WHERE gt.group_id = ?
		`, id)
		defer tagRows.Close()
		for tagRows.Next() {
			var t models.Tag
			tagRows.Scan(&t.ID, &t.Name, &t.Color)
			g.Tags = append(g.Tags, t)
		}

		writeJSON(w, http.StatusOK, g)
	}
}

func DeleteGroup(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		db.Exec("DELETE FROM groups WHERE id = ?", id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func AddUserToGroup(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		groupID := mux.Vars(r)["id"]
		var req struct {
			UserID string `json:"userId"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		db.Exec("INSERT OR IGNORE INTO user_groups (user_id, group_id) VALUES (?, ?)", req.UserID, groupID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func RemoveUserFromGroup(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		db.Exec("DELETE FROM user_groups WHERE group_id = ? AND user_id = ?", vars["id"], vars["userId"])
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func AddTagToGroup(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		groupID := mux.Vars(r)["id"]
		var req struct {
			TagID string `json:"tagId"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		db.Exec("INSERT OR IGNORE INTO group_tags (group_id, tag_id) VALUES (?, ?)", groupID, req.TagID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func RemoveTagFromGroup(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		db.Exec("DELETE FROM group_tags WHERE group_id = ? AND tag_id = ?", vars["id"], vars["tagId"])
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Tags ──────────────────────────────────────────────────────────────────────

func ListTags(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query("SELECT id, name, color, created_at FROM tags ORDER BY name ASC")
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query tags")
			return
		}
		defer rows.Close()
		tags := []models.Tag{}
		for rows.Next() {
			var t models.Tag
			rows.Scan(&t.ID, &t.Name, &t.Color, &t.CreatedAt)
			tags = append(tags, t)
		}
		writeJSON(w, http.StatusOK, tags)
	}
}

func CreateTag(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name  string `json:"name"`
			Color string `json:"color"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
			writeError(w, http.StatusBadRequest, "name required")
			return
		}
		if req.Color == "" {
			req.Color = "#6366f1"
		}
		id := generateID()
		_, err := db.Exec(
			"INSERT INTO tags (id, name, color) VALUES (?, ?, ?)",
			id, req.Name, req.Color,
		)
		if err != nil {
			writeError(w, http.StatusConflict, "tag already exists")
			return
		}
		writeJSON(w, http.StatusCreated, models.Tag{
			ID: id, Name: req.Name, Color: req.Color, CreatedAt: time.Now(),
		})
	}
}

func DeleteTag(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		db.Exec("DELETE FROM tags WHERE id = ?", id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── OAuth Config ──────────────────────────────────────────────────────────────

func GetOAuthConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cfg := models.OAuthConfig{}
		db.QueryRow("SELECT value FROM app_config WHERE key = 'oauth_client_id'").Scan(&cfg.ClientID)
		db.QueryRow("SELECT value FROM app_config WHERE key = 'oauth_issuer_url'").Scan(&cfg.IssuerURL)
		db.QueryRow("SELECT value FROM app_config WHERE key = 'oauth_redirect_url'").Scan(&cfg.RedirectURL)
		// Never return the secret
		writeJSON(w, http.StatusOK, cfg)
	}
}

func SaveOAuthConfig(db *sql.DB, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.OAuthConfig
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}

		upsert := func(key, value string) {
			db.Exec(`
				INSERT INTO app_config (key, value) VALUES (?, ?)
				ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
			`, key, value)
		}

		upsert("oauth_client_id", req.ClientID)
		upsert("oauth_issuer_url", req.IssuerURL)
		upsert("oauth_redirect_url", req.RedirectURL)
		if req.ClientSecret != "" {
			upsert("oauth_client_secret", req.ClientSecret)
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
