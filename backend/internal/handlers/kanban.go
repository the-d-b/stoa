package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type KanbanBoard struct {
	ID        string `json:"id"`
	PanelID   string `json:"panelId"`
	Name      string `json:"name"`
	SortOrder int    `json:"sortOrder"`
	CreatedAt string `json:"createdAt"`
	CardCount int    `json:"cardCount"`
	DueSoon   int    `json:"dueSoon"`
	Overdue   int    `json:"overdue"`
}

type KanbanCard struct {
	ID        string `json:"id"`
	BoardID   string `json:"boardId"`
	Title     string `json:"title"`
	Status    string `json:"status"`
	DueDate   string `json:"dueDate,omitempty"`
	Notes     string `json:"notes,omitempty"`
	SortOrder int    `json:"sortOrder"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type KanbanBoardSummary struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CardCount int    `json:"cardCount"`
	DueSoon   int    `json:"dueSoon"`
	Overdue   int    `json:"overdue"`
	SortOrder int    `json:"sortOrder"`
}

type KanbanCardSummary struct {
	ID        string `json:"id"`
	BoardID   string `json:"boardId"`
	BoardName string `json:"boardName"`
	Title     string `json:"title"`
	Status    string `json:"status"`
	DueDate   string `json:"dueDate,omitempty"`
	Notes     string `json:"notes,omitempty"`
}

type KanbanPanelData struct {
	PanelID string               `json:"panelId"`
	Boards  []KanbanBoardSummary `json:"boards"`
	Cards   []KanbanCardSummary  `json:"cards"`
}

// ── Access helpers ────────────────────────────────────────────────────────────

func kanbanPanelAccess(db *sql.DB, panelID, userID string, role models.Role) bool {
	var createdBy string
	if err := db.QueryRow("SELECT created_by FROM panels WHERE id=?", panelID).Scan(&createdBy); err != nil {
		return false
	}
	return role == models.RoleAdmin || createdBy == "SYSTEM" || createdBy == userID
}

func kanbanBoardPanelID(db *sql.DB, boardID string) (string, error) {
	var panelID string
	err := db.QueryRow("SELECT panel_id FROM kanban_boards WHERE id=?", boardID).Scan(&panelID)
	return panelID, err
}

func kanbanCardBoardID(db *sql.DB, cardID string) (string, error) {
	var boardID string
	err := db.QueryRow("SELECT board_id FROM kanban_cards WHERE id=?", cardID).Scan(&boardID)
	return boardID, err
}

// ── Board handlers ────────────────────────────────────────────────────────────

func KanbanListBoards(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		panelID := r.URL.Query().Get("panelId")
		if panelID == "" {
			writeError(w, http.StatusBadRequest, "panelId required")
			return
		}
		if !kanbanPanelAccess(db, panelID, claims.UserID, claims.Role) {
			writeError(w, http.StatusForbidden, "access denied")
			return
		}
		today := time.Now().Format("2006-01-02")
		week := time.Now().AddDate(0, 0, 7).Format("2006-01-02")
		rows, err := db.Query(`
			SELECT kb.id, kb.name, kb.sort_order, kb.created_at,
				COUNT(kc.id),
				COUNT(CASE WHEN kc.due_date >= ? AND kc.due_date <= ?
				           AND kc.status NOT IN ('completed','cancelled') THEN 1 END),
				COUNT(CASE WHEN kc.due_date < ?
				           AND kc.status NOT IN ('completed','cancelled') THEN 1 END)
			FROM kanban_boards kb
			LEFT JOIN kanban_cards kc ON kc.board_id = kb.id
			WHERE kb.panel_id = ?
			GROUP BY kb.id
			ORDER BY kb.sort_order ASC, kb.created_at ASC
		`, today, week, today, panelID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		defer rows.Close()
		boards := []KanbanBoard{}
		for rows.Next() {
			var b KanbanBoard
			rows.Scan(&b.ID, &b.Name, &b.SortOrder, &b.CreatedAt, &b.CardCount, &b.DueSoon, &b.Overdue)
			b.PanelID = panelID
			boards = append(boards, b)
		}
		writeJSON(w, http.StatusOK, boards)
	}
}

func KanbanCreateBoard(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var req struct {
			PanelID string `json:"panelId"`
			Name    string `json:"name"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		if req.PanelID == "" || req.Name == "" {
			writeError(w, http.StatusBadRequest, "panelId and name required")
			return
		}
		if !kanbanPanelAccess(db, req.PanelID, claims.UserID, claims.Role) {
			writeError(w, http.StatusForbidden, "access denied")
			return
		}
		var maxOrder int
		db.QueryRow("SELECT COALESCE(MAX(sort_order),0) FROM kanban_boards WHERE panel_id=?", req.PanelID).Scan(&maxOrder)
		id := generateID()
		if _, err := db.Exec(
			"INSERT INTO kanban_boards (id, panel_id, name, sort_order) VALUES (?,?,?,?)",
			id, req.PanelID, req.Name, maxOrder+1,
		); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, KanbanBoard{ID: id, PanelID: req.PanelID, Name: req.Name, SortOrder: maxOrder + 1})
	}
}

func KanbanUpdateBoard(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		panelID, err := kanbanBoardPanelID(db, id)
		if err != nil {
			writeError(w, http.StatusNotFound, "board not found")
			return
		}
		if !kanbanPanelAccess(db, panelID, claims.UserID, claims.Role) {
			writeError(w, http.StatusForbidden, "access denied")
			return
		}
		var req struct {
			Name      string `json:"name"`
			SortOrder *int   `json:"sortOrder"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		if req.Name == "" {
			writeError(w, http.StatusBadRequest, "name required")
			return
		}
		if req.SortOrder != nil {
			db.Exec("UPDATE kanban_boards SET name=?, sort_order=? WHERE id=?", req.Name, *req.SortOrder, id)
		} else {
			db.Exec("UPDATE kanban_boards SET name=? WHERE id=?", req.Name, id)
		}
		writeJSON(w, http.StatusOK, map[string]string{"id": id})
	}
}

func KanbanDeleteBoard(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		panelID, err := kanbanBoardPanelID(db, id)
		if err != nil {
			writeError(w, http.StatusNotFound, "board not found")
			return
		}
		if !kanbanPanelAccess(db, panelID, claims.UserID, claims.Role) {
			writeError(w, http.StatusForbidden, "access denied")
			return
		}
		db.Exec("DELETE FROM kanban_cards WHERE board_id=?", id)
		db.Exec("DELETE FROM kanban_boards WHERE id=?", id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Card handlers ─────────────────────────────────────────────────────────────

func KanbanListCards(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		boardID := mux.Vars(r)["boardId"]
		panelID, err := kanbanBoardPanelID(db, boardID)
		if err != nil {
			writeError(w, http.StatusNotFound, "board not found")
			return
		}
		if !kanbanPanelAccess(db, panelID, claims.UserID, claims.Role) {
			writeError(w, http.StatusForbidden, "access denied")
			return
		}
		rows, err := db.Query(`
			SELECT id, board_id, title, status,
			       COALESCE(due_date,''), COALESCE(notes,''),
			       sort_order, created_at, updated_at
			FROM kanban_cards
			WHERE board_id=?
			ORDER BY status ASC, sort_order ASC, created_at ASC
		`, boardID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		defer rows.Close()
		cards := []KanbanCard{}
		for rows.Next() {
			var c KanbanCard
			rows.Scan(&c.ID, &c.BoardID, &c.Title, &c.Status, &c.DueDate, &c.Notes, &c.SortOrder, &c.CreatedAt, &c.UpdatedAt)
			cards = append(cards, c)
		}
		writeJSON(w, http.StatusOK, cards)
	}
}

func KanbanCreateCard(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		boardID := mux.Vars(r)["boardId"]
		panelID, err := kanbanBoardPanelID(db, boardID)
		if err != nil {
			writeError(w, http.StatusNotFound, "board not found")
			return
		}
		if !kanbanPanelAccess(db, panelID, claims.UserID, claims.Role) {
			writeError(w, http.StatusForbidden, "access denied")
			return
		}
		var req struct {
			Title   string `json:"title"`
			Status  string `json:"status"`
			DueDate string `json:"dueDate"`
			Notes   string `json:"notes"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		if req.Title == "" {
			writeError(w, http.StatusBadRequest, "title required")
			return
		}
		if req.Status == "" {
			req.Status = "not_started"
		}
		var maxOrder int
		db.QueryRow("SELECT COALESCE(MAX(sort_order),0) FROM kanban_cards WHERE board_id=? AND status=?", boardID, req.Status).Scan(&maxOrder)
		id := generateID()
		now := time.Now().UTC().Format(time.RFC3339)
		var dueDate, notes interface{}
		if req.DueDate != "" {
			dueDate = req.DueDate
		}
		if req.Notes != "" {
			notes = req.Notes
		}
		if _, err := db.Exec(
			`INSERT INTO kanban_cards (id,board_id,title,status,due_date,notes,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
			id, boardID, req.Title, req.Status, dueDate, notes, maxOrder+1, now, now,
		); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, KanbanCard{
			ID: id, BoardID: boardID, Title: req.Title, Status: req.Status,
			DueDate: req.DueDate, Notes: req.Notes, SortOrder: maxOrder + 1,
			CreatedAt: now, UpdatedAt: now,
		})
	}
}

func KanbanUpdateCard(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		boardID, err := kanbanCardBoardID(db, id)
		if err != nil {
			writeError(w, http.StatusNotFound, "card not found")
			return
		}
		panelID, err := kanbanBoardPanelID(db, boardID)
		if err != nil {
			writeError(w, http.StatusNotFound, "board not found")
			return
		}
		if !kanbanPanelAccess(db, panelID, claims.UserID, claims.Role) {
			writeError(w, http.StatusForbidden, "access denied")
			return
		}
		var req struct {
			Title     string `json:"title"`
			Status    string `json:"status"`
			DueDate   string `json:"dueDate"`
			Notes     string `json:"notes"`
			SortOrder *int   `json:"sortOrder"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		if req.Title == "" {
			writeError(w, http.StatusBadRequest, "title required")
			return
		}
		now := time.Now().UTC().Format(time.RFC3339)
		var dueDate, notes interface{}
		if req.DueDate != "" {
			dueDate = req.DueDate
		}
		if req.Notes != "" {
			notes = req.Notes
		}
		if req.SortOrder != nil {
			db.Exec(`UPDATE kanban_cards SET title=?,status=?,due_date=?,notes=?,sort_order=?,updated_at=? WHERE id=?`,
				req.Title, req.Status, dueDate, notes, *req.SortOrder, now, id)
		} else {
			db.Exec(`UPDATE kanban_cards SET title=?,status=?,due_date=?,notes=?,updated_at=? WHERE id=?`,
				req.Title, req.Status, dueDate, notes, now, id)
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func KanbanDeleteCard(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		boardID, err := kanbanCardBoardID(db, id)
		if err != nil {
			writeError(w, http.StatusNotFound, "card not found")
			return
		}
		panelID, err := kanbanBoardPanelID(db, boardID)
		if err != nil {
			writeError(w, http.StatusNotFound, "board not found")
			return
		}
		if !kanbanPanelAccess(db, panelID, claims.UserID, claims.Role) {
			writeError(w, http.StatusForbidden, "access denied")
			return
		}
		db.Exec("DELETE FROM kanban_cards WHERE id=?", id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func KanbanReorderCards(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		boardID := mux.Vars(r)["boardId"]
		panelID, err := kanbanBoardPanelID(db, boardID)
		if err != nil {
			writeError(w, http.StatusNotFound, "board not found")
			return
		}
		if !kanbanPanelAccess(db, panelID, claims.UserID, claims.Role) {
			writeError(w, http.StatusForbidden, "access denied")
			return
		}
		var req struct {
			Cards []struct {
				ID        string `json:"id"`
				SortOrder int    `json:"sortOrder"`
				Status    string `json:"status"`
			} `json:"cards"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		now := time.Now().UTC().Format(time.RFC3339)
		for _, item := range req.Cards {
			db.Exec(`UPDATE kanban_cards SET sort_order=?,status=?,updated_at=? WHERE id=? AND board_id=?`,
				item.SortOrder, item.Status, now, item.ID, boardID)
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Search ────────────────────────────────────────────────────────────────────

func KanbanSearch(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		q := r.URL.Query().Get("q")
		if q == "" {
			writeJSON(w, http.StatusOK, []interface{}{})
			return
		}
		like := "%" + q + "%"
		var rows *sql.Rows
		var err error
		if claims.Role == models.RoleAdmin {
			rows, err = db.Query(`
				SELECT kc.id, kc.board_id, kb.id, kb.name, kc.title,
				       COALESCE(kc.notes,''), kc.status, COALESCE(kc.due_date,''),
				       p.id, p.title
				FROM kanban_cards kc
				JOIN kanban_boards kb ON kc.board_id=kb.id
				JOIN panels p ON kb.panel_id=p.id
				WHERE kc.title LIKE ? OR kc.notes LIKE ?
				ORDER BY kc.updated_at DESC LIMIT 20
			`, like, like)
		} else {
			rows, err = db.Query(`
				SELECT kc.id, kc.board_id, kb.id, kb.name, kc.title,
				       COALESCE(kc.notes,''), kc.status, COALESCE(kc.due_date,''),
				       p.id, p.title
				FROM kanban_cards kc
				JOIN kanban_boards kb ON kc.board_id=kb.id
				JOIN panels p ON kb.panel_id=p.id
				WHERE (kc.title LIKE ? OR kc.notes LIKE ?)
				  AND (p.created_by='SYSTEM' OR p.created_by=?)
				ORDER BY kc.updated_at DESC LIMIT 20
			`, like, like, claims.UserID)
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		defer rows.Close()
		type Result struct {
			ID         string `json:"id"`
			BoardID    string `json:"boardId"`
			BoardRefID string `json:"boardRefId"`
			BoardName  string `json:"boardName"`
			Title      string `json:"title"`
			Notes      string `json:"notes,omitempty"`
			Status     string `json:"status"`
			DueDate    string `json:"dueDate,omitempty"`
			PanelID    string `json:"panelId"`
			PanelTitle string `json:"panelTitle"`
		}
		results := []Result{}
		for rows.Next() {
			var r Result
			rows.Scan(&r.ID, &r.BoardID, &r.BoardRefID, &r.BoardName, &r.Title, &r.Notes, &r.Status, &r.DueDate, &r.PanelID, &r.PanelTitle)
			results = append(results, r)
		}
		writeJSON(w, http.StatusOK, results)
	}
}

// ── Panel data fetcher ────────────────────────────────────────────────────────

func fetchKanbanPanelData(db *sql.DB, config map[string]interface{}) (*KanbanPanelData, error) {
	panelID, _ := config["_panelId"].(string)
	if panelID == "" {
		return nil, fmt.Errorf("kanban: panelId required")
	}
	today := time.Now().Format("2006-01-02")
	week := time.Now().AddDate(0, 0, 7).Format("2006-01-02")

	brows, err := db.Query(`
		SELECT kb.id, kb.name, kb.sort_order,
			COUNT(kc.id),
			COUNT(CASE WHEN kc.due_date >= ? AND kc.due_date <= ?
			           AND kc.status NOT IN ('completed','cancelled') THEN 1 END),
			COUNT(CASE WHEN kc.due_date < ?
			           AND kc.status NOT IN ('completed','cancelled') THEN 1 END)
		FROM kanban_boards kb
		LEFT JOIN kanban_cards kc ON kc.board_id=kb.id
		WHERE kb.panel_id=?
		GROUP BY kb.id
		ORDER BY kb.sort_order ASC, kb.created_at ASC
	`, today, week, today, panelID)
	if err != nil {
		return nil, err
	}
	defer brows.Close()
	boards := []KanbanBoardSummary{}
	boardNames := map[string]string{}
	for brows.Next() {
		var b KanbanBoardSummary
		brows.Scan(&b.ID, &b.Name, &b.SortOrder, &b.CardCount, &b.DueSoon, &b.Overdue)
		boards = append(boards, b)
		boardNames[b.ID] = b.Name
	}

	crows, err := db.Query(`
		SELECT kc.id, kc.board_id, kc.title, kc.status,
		       COALESCE(kc.due_date,''), COALESCE(kc.notes,'')
		FROM kanban_cards kc
		JOIN kanban_boards kb ON kc.board_id=kb.id
		WHERE kb.panel_id=?
	`, panelID)
	if err != nil {
		return nil, err
	}
	defer crows.Close()
	cards := []KanbanCardSummary{}
	for crows.Next() {
		var c KanbanCardSummary
		crows.Scan(&c.ID, &c.BoardID, &c.Title, &c.Status, &c.DueDate, &c.Notes)
		c.BoardName = boardNames[c.BoardID]
		cards = append(cards, c)
	}
	return &KanbanPanelData{PanelID: panelID, Boards: boards, Cards: cards}, nil
}
