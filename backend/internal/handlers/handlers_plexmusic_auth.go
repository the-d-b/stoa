package handlers

import (
	"database/sql"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

// Plex Home users don't have their own plex.tv email/password login — the
// only way to get a token for one is admin-mediated: use the server owner's
// already-stored token to list home users and switch into one on their
// behalf. This is structurally different from the YouTube/TMDB OAuth
// connect flows (no browser redirect, no client secret) — it's a single
// in-app picker + optional PIN, entirely server-side. External shared users
// (real independent plex.tv accounts) would need the self-service PIN-link
// flow instead; that's a deliberately separate, deferred addition — see
// docs/integrations/plexmusic/README.md.

const plexTVBase = "https://plex.tv"

// plexClientIdentifier is a fixed, persistent identifier for Stoa as a Plex
// "app" — Plex's account-level API (plex.tv, as opposed to a media server's
// own API) increasingly expects this on every call and can reject or
// misbehave on requests without it, even ones that don't error outright.
const plexClientIdentifier = "stoa-dashboard-a1e6f3d2"

// plexTVRequest builds an authenticated request against plex.tv's
// account-level API (not a media server) with the headers Plex expects an
// "app" to send.
func plexTVRequest(method, path, token string) (*http.Request, error) {
	req, err := http.NewRequest(method, plexTVBase+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Plex-Token", token)
	req.Header.Set("X-Plex-Client-Identifier", plexClientIdentifier)
	req.Header.Set("X-Plex-Product", "Stoa")
	req.Header.Set("Accept", "application/xml")
	return req, nil
}

type plexUsersResponse struct {
	XMLName xml.Name       `xml:"MediaContainer"`
	Users   []plexHomeUser `xml:"User"`
}

type plexHomeUser struct {
	ID        string `xml:"id,attr"`
	Title     string `xml:"title,attr"`
	Username  string `xml:"username,attr"`
	Thumb     string `xml:"thumb,attr"`
	Home      string `xml:"home,attr"`
	Protected string `xml:"protected,attr"`
}

type plexSwitchResponse struct {
	XMLName             xml.Name `xml:"user"`
	AuthenticationToken string   `xml:"authenticationToken,attr"`
}

// A Plex account-level token (from sign-in or, here, switch-user) is not
// itself valid against a Plex Media Server — the server returns a flat 401.
// Confirmed against a live server. Confirmed also that a Home/managed
// sub-account's own token doesn't expose shared-server resources via
// /api/v2/resources the way an independent account's does (it returns zero
// devices) — Home users aren't first-class enough in Plex's resource model
// for that. The actual mechanism (matching Plex's own client libraries):
// the *admin's* token looks up each shared user's per-server access token
// directly via /api/servers/{machineId}/shared_servers, keyed by that
// user's account ID.
type plexSharedServersResponse struct {
	SharedServers []plexSharedServer `xml:"SharedServer"`
}

type plexSharedServer struct {
	UserID      string `xml:"userID,attr"`
	AccessToken string `xml:"accessToken,attr"`
}

// plexMusicServerToken looks up the per-server access token for a specific
// home/shared user, using the admin's own token.
func plexMusicServerToken(adminToken, machineIdentifier, targetUserID string) (string, error) {
	path := fmt.Sprintf("/api/servers/%s/shared_servers", url.QueryEscape(machineIdentifier))
	req, err := plexTVRequest("GET", path, adminToken)
	if err != nil {
		return "", err
	}
	resp, err := httpClient(false).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("HTTP %d listing shared servers: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var parsed plexSharedServersResponse
	if xml.Unmarshal(body, &parsed) != nil {
		logErrorf("PLEXMUSIC", "shared_servers: unexpected response: %s", strings.TrimSpace(string(body)))
		return "", fmt.Errorf("unexpected shared_servers response")
	}
	logErrorf("PLEXMUSIC", "shared_servers: looking for userID=%q among %d entries", targetUserID, len(parsed.SharedServers))
	for _, s := range parsed.SharedServers {
		if s.UserID == targetUserID && s.AccessToken != "" {
			return s.AccessToken, nil
		}
	}
	return "", fmt.Errorf("no access token found for this user on this server — they may not be a shared member of it")
}

// plexMusicSourceIntegration resolves the system Plex integration a
// plexmusic integration borrows connectivity + the admin token from
// (stored as sourceIntegrationId in the plexmusic integration's own
// config — it has no secret of its own).
func plexMusicSourceIntegration(db *sql.DB, plexMusicIntegrationID string) (adminToken string, err error) {
	cfgJSON, err := readIntegrationConfig(db, plexMusicIntegrationID)
	if err != nil {
		return "", err
	}
	var cfg struct {
		SourceIntegrationID string `json:"sourceIntegrationId"`
	}
	json.Unmarshal([]byte(cfgJSON), &cfg) //nolint:errcheck
	if cfg.SourceIntegrationID == "" {
		return "", fmt.Errorf("plexmusic: no source Plex integration configured")
	}
	_, _, adminToken, _, err = resolveIntegration(db, cfg.SourceIntegrationID)
	if err != nil {
		return "", fmt.Errorf("plexmusic: source Plex integration not found: %w", err)
	}
	if adminToken == "" {
		return "", fmt.Errorf("plexmusic: source Plex integration has no token")
	}
	return adminToken, nil
}

// ── Home user list + connect ───────────────────────────────────────────────────

func PlexMusicListHomeUsers(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := r.URL.Query().Get("integrationId")
		if integrationID == "" {
			writeError(w, http.StatusBadRequest, "integrationId required")
			return
		}
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		if !userCanAccessIntegration(db, claims, integrationID) {
			writeError(w, http.StatusForbidden, "not authorized")
			return
		}
		adminToken, err := plexMusicSourceIntegration(db, integrationID)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		listReq, err := plexTVRequest("GET", "/api/users/", adminToken)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		resp, err := httpClient(false).Do(listReq)
		if err != nil {
			writeError(w, http.StatusBadGateway, "plexmusic: failed to list Plex users: "+err.Error())
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode >= 400 {
			writeError(w, http.StatusBadGateway, fmt.Sprintf("plexmusic: failed to list Plex users (HTTP %d): %s", resp.StatusCode, strings.TrimSpace(string(body))))
			return
		}
		var parsed plexUsersResponse
		if xml.Unmarshal(body, &parsed) != nil {
			writeError(w, http.StatusBadGateway, "plexmusic: unexpected response listing Plex users")
			return
		}
		type homeUser struct {
			ID        string `json:"id"`
			Title     string `json:"title"`
			Thumb     string `json:"thumb"`
			Protected bool   `json:"protected"`
		}
		out := []homeUser{}
		for _, u := range parsed.Users {
			if u.Home != "1" {
				continue // exclude external shared-library friends — home users only, see file header
			}
			title := u.Title
			if title == "" {
				title = u.Username
			}
			out = append(out, homeUser{ID: u.ID, Title: title, Thumb: u.Thumb, Protected: u.Protected == "1"})
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"users": out})
	}
}

func PlexMusicConnect(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			IntegrationID string `json:"integrationId"`
			HomeUserID    string `json:"homeUserId"`
			HomeUserTitle string `json:"homeUserTitle"`
			HomeUserThumb string `json:"homeUserThumb"`
			PIN           string `json:"pin"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IntegrationID == "" || req.HomeUserID == "" {
			writeError(w, http.StatusBadRequest, "integrationId and homeUserId required")
			return
		}
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		if !userCanAccessIntegration(db, claims, req.IntegrationID) {
			writeError(w, http.StatusForbidden, "not authorized")
			return
		}
		adminToken, err := plexMusicSourceIntegration(db, req.IntegrationID)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		path := fmt.Sprintf("/api/home/users/%s/switch", url.QueryEscape(req.HomeUserID))
		if req.PIN != "" {
			path += "?pin=" + url.QueryEscape(req.PIN)
		}
		httpReq, herr := plexTVRequest("POST", path, adminToken)
		if herr != nil {
			writeError(w, http.StatusInternalServerError, herr.Error())
			return
		}
		resp, herr := httpClient(false).Do(httpReq)
		if herr != nil {
			writeError(w, http.StatusBadGateway, "plexmusic: switch-user request failed: "+herr.Error())
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode >= 400 {
			msg := fmt.Sprintf("plexmusic: switch-user failed (HTTP %d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
			if resp.StatusCode == 401 {
				msg = "plexmusic: incorrect PIN, or this profile requires one"
			}
			writeError(w, http.StatusBadGateway, msg)
			return
		}
		var sw plexSwitchResponse
		if xml.Unmarshal(body, &sw) != nil || sw.AuthenticationToken == "" {
			writeError(w, http.StatusBadGateway, "plexmusic: unexpected switch-user response: "+strings.TrimSpace(string(body)))
			return
		}

		// The account-level token above isn't valid directly against the
		// media server (confirmed: flat 401) — exchange it for the token
		// specific to this server via a resources lookup.
		cfgJSON, cerr := readIntegrationConfig(db, req.IntegrationID)
		var cfg struct {
			SourceIntegrationID string `json:"sourceIntegrationId"`
		}
		if cerr == nil {
			json.Unmarshal([]byte(cfgJSON), &cfg) //nolint:errcheck
		}
		serverURL, _, _, skipTLS, serr := resolveIntegration(db, cfg.SourceIntegrationID)
		if serr != nil {
			writeError(w, http.StatusInternalServerError, "plexmusic: source Plex integration not found: "+serr.Error())
			return
		}
		idBody, ierr := plexGet(serverURL, adminToken, "/", skipTLS)
		if ierr != nil {
			writeError(w, http.StatusBadGateway, "plexmusic: could not identify Plex server: "+ierr.Error())
			return
		}
		var idmc plexMediaContainer
		if xml.Unmarshal(idBody, &idmc) != nil || idmc.MachineIdentifier == "" {
			writeError(w, http.StatusBadGateway, "plexmusic: could not identify Plex server (missing machineIdentifier)")
			return
		}
		logErrorf("PLEXMUSIC", "connect: source server machineIdentifier=%q", idmc.MachineIdentifier)
		serverToken, terr := plexMusicServerToken(adminToken, idmc.MachineIdentifier, req.HomeUserID)
		if terr != nil {
			writeError(w, http.StatusBadGateway, "plexmusic: "+terr.Error())
			return
		}

		_, err = db.Exec(`
			INSERT OR REPLACE INTO plex_music_tokens
				(integration_id, plex_token, account_token, plex_user_id, plex_username, thumb_url)
			VALUES (?, ?, ?, ?, ?, ?)`,
			req.IntegrationID, serverToken, sw.AuthenticationToken, req.HomeUserID, req.HomeUserTitle, req.HomeUserThumb,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "connected"})
	}
}

func PlexMusicGetStatus(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := r.URL.Query().Get("integrationId")
		if integrationID == "" {
			writeError(w, http.StatusBadRequest, "integrationId required")
			return
		}
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		if !userCanAccessIntegration(db, claims, integrationID) {
			writeError(w, http.StatusForbidden, "not authorized")
			return
		}
		var username, thumb string
		err := db.QueryRow("SELECT plex_username, thumb_url FROM plex_music_tokens WHERE integration_id=?", integrationID).
			Scan(&username, &thumb)
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusOK, map[string]interface{}{"connected": false})
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"connected": true, "username": username, "thumbUrl": thumb,
		})
	}
}

func PlexMusicDisconnect(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := r.URL.Query().Get("integrationId")
		if integrationID == "" {
			writeError(w, http.StatusBadRequest, "integrationId required")
			return
		}
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		if !userCanAccessIntegration(db, claims, integrationID) {
			writeError(w, http.StatusForbidden, "not authorized")
			return
		}
		db.Exec("DELETE FROM plex_music_tokens WHERE integration_id=?", integrationID) //nolint:errcheck
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
