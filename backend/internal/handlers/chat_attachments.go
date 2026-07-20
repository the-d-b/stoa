package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

type ChatAttachment struct {
	ID           string `json:"id"`
	OriginalName string `json:"originalName"`
	MimeType     string `json:"mimeType"`
	Size         int64  `json:"size"`
	Source       string `json:"source"`
	SourceURL    string `json:"sourceUrl,omitempty"`
	URL          string `json:"url"`
}

func chatAttachmentURL(id string) string { return "/api/chat/attachments/" + id }

func isImageMime(mimeType string) bool { return strings.HasPrefix(mimeType, "image/") }

func getAttachmentMaxMB(db *sql.DB) int64 {
	var val string
	db.QueryRow(`SELECT value FROM app_config WHERE key = 'chat_attachment_max_mb'`).Scan(&val)
	if val == "" {
		return 10
	}
	n, err := strconv.ParseInt(val, 10, 64)
	if err != nil || n <= 0 {
		return 10
	}
	return n
}

func isPrivateHost(host string) bool {
	h := host
	if strings.Count(h, ":") == 1 {
		if i := strings.LastIndex(h, ":"); i > 0 {
			h = h[:i]
		}
	}
	ips, err := net.LookupHost(h)
	if err != nil {
		return true
	}
	for _, ipStr := range ips {
		ip := net.ParseIP(ipStr)
		if ip == nil || ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
			return true
		}
	}
	return false
}

func UploadChatAttachment(db *sql.DB, attachDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		maxMB := getAttachmentMaxMB(db)
		r.Body = http.MaxBytesReader(w, r.Body, maxMB<<20+1024)
		if err := r.ParseMultipartForm(maxMB << 20); err != nil {
			writeError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("file too large (max %dMB)", maxMB))
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			writeError(w, http.StatusBadRequest, "file field required")
			return
		}
		defer file.Close()
		if header.Size > maxMB<<20 {
			writeError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("file too large (max %dMB)", maxMB))
			return
		}
		mimeType := header.Header.Get("Content-Type")
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}
		if i := strings.Index(mimeType, ";"); i > 0 {
			mimeType = strings.TrimSpace(mimeType[:i])
		}

		if err := os.MkdirAll(attachDir, 0755); err != nil {
			writeError(w, http.StatusInternalServerError, "storage error")
			return
		}
		id := generateID()
		ext := filepath.Ext(header.Filename)
		storedName := id + ext
		dst := filepath.Join(attachDir, storedName)
		out, err := os.Create(dst)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "storage error")
			return
		}
		defer out.Close()
		size, err := io.Copy(out, file)
		if err != nil {
			os.Remove(dst)
			writeError(w, http.StatusInternalServerError, "write error")
			return
		}
		now := time.Now().UTC().Format(time.RFC3339)
		db.Exec(`INSERT INTO chat_attachments (id, uploader_id, filename, original_name, mime_type, size, source, created_at)
			VALUES (?, ?, ?, ?, ?, ?, 'upload', ?)`,
			id, claims.UserID, storedName, header.Filename, mimeType, size, now)

		writeJSON(w, http.StatusOK, ChatAttachment{
			ID: id, OriginalName: header.Filename, MimeType: mimeType,
			Size: size, Source: "upload", URL: chatAttachmentURL(id),
		})
	}
}

func FetchURLAttachment(db *sql.DB, attachDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var req struct {
			URL string `json:"url"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.URL == "" {
			writeError(w, http.StatusBadRequest, "url required")
			return
		}
		if !strings.HasPrefix(req.URL, "http://") && !strings.HasPrefix(req.URL, "https://") {
			writeError(w, http.StatusBadRequest, "url must be http or https")
			return
		}
		parsed, err := url.Parse(req.URL)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid url")
			return
		}
		if isPrivateHost(parsed.Host) {
			writeError(w, http.StatusForbidden, "private/internal URLs are not allowed")
			return
		}

		maxMB := getAttachmentMaxMB(db)
		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Get(req.URL)
		if err != nil {
			writeError(w, http.StatusBadGateway, "failed to fetch URL")
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			writeError(w, http.StatusBadGateway, fmt.Sprintf("remote returned %d", resp.StatusCode))
			return
		}

		mimeType := resp.Header.Get("Content-Type")
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}
		if i := strings.Index(mimeType, ";"); i > 0 {
			mimeType = strings.TrimSpace(mimeType[:i])
		}

		origName := filepath.Base(parsed.Path)
		if origName == "." || origName == "/" || origName == "" {
			origName = "image"
		}
		ext := filepath.Ext(origName)
		if ext == "" {
			switch mimeType {
			case "image/jpeg":
				ext = ".jpg"
			case "image/png":
				ext = ".png"
			case "image/gif":
				ext = ".gif"
			case "image/webp":
				ext = ".webp"
			}
		}

		if err := os.MkdirAll(attachDir, 0755); err != nil {
			writeError(w, http.StatusInternalServerError, "storage error")
			return
		}
		id := generateID()
		storedName := id + ext
		dst := filepath.Join(attachDir, storedName)
		out, err := os.Create(dst)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "storage error")
			return
		}
		defer out.Close()
		limited := io.LimitReader(resp.Body, maxMB<<20+1)
		size, err := io.Copy(out, limited)
		if err != nil {
			os.Remove(dst)
			writeError(w, http.StatusInternalServerError, "write error")
			return
		}
		if size > maxMB<<20 {
			os.Remove(dst)
			writeError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("remote file too large (max %dMB)", maxMB))
			return
		}

		now := time.Now().UTC().Format(time.RFC3339)
		db.Exec(`INSERT INTO chat_attachments (id, uploader_id, filename, original_name, mime_type, size, source, source_url, created_at)
			VALUES (?, ?, ?, ?, ?, ?, 'url', ?, ?)`,
			id, claims.UserID, storedName, origName, mimeType, size, req.URL, now)

		writeJSON(w, http.StatusOK, ChatAttachment{
			ID: id, OriginalName: origName, MimeType: mimeType,
			Size: size, Source: "url", SourceURL: req.URL, URL: chatAttachmentURL(id),
		})
	}
}

func ServeChatAttachment(db *sql.DB, attachDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var filename, mimeType, origName string
		err := db.QueryRow(`SELECT filename, mime_type, original_name FROM chat_attachments WHERE id = ?`, id).
			Scan(&filename, &mimeType, &origName)
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "attachment not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "db error")
			return
		}
		w.Header().Set("Content-Type", mimeType)
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if !isImageMime(mimeType) {
			w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, origName))
		}
		http.ServeFile(w, r, filepath.Join(attachDir, filename))
	}
}

func DeleteChatAttachment(db *sql.DB, attachDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		var filename, uploaderID string
		err := db.QueryRow(`SELECT filename, uploader_id FROM chat_attachments WHERE id = ?`, id).
			Scan(&filename, &uploaderID)
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "attachment not found")
			return
		}
		if uploaderID != claims.UserID && claims.Role != "admin" {
			writeError(w, http.StatusForbidden, "not your attachment")
			return
		}
		db.Exec(`DELETE FROM chat_attachments WHERE id = ?`, id)
		os.Remove(filepath.Join(attachDir, filename))
		w.WriteHeader(http.StatusNoContent)
	}
}

func GetAttachmentConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]int64{"maxMB": getAttachmentMaxMB(db)})
	}
}

func SaveAttachmentConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			MaxMB int64 `json:"maxMB"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.MaxMB <= 0 || req.MaxMB > 500 {
			writeError(w, http.StatusBadRequest, "maxMB must be 1–500")
			return
		}
		db.Exec(`INSERT INTO app_config(key,value) VALUES('chat_attachment_max_mb',?)
			ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
			strconv.FormatInt(req.MaxMB, 10))
		writeJSON(w, http.StatusOK, map[string]int64{"maxMB": req.MaxMB})
	}
}
