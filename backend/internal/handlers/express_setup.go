package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

// ExpressSetupStatus returns the integration types that are already configured.
func ExpressSetupStatus(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query("SELECT DISTINCT type FROM integrations")
		if err != nil {
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()
		types := []string{}
		for rows.Next() {
			var t string
			rows.Scan(&t)
			types = append(types, t)
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"existingTypes": types,
		})
	}
}

type expressServiceInput struct {
	Type        string `json:"type"`
	Label       string `json:"label"`
	SecretName  string `json:"secretName"`
	APIKey      string `json:"apiKey"`
	APIURL      string `json:"apiUrl"`
	NeedsKey    bool   `json:"needsKey"`
	NeedsURL    bool   `json:"needsUrl"`
	CreatePanel bool   `json:"createPanel"`
}

// ExpressSetupRun bulk-creates secrets, integrations, and panels from wizard input.
func ExpressSetupRun(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)

		var req struct {
			PanelHeight int                   `json:"panelHeight"`
			Services    []expressServiceInput `json:"services"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		if req.PanelHeight < 1 {
			req.PanelHeight = 3
		}

		// Determine ownerID: SYSTEM in multi-user mode, actual user in single-user mode
		ownerID := "SYSTEM"
		var userMode string
		db.QueryRow("SELECT value FROM app_config WHERE key='user_mode'").Scan(&userMode)
		if userMode == "single" {
			ownerID = claims.UserID
		}

		// Existing integration types — skip to avoid duplicates
		existing := map[string]bool{}
		if rows, err := db.Query("SELECT DISTINCT type FROM integrations"); err == nil {
			defer rows.Close()
			for rows.Next() {
				var t string
				rows.Scan(&t)
				existing[t] = true
			}
		}

		type resultEntry struct {
			Type    string `json:"type"`
			Created bool   `json:"created"`
			Skipped bool   `json:"skipped"`
			Error   string `json:"error,omitempty"`
		}
		results := []resultEntry{}

		for _, svc := range req.Services {
			if strings.TrimSpace(svc.Type) == "" {
				continue
			}
			if svc.NeedsKey && strings.TrimSpace(svc.APIKey) == "" {
				continue
			}
			if svc.NeedsURL && strings.TrimSpace(svc.APIURL) == "" {
				continue
			}
			if existing[svc.Type] {
				results = append(results, resultEntry{Type: svc.Type, Skipped: true})
				continue
			}

			entry := resultEntry{Type: svc.Type}
			integID, err := createExpressBundle(db, svc, req.PanelHeight, ownerID)
			if err != nil {
				logErrorf("EXPRESS SETUP", "%s error: %v", svc.Type, err)
				entry.Error = err.Error()
			} else {
				entry.Created = true
				if integID != "" {
					go StartWorkerForIntegration(db, integID)
				}
			}
			results = append(results, entry)
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{"results": results})
	}
}

// createExpressBundle creates a secret + integration + panel for a single service.
// Returns the integration ID (empty for key-only services).
func createExpressBundle(db *sql.DB, svc expressServiceInput, height int, ownerID string) (string, error) {
	var secretID interface{}

	// Step 1: create secret (if the service has an API key)
	if strings.TrimSpace(svc.APIKey) != "" {
		enc, err := encryptSecret(strings.TrimSpace(svc.APIKey))
		if err != nil {
			return "", fmt.Errorf("encrypt secret: %w", err)
		}
		sid := generateID()
		scope := "shared"
		if ownerID != "SYSTEM" {
			scope = "personal"
		}
		secretName := svc.SecretName
		if secretName == "" {
			secretName = svc.Label + " API Key"
		}
		if _, err := db.Exec(
			`INSERT INTO secrets (id, name, value, scope, created_by) VALUES (?, ?, ?, ?, ?)`,
			sid, secretName, enc, scope, ownerID,
		); err != nil {
			return "", fmt.Errorf("create secret: %w", err)
		}
		secretID = sid
	}

	apiURL := strings.TrimSpace(svc.APIURL)
	if apiURL == "" {
		// Key-only service (no URL needed) — done after secret creation
		return "", nil
	}

	// Step 2: create integration (URL used for both api_url and ui_url)
	iid := generateID()
	refresh := defaultRefreshSecs(svc.Type)
	if _, err := db.Exec(
		`INSERT INTO integrations (id, name, type, api_url, ui_url, secret_id, enabled, skip_tls, refresh_secs, created_by)
		 VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
		iid, svc.Label, svc.Type, apiURL, apiURL,
		secretID, refresh, ownerID,
	); err != nil {
		return "", fmt.Errorf("create integration: %w", err)
	}

	// Step 3: create panel
	if svc.CreatePanel {
		pid := generateID()
		cfg, _ := json.Marshal(map[string]interface{}{
			"integrationId": iid,
			"height":        height,
		})
		if _, err := db.Exec(
			`INSERT INTO panels (id, type, title, config, created_by) VALUES (?, ?, ?, ?, ?)`,
			pid, svc.Type, svc.Label, string(cfg), ownerID,
		); err != nil {
			return iid, fmt.Errorf("create panel: %w", err)
		}
	}

	return iid, nil
}
