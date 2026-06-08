package handlers

import (
	"database/sql"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

func GetAppIcon(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var url string
		err := db.QueryRow(`SELECT value FROM app_config WHERE key = 'app_icon_url'`).Scan(&url)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{"url": nil})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"url": url})
	}
}

func UploadAppIcon(db *sql.DB, iconsDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doUploadAppIcon(db, iconsDir, w, r)
	}
}

func DeleteAppIcon(db *sql.DB, iconsDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		doDeleteAppIcon(db, iconsDir, w, r)
	}
}

// ProfileUploadAppIcon is the same as UploadAppIcon but only works in single-user mode,
// so it can be registered under the regular auth middleware for profile settings.
func ProfileUploadAppIcon(db *sql.DB, iconsDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var mode string
		db.QueryRow(`SELECT value FROM app_config WHERE key = 'user_mode'`).Scan(&mode)
		if mode != "single" {
			writeError(w, http.StatusForbidden, "admin access required in multi-user mode")
			return
		}
		doUploadAppIcon(db, iconsDir, w, r)
	}
}

func ProfileDeleteAppIcon(db *sql.DB, iconsDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var mode string
		db.QueryRow(`SELECT value FROM app_config WHERE key = 'user_mode'`).Scan(&mode)
		if mode != "single" {
			writeError(w, http.StatusForbidden, "admin access required in multi-user mode")
			return
		}
		doDeleteAppIcon(db, iconsDir, w, r)
	}
}

func doUploadAppIcon(db *sql.DB, iconsDir string, w http.ResponseWriter, r *http.Request) {
	r.ParseMultipartForm(2 << 20) // 2MB max
	file, header, err := r.FormFile("icon")
	if err != nil {
		writeError(w, http.StatusBadRequest, "no file provided")
		return
	}
	defer file.Close()

	ct := header.Header.Get("Content-Type")
	ext := ""
	switch ct {
	case "image/jpeg":
		ext = ".jpg"
	case "image/png":
		ext = ".png"
	case "image/gif":
		ext = ".gif"
	case "image/webp":
		ext = ".webp"
	case "image/svg+xml":
		ext = ".svg"
	default:
		writeError(w, http.StatusBadRequest, "unsupported image type (jpeg, png, gif, webp, svg)")
		return
	}

	if err := os.MkdirAll(iconsDir, 0755); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create icons dir")
		return
	}

	// Remove any previously uploaded app icon across all supported extensions
	for _, oldExt := range []string{".jpg", ".png", ".gif", ".webp", ".svg"} {
		os.Remove(filepath.Join(iconsDir, "app-icon"+oldExt))
	}

	filename := "app-icon" + ext
	dest := filepath.Join(iconsDir, filename)

	data, err := io.ReadAll(io.LimitReader(file, 2<<20))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read file")
		return
	}
	if err := os.WriteFile(dest, data, 0644); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save icon")
		return
	}

	iconURL := "/api/icons/" + filename
	db.Exec(`INSERT INTO app_config(key,value) VALUES('app_icon_url',?)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
		iconURL)

	writeJSON(w, http.StatusOK, map[string]string{"url": iconURL})
}

func doDeleteAppIcon(db *sql.DB, iconsDir string, w http.ResponseWriter, r *http.Request) {
	for _, ext := range []string{".jpg", ".png", ".gif", ".webp", ".svg"} {
		os.Remove(filepath.Join(iconsDir, "app-icon"+ext))
	}
	db.Exec(`DELETE FROM app_config WHERE key = 'app_icon_url'`)
	w.WriteHeader(http.StatusNoContent)
}
