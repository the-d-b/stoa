package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/golang-jwt/jwt/v5"
	"github.com/the-d-b/stoa/internal/config"
	"github.com/the-d-b/stoa/internal/models"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/oauth2"
)

type contextKey string

const UserContextKey contextKey = "user"

type Service struct {
	cfg      *config.Config
	db       *sql.DB
	provider *oidc.Provider
	oauth2   *oauth2.Config
}

func New(cfg *config.Config, db *sql.DB) *Service {
	s := &Service{cfg: cfg, db: db}
	// OAuth provider will be initialized lazily when config is available
	return s
}

func (s *Service) initOAuth(ctx context.Context) error {
	if s.provider != nil {
		return nil
	}

	issuerURL := s.cfg.OAuthIssuerURL
	if issuerURL == "" {
		// Try loading from DB
		var val string
		err := s.db.QueryRow("SELECT value FROM app_config WHERE key = 'oauth_issuer_url'").Scan(&val)
		if err != nil {
			return fmt.Errorf("OAuth not configured: db error: %w", err)
		}
		if val == "" {
			return fmt.Errorf("OAuth not configured: issuer_url is empty in db")
		}
		issuerURL = val
	}

	log.Printf("Initializing OIDC provider with issuer: %s", issuerURL)
	provider, err := oidc.NewProvider(ctx, issuerURL)
	if err != nil {
		return fmt.Errorf("failed to init OIDC provider at %s: %w", issuerURL, err)
	}

	clientID := s.cfg.OAuthClientID
	clientSecret := s.cfg.OAuthClientSecret
	redirectURL := s.cfg.OAuthRedirectURL

	// Load from DB if not in env
	if clientID == "" {
		s.db.QueryRow("SELECT value FROM app_config WHERE key = 'oauth_client_id'").Scan(&clientID)
	}
	if clientSecret == "" {
		s.db.QueryRow("SELECT value FROM app_config WHERE key = 'oauth_client_secret'").Scan(&clientSecret)
	}
	if redirectURL == "" {
		var appURL string
		s.db.QueryRow("SELECT value FROM app_config WHERE key = 'app_url'").Scan(&appURL)
		redirectURL = strings.TrimRight(appURL, "/") + "/api/auth/oauth/callback"
	}

	s.provider = provider
	s.oauth2 = &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURL,
		Endpoint:     provider.Endpoint(),
		Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
	}

	return nil
}

func (s *Service) GenerateToken(user *models.User) (string, error) {
	secret := s.cfg.SessionSecret
	if secret == "" {
		s.db.QueryRow("SELECT value FROM app_config WHERE key = 'session_secret'").Scan(&secret)
	}

	claims := jwt.MapClaims{
		"userId":   user.ID,
		"username": user.Username,
		"role":     user.Role,
		"exp":      time.Now().Add(24 * time.Hour).Unix(),
		"iat":      time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func (s *Service) ValidateToken(tokenStr string) (*models.Claims, error) {
	secret := s.cfg.SessionSecret
	if secret == "" {
		s.db.QueryRow("SELECT value FROM app_config WHERE key = 'session_secret'").Scan(&secret)
	}

	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		return &models.Claims{
			UserID:   claims["userId"].(string),
			Username: claims["username"].(string),
			Role:     models.Role(claims["role"].(string)),
		}, nil
	}

	return nil, fmt.Errorf("invalid token")
}

func (s *Service) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		claims, err := s.ValidateToken(tokenStr)
		if err != nil {
			http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), UserContextKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Service) AdminMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := r.Context().Value(UserContextKey).(*models.Claims)
		if !ok || claims.Role != models.RoleAdmin {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Service) HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func (s *Service) CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func (s *Service) GetOAuthLoginURL(ctx context.Context) (string, string, error) {
	if err := s.initOAuth(ctx); err != nil {
		return "", "", err
	}

	state := generateRandomString(32)
	url := s.oauth2.AuthCodeURL(state)
	return url, state, nil
}

func (s *Service) HandleOAuthCallback(ctx context.Context, code string) (*models.User, bool, error) {
	if err := s.initOAuth(ctx); err != nil {
		return nil, false, err
	}

	token, err := s.oauth2.Exchange(ctx, code)
	if err != nil {
		return nil, false, fmt.Errorf("failed to exchange code: %w", err)
	}

	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		return nil, false, fmt.Errorf("no id_token in response")
	}

	verifier := s.provider.Verifier(&oidc.Config{ClientID: s.oauth2.ClientID})
	idToken, err := verifier.Verify(ctx, rawIDToken)
	if err != nil {
		return nil, false, fmt.Errorf("failed to verify id_token: %w", err)
	}

	var claims struct {
		Sub   string `json:"sub"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := idToken.Claims(&claims); err != nil {
		return nil, false, err
	}

	// Look up or create user
	user, isNew, err := s.findOrCreateOAuthUser(claims.Sub, claims.Email, claims.Name)
	if err != nil {
		return nil, false, err
	}

	return user, isNew, nil
}

func (s *Service) findOrCreateOAuthUser(sub, email, name string) (*models.User, bool, error) {
	var user models.User
	err := s.db.QueryRow(`
		SELECT id, username, email, role, auth_provider 
		FROM users WHERE oauth_subject = ? AND auth_provider = 'oauth'
	`, sub).Scan(&user.ID, &user.Username, &user.Email, &user.Role, &user.AuthProvider)

	if err == nil {
		// Update last login
		s.db.Exec("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", user.ID)
		return &user, false, nil
	}

	if err != sql.ErrNoRows {
		return nil, false, err
	}

	// New OAuth user — check if first OAuth user (becomes admin)
	var oauthCount int
	s.db.QueryRow("SELECT COUNT(*) FROM users WHERE auth_provider = 'oauth'").Scan(&oauthCount)

	role := models.RoleUser
	if oauthCount == 0 {
		role = models.RoleAdmin
	}

	username := name
	if username == "" {
		username = email
	}

	id := generateRandomString(16)
	_, err = s.db.Exec(`
		INSERT INTO users (id, username, email, role, auth_provider, oauth_subject, last_login)
		VALUES (?, ?, ?, ?, 'oauth', ?, CURRENT_TIMESTAMP)
	`, id, username, email, role, sub)
	if err != nil {
		return nil, false, fmt.Errorf("failed to create oauth user: %w", err)
	}

	user = models.User{
		ID:           id,
		Username:     username,
		Email:        email,
		Role:         role,
		AuthProvider: models.AuthProviderOAuth,
	}

	return &user, true, nil
}

func (s *Service) WriteJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func generateRandomString(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)[:n]
}
