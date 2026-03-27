package config

import (
	"os"
	"strings"
)

type Config struct {
	DBPath         string
	Port           string
	FrontendPath   string
	SessionSecret  string
	AllowedOrigins []string

	// OAuth - loaded from DB at runtime, env vars as fallback
	OAuthClientID     string
	OAuthClientSecret string
	OAuthIssuerURL    string
	OAuthRedirectURL  string
}

func Load() *Config {
	cfg := &Config{
		DBPath:       getEnv("STOA_DB_PATH", "/data/db/stoa.db"),
		Port:         getEnv("STOA_PORT", "8080"),
		FrontendPath: getEnv("STOA_FRONTEND_PATH", "/app/frontend/dist"),
		SessionSecret: getEnv("STOA_SESSION_SECRET", ""),
		AllowedOrigins: strings.Split(
			getEnv("STOA_ALLOWED_ORIGINS", "http://localhost:3000"),
			",",
		),
		OAuthClientID:     getEnv("STOA_OAUTH_CLIENT_ID", ""),
		OAuthClientSecret: getEnv("STOA_OAUTH_CLIENT_SECRET", ""),
		OAuthIssuerURL:    getEnv("STOA_OAUTH_ISSUER_URL", ""),
		OAuthRedirectURL:  getEnv("STOA_OAUTH_REDIRECT_URL", ""),
	}
	return cfg
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
