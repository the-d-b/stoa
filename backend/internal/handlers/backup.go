package handlers

import (
	"archive/tar"
	"compress/gzip"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// CreateBackup streams a full tar.gz backup (database + icons + uploads + css)
// directly to the browser as a file download. Safe to run while the server is live —
// uses VACUUM INTO for a consistent DB snapshot.
//
// Restore is CLI-only: stoa-cli backup restore <file>
// The server must be stopped before restoring so the database file is not locked.
func CreateBackup(db *sql.DB, dbPath, iconsDir, uploadsDir, cssDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// VACUUM INTO requires the target file not to exist
		tmpDB := dbPath + ".backup_tmp"
		os.Remove(tmpDB) // clean up any leftover from a prior crash
		defer os.Remove(tmpDB)

		escapedTmp := strings.ReplaceAll(tmpDB, "'", "''")
		if _, err := db.Exec(fmt.Sprintf("VACUUM INTO '%s'", escapedTmp)); err != nil {
			writeError(w, http.StatusInternalServerError, "database backup failed: "+err.Error())
			return
		}

		filename := fmt.Sprintf("stoa-backup-%s.tar.gz", time.Now().Format("2006-01-02-150405"))
		w.Header().Set("Content-Type", "application/gzip")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
		w.Header().Set("Cache-Control", "no-store")

		gz := gzip.NewWriter(w)
		tw := tar.NewWriter(gz)

		// Manifest
		manifest := map[string]interface{}{
			"version":   1,
			"createdAt": time.Now().UTC().Format(time.RFC3339),
		}
		manifestJSON, _ := json.MarshalIndent(manifest, "", "  ")
		tw.WriteHeader(&tar.Header{
			Name:    "manifest.json",
			Size:    int64(len(manifestJSON)),
			Mode:    0644,
			ModTime: time.Now(),
		})
		tw.Write(manifestJSON)

		// Database
		if err := addFileToTarHandler(tw, tmpDB, "db/stoa.db"); err != nil {
			// Headers already sent — can't send an error response, just close
			tw.Close()
			gz.Close()
			return
		}

		// Asset directories (absent dirs are silently skipped)
		for _, entry := range []struct{ src, prefix string }{
			{iconsDir, "icons"},
			{uploadsDir, "uploads"},
			{cssDir, "css"},
		} {
			addDirToTarHandler(tw, entry.src, entry.prefix)
		}

		tw.Close()
		gz.Close()
	}
}

// ── tar helpers ───────────────────────────────────────────────────────────────

func addFileToTarHandler(tw *tar.Writer, srcPath, archivePath string) error {
	f, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	if err := tw.WriteHeader(&tar.Header{
		Name:    archivePath,
		Size:    info.Size(),
		Mode:    int64(info.Mode()),
		ModTime: info.ModTime(),
	}); err != nil {
		return err
	}
	_, err = io.Copy(tw, f)
	return err
}

func addDirToTarHandler(tw *tar.Writer, srcDir, prefix string) {
	if _, err := os.Stat(srcDir); os.IsNotExist(err) {
		return
	}
	filepath.Walk(srcDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(srcDir, path)
		if err != nil {
			return nil
		}
		addFileToTarHandler(tw, path, prefix+"/"+filepath.ToSlash(rel))
		return nil
	})
}
