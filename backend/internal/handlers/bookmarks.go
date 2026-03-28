package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

// ── Bookmark Tree ─────────────────────────────────────────────────────────────

func ListBookmarkTree(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Get all nodes
		rows, err := db.Query(`
			SELECT id, COALESCE(parent_id,''), path, name, type,
			       COALESCE(url,''), COALESCE(icon_url,''), sort_order, scope, created_at
			FROM bookmark_nodes ORDER BY path ASC
		`)
		if err != nil {
			log.Printf("[BOOKMARKS] list error: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to query bookmarks")
			return
		}
		defer rows.Close()

		nodeMap := map[string]*models.BookmarkNode{}
		var roots []*models.BookmarkNode

		for rows.Next() {
			n := &models.BookmarkNode{Children: []*models.BookmarkNode{}}
			rows.Scan(&n.ID, &n.ParentID, &n.Path, &n.Name, &n.Type,
				&n.URL, &n.IconURL, &n.SortOrder, &n.Scope, &n.CreatedAt)
			nodeMap[n.ID] = n
		}

		// Build tree
		for _, n := range nodeMap {
			if n.ParentID == "" {
				roots = append(roots, n)
			} else if parent, ok := nodeMap[n.ParentID]; ok {
				parent.Children = append(parent.Children, n)
			}
		}

		writeJSON(w, http.StatusOK, roots)
	}
}

func GetBookmarkNode(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var n models.BookmarkNode
		err := db.QueryRow(`
			SELECT id, COALESCE(parent_id,''), path, name, type,
			       COALESCE(url,''), COALESCE(icon_url,''), sort_order, scope, created_at
			FROM bookmark_nodes WHERE id = ?
		`, id).Scan(&n.ID, &n.ParentID, &n.Path, &n.Name, &n.Type,
			&n.URL, &n.IconURL, &n.SortOrder, &n.Scope, &n.CreatedAt)
		if err != nil {
			writeError(w, http.StatusNotFound, "node not found")
			return
		}
		writeJSON(w, http.StatusOK, n)
	}
}

func CreateBookmarkNode(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)

		var req models.CreateNodeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
			writeError(w, http.StatusBadRequest, "name required")
			return
		}
		if req.Type != models.NodeSection && req.Type != models.NodeBookmark {
			writeError(w, http.StatusBadRequest, "type must be section or bookmark")
			return
		}
		if req.Type == models.NodeBookmark && req.URL == "" {
			writeError(w, http.StatusBadRequest, "url required for bookmark")
			return
		}

		// Determine path and depth
		var parentPath string
		var depth int
		if req.ParentID != "" {
			err := db.QueryRow("SELECT path FROM bookmark_nodes WHERE id = ?", req.ParentID).Scan(&parentPath)
			if err != nil {
				writeError(w, http.StatusBadRequest, "parent not found")
				return
			}
			depth = strings.Count(parentPath, "/")
			if depth >= 5 {
				writeError(w, http.StatusBadRequest, "maximum tree depth of 5 reached")
				return
			}
		}

		slug := slugify(req.Name)
		var path string
		if parentPath == "" {
			path = "/" + slug
		} else {
			path = parentPath + "/" + slug
		}

		// Ensure unique path
		path = uniquePath(db, path)

		// Scrape favicon if bookmark and no icon provided
		iconURL := req.IconURL
		if req.Type == models.NodeBookmark && iconURL == "" && req.URL != "" {
			iconURL = scrapeFavicon(req.URL)
		}

		id := generateID()
		var parentIDVal interface{}
		if req.ParentID != "" {
			parentIDVal = req.ParentID
		}

		_, err := db.Exec(`
			INSERT INTO bookmark_nodes (id, parent_id, path, name, type, url, icon_url, sort_order, scope, created_by)
			VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'shared', ?)
		`, id, parentIDVal, path, req.Name, req.Type, nullStr(req.URL), nullStr(iconURL), claims.UserID)
		if err != nil {
			log.Printf("[BOOKMARKS] create error: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to create node")
			return
		}

		node := models.BookmarkNode{
			ID: id, ParentID: req.ParentID, Path: path,
			Name: req.Name, Type: req.Type, URL: req.URL,
			IconURL: iconURL, Scope: models.ScopeShared, CreatedAt: time.Now(),
		}
		writeJSON(w, http.StatusCreated, node)
	}
}

func UpdateBookmarkNode(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var req models.UpdateNodeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}

		_, err := db.Exec(`
			UPDATE bookmark_nodes SET name=?, url=?, icon_url=?, sort_order=?
			WHERE id=?
		`, req.Name, nullStr(req.URL), nullStr(req.IconURL), req.SortOrder, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update node")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func DeleteBookmarkNode(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		// ON DELETE CASCADE handles children
		db.Exec("DELETE FROM bookmark_nodes WHERE id = ?", id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func GetSubtree(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]

		var rootPath string
		err := db.QueryRow("SELECT path FROM bookmark_nodes WHERE id = ?", id).Scan(&rootPath)
		if err != nil {
			writeError(w, http.StatusNotFound, "node not found")
			return
		}

		rows, err := db.Query(`
			SELECT id, COALESCE(parent_id,''), path, name, type,
			       COALESCE(url,''), COALESCE(icon_url,''), sort_order, scope, created_at
			FROM bookmark_nodes
			WHERE path = ? OR path LIKE ?
			ORDER BY path ASC
		`, rootPath, rootPath+"/%")
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query subtree")
			return
		}
		defer rows.Close()

		nodeMap := map[string]*models.BookmarkNode{}
		var root *models.BookmarkNode

		for rows.Next() {
			n := &models.BookmarkNode{Children: []*models.BookmarkNode{}}
			rows.Scan(&n.ID, &n.ParentID, &n.Path, &n.Name, &n.Type,
				&n.URL, &n.IconURL, &n.SortOrder, &n.Scope, &n.CreatedAt)
			nodeMap[n.ID] = n
			if n.ID == id {
				root = n
			}
		}

		for _, n := range nodeMap {
			if n.ID == id {
				continue
			}
			if parent, ok := nodeMap[n.ParentID]; ok {
				parent.Children = append(parent.Children, n)
			}
		}

		writeJSON(w, http.StatusOK, root)
	}
}

func ScrapeFaviconHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		targetURL := r.URL.Query().Get("url")
		if targetURL == "" {
			writeError(w, http.StatusBadRequest, "url required")
			return
		}
		icon := scrapeFavicon(targetURL)
		writeJSON(w, http.StatusOK, map[string]string{"iconUrl": icon})
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func slugify(s string) string {
	s = strings.ToLower(s)
	s = strings.ReplaceAll(s, " ", "-")
	var result strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			result.WriteRune(r)
		}
	}
	return result.String()
}

func uniquePath(db *sql.DB, path string) string {
	var count int
	db.QueryRow("SELECT COUNT(*) FROM bookmark_nodes WHERE path = ?", path).Scan(&count)
	if count == 0 {
		return path
	}
	for i := 2; i < 100; i++ {
		candidate := fmt.Sprintf("%s-%d", path, i)
		db.QueryRow("SELECT COUNT(*) FROM bookmark_nodes WHERE path = ?", candidate).Scan(&count)
		if count == 0 {
			return candidate
		}
	}
	return path + "-" + generateID()[:4]
}

func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func scrapeFavicon(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	base := fmt.Sprintf("%s://%s", parsed.Scheme, parsed.Host)
	faviconURL := base + "/favicon.ico"

	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(faviconURL)
	if err != nil || resp.StatusCode != 200 {
		return tryGoogleFavicon(parsed.Host)
	}
	defer resp.Body.Close()

	contentType := resp.Header.Get("Content-Type")
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil || len(body) < 10 {
		return tryGoogleFavicon(parsed.Host)
	}

	// Check it looks like an image
	if strings.Contains(contentType, "image") || strings.Contains(contentType, "icon") {
		return faviconURL
	}

	return tryGoogleFavicon(parsed.Host)
}

func tryGoogleFavicon(host string) string {
	return fmt.Sprintf("https://www.google.com/s2/favicons?domain=%s&sz=64", host)
}
