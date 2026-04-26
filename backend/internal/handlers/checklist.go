package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

func checklistID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)[:16]
}

// ChecklistItem represents a single checklist entry
type ChecklistItem struct {
	ID          string  `json:"id"`
	PanelID     string  `json:"panelId"`
	Text        string  `json:"text"`
	DueDate     *string `json:"dueDate"`
	Completed   bool    `json:"completed"`
	CompletedAt *string `json:"completedAt"`
	CreatedBy   *string `json:"createdBy"`
	CreatedAt   string  `json:"createdAt"`
}

// ListChecklistItems returns all items for a panel, sorted by due_date ASC NULLS LAST, created_at ASC
func ListChecklistItems(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		panelID := mux.Vars(r)["panelId"]
		rows, err := db.Query(`
			SELECT id, panel_id, text, due_date, completed, completed_at, created_by, created_at
			FROM checklist_items
			WHERE panel_id = ?
			ORDER BY due_date ASC NULLS LAST, created_at ASC
		`, panelID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()
		var items []ChecklistItem
		for rows.Next() {
			var item ChecklistItem
			var dueDate, completedAt, createdBy sql.NullString
			var completed int
			rows.Scan(&item.ID, &item.PanelID, &item.Text, &dueDate, &completed,
				&completedAt, &createdBy, &item.CreatedAt)
			item.Completed = completed == 1
			if dueDate.Valid { item.DueDate = &dueDate.String }
			if completedAt.Valid { item.CompletedAt = &completedAt.String }
			if createdBy.Valid { item.CreatedBy = &createdBy.String }
			items = append(items, item)
		}
		if items == nil { items = []ChecklistItem{} }
		writeJSON(w, http.StatusOK, items)
	}
}

// CreateChecklistItem adds a new item to a checklist panel
func CreateChecklistItem(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		panelID := mux.Vars(r)["panelId"]
		var req struct {
			Text    string  `json:"text"`
			DueDate *string `json:"dueDate"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Text == "" {
			writeError(w, http.StatusBadRequest, "text required")
			return
		}
		id := checklistID()
		_, err := db.Exec(`
			INSERT INTO checklist_items (id, panel_id, text, due_date, created_by)
			VALUES (?, ?, ?, ?, ?)
		`, id, panelID, req.Text, req.DueDate, claims.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "insert failed")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"id": id})
	}
}

// UpdateChecklistItem updates text and/or due date of an item
func UpdateChecklistItem(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var req struct {
			Text    string  `json:"text"`
			DueDate *string `json:"dueDate"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Text == "" {
			writeError(w, http.StatusBadRequest, "text required")
			return
		}
		db.Exec(`UPDATE checklist_items SET text=?, due_date=? WHERE id=?`,
			req.Text, req.DueDate, id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ToggleChecklistItem marks an item complete or incomplete
func ToggleChecklistItem(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var req struct {
			Completed bool `json:"completed"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		completedAt := sql.NullString{}
		if req.Completed {
			completedAt = sql.NullString{String: time.Now().UTC().Format(time.RFC3339), Valid: true}
		}
		db.Exec(`UPDATE checklist_items SET completed=?, completed_at=? WHERE id=?`,
			boolToInt(req.Completed), completedAt, id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// DeleteChecklistItem removes an item
func DeleteChecklistItem(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		db.Exec("DELETE FROM checklist_items WHERE id=?", id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
