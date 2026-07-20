package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

// Integration is the shared struct used across all integration handlers.
type Integration struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Type        string    `json:"type"`
	APIURL      string    `json:"apiUrl"`
	UIURL       string    `json:"uiUrl"`
	Config      string    `json:"config"`
	SecretID    *string   `json:"secretId,omitempty"`
	SkipTLS     bool      `json:"skipTls"`
	Enabled     bool      `json:"enabled"`
	RefreshSecs int       `json:"refreshSecs"`
	CreatedBy   string    `json:"createdBy"`
	CreatedAt   time.Time `json:"createdAt"`
}

// integrationConfigTypes are types whose "what to fetch" config lives in the
// config column rather than api_url. api_url may be empty for these types.
var integrationConfigTypes = map[string]bool{
	"stocks": true, "crypto": true, "sports": true, "weather": true,
	"youtube": true, "twitch": true, "spotify": true, "lastfm": true,
	"strava": true, "trakt": true, "github": true, "steam": true, "duolingo": true,
	"rss": true, "tailscale": true,
}

func ListIntegrations(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var rows *sql.Rows
		var err error
		if claims.Role == models.RoleAdmin {
			// Admin sees SYSTEM integrations + their own personal integrations
			rows, err = db.Query(`
				SELECT id, name, type, api_url, ui_url, COALESCE(config,'{}'), secret_id, enabled, skip_tls, refresh_secs, created_by, created_at
				FROM integrations
				WHERE created_by = 'SYSTEM' OR created_by = ?
				ORDER BY CASE WHEN created_by = 'SYSTEM' THEN 0 ELSE 1 END ASC, name ASC
			`, claims.UserID)
		} else {
			rows, err = db.Query(`
				SELECT DISTINCT i.id, i.name, i.type, i.api_url, i.ui_url, COALESCE(i.config,'{}'),
				       i.secret_id, i.enabled, i.skip_tls, i.refresh_secs, i.created_by, i.created_at
				FROM integrations i
				WHERE
					i.created_by = ?
					OR (i.created_by = 'SYSTEM' AND NOT EXISTS (
						SELECT 1 FROM integration_groups WHERE integration_id = i.id
					))
					OR (i.created_by = 'SYSTEM' AND EXISTS (
						SELECT 1 FROM integration_groups ig
						JOIN user_groups ug ON ig.group_id = ug.group_id
						WHERE ig.integration_id = i.id AND ug.user_id = ?
					))
				ORDER BY CASE WHEN i.created_by = 'SYSTEM' THEN 0 ELSE 1 END ASC, i.name ASC
			`, claims.UserID, claims.UserID)
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query integrations")
			return
		}
		defer rows.Close()
		integrations := []Integration{}
		for rows.Next() {
			var ig Integration
			var enabled int
			var secretID sql.NullString
			var skipTLS int
			rows.Scan(&ig.ID, &ig.Name, &ig.Type, &ig.APIURL, &ig.UIURL, &ig.Config,
				&secretID, &enabled, &skipTLS, &ig.RefreshSecs, &ig.CreatedBy, &ig.CreatedAt)
			ig.Enabled = enabled == 1
			ig.SkipTLS = skipTLS == 1
			if secretID.Valid {
				ig.SecretID = &secretID.String
			}
			integrations = append(integrations, ig)
		}
		writeJSON(w, http.StatusOK, integrations)
	}
}

// GetAllIntegrationsAdmin returns every integration across all users, with owner name.
// Admin-only — enforced by the admin subrouter.
func GetAllIntegrationsAdmin(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query(`
			SELECT
				i.id, i.name, i.type, i.enabled,
				CASE WHEN i.created_by = 'SYSTEM' THEN 'shared' ELSE 'personal' END,
				CASE WHEN i.created_by = 'SYSTEM' THEN 'system'
				     ELSE COALESCE(u.username, i.created_by) END,
				i.created_at
			FROM integrations i
			LEFT JOIN users u ON u.id = i.created_by
			ORDER BY CASE WHEN i.created_by = 'SYSTEM' THEN 0 ELSE 1 END ASC, i.name ASC
		`)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()

		type row struct {
			ID        string `json:"id"`
			Name      string `json:"name"`
			Type      string `json:"type"`
			Enabled   bool   `json:"enabled"`
			Scope     string `json:"scope"`
			OwnerName string `json:"ownerName"`
			CreatedAt string `json:"createdAt"`
		}
		list := []row{}
		for rows.Next() {
			var r row
			var enabled int
			var createdAt string
			rows.Scan(&r.ID, &r.Name, &r.Type, &enabled, &r.Scope, &r.OwnerName, &createdAt)
			r.Enabled = enabled == 1
			r.CreatedAt = createdAt
			list = append(list, r)
		}
		writeJSON(w, http.StatusOK, list)
	}
}

func CreateIntegration(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var req struct {
			Name        string  `json:"name"`
			Type        string  `json:"type"`
			APIURL      string  `json:"apiUrl"`
			UIURL       string  `json:"uiUrl"`
			Config      string  `json:"config"`
			SecretID    *string `json:"secretId"`
			SkipTLS     bool    `json:"skipTls"`
			Scope       string  `json:"scope"`
			RefreshSecs int     `json:"refreshSecs"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil ||
			req.Name == "" || req.Type == "" ||
			(!integrationConfigTypes[req.Type] && req.APIURL == "") {
			writeError(w, http.StatusBadRequest, "name, type and apiUrl required")
			return
		}
		ownerID := "SYSTEM"
		if req.Scope == "personal" || claims.Role != models.RoleAdmin {
			ownerID = claims.UserID
		}
		req.APIURL = strings.TrimSpace(req.APIURL)
		req.UIURL = strings.TrimSpace(req.UIURL)
		if req.Config == "" {
			req.Config = "{}"
		}
		if req.RefreshSecs < 15 {
			req.RefreshSecs = defaultRefreshSecs(req.Type)
		}
		id := generateID()
		var secretID interface{} = nil
		if req.SecretID != nil && *req.SecretID != "" {
			secretID = *req.SecretID
		}
		skipTLSInt := 0
		if req.SkipTLS {
			skipTLSInt = 1
		}
		_, err := db.Exec(`
			INSERT INTO integrations (id, name, type, api_url, ui_url, config, secret_id, skip_tls, refresh_secs, created_by)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, id, req.Name, req.Type, req.APIURL, req.UIURL, req.Config, secretID, skipTLSInt, req.RefreshSecs, ownerID)
		if err != nil {
			logErrorf("INTEGRATIONS", "create error: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to create integration")
			return
		}
		RecordAudit(db, claims.UserID, claims.Username, "integration.create", id, req.Name, map[string]string{"type": req.Type})
		go StartWorkerForIntegration(db, id)
		writeJSON(w, http.StatusCreated, map[string]string{"id": id})
	}
}

func UpdateIntegration(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		var intName string
		db.QueryRow("SELECT name FROM integrations WHERE id=?", id).Scan(&intName)
		var req struct {
			Name        string  `json:"name"`
			APIURL      string  `json:"apiUrl"`
			UIURL       string  `json:"uiUrl"`
			Config      string  `json:"config"`
			SecretID    *string `json:"secretId"`
			SkipTLS     bool    `json:"skipTls"`
			RefreshSecs int     `json:"refreshSecs"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		req.APIURL = strings.TrimSpace(req.APIURL)
		req.UIURL = strings.TrimSpace(req.UIURL)
		if req.Config == "" {
			req.Config = "{}"
		}
		if req.RefreshSecs < 15 {
			req.RefreshSecs = defaultRefreshSecs("")
		}
		var secretID interface{} = nil
		if req.SecretID != nil && *req.SecretID != "" {
			secretID = *req.SecretID
		}
		skipTLSInt := 0
		if req.SkipTLS {
			skipTLSInt = 1
		}
		_, uerr := db.Exec(`UPDATE integrations SET name=?, api_url=?, ui_url=?, config=?, secret_id=?, skip_tls=?, refresh_secs=? WHERE id=?`,
			req.Name, req.APIURL, req.UIURL, req.Config, secretID, skipTLSInt, req.RefreshSecs, id)
		if uerr != nil {
			logErrorf("INTEGRATIONS", "update error: %v", uerr)
			writeError(w, http.StatusInternalServerError, "update failed")
			return
		}
		if intName == "" {
			intName = req.Name
		}
		RecordAudit(db, claims.UserID, claims.Username, "integration.update", id, intName, nil)
		go StartWorkerForIntegration(db, id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// setIntegrationEnabled flips the enabled bit. Disabling stops the polling
// worker and clears the cache so the integration goes fully inert (every
// fetch path checks enabled via resolveIntegration); enabling restarts the
// worker. requireOwner enforces personal-integration ownership.
func setIntegrationEnabled(db *sql.DB, requireOwner bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		if requireOwner {
			var owner string
			db.QueryRow("SELECT created_by FROM integrations WHERE id=?", id).Scan(&owner)
			if owner != claims.UserID {
				writeError(w, http.StatusForbidden, "not your integration")
				return
			}
		}
		var req struct {
			Enabled bool `json:"enabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		var intName string
		db.QueryRow("SELECT name FROM integrations WHERE id=?", id).Scan(&intName)
		val := 0
		if req.Enabled {
			val = 1
		}
		res, err := db.Exec("UPDATE integrations SET enabled=? WHERE id=?", val, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "update failed")
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			writeError(w, http.StatusNotFound, "integration not found")
			return
		}
		action := "integration.disable"
		if req.Enabled {
			action = "integration.enable"
			go StartWorkerForIntegration(db, id)
		} else {
			StopWorkerForIntegration(id)
			cacheDelete(id)
		}
		RecordAudit(db, claims.UserID, claims.Username, action, id, intName, nil)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// SetIntegrationEnabled is the admin toggle (any integration).
func SetIntegrationEnabled(db *sql.DB) http.HandlerFunc {
	return setIntegrationEnabled(db, false)
}

// SetMyIntegrationEnabled is the personal toggle (ownership enforced).
func SetMyIntegrationEnabled(db *sql.DB) http.HandlerFunc {
	return setIntegrationEnabled(db, true)
}

func DeleteIntegration(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		var intName string
		db.QueryRow("SELECT name FROM integrations WHERE id=?", id).Scan(&intName)
		StopWorkerForIntegration(id)
		db.Exec("DELETE FROM integrations WHERE id=?", id)
		RecordAudit(db, claims.UserID, claims.Username, "integration.delete", id, intName, nil)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func TestIntegration(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Type     string `json:"type"`
			APIURL   string `json:"apiUrl"`
			SecretID string `json:"secretId"`
			SkipTLS  bool   `json:"skipTls"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.APIURL == "" {
			writeError(w, http.StatusBadRequest, "apiUrl required")
			return
		}
		req.APIURL = strings.TrimSpace(req.APIURL)
		apiKey := ""
		if req.SecretID != "" {
			var enc string
			if err := db.QueryRow("SELECT value FROM secrets WHERE id=?", req.SecretID).Scan(&enc); err == nil {
				apiKey = decryptSecret(enc)
			}
		}
		var err error
		switch req.Type {
		case "sonarr", "radarr", "lidarr":
			err = testArrConnection(req.APIURL, apiKey, req.Type, req.SkipTLS)
		case "plex":
			err = testPlexConnection(req.APIURL, apiKey, req.SkipTLS)
		case "jellyfin":
			err = testJellyfinConnection(req.APIURL, apiKey, req.SkipTLS)
		case "homeassistant":
			err = testHAConnection(req.APIURL, apiKey, req.SkipTLS)
		case "overseerr":
			err = testOverseerrConnection(req.APIURL, apiKey, req.SkipTLS)
		case "tautulli":
			err = testTautulliConnection(req.APIURL, apiKey, req.SkipTLS)
		case "truenas":
			err = testTrueNASConnection(req.APIURL, apiKey, req.SkipTLS)
		case "proxmox":
			err = testProxmoxConnection(req.APIURL, apiKey, req.SkipTLS)
		case "kuma":
			err = testKumaConnection(req.APIURL, apiKey, req.SkipTLS)
		case "gluetun":
			err = testGluetunConnection(req.APIURL, apiKey, req.SkipTLS)
		case "opnsense":
			err = testOPNsenseConnection(req.APIURL, apiKey, req.SkipTLS)
		case "pfsense":
			err = testPfSenseConnection(req.APIURL, apiKey, req.SkipTLS)
		case "openwrt":
			err = testOpenWrtConnection(req.APIURL, apiKey, req.SkipTLS)
		case "omada":
			err = testOmadaConnection(req.APIURL, apiKey, req.SkipTLS)
		case "unifi":
			err = testUniFiConnection(req.APIURL, apiKey, req.SkipTLS)
		case "traefik":
			err = testTraefikConnection(req.APIURL, apiKey, req.SkipTLS)
		case "cloudflare":
			err = testCloudflareConnection(req.APIURL, apiKey, req.SkipTLS)
		case "pihole":
			err = testPiHoleConnection(req.APIURL, apiKey, req.SkipTLS)
		case "adguard":
			err = testAdGuardConnection(req.APIURL, apiKey, req.SkipTLS)
		case "nextdns":
			err = testNextDNSConnection(req.APIURL, apiKey, req.SkipTLS)
		case "nginxpm":
			err = testNPMConnection(req.APIURL, apiKey, req.SkipTLS)
		case "wgeasy":
			err = testWGEasyConnection(req.APIURL, apiKey, req.SkipTLS)
		case "tailscale":
			err = testTailscaleConnection(req.APIURL, apiKey, req.SkipTLS)
		case "prometheus":
			err = testPrometheusConnection(req.APIURL, apiKey, req.SkipTLS)
		case "grafana":
			err = testGrafanaConnection(req.APIURL, apiKey, req.SkipTLS)
		case "autobrr":
			err = testAutobrrrConnection(req.APIURL, apiKey, req.SkipTLS)
		case "bazarr":
			err = testBazarrConnection(req.APIURL, apiKey, req.SkipTLS)
		case "prowlarr":
			err = testProwlarrConnection(req.APIURL, apiKey, req.SkipTLS)
		case "frigate":
			err = testFrigateConnection(req.APIURL, apiKey, req.SkipTLS)
		case "blueiris":
			err = testBlueIrisConnection(req.APIURL, apiKey, req.SkipTLS)
		case "nextcloud":
			err = testNextcloudConnection(req.APIURL, apiKey, req.SkipTLS)
		case "fireflyiii":
			err = testFireflyConnection(req.APIURL, apiKey, req.SkipTLS)
		case "netbird":
			err = testNetbirdConnection(req.APIURL, apiKey, req.SkipTLS)
		case "actualbudget":
			err = testActualBudgetConnection(req.APIURL, apiKey, req.SkipTLS)
		case "scrutiny":
			err = testScrutinyConnection(req.APIURL, apiKey, req.SkipTLS)
		case "paperless":
			err = testPaperlessConnection(req.APIURL, apiKey, req.SkipTLS)
		case "mealie":
			err = testMealieConnection(req.APIURL, apiKey, req.SkipTLS)
		case "grocy":
			err = testGrocyConnection(req.APIURL, apiKey, req.SkipTLS)
		case "ghostfolio":
			err = testGhostfolioConnection(req.APIURL, apiKey, req.SkipTLS)
		case "coinbase":
			err = testCoinbaseConnection(req.APIURL, apiKey, req.SkipTLS)
		case "sabnzbd":
			err = testSABnzbdConnection(req.APIURL, apiKey, req.SkipTLS)
		case "nzbget":
			err = testNZBGetConnection(req.APIURL, apiKey, req.SkipTLS)
		case "tandoor":
			err = testTandoorConnection(req.APIURL, apiKey, req.SkipTLS)
		case "lubelogger":
			err = testLubeLoggerConnection(req.APIURL, apiKey, req.SkipTLS)
		case "tdarr":
			err = testTdarrConnection(req.APIURL, apiKey, req.SkipTLS)
		case "docspell":
			err = testDocspellConnection(req.APIURL, apiKey, req.SkipTLS)
		case "romm":
			err = testRommConnection(req.APIURL, apiKey, req.SkipTLS)
		case "pterodactyl":
			err = testPterodactylConnection(req.APIURL, apiKey, req.SkipTLS)
		case "maintainerr":
			err = testMaintainerrConnection(req.APIURL, apiKey, req.SkipTLS)
		case "caldav":
			err = testCaldavConnection(req.APIURL, apiKey, req.SkipTLS)
		case "monica":
			err = testMonicaConnection(req.APIURL, apiKey, req.SkipTLS)
		case "homebox":
			err = testHomeboxConnection(req.APIURL, apiKey, req.SkipTLS)
		case "wger":
			err = testWgerConnection(req.APIURL, apiKey, req.SkipTLS)
		case "fittrackee":
			err = testFittrackeeConnection(req.APIURL, apiKey, req.SkipTLS)
		case "spotify":
			err = testSpotifyConnection(apiKey)
		case "lastfm":
			err = testLastFmConnection(apiKey)
		case "strava":
			err = testStravaConnection(apiKey)
		case "duolingo":
			err = testDuolingoConnection(apiKey)
		case "github":
			err = testGitHubConnection(apiKey)
		case "trakt":
			err = testTraktConnection(apiKey)
		case "twitch":
			err = testTwitchConnection(apiKey)
		case "youtube":
			err = testYouTubeConnection(apiKey)
		case "transmission":
			err = testTransmissionConnection(req.APIURL, apiKey, req.SkipTLS)
		case "qbittorrent":
			err = testQBTConnection(req.APIURL, apiKey, req.SkipTLS)
		case "deluge":
			err = testDelugeConnection(req.APIURL, apiKey, req.SkipTLS)
		case "rutorrent":
			err = testRTorrentConnection(req.APIURL, apiKey, req.SkipTLS)
		case "emby":
			err = testEmbyConnection(req.APIURL, apiKey, req.SkipTLS)
		case "jellystat":
			err = testJellystatConnection(req.APIURL, apiKey, req.SkipTLS)
		case "tracearr":
			err = testTracearrConnection(req.APIURL, apiKey, req.SkipTLS)
		case "immich":
			err = testImmichConnection(req.APIURL, apiKey, req.SkipTLS)
		case "kavita":
			err = testKavitaConnection(req.APIURL, apiKey, req.SkipTLS)
		case "komga":
			err = testKomgaConnection(req.APIURL, apiKey, req.SkipTLS)
		case "audiobookshelf":
			err = testABSConnection(req.APIURL, apiKey, req.SkipTLS)
		case "navidrome":
			err = testNavidromeConnection(req.APIURL, apiKey, req.SkipTLS)
		case "photoprism":
			err = testPhotoPrismConnection(req.APIURL, apiKey, req.SkipTLS)
		case "unraid":
			err = testUnraidConnection(req.APIURL, apiKey, req.SkipTLS)
		case "omv":
			err = testOMVConnection(req.APIURL, apiKey, req.SkipTLS)
		case "synology":
			err = testSynologyConnection(req.APIURL, apiKey, req.SkipTLS)
		case "qnap":
			err = testQNAPConnection(req.APIURL, apiKey, req.SkipTLS)
		case "authentik", "customapi":
			err = testAuthentikConnection(req.APIURL, apiKey, req.SkipTLS)
		default:
			err = testGenericConnection(req.APIURL)
		}
		if err != nil {
			// If TLS failed and we weren't already skipping — retry with skipTLS
			// to detect self-signed cert issues
			if !req.SkipTLS && isTLSError(err) {
				writeJSON(w, http.StatusOK, map[string]interface{}{
					"ok":       false,
					"error":    err.Error(),
					"tlsError": true,
					"skipTlsWorks": func() bool {
						var retryErr error
						switch req.Type {
						case "sonarr", "radarr", "lidarr":
							retryErr = testArrConnection(req.APIURL, apiKey, req.Type, true)
						case "plex":
							retryErr = testPlexConnection(req.APIURL, apiKey, true)
						case "jellyfin":
							retryErr = testJellyfinConnection(req.APIURL, apiKey, true)
						case "homeassistant":
							retryErr = testHAConnection(req.APIURL, apiKey, true)
						case "overseerr":
							retryErr = testOverseerrConnection(req.APIURL, apiKey, true)
						case "tautulli":
							retryErr = testTautulliConnection(req.APIURL, apiKey, true)
						case "truenas":
							retryErr = testTrueNASConnection(req.APIURL, apiKey, true)
						case "proxmox":
							retryErr = testProxmoxConnection(req.APIURL, apiKey, true)
						case "kuma":
							retryErr = testKumaConnection(req.APIURL, apiKey, true)
						case "gluetun":
							retryErr = testGluetunConnection(req.APIURL, apiKey, true)
						case "opnsense":
							retryErr = testOPNsenseConnection(req.APIURL, apiKey, true)
						case "pfsense":
							retryErr = testPfSenseConnection(req.APIURL, apiKey, true)
						case "openwrt":
							retryErr = testOpenWrtConnection(req.APIURL, apiKey, true)
						case "omada":
							retryErr = testOmadaConnection(req.APIURL, apiKey, true)
						case "unifi":
							retryErr = testUniFiConnection(req.APIURL, apiKey, true)
						case "traefik":
							retryErr = testTraefikConnection(req.APIURL, apiKey, true)
						case "cloudflare":
							retryErr = testCloudflareConnection(req.APIURL, apiKey, true)
						case "pihole":
							retryErr = testPiHoleConnection(req.APIURL, apiKey, true)
						case "adguard":
							retryErr = testAdGuardConnection(req.APIURL, apiKey, true)
						case "nextdns":
							retryErr = testNextDNSConnection(req.APIURL, apiKey, true)
						case "nginxpm":
							retryErr = testNPMConnection(req.APIURL, apiKey, true)
						case "wgeasy":
							retryErr = testWGEasyConnection(req.APIURL, apiKey, true)
						case "tailscale":
							retryErr = testTailscaleConnection(req.APIURL, apiKey, true)
						case "prometheus":
							retryErr = testPrometheusConnection(req.APIURL, apiKey, true)
						case "grafana":
							retryErr = testGrafanaConnection(req.APIURL, apiKey, true)
						case "autobrr":
							retryErr = testAutobrrrConnection(req.APIURL, apiKey, true)
						case "bazarr":
							retryErr = testBazarrConnection(req.APIURL, apiKey, true)
						case "prowlarr":
							retryErr = testProwlarrConnection(req.APIURL, apiKey, true)
						case "frigate":
							retryErr = testFrigateConnection(req.APIURL, apiKey, true)
						case "blueiris":
							retryErr = testBlueIrisConnection(req.APIURL, apiKey, true)
						case "nextcloud":
							retryErr = testNextcloudConnection(req.APIURL, apiKey, true)
						case "fireflyiii":
							retryErr = testFireflyConnection(req.APIURL, apiKey, true)
						case "netbird":
							retryErr = testNetbirdConnection(req.APIURL, apiKey, true)
						case "actualbudget":
							retryErr = testActualBudgetConnection(req.APIURL, apiKey, true)
						case "scrutiny":
							retryErr = testScrutinyConnection(req.APIURL, apiKey, true)
						case "paperless":
							retryErr = testPaperlessConnection(req.APIURL, apiKey, true)
						case "mealie":
							retryErr = testMealieConnection(req.APIURL, apiKey, true)
						case "grocy":
							retryErr = testGrocyConnection(req.APIURL, apiKey, true)
						case "ghostfolio":
							retryErr = testGhostfolioConnection(req.APIURL, apiKey, true)
						case "coinbase":
							retryErr = testCoinbaseConnection(req.APIURL, apiKey, true)
						case "sabnzbd":
							retryErr = testSABnzbdConnection(req.APIURL, apiKey, true)
						case "nzbget":
							retryErr = testNZBGetConnection(req.APIURL, apiKey, true)
						case "tandoor":
							retryErr = testTandoorConnection(req.APIURL, apiKey, true)
						case "lubelogger":
							retryErr = testLubeLoggerConnection(req.APIURL, apiKey, true)
						case "tdarr":
							retryErr = testTdarrConnection(req.APIURL, apiKey, true)
						case "docspell":
							retryErr = testDocspellConnection(req.APIURL, apiKey, true)
						case "romm":
							retryErr = testRommConnection(req.APIURL, apiKey, true)
						case "pterodactyl":
							retryErr = testPterodactylConnection(req.APIURL, apiKey, true)
						case "maintainerr":
							retryErr = testMaintainerrConnection(req.APIURL, apiKey, true)
						case "caldav":
							retryErr = testCaldavConnection(req.APIURL, apiKey, true)
						case "monica":
							retryErr = testMonicaConnection(req.APIURL, apiKey, true)
						case "homebox":
							retryErr = testHomeboxConnection(req.APIURL, apiKey, true)
						case "wger":
							retryErr = testWgerConnection(req.APIURL, apiKey, true)
						case "fittrackee":
							retryErr = testFittrackeeConnection(req.APIURL, apiKey, true)
						case "spotify":
							retryErr = testSpotifyConnection(apiKey)
						case "lastfm":
							retryErr = testLastFmConnection(apiKey)
						case "strava":
							retryErr = testStravaConnection(apiKey)
						case "duolingo":
							retryErr = testDuolingoConnection(apiKey)
						case "github":
							retryErr = testGitHubConnection(apiKey)
						case "trakt":
							retryErr = testTraktConnection(apiKey)
						case "twitch":
							retryErr = testTwitchConnection(apiKey)
						case "youtube":
							retryErr = testYouTubeConnection(apiKey)
						case "transmission":
							retryErr = testTransmissionConnection(req.APIURL, apiKey, true)
						case "qbittorrent":
							retryErr = testQBTConnection(req.APIURL, apiKey, true)
						case "deluge":
							retryErr = testDelugeConnection(req.APIURL, apiKey, true)
						case "rutorrent":
							retryErr = testRTorrentConnection(req.APIURL, apiKey, true)
						case "emby":
							retryErr = testEmbyConnection(req.APIURL, apiKey, true)
						case "jellystat":
							retryErr = testJellystatConnection(req.APIURL, apiKey, true)
						case "tracearr":
							retryErr = testTracearrConnection(req.APIURL, apiKey, true)
						case "immich":
							retryErr = testImmichConnection(req.APIURL, apiKey, true)
						case "kavita":
							retryErr = testKavitaConnection(req.APIURL, apiKey, true)
						case "komga":
							retryErr = testKomgaConnection(req.APIURL, apiKey, true)
						case "audiobookshelf":
							retryErr = testABSConnection(req.APIURL, apiKey, true)
						case "navidrome":
							retryErr = testNavidromeConnection(req.APIURL, apiKey, true)
						case "photoprism":
							retryErr = testPhotoPrismConnection(req.APIURL, apiKey, true)
						case "unraid":
							retryErr = testUnraidConnection(req.APIURL, apiKey, true)
						case "omv":
							retryErr = testOMVConnection(req.APIURL, apiKey, true)
						case "synology":
							retryErr = testSynologyConnection(req.APIURL, apiKey, true)
						case "qnap":
							retryErr = testQNAPConnection(req.APIURL, apiKey, true)
						case "authentik", "customapi":
							retryErr = testAuthentikConnection(req.APIURL, apiKey, true)
						}
						return retryErr == nil
					}(),
				})
				return
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{"ok": false, "error": err.Error()})
		} else {
			writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true})
		}
	}
}

func GetIntegrationGroups(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		rows, err := db.Query("SELECT group_id FROM integration_groups WHERE integration_id=?", id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query groups")
			return
		}
		defer rows.Close()
		groupIDs := []string{}
		for rows.Next() {
			var gid string
			rows.Scan(&gid)
			groupIDs = append(groupIDs, gid)
		}
		writeJSON(w, http.StatusOK, groupIDs)
	}
}

func SetIntegrationGroups(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		var intName string
		db.QueryRow("SELECT name FROM integrations WHERE id=?", id).Scan(&intName)
		var req struct {
			GroupIDs []string `json:"groupIds"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		tx, _ := db.Begin()
		tx.Exec("DELETE FROM integration_groups WHERE integration_id=?", id)
		for _, gid := range req.GroupIDs {
			tx.Exec("INSERT OR IGNORE INTO integration_groups (integration_id, group_id) VALUES (?,?)", id, gid)
		}
		tx.Commit()
		RecordAudit(db, claims.UserID, claims.Username, "integration.groups_update", id, intName, nil)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func ListMyIntegrations(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		rows, err := db.Query(`
			SELECT id, name, type, api_url, ui_url, COALESCE(config,'{}'), secret_id, enabled, skip_tls, refresh_secs, created_by, created_at
			FROM integrations WHERE created_by = ? ORDER BY name ASC
		`, claims.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query integrations")
			return
		}
		defer rows.Close()
		integrations := []Integration{}
		for rows.Next() {
			var ig Integration
			var enabled int
			var secretID sql.NullString
			var skipTLS int
			rows.Scan(&ig.ID, &ig.Name, &ig.Type, &ig.APIURL, &ig.UIURL, &ig.Config,
				&secretID, &enabled, &skipTLS, &ig.RefreshSecs, &ig.CreatedBy, &ig.CreatedAt)
			ig.Enabled = enabled == 1
			ig.SkipTLS = skipTLS == 1
			if secretID.Valid {
				ig.SecretID = &secretID.String
			}
			integrations = append(integrations, ig)
		}
		writeJSON(w, http.StatusOK, integrations)
	}
}

func UpdateMyIntegration(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		// Verify ownership
		var owner string
		db.QueryRow("SELECT created_by FROM integrations WHERE id=?", id).Scan(&owner)
		if owner != claims.UserID {
			writeError(w, http.StatusForbidden, "not your integration")
			return
		}
		var req struct {
			Name        string  `json:"name"`
			APIURL      string  `json:"apiUrl"`
			UIURL       string  `json:"uiUrl"`
			Config      string  `json:"config"`
			SecretID    *string `json:"secretId"`
			SkipTLS     bool    `json:"skipTls"`
			RefreshSecs int     `json:"refreshSecs"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		req.APIURL = strings.TrimSpace(req.APIURL)
		req.UIURL = strings.TrimSpace(req.UIURL)
		if req.Config == "" {
			req.Config = "{}"
		}
		if req.RefreshSecs < 15 {
			req.RefreshSecs = defaultRefreshSecs("")
		}
		var secretID interface{} = nil
		if req.SecretID != nil && *req.SecretID != "" {
			secretID = *req.SecretID
		}
		skipTLSInt := 0
		if req.SkipTLS {
			skipTLSInt = 1
		}
		_, uerr := db.Exec(`UPDATE integrations SET name=?, api_url=?, ui_url=?, config=?, secret_id=?, skip_tls=?, refresh_secs=? WHERE id=? AND created_by=?`,
			req.Name, req.APIURL, req.UIURL, req.Config, secretID, skipTLSInt, req.RefreshSecs, id, claims.UserID)
		if uerr != nil {
			writeError(w, http.StatusInternalServerError, "update failed")
			return
		}
		// Restart any running worker so it picks up the new config (e.g. skipTLS change)
		StartWorkerForIntegration(db, id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func DeleteMyIntegration(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		db.Exec("DELETE FROM integrations WHERE id=? AND created_by=?", id, claims.UserID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// readIntegrationConfig returns the config JSON for an integration.
// Used by types whose fetch config lives in the config column (stocks, crypto, sports, weather).
func readIntegrationConfig(db *sql.DB, id string) (string, error) {
	var cfg string
	var enabledInt int
	err := db.QueryRow(`SELECT COALESCE(config,'{}'), enabled FROM integrations WHERE id=?`, id).Scan(&cfg, &enabledInt)
	if err != nil {
		return "{}", fmt.Errorf("integration not found: %w", err)
	}
	if enabledInt != 1 {
		return "{}", fmt.Errorf("integration disabled")
	}
	return cfg, nil
}

// resolveIntegration fetches the API URL, UI URL, and decrypted API key for an integration.
func resolveIntegration(db *sql.DB, id string) (apiURL, uiURL, apiKey string, skipTLS bool, err error) {
	var secretID sql.NullString
	var skipTLSInt, enabledInt int
	err = db.QueryRow(`
		SELECT api_url, ui_url, secret_id, skip_tls, enabled FROM integrations WHERE id=?
	`, id).Scan(&apiURL, &uiURL, &secretID, &skipTLSInt, &enabledInt)
	if err != nil {
		return "", "", "", false, fmt.Errorf("integration not found")
	}
	if enabledInt != 1 {
		return "", "", "", false, fmt.Errorf("integration disabled")
	}
	skipTLS = skipTLSInt == 1
	if secretID.Valid {
		var enc string
		if dbErr := db.QueryRow("SELECT value FROM secrets WHERE id=?", secretID.String).Scan(&enc); dbErr == nil {
			// Trim pasted whitespace/newlines — a trailing \n in a stored key
			// makes Go reject the auth header ("invalid header field value")
			// and every request for the integration fails.
			apiKey = strings.TrimSpace(decryptSecret(enc))
		}
	}
	apiURL = strings.TrimSpace(apiURL)
	uiURL = strings.TrimSpace(uiURL)
	return
}

func testArrConnection(apiURL, apiKey, intType string, skipTLS ...bool) error {
	// Sonarr/Radarr use v3, Lidarr uses v1
	apiVersion := "v3"
	if intType == "lidarr" {
		apiVersion = "v1"
	}
	body, err := arrGet(apiURL, apiKey, "/api/"+apiVersion+"/system/status", len(skipTLS) > 0 && skipTLS[0])
	if err != nil {
		return err
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(body, &resp); err != nil || resp["version"] == nil {
		return fmt.Errorf("unexpected response from API")
	}
	return nil
}

func testGenericConnection(apiURL string, skipTLS ...bool) error {
	client := httpClient(len(skipTLS) > 0 && skipTLS[0])
	resp, err := client.Get(apiURL)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return nil
}

// defaultRefreshSecs returns a sensible default TTL for each integration type.
func isTLSError(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "certificate") ||
		strings.Contains(s, "tls") ||
		strings.Contains(s, "x509") ||
		strings.Contains(s, "TLS")
}

func defaultRefreshSecs(igType string) int {
	switch igType {
	case "pfsense", "openwrt":
		return 5
	case "omada":
		return 30
	case "unifi":
		return 30
	case "traefik":
		return 30
	case "cloudflare":
		return 300 // analytics are 1-minute resolution; polling faster wastes quota
	case "pihole":
		return 30
	case "adguard":
		return 30
	case "nextdns":
		return 30
	case "nginxpm":
		return 60
	case "wgeasy":
		return 30
	case "tailscale":
		return 60
	case "prometheus":
		return 30
	case "grafana":
		return 60
	case "autobrr":
		return 30
	case "bazarr":
		return 60
	case "prowlarr":
		return 60
	case "frigate":
		return 15
	case "blueiris":
		return 30
	case "nextcloud":
		return 300
	case "fireflyiii":
		return 3600
	case "netbird":
		return 60
	case "actualbudget":
		return 300
	case "scrutiny":
		return 300
	case "paperless":
		return 300
	case "mealie":
		return 900
	case "grocy":
		return 300
	case "ghostfolio":
		return 300
	case "coinbase":
		return 300
	case "sabnzbd", "nzbget":
		return 15
	case "tdarr":
		return 30
	case "tandoor", "lubelogger", "docspell", "romm":
		return 900
	case "maintainerr":
		return 300
	case "monica", "homebox", "wger", "fittrackee":
		return 900
	case "spotify", "lastfm":
		return 30
	case "strava", "duolingo":
		return 60
	case "github":
		return 120
	case "trakt":
		return 60
	case "twitch":
		return 60
	case "youtube":
		return 3600
	case "pterodactyl":
		return 30
	case "opnsense", "truenas", "proxmox", "transmission", "qbittorrent", "deluge", "rutorrent", "unraid", "omv", "synology", "qnap", "emby":
		return 30
	case "plex", "jellyfin", "homeassistant", "tautulli", "jellystat", "tracearr", "kuma", "gluetun":
		return 60
	case "authentik", "customapi":
		return 300
	case "overseerr":
		return 120
	case "sonarr", "radarr", "lidarr", "photoprism", "immich", "kavita", "komga":
		return 1800
	case "audiobookshelf", "navidrome":
		return 60
	case "calendar":
		return 3600
	default:
		return 60
	}
}
