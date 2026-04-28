package handlers

import (
	"database/sql"
	"net/http"
	"runtime"
	"sync"
	"time"
)

var serverStartTime = time.Now()

// ── Integration error tracking ────────────────────────────────────────────────
// Panels and workers can report errors here for surfacing in /api/health

type integrationError struct {
	IntegrationID   string    `json:"integrationId"`
	IntegrationName string    `json:"integrationName"`
	Error           string    `json:"error"`
	OccurredAt      time.Time `json:"occurredAt"`
}

var (
	integrationErrorsMu sync.Mutex
	integrationErrors   = map[string]integrationError{} // keyed by integrationId
)

// RecordIntegrationError stores the most recent error for an integration.
// Call this from workers/handlers when a fetch fails.
func RecordIntegrationError(id, name, errMsg string) {
	integrationErrorsMu.Lock()
	defer integrationErrorsMu.Unlock()
	integrationErrors[id] = integrationError{
		IntegrationID:   id,
		IntegrationName: name,
		Error:           errMsg,
		OccurredAt:      time.Now(),
	}
}

// ClearIntegrationError removes the error record for an integration (call on success).
func ClearIntegrationError(id string) {
	integrationErrorsMu.Lock()
	defer integrationErrorsMu.Unlock()
	delete(integrationErrors, id)
}

// ── Health handler ────────────────────────────────────────────────────────────

func HealthCheck(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// DB connectivity + migration version
		var dbOk bool
		var migrationVersion int
		if err := db.QueryRow("SELECT MAX(version) FROM schema_migrations").Scan(&migrationVersion); err == nil {
			dbOk = true
		}

		// Active SSE connections
		sseMu.RLock()
		sseClients := len(sseClients)
		sseMu.RUnlock()

		// Online users
		onlineUsersMu.Lock()
		onlineCount := len(onlineUsers)
		onlineUsersMu.Unlock()

		// Integration errors snapshot
		integrationErrorsMu.Lock()
		errs := make([]integrationError, 0, len(integrationErrors))
		for _, e := range integrationErrors {
			errs = append(errs, e)
		}
		integrationErrorsMu.Unlock()

		// Memory stats
		var mem runtime.MemStats
		runtime.ReadMemStats(&mem)

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":           "ok",
			"uptime":           time.Since(serverStartTime).Round(time.Second).String(),
			"dbOk":             dbOk,
			"migrationVersion": migrationVersion,
			"sseClients":       sseClients,
			"onlineUsers":      onlineCount,
			"memMb":            mem.Alloc / 1024 / 1024,
			"integrationErrors": errs,
		})
	}
}
