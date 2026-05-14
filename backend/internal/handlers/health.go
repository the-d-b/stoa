package handlers

import (
	"database/sql"
	"net/http"
	"runtime"
	"strings"
	"sync"
	"time"
)

var serverStartTime = time.Now()

// ── Integration status tracking ───────────────────────────────────────────────
// Panels and workers can report errors here for surfacing in /api/health

type IntegrationStatus struct {
	IntegrationID     string     `json:"integrationId"`
	IntegrationName   string     `json:"integrationName"`
	Healthy           bool       `json:"healthy"`
	ConsecutiveErrors int        `json:"consecutiveErrors"`
	LastSuccessAt     *time.Time `json:"lastSuccessAt"`
	LastErrorAt       *time.Time `json:"lastErrorAt,omitempty"`
	LastError         string     `json:"lastError,omitempty"`
	ErrorCategory     string     `json:"errorCategory,omitempty"`
}

var (
	integrationErrorsMu sync.Mutex
	integrationStatuses = map[string]IntegrationStatus{} // keyed by integrationId
)

// RecordIntegrationError stores the most recent error for an integration,
// incrementing the consecutive error count.
func RecordIntegrationError(id, name, errMsg string) {
	integrationErrorsMu.Lock()
	defer integrationErrorsMu.Unlock()
	now := time.Now()
	prev := integrationStatuses[id]
	integrationStatuses[id] = IntegrationStatus{
		IntegrationID:     id,
		IntegrationName:   name,
		Healthy:           false,
		ConsecutiveErrors: prev.ConsecutiveErrors + 1,
		LastSuccessAt:     prev.LastSuccessAt,
		LastErrorAt:       &now,
		LastError:         errMsg,
		ErrorCategory:     categorizeError(errMsg),
	}
}

// ClearIntegrationError marks an integration as healthy (call on success).
func ClearIntegrationError(id, name string) {
	integrationErrorsMu.Lock()
	defer integrationErrorsMu.Unlock()
	now := time.Now()
	prev := integrationStatuses[id]
	n := name
	if n == "" {
		n = prev.IntegrationName
	}
	integrationStatuses[id] = IntegrationStatus{
		IntegrationID:   id,
		IntegrationName: n,
		Healthy:         true,
		LastSuccessAt:   &now,
	}
}

func categorizeError(msg string) string {
	s := strings.ToLower(msg)
	if strings.Contains(s, "401") || strings.Contains(s, "unauthorized") ||
		strings.Contains(s, "403") || strings.Contains(s, "forbidden") {
		return "auth"
	}
	if strings.Contains(s, "429") || strings.Contains(s, "rate limit") || strings.Contains(s, "too many") {
		return "rate_limit"
	}
	if strings.Contains(s, "certificate") || strings.Contains(s, "tls") || strings.Contains(s, "x509") {
		return "tls"
	}
	if strings.Contains(s, "connection refused") || strings.Contains(s, "no such host") ||
		strings.Contains(s, "timeout") || strings.Contains(s, "dial ") || strings.Contains(s, "i/o timeout") {
		return "connection"
	}
	return "unknown"
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

		// Integration errors snapshot (only unhealthy entries for backward compat)
		integrationErrorsMu.Lock()
		statuses := make([]IntegrationStatus, 0, len(integrationStatuses))
		for _, s := range integrationStatuses {
			if !s.Healthy {
				statuses = append(statuses, s)
			}
		}
		integrationErrorsMu.Unlock()

		// Memory stats
		var mem runtime.MemStats
		runtime.ReadMemStats(&mem)

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":            "ok",
			"uptime":            time.Since(serverStartTime).Round(time.Second).String(),
			"dbOk":              dbOk,
			"migrationVersion":  migrationVersion,
			"sseClients":        sseClients,
			"onlineUsers":       onlineCount,
			"memMb":             mem.Alloc / 1024 / 1024,
			"integrationErrors": statuses,
		})
	}
}

// ── Integration health endpoint ───────────────────────────────────────────────

type IntegrationHealthItem struct {
	IntegrationID     string     `json:"integrationId"`
	IntegrationName   string     `json:"integrationName"`
	IntegrationType   string     `json:"integrationType"`
	Status            string     `json:"status"` // "healthy" | "error" | "pending"
	ConsecutiveErrors int        `json:"consecutiveErrors"`
	LastSuccessAt     *time.Time `json:"lastSuccessAt"`
	LastErrorAt       *time.Time `json:"lastErrorAt"`
	LastError         string     `json:"lastError"`
	ErrorCategory     string     `json:"errorCategory"`
}

// GetIntegrationHealth returns all enabled integrations with their current
// worker health status. Admin-only route.
func GetIntegrationHealth(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query(`SELECT id, COALESCE(name,''), type FROM integrations WHERE enabled=1 ORDER BY name`)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		defer rows.Close()

		integrationErrorsMu.Lock()
		snapshot := make(map[string]IntegrationStatus, len(integrationStatuses))
		for k, v := range integrationStatuses {
			snapshot[k] = v
		}
		integrationErrorsMu.Unlock()

		var items []IntegrationHealthItem
		for rows.Next() {
			var id, name, igType string
			if err := rows.Scan(&id, &name, &igType); err != nil {
				continue
			}
			item := IntegrationHealthItem{
				IntegrationID:   id,
				IntegrationName: name,
				IntegrationType: igType,
			}
			if s, ok := snapshot[id]; ok {
				if s.Healthy {
					item.Status = "healthy"
				} else {
					item.Status = "error"
				}
				item.ConsecutiveErrors = s.ConsecutiveErrors
				item.LastSuccessAt = s.LastSuccessAt
				item.LastErrorAt = s.LastErrorAt
				item.LastError = s.LastError
				item.ErrorCategory = s.ErrorCategory
			} else {
				item.Status = "pending"
			}
			items = append(items, item)
		}
		if items == nil {
			items = []IntegrationHealthItem{}
		}
		writeJSON(w, http.StatusOK, items)
	}
}
