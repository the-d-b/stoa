package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

// ── Series cache ─────────────────────────────────────────────────────────────
// The full series list is large (2-3MB for big libraries). Cache it per integration
// and only refresh every 30 minutes to avoid blocking panel renders.

type seriesCacheEntry struct {
	data      []map[string]interface{}
	fetchedAt time.Time
}

var (
	seriesCache   = map[string]*seriesCacheEntry{}
	seriesCacheMu sync.Mutex
)

const seriesCacheTTL = 30 * time.Minute

func getCachedSeries(apiURL, apiKey string) ([]map[string]interface{}, error) {
	key := apiURL
	seriesCacheMu.Lock()
	entry, ok := seriesCache[key]
	seriesCacheMu.Unlock()

	if ok && time.Since(entry.fetchedAt) < seriesCacheTTL {
		log.Printf("[SONARR] series cache hit (age=%s)", time.Since(entry.fetchedAt).Round(time.Second))
		return entry.data, nil
	}

	log.Printf("[SONARR] series cache miss — fetching from API")
	data, err := sonarrGet(apiURL, apiKey, "/api/v3/series")
	if err != nil {
		// On error, return stale cache if available
		if ok {
			log.Printf("[SONARR] series fetch failed, using stale cache: %v", err)
			return entry.data, nil
		}
		return nil, err
	}

	var seriesList []map[string]interface{}
	if umerr := json.Unmarshal(data, &seriesList); umerr != nil {
		log.Printf("[SONARR] series unmarshal error: %v (len=%d)", umerr, len(data))
		if ok { return entry.data, nil }
		return nil, umerr
	}

	log.Printf("[SONARR] series fetched total=%d (data len=%d)", len(seriesList), len(data))
	seriesCacheMu.Lock()
	seriesCache[key] = &seriesCacheEntry{data: seriesList, fetchedAt: time.Now()}
	seriesCacheMu.Unlock()
	return seriesList, nil
}

// ── Integration CRUD ──────────────────────────────────────────────────────────

type Integration struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Type      string  `json:"type"`
	APIURL    string  `json:"apiUrl"`
	UIURL     string  `json:"uiUrl"`
	SecretID  *string `json:"secretId"`
	Enabled   bool    `json:"enabled"`
	CreatedBy string  `json:"createdBy"`
	CreatedAt string  `json:"createdAt"`
}

func ListIntegrations(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var rows *sql.Rows
		var err error
		if claims.Role == models.RoleAdmin {
			// Admin screens: only show system integrations (no owner)
			rows, err = db.Query(`
				SELECT id, name, type, api_url, ui_url, secret_id, enabled, created_by, created_at
				FROM integrations WHERE created_by = 'SYSTEM' ORDER BY name ASC
			`)
		} else {
			// Profile: system integrations shared to user's groups + user's own integrations
			rows, err = db.Query(`
				SELECT DISTINCT i.id, i.name, i.type, i.api_url, i.ui_url,
				       i.secret_id, i.enabled, i.created_by, i.created_at
				FROM integrations i
				WHERE
					-- User's own integrations
					i.created_by = ?
					OR
					-- System integrations with no group restrictions (visible to all)
					(i.created_by = 'SYSTEM' AND NOT EXISTS (
						SELECT 1 FROM integration_groups WHERE integration_id = i.id
					))
					OR
					-- System integrations restricted to groups user belongs to
					(i.created_by = 'SYSTEM' AND EXISTS (
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
			rows.Scan(&ig.ID, &ig.Name, &ig.Type, &ig.APIURL, &ig.UIURL,
				&secretID, &enabled, &ig.CreatedBy, &ig.CreatedAt)
			ig.Enabled = enabled == 1
			if secretID.Valid {
				ig.SecretID = &secretID.String
			}
			integrations = append(integrations, ig)
		}
		writeJSON(w, http.StatusOK, integrations)
	}
}

func CreateIntegration(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var req struct {
			Name     string  `json:"name"`
			Type     string  `json:"type"`
			APIURL   string  `json:"apiUrl"`
			UIURL    string  `json:"uiUrl"`
			SecretID *string `json:"secretId"`
			Scope    string  `json:"scope"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil ||
			req.Name == "" || req.Type == "" || req.APIURL == "" {
			writeError(w, http.StatusBadRequest, "name, type and apiUrl required")
			return
		}

		// Determine owner: explicit personal request or non-admin = owned by user
		// Admin creating from admin page (no scope field) = system integration (NULL owner)
		ownerID := "SYSTEM"
		if req.Scope == "personal" || claims.Role != models.RoleAdmin {
			ownerID = claims.UserID
		}

		id := generateID()
		var secretID interface{} = nil
		if req.SecretID != nil && *req.SecretID != "" {
			secretID = *req.SecretID
		}

		_, err := db.Exec(`
			INSERT INTO integrations (id, name, type, api_url, ui_url, secret_id, created_by)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`, id, req.Name, req.Type, req.APIURL, req.UIURL, secretID, ownerID)
		if err != nil {
			log.Printf("[INTEGRATIONS] create error: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to create integration")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"id": id})
	}
}

func UpdateIntegration(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var req struct {
			Name     *string `json:"name"`
			APIURL   *string `json:"apiUrl"`
			UIURL    *string `json:"uiUrl"`
			SecretID *string `json:"secretId"`
			Enabled  *bool   `json:"enabled"`
		}
		json.NewDecoder(r.Body).Decode(&req)

		if req.Name != nil {
			db.Exec("UPDATE integrations SET name=? WHERE id=?", *req.Name, id)
		}
		if req.APIURL != nil {
			db.Exec("UPDATE integrations SET api_url=? WHERE id=?", *req.APIURL, id)
		}
		if req.UIURL != nil {
			db.Exec("UPDATE integrations SET ui_url=? WHERE id=?", *req.UIURL, id)
		}
		if req.SecretID != nil {
			if *req.SecretID == "" {
				db.Exec("UPDATE integrations SET secret_id=NULL WHERE id=?", id)
			} else {
				db.Exec("UPDATE integrations SET secret_id=? WHERE id=?", *req.SecretID, id)
			}
		}
		if req.Enabled != nil {
			db.Exec("UPDATE integrations SET enabled=? WHERE id=?", boolToInt(*req.Enabled), id)
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func DeleteIntegration(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		if claims.Role == models.RoleAdmin {
			db.Exec("DELETE FROM integrations WHERE id=? AND created_by='SYSTEM'", id)
		} else {
			db.Exec("DELETE FROM integrations WHERE id=? AND created_by=?", id, claims.UserID)
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Test connection ───────────────────────────────────────────────────────────

func TestIntegration(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Type     string  `json:"type"`
			APIURL   string  `json:"apiUrl"`
			SecretID *string `json:"secretId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}

		apiKey := ""
		if req.SecretID != nil && *req.SecretID != "" {
			var enc string
			if err := db.QueryRow("SELECT value FROM secrets WHERE id=?", *req.SecretID).Scan(&enc); err == nil {
				apiKey = decryptSecret(enc)
			}
		}

		var testErr error
		switch req.Type {
		case "sonarr", "radarr", "lidarr", "readarr":
			testErr = testArrConnection(req.APIURL, apiKey)
		default:
			testErr = testGenericConnection(req.APIURL)
		}

		if testErr != nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"ok":    false,
				"error": testErr.Error(),
			})
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true})
	}
}

func testArrConnection(apiURL, apiKey string) error {
	client := &http.Client{Timeout: 8 * time.Second}
	url := strings.TrimRight(apiURL, "/") + "/api/v3/system/status"
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return fmt.Errorf("invalid URL: %v", err)
	}
	if apiKey != "" {
		req.Header.Set("X-Api-Key", apiKey)
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("connection failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 {
		return fmt.Errorf("authentication failed — check API key")
	}
	if resp.StatusCode != 200 {
		return fmt.Errorf("unexpected response: %d", resp.StatusCode)
	}
	return nil
}

func testGenericConnection(apiURL string) error {
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get(apiURL)
	if err != nil {
		return fmt.Errorf("connection failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 500 {
		return fmt.Errorf("server error: %d", resp.StatusCode)
	}
	return nil
}

// ── Panel data endpoint ───────────────────────────────────────────────────────

func GetPanelData(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]

		var panelType, configStr string
		err := db.QueryRow("SELECT type, config FROM panels WHERE id=?", id).Scan(&panelType, &configStr)
		if err != nil {
			writeError(w, http.StatusNotFound, "panel not found")
			return
		}

		var config map[string]interface{}
		json.Unmarshal([]byte(configStr), &config)

		switch panelType {
		case "sonarr":
			data, err := fetchSonarrPanelData(db, config)
			if err != nil {
				log.Printf("[PANEL DATA] sonarr error: %v", err)
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, data)
		case "calendar":
			data, err := fetchCalendarData(db, config)
			if err != nil {
				log.Printf("[PANEL DATA] calendar error: %v", err)
				writeError(w, http.StatusInternalServerError, err.Error())
				return
		}
			writeJSON(w, http.StatusOK, data)
		default:
			writeJSON(w, http.StatusOK, map[string]interface{}{})
		}
	}
}

// ── Sonarr fetch ──────────────────────────────────────────────────────────────

type SonarrPanelData struct {
	Upcoming       []SonarrEpisode `json:"upcoming"`
	History        []SonarrHistory `json:"history"`
	ZeroByte       []SonarrSeries  `json:"zeroByte"`
	UIURL          string          `json:"uiUrl"`
	SeriesCount    int             `json:"seriesCount"`
	EpisodeCount   int             `json:"episodeCount"`
	OnDiskCount    int             `json:"onDiskCount"`
}

type SonarrEpisode struct {
	ID          int    `json:"id"`
	SeriesTitle string `json:"seriesTitle"`
	Title       string `json:"title"`
	Season      int    `json:"season"`
	Episode     int    `json:"episode"`
	AirDate     string `json:"airDate"`
	HasFile     bool   `json:"hasFile"`
}

type SonarrHistory struct {
	SeriesTitle string `json:"seriesTitle"`
	Title       string `json:"title"`
	Date        string `json:"date"`
	Season      int    `json:"season"`
	Episode     int    `json:"episode"`
}

type SonarrSeries struct {
	ID    int    `json:"id"`
	Title string `json:"title"`
	Year  int    `json:"year"`
}

func fetchSonarrPanelData(db *sql.DB, config map[string]interface{}) (*SonarrPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}

	apiURL, uiURL, apiKey, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}

	data := &SonarrPanelData{UIURL: uiURL}

	// Fetch upcoming episodes — use 90 day window to ensure we get next N regardless of gap
	upcStart := time.Now().Format("2006-01-02")
	upcEnd   := time.Now().AddDate(0, 0, 90).Format("2006-01-02")
	upcoming, err := sonarrGet(apiURL, apiKey,
		fmt.Sprintf("/api/v3/calendar?includeSeries=true&unmonitored=true&start=%s&end=%s", upcStart, upcEnd))
	if err == nil {
		var episodes []map[string]interface{}
		json.Unmarshal(upcoming, &episodes)
		log.Printf("[SONARR] upcoming count=%d (start=%s end=%s)", len(episodes), upcStart, upcEnd)
		for idx, ep := range episodes {
			// Always check for target episodes regardless of index
			if ttl, ok := ep["title"].(string); ok {
				if ttl == "Knick-Knack" || ttl == "Teenage Kix" {
					ad, _ := ep["airDate"].(string)
					adu, _ := ep["airDateUtc"].(string)
					log.Printf("[UPCOMING TARGET] %q airDate=%q airDateUtc=%q", ttl, ad, adu)
				}
			}
			if idx < 5 {
				title, _ := ep["title"].(string)
				airDate, _ := ep["airDate"].(string)
				airDateUtc, _ := ep["airDateUtc"].(string)
					log.Printf("[SONARR] ep[%d]: title=%q airDate=%q airDateUtc=%q", idx, title, airDate, airDateUtc)
				targetEps := map[string]bool{"Knick-Knack": true, "Teenage Kix": true}
				if targetEps[title] {
					log.Printf("[UPCOMING DEBUG] FOUND target ep %q airDate=%q airDateUtc=%q", title, airDate, airDateUtc)
				}
			}
			ep := ep // shadow for loop var
			series, _ := ep["series"].(map[string]interface{})
			seriesTitle := ""
			if series != nil {
				seriesTitle, _ = series["title"].(string)
			}
			// Skip already-downloaded episodes
			hasFile := ep["hasFile"] == true
			e := SonarrEpisode{
				SeriesTitle: seriesTitle,
				AirDate:     stringVal(ep, "airDate"), // local date, not UTC to avoid day offset
				HasFile:     hasFile,
			}
			if t, ok := ep["title"].(string); ok { e.Title = t }
			if s, ok := ep["seasonNumber"].(float64); ok { e.Season = int(s) }
			if n, ok := ep["episodeNumber"].(float64); ok { e.Episode = int(n) }
			if i, ok := ep["id"].(float64); ok { e.ID = int(i) }
			data.Upcoming = append(data.Upcoming, e)
		}
	}

	// Fetch recent history
	hist, err := sonarrGet(apiURL, apiKey, "/api/v3/history?pageSize=5&pageSize=5&sortKey=date&sortDirection=descending&eventType=1&includeSeries=true&includeEpisode=true")
	if err == nil {
		var histResp map[string]interface{}
		json.Unmarshal(hist, &histResp)
		if records, ok := histResp["records"].([]interface{}); ok {
			for _, r := range records {
				rec, _ := r.(map[string]interface{})
				if rec == nil { continue }

				// Try top-level series/episode objects first (v3 with include params)
				series, _ := rec["series"].(map[string]interface{})
				episode, _ := rec["episode"].(map[string]interface{})

				seriesTitle := ""
				if series != nil {
					seriesTitle, _ = series["title"].(string)
				}
				// Fallback: sourceTitle often contains "Series - Episode Title"
				if seriesTitle == "" {
					seriesTitle, _ = rec["sourceTitle"].(string)
				}

				epTitle := ""
				season := 0
				epNum := 0
				if episode != nil {
					epTitle, _ = episode["title"].(string)
					if s, ok := episode["seasonNumber"].(float64); ok { season = int(s) }
					if n, ok := episode["episodeNumber"].(float64); ok { epNum = int(n) }
				}

				data.History = append(data.History, SonarrHistory{
					SeriesTitle: seriesTitle,
					Title:       epTitle,
					Date:        stringVal(rec, "date"),
					Season:      season,
					Episode:     epNum,
				})
			}
		}
	}

	// Fetch zero-byte series via cache — avoids re-fetching 2-3MB on every panel render
	seriesList, seriesErr := getCachedSeries(apiURL, apiKey)
	if seriesErr != nil {
		log.Printf("[SONARR] series fetch error: %v", seriesErr)
	} else {
		data.SeriesCount = len(seriesList)
		for _, s := range seriesList {
			// sizeOnDisk is unreliable — Sonarr only updates it after manual rescan
			// Use episodeFileCount/episodeCount from statistics instead
			statistics, _ := s["statistics"].(map[string]interface{})
			episodeFileCount := 0
			if statistics != nil {
				if v, ok := statistics["episodeFileCount"].(float64); ok { episodeFileCount = int(v) }
				if v, ok := statistics["episodeCount"].(float64); ok { data.EpisodeCount += int(v) }
				data.OnDiskCount += episodeFileCount
			}
			seriesTitle := ""
			if t, ok := s["title"].(string); ok { seriesTitle = t }

			// Targeted debug for known empty series — dump raw statistics
			targetSeries := map[string]bool{
				"90 Day: The Last Resort":  true,
				"Body of Evidence":         true,
				"Lucky (2026)":             true,
				"Spider-Noir":              true,
				"Warhammer 40,000":         true,
				"Wuthering Heights (1978)": true,
			}
			if targetSeries[seriesTitle] {
				statRaw, _ := json.Marshal(statistics)
				sizeRaw := s["sizeOnDisk"]
				log.Printf("[ZERO-BYTE DEBUG] %q: episodeFileCount=%d sizeOnDisk=%v stats=%s",
					seriesTitle, episodeFileCount, sizeRaw, string(statRaw))
			}

			if episodeFileCount == 0 { // episodeCount omitted — unmonitored series may show 0 even with known episodes
				ss := SonarrSeries{}
				ss.Title = seriesTitle
				if y, ok := s["year"].(float64); ok { ss.Year = int(y) }
				if i, ok := s["id"].(float64); ok { ss.ID = int(i) }
				data.ZeroByte = append(data.ZeroByte, ss)
			}
		}
		log.Printf("[SONARR] zero-byte count=%d", len(data.ZeroByte))
	}

	return data, nil
}

func fetchCalendarData(db *sql.DB, config map[string]interface{}) (map[string]interface{}, error) {
	sources, _ := config["sources"].([]interface{})
	events := []map[string]interface{}{}

	for _, src := range sources {
		source, _ := src.(map[string]interface{})
		if source == nil { continue }
		srcType := stringVal(source, "type")
		integrationID := stringVal(source, "integrationId")
		if integrationID == "" { continue }

		daysAhead := 30
		if v, ok := source["daysAhead"].(float64); ok { daysAhead = int(v) }

		switch srcType {
		case "sonarr":
			apiURL, _, apiKey, err := resolveIntegration(db, integrationID)
			if err != nil { continue }
			calStart := time.Now().Format("2006-01-02")
			calEnd   := time.Now().AddDate(0, 0, daysAhead).Format("2006-01-02")
			upcoming, err := sonarrGet(apiURL, apiKey,
				fmt.Sprintf("/api/v3/calendar?includeSeries=true&unmonitored=true&start=%s&end=%s", calStart, calEnd))
			if err != nil { continue }
			var episodes []map[string]interface{}
			json.Unmarshal(upcoming, &episodes)
			log.Printf("[CALENDAR] sonarr returned %d episodes (start=%s end=%s)", len(episodes), calStart, calEnd)
			for cidx, ep := range episodes {
				if cidx < 5 {
					t, _ := ep["title"].(string)
					d, _ := ep["airDate"].(string)
						log.Printf("[CALENDAR] ep[%d]: %q on %q", cidx, t, d)
				}
				_ = cidx
			}
			for _, ep := range episodes {
				series, _ := ep["series"].(map[string]interface{})
				seriesTitle := ""
				if series != nil { seriesTitle, _ = series["title"].(string) }
				epTitle, _ := ep["title"].(string)
				airDate, _ := ep["airDate"].(string) // local date avoids UTC day offset
				events = append(events, map[string]interface{}{
					"source":  "sonarr",
					"date":    airDate,
					"title":   fmt.Sprintf("%s — %s", seriesTitle, epTitle),
					"color":   "#60a5fa",
					"hasFile": ep["hasFile"] == true,
				})
			}
		}
	}

	return map[string]interface{}{"events": events}, nil
}

func resolveIntegration(db *sql.DB, id string) (apiURL, uiURL, apiKey string, err error) {
	var secretID sql.NullString
	err = db.QueryRow(`
		SELECT api_url, ui_url, secret_id FROM integrations WHERE id=? AND enabled=1
	`, id).Scan(&apiURL, &uiURL, &secretID)
	if err != nil {
		return "", "", "", fmt.Errorf("integration not found")
	}
	if secretID.Valid {
		var enc string
		if dbErr := db.QueryRow("SELECT value FROM secrets WHERE id=?", secretID.String).Scan(&enc); dbErr == nil {
			apiKey = decryptSecret(enc)
		}
	}
	return
}

func sonarrGet(apiURL, apiKey, path string) ([]byte, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	url := strings.TrimRight(apiURL, "/") + path
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	if apiKey != "" {
		req.Header.Set("X-Api-Key", apiKey)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("sonarr returned %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024))
}

// ── Integration group access ──────────────────────────────────────────────────

func SetIntegrationGroups(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
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
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ListMyIntegrations returns only integrations owned by the current user, regardless of role.
func ListMyIntegrations(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		rows, err := db.Query(`
			SELECT id, name, type, api_url, ui_url, secret_id, enabled, created_by, created_at
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
			rows.Scan(&ig.ID, &ig.Name, &ig.Type, &ig.APIURL, &ig.UIURL,
				&secretID, &enabled, &ig.CreatedBy, &ig.CreatedAt)
			ig.Enabled = enabled == 1
			if secretID.Valid {
				ig.SecretID = &secretID.String
			}
			integrations = append(integrations, ig)
		}
		writeJSON(w, http.StatusOK, integrations)
	}
}
