package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/gorilla/mux"
	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/config"
	"github.com/the-d-b/stoa/internal/logger"
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

// ── Setup ─────────────────────────────────────────────────────────────────────

func SetupStatus(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var count int
		db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
		writeJSON(w, http.StatusOK, map[string]bool{"needsSetup": count == 0})
	}
}

func SetupInit(db *sql.DB, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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
			log.Printf("[SETUP] failed to hash password: %v", err)
			writeError(w, http.StatusInternalServerError, "setup failed")
			return
		}

		sessionSecret := req.SessionSecret
		if sessionSecret == "" {
			b := make([]byte, 32)
			rand.Read(b)
			sessionSecret = base64.URLEncoding.EncodeToString(b)
		}

		tx, _ := db.Begin()
		userID := generateID()
		_, err = tx.Exec(`
			INSERT INTO users (id, username, role, auth_provider, password_hash, last_login)
			VALUES (?, ?, 'admin', 'local', ?, CURRENT_TIMESTAMP)
		`, userID, req.AdminUsername, hash)
		if err != nil {
			tx.Rollback()
			log.Printf("[SETUP] failed to create admin user: %v", err)
			writeError(w, http.StatusInternalServerError, "setup failed")
			return
		}

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
			log.Printf("[SETUP] failed to commit: %v", err)
			writeError(w, http.StatusInternalServerError, "setup failed")
			return
		}

		// Create initial tags
		tagNameToID := map[string]string{}
		for _, t := range req.InitialTags {
			tagID := generateID()
			color := t.Color
			if color == "" {
				color = "#6366f1"
			}
			db.Exec(`INSERT OR IGNORE INTO tags (id, name, color) VALUES (?, ?, ?)`, tagID, t.Name, color)
			tagNameToID[t.Name] = tagID
		}

		// Create initial groups and assign tags
		for _, g := range req.InitialGroups {
			groupID := generateID()
			db.Exec(`INSERT OR IGNORE INTO groups (id, name) VALUES (?, ?)`, groupID, g.Name)
			for _, tagName := range g.TagNames {
				if tagID, ok := tagNameToID[tagName]; ok {
					db.Exec(`INSERT OR IGNORE INTO group_tags (group_id, tag_id) VALUES (?, ?)`, groupID, tagID)
				}
			}
		}

		// Save default group name
		if req.DefaultGroupName != "" {
			db.Exec(`INSERT INTO app_config (key, value) VALUES (?, ?)
				ON CONFLICT(key) DO UPDATE SET value=excluded.value`, "default_group", req.DefaultGroupName)
		}

		logger.SetupComplete(req.AdminUsername)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Auth ──────────────────────────────────────────────────────────────────────

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
			log.Printf("[AUTH] local login: user not found: %q err=%v", req.Username, err)
			logger.LoginFailure(r, req.Username, "user_not_found")
			writeError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}

		if email.Valid {
			user.Email = email.String
		}

		if !authSvc.CheckPassword(hash, req.Password) {
			log.Printf("[AUTH] local login: password mismatch user=%q", req.Username)
			logger.LoginFailure(r, req.Username, "invalid_password")
			writeError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}

		db.Exec("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", user.ID)

		token, err := authSvc.GenerateToken(&user)
		if err != nil {
			log.Printf("[AUTH] failed to generate token: %v", err)
			writeError(w, http.StatusInternalServerError, "authentication error")
			return
		}

		logger.LoginSuccess(r, user.Username, "local")
		writeJSON(w, http.StatusOK, map[string]interface{}{"token": token, "user": user})
	}
}

func Logout(authSvc *auth.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, _ := r.Context().Value(auth.UserContextKey).(*models.Claims)
		if claims != nil {
			logger.Logout(r, claims.Username)
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func OAuthLogin(authSvc *auth.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		url, state, err := authSvc.GetOAuthLoginURL(r.Context())
		if err != nil {
			log.Printf("[AUTH] oauth login init failed: %v", err)
			writeError(w, http.StatusServiceUnavailable, "OAuth not configured")
			return
		}
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
		cookie, err := r.Cookie("oauth_state")
		if err != nil {
			log.Printf("[AUTH] oauth callback: state cookie missing")
			logger.OAuthFailure(r, "state_validation", "cookie_missing")
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		if cookie.Value != r.URL.Query().Get("state") {
			log.Printf("[AUTH] oauth callback: state mismatch")
			logger.OAuthFailure(r, "state_validation", "state_mismatch")
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}

		code := r.URL.Query().Get("code")
		user, isNew, err := authSvc.HandleOAuthCallback(r.Context(), code)
		if err != nil {
			log.Printf("[AUTH] oauth callback failed: %v", err)
			logger.OAuthFailure(r, "token_exchange", err.Error())
			writeError(w, http.StatusInternalServerError, "authentication error")
			return
		}

		token, err := authSvc.GenerateToken(user)
		if err != nil {
			log.Printf("[AUTH] oauth: failed to generate token: %v", err)
			writeError(w, http.StatusInternalServerError, "authentication error")
			return
		}

		logger.OAuthSuccess(r, user.Username, isNew)
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
		var email sql.NullString
		err := db.QueryRow(`
			SELECT id, username, email, role, auth_provider, created_at, last_login
			FROM users WHERE id = ?
		`, claims.UserID).Scan(
			&user.ID, &user.Username, &email,
			&user.Role, &user.AuthProvider, &user.CreatedAt, &lastLogin,
		)
		if err != nil {
			log.Printf("[AUTH] me: user not found id=%s err=%v", claims.UserID, err)
			writeError(w, http.StatusNotFound, "user not found")
			return
		}

		if email.Valid {
			user.Email = email.String
		}
		if lastLogin.Valid {
			user.LastLogin = &lastLogin.Time
		}
		writeJSON(w, http.StatusOK, user)
	}
}

// ── OAuth Config ──────────────────────────────────────────────────────────────

func TestOAuthConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			IssuerURL string `json:"issuerUrl"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IssuerURL == "" {
			db.QueryRow("SELECT value FROM app_config WHERE key = 'oauth_issuer_url'").Scan(&req.IssuerURL)
		}
		if req.IssuerURL == "" {
			writeError(w, http.StatusBadRequest, "issuer URL required")
			return
		}

		discoveryURL := strings.TrimRight(req.IssuerURL, "/") + "/.well-known/openid-configuration"
		client := &http.Client{Timeout: 5 * time.Second}
		resp, err := client.Get(discoveryURL)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"ok":    false,
				"error": fmt.Sprintf("Cannot reach issuer: %v", err),
			})
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"ok":    false,
				"error": fmt.Sprintf("Issuer returned HTTP %d", resp.StatusCode),
			})
			return
		}

		var discovery map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&discovery); err != nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"ok":    false,
				"error": "Response is not a valid OIDC discovery document",
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"ok":      true,
			"issuer":  discovery["issuer"],
			"authURL": discovery["authorization_endpoint"],
		})
	}
}

func GetOAuthConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cfg := models.OAuthConfig{}
		db.QueryRow("SELECT value FROM app_config WHERE key = 'oauth_client_id'").Scan(&cfg.ClientID)
		db.QueryRow("SELECT value FROM app_config WHERE key = 'oauth_issuer_url'").Scan(&cfg.IssuerURL)
		db.QueryRow("SELECT value FROM app_config WHERE key = 'oauth_redirect_url'").Scan(&cfg.RedirectURL)
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
		log.Printf("[ADMIN] oauth_config_updated")
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Users ─────────────────────────────────────────────────────────────────────

func ListUsers(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query(`
			SELECT id, username, email, role, auth_provider, created_at, last_login
			FROM users WHERE id != 'SYSTEM' ORDER BY created_at ASC
		`)
		if err != nil {
			log.Printf("[API] list_users error: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to query users")
			return
		}
		defer rows.Close()

		users := []models.User{}
		for rows.Next() {
			var u models.User
			var lastLogin sql.NullTime
			var email sql.NullString
			rows.Scan(&u.ID, &u.Username, &email, &u.Role, &u.AuthProvider, &u.CreatedAt, &lastLogin)
			if email.Valid {
				u.Email = email.String
			}
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
		var email sql.NullString
		err := db.QueryRow(`
			SELECT id, username, email, role, auth_provider, created_at, last_login
			FROM users WHERE id = ?
		`, id).Scan(&u.ID, &u.Username, &email, &u.Role, &u.AuthProvider, &u.CreatedAt, &lastLogin)
		if err != nil {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		if email.Valid {
			u.Email = email.String
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
		log.Printf("[ADMIN] role_update user_id=%s new_role=%s", id, req.Role)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func DeleteUser(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		if id == "SYSTEM" {
			writeError(w, http.StatusForbidden, "cannot delete system user")
			return
		}
		if id == claims.UserID {
			writeError(w, http.StatusForbidden, "cannot delete your own account")
			return
		}
		// Allow deleting both local and OAuth users (but not SYSTEM or self)
		db.Exec("DELETE FROM users WHERE id = ?", id)
		log.Printf("[ADMIN] user_deleted user_id=%s by=%s", id, claims.UserID)
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
		_, err := db.Exec("INSERT INTO groups (id, name, description) VALUES (?, ?, ?)", id, req.Name, req.Description)
		if err != nil {
			writeError(w, http.StatusConflict, "group already exists")
			return
		}
		writeJSON(w, http.StatusCreated, models.Group{ID: id, Name: req.Name, Description: req.Description, CreatedAt: time.Now()})
	}
}

func GetGroup(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var g models.Group
		err := db.QueryRow("SELECT id, name, description, created_at FROM groups WHERE id = ?", id).
			Scan(&g.ID, &g.Name, &g.Description, &g.CreatedAt)
		if err != nil {
			writeError(w, http.StatusNotFound, "group not found")
			return
		}

		rows, _ := db.Query(`
			SELECT u.id, u.username, u.email, u.role, u.auth_provider
			FROM users u JOIN user_groups ug ON u.id = ug.user_id WHERE ug.group_id = ?`, id)
		defer rows.Close()
		for rows.Next() {
			var u models.User
			var email sql.NullString
			rows.Scan(&u.ID, &u.Username, &email, &u.Role, &u.AuthProvider)
			if email.Valid {
				u.Email = email.String
			}
			g.Users = append(g.Users, u)
		}

		tagRows, _ := db.Query(`
			SELECT t.id, t.name, t.color FROM tags t JOIN group_tags gt ON t.id = gt.tag_id WHERE gt.group_id = ?`, id)
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
		claims, ok := r.Context().Value(auth.UserContextKey).(*models.Claims)
		if !ok {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var rows *sql.Rows
		var err error

		if claims.Role == models.RoleAdmin {
			// Admin screens: only show system tags (no owner)
			rows, err = db.Query(`
				SELECT id, name, color, COALESCE(scope,'shared'), COALESCE(created_by,''), created_at
				FROM tags WHERE created_by = 'SYSTEM' ORDER BY name ASC
			`)
		} else {
			// Profile: system tags + user's own tags
			rows, err = db.Query(`
				SELECT id, name, color, COALESCE(scope,'shared'), COALESCE(created_by,''), created_at
				FROM tags
				WHERE created_by = 'SYSTEM' OR created_by = ?
				ORDER BY CASE WHEN created_by = 'SYSTEM' THEN 0 ELSE 1 END ASC, name ASC
			`, claims.UserID)
		}

		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query tags")
			return
		}
		defer rows.Close()
		tags := []models.Tag{}
		for rows.Next() {
			var t models.Tag
			rows.Scan(&t.ID, &t.Name, &t.Color, &t.Scope, &t.CreatedBy, &t.CreatedAt)
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
			Scope string `json:"scope"` // optional — caller can force 'personal'
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
			writeError(w, http.StatusBadRequest, "name required")
			return
		}
		if req.Color == "" {
			req.Color = "#6366f1"
		}
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		// Admin creating from admin page = system tag (NULL owner)
		// Admin creating from profile (scope=personal) or any non-admin = owned tag
		ownerID := "SYSTEM"
		if req.Scope == "personal" || claims.Role != models.RoleAdmin {
			ownerID = claims.UserID
		}
		id := generateID()
		_, err := db.Exec(
			"INSERT INTO tags (id, name, color, created_by) VALUES (?, ?, ?, ?)",
			id, req.Name, req.Color, ownerID)
		if err != nil {
			writeError(w, http.StatusConflict, "tag already exists")
			return
		}
		writeJSON(w, http.StatusCreated, models.Tag{ID: id, Name: req.Name, Color: req.Color, CreatedAt: time.Now()})
	}
}

func UpdateTag(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var req models.UpdateTagRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Color == "" {
			writeError(w, http.StatusBadRequest, "color required")
			return
		}
		db.Exec("UPDATE tags SET color=? WHERE id=?", req.Color, id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func DeleteTag(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		db.Exec("DELETE FROM tags WHERE id = ?", id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Profile ───────────────────────────────────────────────────────────────────

func UpdateProfile(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)

		var req struct {
			Email string `json:"email"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}

		_, err := db.Exec("UPDATE users SET email=? WHERE id=?", req.Email, claims.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update profile")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func UploadAvatar(db *sql.DB, iconsDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)

		r.ParseMultipartForm(2 << 20) // 2MB max
		file, header, err := r.FormFile("avatar")
		if err != nil {
			writeError(w, http.StatusBadRequest, "no file provided")
			return
		}
		defer file.Close()

		// Validate content type
		ct := header.Header.Get("Content-Type")
		ext := ".png"
		switch ct {
		case "image/jpeg":
			ext = ".jpg"
		case "image/png":
			ext = ".png"
		case "image/gif":
			ext = ".gif"
		case "image/webp":
			ext = ".webp"
		default:
			writeError(w, http.StatusBadRequest, "unsupported image type")
			return
		}

		avatarDir := iconsDir + "/avatars"
		if err := os.MkdirAll(avatarDir, 0755); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create avatar dir")
			return
		}

		filename := "avatar-" + claims.UserID + ext
		dest := avatarDir + "/" + filename

		data, err := io.ReadAll(io.LimitReader(file, 2<<20))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to read file")
			return
		}
		if err := os.WriteFile(dest, data, 0644); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save avatar")
			return
		}

		avatarURL := "/api/icons/avatars/" + filename

		// Save to user_preferences
		db.Exec(`
			INSERT INTO user_preferences (user_id, avatar_url)
			VALUES (?, ?)
			ON CONFLICT(user_id) DO UPDATE SET avatar_url = excluded.avatar_url
		`, claims.UserID, avatarURL)

		writeJSON(w, http.StatusOK, map[string]string{"avatarUrl": avatarURL})
	}
}

func GetProfile(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)

		var user models.User
		err := db.QueryRow(
			"SELECT id, username, COALESCE(email,''), role, auth_provider FROM users WHERE id=?",
			claims.UserID,
		).Scan(&user.ID, &user.Username, &user.Email, &user.Role, &user.AuthProvider)
		if err != nil {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}

		// Load avatar from preferences
		var avatarURL string
		db.QueryRow("SELECT COALESCE(avatar_url,'') FROM user_preferences WHERE user_id=?", claims.UserID).Scan(&avatarURL)

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"id":           user.ID,
			"username":     user.Username,
			"email":        user.Email,
			"role":         user.Role,
			"authProvider": user.AuthProvider,
			"avatarUrl":    avatarURL,
		})
	}
}

// ListMyTags returns only tags owned by the current user, regardless of role.
func ListMyTags(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		rows, err := db.Query(`
			SELECT id, name, color, COALESCE(scope,'shared'), COALESCE(created_by,''), created_at
			FROM tags WHERE created_by = ? ORDER BY name ASC
		`, claims.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query tags")
			return
		}
		defer rows.Close()
		tags := []models.Tag{}
		for rows.Next() {
			var t models.Tag
			rows.Scan(&t.ID, &t.Name, &t.Color, &t.Scope, &t.CreatedBy, &t.CreatedAt)
			tags = append(tags, t)
		}
		writeJSON(w, http.StatusOK, tags)
	}
}

func GetUserMode(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var mode string
		db.QueryRow("SELECT value FROM app_config WHERE key = 'user_mode'").Scan(&mode)
		if mode == "" {
			mode = "multi" // default to multi-user
		}
		writeJSON(w, http.StatusOK, map[string]string{"mode": mode})
	}
}

func SetUserMode(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Mode string `json:"mode"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		if req.Mode != "single" && req.Mode != "multi" {
			writeError(w, http.StatusBadRequest, "mode must be 'single' or 'multi'")
			return
		}
		db.Exec(`INSERT INTO app_config (key, value) VALUES ('user_mode', ?)
			ON CONFLICT(key) DO UPDATE SET value=excluded.value`, req.Mode)
		writeJSON(w, http.StatusOK, map[string]string{"mode": req.Mode})
	}
}

func CreateLocalUser(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Username string `json:"username"`
			Email    string `json:"email"`
			Password string `json:"password"`
			Role     string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil ||
			req.Username == "" || req.Password == "" {
			writeError(w, http.StatusBadRequest, "username and password required")
			return
		}
		if req.Role != "admin" && req.Role != "user" {
			req.Role = "user"
		}
		log.Printf("[USERS] creating local user username=%q role=%s", req.Username, req.Role)
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("[USERS] bcrypt error: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to hash password")
			return
		}
		id := generateID()
		var emailVal interface{} = nil
		if req.Email != "" {
			emailVal = req.Email
		}
		_, err = db.Exec(
			"INSERT INTO users (id, username, email, role, auth_provider, password_hash) VALUES (?, ?, ?, ?, 'local', ?)",
			id, req.Username, emailVal, req.Role, string(hash))
		if err != nil {
			log.Printf("[USERS] insert error: %v", err)
			writeError(w, http.StatusConflict, "username already exists")
			return
		}
		log.Printf("[USERS] created local user id=%s username=%q", id, req.Username)
		writeJSON(w, http.StatusCreated, map[string]string{"id": id, "username": req.Username, "role": req.Role})
	}
}

func ResetUserPassword(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var req struct {
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Password == "" {
			writeError(w, http.StatusBadRequest, "password required")
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to hash password")
			return
		}
		res, err := db.Exec(
			"UPDATE users SET password_hash=? WHERE id=? AND auth_provider='local'",
			string(hash), id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update password")
			return
		}
		rows, _ := res.RowsAffected()
		if rows == 0 {
			writeError(w, http.StatusNotFound, "user not found or not a local user")
			return
		}
		log.Printf("[ADMIN] password_reset user_id=%s", id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
