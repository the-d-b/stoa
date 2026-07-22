package handlers

// Central logging levels. Three tiers:
//
//	error (default) — problems only: failed fetches, auth failures, non-2xx
//	                  responses served by Stoa's own API
//	debug           — + cache activity, worker lifecycle, fetch summaries
//	trace           — + every outbound HTTP request (method, URL, status,
//	                  duration) via the shared transport, and every inbound
//	                  request served
//
// The level is set at boot from STOA_LOG_LEVEL (falling back to the
// app_config `log_level` row, then "error") and can be changed live from
// Admin → Settings — one atomic store, no restart.
//
// Call sites keep their existing [COMPONENT] identity:
//
//	logErrorf("CACHE", "refresh error %s: %v", id, err)
//	→ [ERROR] [CACHE] refresh error abc: timeout

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"
)

const (
	logLevelError int32 = iota
	logLevelDebug
	logLevelTrace
)

var logLevel atomic.Int32 // zero value = error

func parseLogLevel(s string) (int32, bool) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "error":
		return logLevelError, true
	case "debug":
		return logLevelDebug, true
	case "trace":
		return logLevelTrace, true
	}
	return logLevelError, false
}

func logLevelName() string {
	switch logLevel.Load() {
	case logLevelTrace:
		return "trace"
	case logLevelDebug:
		return "debug"
	}
	return "error"
}

func logErrorf(component, format string, args ...interface{}) {
	log.Printf("[ERROR] ["+component+"] "+format, args...)
}

func logDebugf(component, format string, args ...interface{}) {
	if logLevel.Load() >= logLevelDebug {
		log.Printf("[DEBUG] ["+component+"] "+format, args...)
	}
}

func logTracef(component, format string, args ...interface{}) {
	if logLevel.Load() >= logLevelTrace {
		log.Printf("[TRACE] ["+component+"] "+format, args...)
	}
}

// InitLogLevel sets the boot log level: STOA_LOG_LEVEL env var wins, then the
// persisted admin setting, then "error". Also installs the tracing transport
// on http.DefaultClient so integrations using it are covered at trace level.
func InitLogLevel(db *sql.DB) {
	source := "default"
	if lvl, ok := parseLogLevel(os.Getenv("STOA_LOG_LEVEL")); ok {
		logLevel.Store(lvl)
		source = "env STOA_LOG_LEVEL"
	} else {
		var stored string
		db.QueryRow("SELECT value FROM app_config WHERE key='log_level'").Scan(&stored)
		if lvl, ok := parseLogLevel(stored); ok && stored != "" {
			logLevel.Store(lvl)
			source = "admin setting"
		}
	}
	http.DefaultClient.Transport = loggingTransport{base: http.DefaultTransport}
	log.Printf("logging at level=%s (%s) — set STOA_LOG_LEVEL or Admin → Settings to change", logLevelName(), source)
}

// ── Admin API ─────────────────────────────────────────────────────────────────

// GET /api/admin/log-config
func GetLogConfig() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"logLevel": logLevelName()})
	}
}

// PUT /api/admin/log-config — applies immediately and persists
func SaveLogConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			LogLevel string `json:"logLevel"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		lvl, ok := parseLogLevel(req.LogLevel)
		if !ok {
			writeError(w, http.StatusBadRequest, "logLevel must be error, debug, or trace")
			return
		}
		logLevel.Store(lvl)
		db.Exec(`INSERT INTO app_config (key, value) VALUES ('log_level', ?)
			ON CONFLICT(key) DO UPDATE SET value=excluded.value`, logLevelName())
		log.Printf("log level set to %s via admin UI", logLevelName())
		writeJSON(w, http.StatusOK, map[string]string{"logLevel": logLevelName()})
	}
}

// ── Outbound HTTP tracing ─────────────────────────────────────────────────────

// loggingTransport logs every outbound request at trace level. Query strings
// are redacted — several integrations carry API keys there.
type loggingTransport struct {
	base http.RoundTripper
}

func (t loggingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if logLevel.Load() < logLevelTrace {
		return t.base.RoundTrip(req)
	}
	target := req.URL.Scheme + "://" + req.URL.Host + req.URL.Path
	if req.URL.RawQuery != "" {
		target += "?…"
	}
	start := time.Now()
	resp, err := t.base.RoundTrip(req)
	dur := time.Since(start).Round(time.Millisecond)
	if err != nil {
		logTracef("HTTP", "%s %s → %v (%s)", req.Method, target, err, dur)
		return resp, err
	}
	logTracef("HTTP", "%s %s → %d (%s)", req.Method, target, resp.StatusCode, dur)
	return resp, err
}

// ── Inbound access log ────────────────────────────────────────────────────────

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// Flush passthrough — SSE streaming depends on it
func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Hijack passthrough for websocket upgrades
func (r *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if h, ok := r.ResponseWriter.(http.Hijacker); ok {
		return h.Hijack()
	}
	return nil, nil, fmt.Errorf("hijack not supported")
}

// AccessLogMiddleware logs 4xx/5xx responses served by Stoa at error level
// and every request at trace level. 3xx is deliberately excluded — OAuth
// login/callback and every other redirect-based flow (YouTube/Twitch/
// Strava/Google/Spotify connect) return 307/302/303 on their normal,
// successful path, not as an error.
func AccessLogMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		start := time.Now()
		next.ServeHTTP(rec, r)
		if rec.status >= 400 {
			logErrorf("API", "%s %s → %d", r.Method, r.URL.Path, rec.status)
		} else {
			logTracef("API", "%s %s → %d (%s)", r.Method, r.URL.Path, rec.status, time.Since(start).Round(time.Millisecond))
		}
	})
}
