package handlers

import (
	"database/sql"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"

	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

// ImageProxy fetches artwork from an integration's API server and streams it
// to the browser. This keeps API credentials server-side and works regardless
// of firewall rules between the user's browser and internal services.
//
// GET /api/v1/images/proxy?integration=<id>&url=<path>
func ImageProxy(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := r.URL.Query().Get("integration")
		imgPath := r.URL.Query().Get("url")
		if integrationID == "" || imgPath == "" {
			http.NotFound(w, r)
			return
		}

		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		if !userCanAccessIntegration(db, claims, integrationID) {
			http.Error(w, "not authorized", http.StatusForbidden)
			return
		}

		// Resolve integration: type, apiURL, apiKey, skipTLS
		var intType, apiURL string
		var secretID sql.NullString
		var skipTLSInt int
		err := db.QueryRow(`
			SELECT type, api_url, secret_id, skip_tls
			FROM integrations WHERE id=? AND enabled=1
		`, integrationID).Scan(&intType, &apiURL, &secretID, &skipTLSInt)
		if err != nil {
			log.Printf("ImageProxy: integration %q not found: %v", integrationID, err)
			http.Error(w, "integration not found", http.StatusNotFound)
			return
		}
		skipTLS := skipTLSInt == 1

		apiKey := ""
		if secretID.Valid {
			var enc string
			if e := db.QueryRow("SELECT value FROM secrets WHERE id=?", secretID.String).Scan(&enc); e == nil {
				apiKey = decryptSecret(enc)
			}
		}

		// Build upstream URL
		upstream := strings.TrimRight(apiURL, "/") + imgPath

		req, err := http.NewRequest("GET", upstream, nil)
		if err != nil {
			http.Error(w, "bad upstream URL", http.StatusBadGateway)
			return
		}

		// Auth varies by integration type
		switch intType {
		case "plex":
			sep := "?"
			if strings.Contains(upstream, "?") {
				sep = "&"
			}
			req.URL, _ = url.Parse(upstream + sep + "X-Plex-Token=" + url.QueryEscape(apiKey))
		case "emby", "jellyfin":
			req.Header.Set("X-Emby-Token", apiKey)
		case "tautulli":
			sep := "?"
			if strings.Contains(upstream, "?") {
				sep = "&"
			}
			req.URL, _ = url.Parse(upstream + sep + "apikey=" + url.QueryEscape(apiKey))
		case "tracearr":
			req.Header.Set("Authorization", "Bearer "+apiKey)
		case "lubelogger":
			if idx := strings.Index(apiKey, ":"); idx >= 0 {
				req.SetBasicAuth(apiKey[:idx], apiKey[idx+1:])
			} else if apiKey != "" {
				req.Header.Set("x-api-key", apiKey)
			}
		default:
			// Generic: try Bearer token
			if apiKey != "" {
				req.Header.Set("Authorization", "Bearer "+apiKey)
			}
		}

		resp, err := httpClient(skipTLS).Do(req)
		if err != nil {
			log.Printf("ImageProxy: upstream request failed [%s %s]: %v", intType, req.URL, err)
			http.Error(w, "upstream error", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 400 {
			body, _ := io.ReadAll(resp.Body)
			log.Printf("ImageProxy: upstream %s returned %d for %s — body: %s", intType, resp.StatusCode, req.URL, string(body))
			http.Error(w, fmt.Sprintf("upstream %d", resp.StatusCode), http.StatusBadGateway)
			return
		}

		ct := resp.Header.Get("Content-Type")
		if ct == "" {
			ct = "image/jpeg"
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Cache-Control", "public, max-age=86400")
		io.Copy(w, resp.Body)
	}
}
