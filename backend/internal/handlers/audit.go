package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
)

// AuditEntry is the response shape for the audit log API.
type AuditEntry struct {
	ID         string  `json:"id"`
	ActorID    *string `json:"actorId"`
	ActorName  string  `json:"actorName"`
	Action     string  `json:"action"`
	TargetID   *string `json:"targetId"`
	TargetName string  `json:"targetName"`
	Metadata   *string `json:"metadata"`
	CreatedAt  string  `json:"createdAt"`
}

// RecordAudit inserts one row into audit_log. Errors are logged but never
// returned — a logging failure must never abort the real operation.
func RecordAudit(db *sql.DB, actorID, actorName, action, targetID, targetName string, meta map[string]string) {
	id := generateID()
	var metaJSON *string
	if len(meta) > 0 {
		b, _ := json.Marshal(meta)
		s := string(b)
		metaJSON = &s
	}
	if _, err := db.Exec(`
		INSERT INTO audit_log (id, actor_id, actor_name, action, target_id, target_name, metadata)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, id, nullStr(actorID), actorName, action, nullStr(targetID), targetName, metaJSON); err != nil {
		log.Printf("[AUDIT] failed to record %s: %v", action, err)
	}
}

// GetAuditLog returns up to 500 audit entries newest-first.
// Optional ?action= query param filters by action prefix (e.g. "auth.").
// Admin-only — enforced by the admin subrouter middleware.
func GetAuditLog(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		actionPrefix := r.URL.Query().Get("action")

		var rows *sql.Rows
		var err error
		if actionPrefix != "" {
			rows, err = db.Query(`
				SELECT id, actor_id, actor_name, action, target_id, target_name, metadata, created_at
				FROM audit_log WHERE action LIKE ?
				ORDER BY created_at DESC LIMIT 500
			`, actionPrefix+"%")
		} else {
			rows, err = db.Query(`
				SELECT id, actor_id, actor_name, action, target_id, target_name, metadata, created_at
				FROM audit_log ORDER BY created_at DESC LIMIT 500
			`)
		}
		if err != nil {
			log.Printf("[AUDIT] query error: %v", err)
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()

		entries := []AuditEntry{}
		for rows.Next() {
			var e AuditEntry
			var actorID, targetID, metadata sql.NullString
			rows.Scan(&e.ID, &actorID, &e.ActorName, &e.Action, &targetID, &e.TargetName, &metadata, &e.CreatedAt)
			if actorID.Valid {
				e.ActorID = &actorID.String
			}
			if targetID.Valid {
				e.TargetID = &targetID.String
			}
			if metadata.Valid {
				e.Metadata = &metadata.String
			}
			entries = append(entries, e)
		}
		writeJSON(w, http.StatusOK, entries)
	}
}
