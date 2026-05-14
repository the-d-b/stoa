package handlers

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

type SearchResult struct {
	Type    string `json:"type"`    // "note" | "checklist"
	ID      string `json:"id"`
	Title   string `json:"title"`
	Excerpt string `json:"excerpt,omitempty"`
	URL     string `json:"url,omitempty"`     // for bookmarks
	IconURL string `json:"iconUrl,omitempty"` // for bookmarks
	PanelID   string `json:"panelId,omitempty"`
	PorticoID string `json:"porticoId,omitempty"`
	Path      string `json:"path,omitempty"`
}

func Search(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if q == "" {
			writeJSON(w, http.StatusOK, []SearchResult{})
			return
		}
		like := "%" + q + "%"
		var results []SearchResult


				// ── Notes (user's own panels only) ────────────────────────────────────
		noteRows, err := db.Query(`
			SELECT n.id, n.title, SUBSTR(n.body, 1, 120), p.id,
				COALESCE((SELECT ppp.portico_id FROM personal_panel_porticos ppp WHERE ppp.panel_id = p.id LIMIT 1), 'home')
			FROM notes n
			JOIN panels p ON p.id = n.panel_id
			WHERE (n.title LIKE ? OR n.body LIKE ?)
			AND (p.created_by = ? OR p.created_by = 'SYSTEM')
			LIMIT 5
		`, like, like, claims.UserID)
		if err == nil {
			defer noteRows.Close()
			for noteRows.Next() {
				var id, title, excerpt, panelID, porticoID string
				noteRows.Scan(&id, &title, &excerpt, &panelID, &porticoID)
				results = append(results, SearchResult{
					Type:      "note",
					ID:        id,
					Title:     title,
					Excerpt:   strings.TrimSpace(excerpt),
					PanelID:   panelID,
					PorticoID: porticoID,
				})
			}
		}

		// ── Checklist items ───────────────────────────────────────────────────
		checkRows, err := db.Query(`
			SELECT ci.id, ci.text, p.id, p.title
			FROM checklist_items ci
			JOIN panels p ON p.id = ci.panel_id
			WHERE ci.text LIKE ?
			AND (p.created_by = ? OR p.created_by = 'SYSTEM' OR ci.created_by = ?)
			LIMIT 5
		`, like, claims.UserID, claims.UserID)
		if err == nil {
			defer checkRows.Close()
			for checkRows.Next() {
				var id, text, panelID, panelTitle string
				checkRows.Scan(&id, &text, &panelID, &panelTitle)
				results = append(results, SearchResult{
					Type:    "checklist",
					ID:      id,
					Title:   text,
					PanelID: panelID,
					Path:    panelTitle,
				})
			}
		}

		if results == nil {
			results = []SearchResult{}
		}
		writeJSON(w, http.StatusOK, results)
	}
}
