package logger

import (
	"log"
	"net/http"
	"strings"
)

// Auth events
func LoginSuccess(r *http.Request, username, provider string) {
	log.Printf("[AUTH] login_success provider=%s user=%q ip=%s", provider, username, clientIP(r))
}

func LoginFailure(r *http.Request, username, reason string) {
	log.Printf("[AUTH] login_failure user=%q reason=%s ip=%s", username, reason, clientIP(r))
}

func OAuthSuccess(r *http.Request, username string, isNew bool) {
	log.Printf("[AUTH] oauth_success user=%q new_user=%v ip=%s", username, isNew, clientIP(r))
}

func OAuthFailure(r *http.Request, stage, detail string) {
	log.Printf("[AUTH] oauth_failure stage=%s detail=%s ip=%s", stage, detail, clientIP(r))
}

func Logout(r *http.Request, username string) {
	log.Printf("[AUTH] logout user=%q ip=%s", username, clientIP(r))
}

// Setup events
func SetupComplete(username string) {
	log.Printf("[SETUP] setup_complete admin_user=%q", username)
}

// General helpers
func clientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		return strings.Split(fwd, ",")[0]
	}
	if real := r.Header.Get("X-Real-IP"); real != "" {
		return real
	}
	return r.RemoteAddr
}
