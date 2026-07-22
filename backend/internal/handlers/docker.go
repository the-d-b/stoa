package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type DockerHostRow struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Type    string `json:"type"` // "local" or "remote"
	URL     string `json:"url"`
	Enabled bool   `json:"enabled"`
}

type DockerContainer struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Image    string  `json:"image"`
	State    string  `json:"state"`
	Status   string  `json:"status"`
	CPU      float64 `json:"cpu"`
	MemUsed  int64   `json:"memUsed"`
	MemLimit int64   `json:"memLimit"`
	MemPct   float64 `json:"memPct"`
}

type DockerHostData struct {
	DockerHostRow
	Containers []DockerContainer `json:"containers"`
	Error      string            `json:"error,omitempty"`
}

type DockerConfig struct {
	Enabled  bool           `json:"enabled"`
	Groups   []models.Group `json:"groups"`
	GroupIDs []string       `json:"groupIds"`
}

// DockerApp is a tile derived from Homepage-style labels on a container —
// see the "Docker Apps" panel. Only the label subset that maps to a static
// tile (name/icon/href/description/group/weight) is honored; Homepage's
// homepage.widget.* labels (live stats scraping) are deliberately not
// supported since stoa's own Integration/Panel system already covers that,
// with more capability, per instance.
type DockerApp struct {
	Name        string `json:"name"`
	Icon        string `json:"icon,omitempty"`
	Href        string `json:"href,omitempty"`
	Description string `json:"description,omitempty"`
	Group       string `json:"group"`
	Weight      int    `json:"weight"`
	Host        string `json:"host"`
	State       string `json:"state"`
}

type DockerAppsData struct {
	Enabled   bool        `json:"enabled"`
	HasAccess bool        `json:"hasAccess"`
	Apps      []DockerApp `json:"apps"`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func dockerHTTPClient(host DockerHostRow) (*http.Client, string) {
	if host.Type == "local" {
		transport := &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				return (&net.Dialer{}).DialContext(ctx, "unix", "/var/run/docker.sock")
			},
		}
		return &http.Client{Transport: transport, Timeout: 10 * time.Second}, "http://localhost"
	}
	return &http.Client{Timeout: 10 * time.Second}, host.URL
}

func userHasDockerAccess(db *sql.DB, userID string, role models.Role) bool {
	if role == models.RoleAdmin {
		return true
	}
	var groupsJSON string
	db.QueryRow("SELECT value FROM app_config WHERE key='docker_groups'").Scan(&groupsJSON)
	if groupsJSON == "" {
		return false
	}
	var groupIDs []string
	if err := json.Unmarshal([]byte(groupsJSON), &groupIDs); err != nil || len(groupIDs) == 0 {
		return false
	}
	for _, gid := range groupIDs {
		var count int
		db.QueryRow("SELECT COUNT(*) FROM user_groups WHERE user_id=? AND group_id=?", userID, gid).Scan(&count)
		if count > 0 {
			return true
		}
	}
	return false
}

func fetchContainersWithStats(client *http.Client, baseURL string) ([]DockerContainer, error) {
	resp, err := client.Get(baseURL + "/containers/json?all=1")
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	var raw []struct {
		ID     string   `json:"Id"`
		Names  []string `json:"Names"`
		Image  string   `json:"Image"`
		State  string   `json:"State"`
		Status string   `json:"Status"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}

	containers := make([]DockerContainer, len(raw))
	for i, c := range raw {
		name := c.ID[:12]
		if len(c.Names) > 0 {
			name = c.Names[0]
			if len(name) > 0 && name[0] == '/' {
				name = name[1:]
			}
		}
		containers[i] = DockerContainer{
			ID:     c.ID,
			Name:   name,
			Image:  c.Image,
			State:  c.State,
			Status: c.Status,
		}
	}

	// Fetch stats for all containers in parallel with a 8s deadline
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	var wg sync.WaitGroup
	for i, c := range containers {
		if c.State != "running" {
			continue
		}
		wg.Add(1)
		go func(idx int, id string) {
			defer wg.Done()
			req, _ := http.NewRequestWithContext(ctx, "GET",
				baseURL+"/containers/"+id+"/stats?stream=false&one-shot=true", nil)
			r, err := client.Do(req)
			if err != nil {
				return
			}
			defer r.Body.Close()

			var stats struct {
				CPUStats struct {
					CPUUsage struct {
						TotalUsage uint64 `json:"total_usage"`
					} `json:"cpu_usage"`
					SystemCPUUsage uint64 `json:"system_cpu_usage"`
					OnlineCPUs     int    `json:"online_cpus"`
				} `json:"cpu_stats"`
				PreCPUStats struct {
					CPUUsage struct {
						TotalUsage uint64 `json:"total_usage"`
					} `json:"cpu_usage"`
					SystemCPUUsage uint64 `json:"system_cpu_usage"`
				} `json:"precpu_stats"`
				MemoryStats struct {
					Usage uint64 `json:"usage"`
					Limit uint64 `json:"limit"`
					Cache uint64 `json:"cache"`
				} `json:"memory_stats"`
			}
			if err := json.NewDecoder(r.Body).Decode(&stats); err != nil {
				return
			}

			cpuDelta := float64(stats.CPUStats.CPUUsage.TotalUsage - stats.PreCPUStats.CPUUsage.TotalUsage)
			sysDelta := float64(stats.CPUStats.SystemCPUUsage - stats.PreCPUStats.SystemCPUUsage)
			numCPUs := stats.CPUStats.OnlineCPUs
			if numCPUs == 0 {
				numCPUs = 1
			}
			var cpuPct float64
			if sysDelta > 0 {
				cpuPct = (cpuDelta / sysDelta) * float64(numCPUs) * 100.0
			}

			memUsed := int64(stats.MemoryStats.Usage) - int64(stats.MemoryStats.Cache)
			if memUsed < 0 {
				memUsed = int64(stats.MemoryStats.Usage)
			}
			memLimit := int64(stats.MemoryStats.Limit)
			var memPct float64
			if memLimit > 0 {
				memPct = float64(memUsed) / float64(memLimit) * 100.0
			}

			containers[idx].CPU = cpuPct
			containers[idx].MemUsed = memUsed
			containers[idx].MemLimit = memLimit
			containers[idx].MemPct = memPct
		}(i, c.ID)
	}
	wg.Wait()

	return containers, nil
}

func loadDockerHosts(db *sql.DB) ([]DockerHostRow, error) {
	rows, err := db.Query("SELECT id, name, type, url, enabled FROM docker_hosts ORDER BY created_at ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var hosts []DockerHostRow
	for rows.Next() {
		var h DockerHostRow
		var enabled int
		rows.Scan(&h.ID, &h.Name, &h.Type, &h.URL, &enabled)
		h.Enabled = enabled == 1
		hosts = append(hosts, h)
	}
	if hosts == nil {
		hosts = []DockerHostRow{}
	}
	return hosts, nil
}

// ── Docker Apps (Homepage-label-driven tiles) ───────────────────────────────

// parseDockerApp turns a container's labels into a tile, following Homepage's
// label convention. A container only becomes a tile if it carries at least
// one of homepage.name / homepage.href — that presence is the admin's opt-in
// signal; containers with no such labels are silently skipped.
func parseDockerApp(hostName, containerName, state string, labels map[string]string) (DockerApp, bool) {
	name, hasName := labels["homepage.name"]
	href, hasHref := labels["homepage.href"]
	if !hasName && !hasHref {
		return DockerApp{}, false
	}
	if name == "" {
		name = containerName
	}
	group := labels["homepage.group"]
	if group == "" {
		group = "Other"
	}
	weight := 0
	if w := labels["homepage.weight"]; w != "" {
		if n, err := strconv.Atoi(w); err == nil {
			weight = n
		}
	}
	return DockerApp{
		Name:        name,
		Icon:        labels["homepage.icon"],
		Href:        href,
		Description: labels["homepage.description"],
		Group:       group,
		Weight:      weight,
		Host:        hostName,
		State:       state,
	}, true
}

func fetchDockerApps(client *http.Client, baseURL, hostName string) ([]DockerApp, error) {
	resp, err := client.Get(baseURL + "/containers/json?all=1")
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	var raw []struct {
		Names  []string          `json:"Names"`
		State  string            `json:"State"`
		Labels map[string]string `json:"Labels"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}

	apps := make([]DockerApp, 0, len(raw))
	for _, c := range raw {
		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		if app, ok := parseDockerApp(hostName, name, c.State, c.Labels); ok {
			apps = append(apps, app)
		}
	}
	return apps, nil
}

// fetchDockerAppsPanelData implements the panelFetchers signature for the
// "dockerapps" panel type. Access control (docker_enabled + docker_groups)
// is already enforced by GetPanelData before this runs — see the special
// case there — so by the time this executes the caller is known-authorized
// and the result is always Enabled:true, HasAccess:true.
func fetchDockerAppsPanelData(db *sql.DB, _ map[string]interface{}) (interface{}, error) {
	hosts, err := loadDockerHosts(db)
	if err != nil {
		return nil, err
	}

	var mu sync.Mutex
	var wg sync.WaitGroup
	apps := []DockerApp{}

	for _, h := range hosts {
		if !h.Enabled {
			continue
		}
		wg.Add(1)
		go func(host DockerHostRow) {
			defer wg.Done()
			client, baseURL := dockerHTTPClient(host)
			hostApps, err := fetchDockerApps(client, baseURL, host.Name)
			if err != nil {
				logErrorf("DOCKER", "apps: host %s (%s) error: %v", host.Name, host.Type, err)
				return
			}
			mu.Lock()
			apps = append(apps, hostApps...)
			mu.Unlock()
		}(h)
	}
	wg.Wait()

	sort.Slice(apps, func(i, j int) bool {
		if apps[i].Group != apps[j].Group {
			return apps[i].Group < apps[j].Group
		}
		if apps[i].Weight != apps[j].Weight {
			return apps[i].Weight < apps[j].Weight
		}
		return apps[i].Name < apps[j].Name
	})

	return DockerAppsData{Enabled: true, HasAccess: true, Apps: apps}, nil
}

// ── Admin handlers ────────────────────────────────────────────────────────────

func GetDockerConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var enabledStr string
		db.QueryRow("SELECT value FROM app_config WHERE key='docker_enabled'").Scan(&enabledStr)
		enabled := enabledStr == "true"

		var groupsJSON string
		db.QueryRow("SELECT value FROM app_config WHERE key='docker_groups'").Scan(&groupsJSON)
		var groupIDs []string
		if groupsJSON != "" {
			json.Unmarshal([]byte(groupsJSON), &groupIDs)
		}
		if groupIDs == nil {
			groupIDs = []string{}
		}

		// Load full group objects for the stored IDs
		groups := []models.Group{}
		for _, gid := range groupIDs {
			var g models.Group
			err := db.QueryRow("SELECT id, name, COALESCE(description,''), created_at FROM groups WHERE id=?", gid).
				Scan(&g.ID, &g.Name, &g.Description, &g.CreatedAt)
			if err == nil {
				groups = append(groups, g)
			}
		}

		hosts, _ := loadDockerHosts(db)
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"enabled":  enabled,
			"groupIds": groupIDs,
			"groups":   groups,
			"hosts":    hosts,
		})
	}
}

func SaveDockerConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Enabled  bool     `json:"enabled"`
			GroupIDs []string `json:"groupIds"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		upsert := func(key, value string) {
			db.Exec(`INSERT INTO app_config (key, value) VALUES (?, ?)
				ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`, key, value)
		}
		if req.Enabled {
			upsert("docker_enabled", "true")
		} else {
			upsert("docker_enabled", "false")
		}
		if req.GroupIDs == nil {
			req.GroupIDs = []string{}
		}
		b, _ := json.Marshal(req.GroupIDs)
		upsert("docker_groups", string(b))
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func ListDockerHosts(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		hosts, err := loadDockerHosts(db)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		writeJSON(w, http.StatusOK, hosts)
	}
}

func CreateDockerHost(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name string `json:"name"`
			Type string `json:"type"`
			URL  string `json:"url"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
			writeError(w, http.StatusBadRequest, "name required")
			return
		}
		if req.Type != "local" && req.Type != "remote" {
			writeError(w, http.StatusBadRequest, "type must be local or remote")
			return
		}
		if req.Type == "remote" && req.URL == "" {
			writeError(w, http.StatusBadRequest, "url required for remote host")
			return
		}
		id := generateID()
		_, err := db.Exec("INSERT INTO docker_hosts (id, name, type, url) VALUES (?, ?, ?, ?)",
			id, req.Name, req.Type, req.URL)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "insert failed")
			return
		}
		writeJSON(w, http.StatusCreated, DockerHostRow{ID: id, Name: req.Name, Type: req.Type, URL: req.URL, Enabled: true})
	}
}

func UpdateDockerHost(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		var req struct {
			Name    string `json:"name"`
			Type    string `json:"type"`
			URL     string `json:"url"`
			Enabled bool   `json:"enabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		enabled := 0
		if req.Enabled {
			enabled = 1
		}
		db.Exec("UPDATE docker_hosts SET name=?, type=?, url=?, enabled=? WHERE id=?",
			req.Name, req.Type, req.URL, enabled, id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func DeleteDockerHost(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		db.Exec("DELETE FROM docker_hosts WHERE id=?", id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func TestDockerHost(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ID   string `json:"id"`
			Type string `json:"type"`
			URL  string `json:"url"`
		}
		json.NewDecoder(r.Body).Decode(&req)

		var host DockerHostRow
		if req.ID != "" {
			err := db.QueryRow("SELECT id, name, type, url FROM docker_hosts WHERE id=?", req.ID).
				Scan(&host.ID, &host.Name, &host.Type, &host.URL)
			if err != nil {
				writeError(w, http.StatusNotFound, "host not found")
				return
			}
		} else {
			host = DockerHostRow{Type: req.Type, URL: req.URL}
		}

		client, baseURL := dockerHTTPClient(host)
		resp, err := client.Get(baseURL + "/version")
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{"ok": false, "error": err.Error()})
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			writeJSON(w, http.StatusOK, map[string]interface{}{"ok": false, "error": fmt.Sprintf("HTTP %d", resp.StatusCode)})
			return
		}
		var version map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&version)
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"ok":      true,
			"version": version["Version"],
		})
	}
}

// ── User-facing handlers ──────────────────────────────────────────────────────

func GetDockerAccess(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var enabledStr string
		db.QueryRow("SELECT value FROM app_config WHERE key='docker_enabled'").Scan(&enabledStr)
		enabled := enabledStr == "true"
		hasAccess := enabled && userHasDockerAccess(db, claims.UserID, claims.Role)
		writeJSON(w, http.StatusOK, map[string]bool{"hasAccess": hasAccess})
	}
}

func GetDockerContainers(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var enabledStr string
		db.QueryRow("SELECT value FROM app_config WHERE key='docker_enabled'").Scan(&enabledStr)
		if enabledStr != "true" {
			writeError(w, http.StatusForbidden, "docker not enabled")
			return
		}
		if !userHasDockerAccess(db, claims.UserID, claims.Role) {
			writeError(w, http.StatusForbidden, "access denied")
			return
		}

		hosts, err := loadDockerHosts(db)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}

		result := make([]DockerHostData, 0, len(hosts))
		var mu sync.Mutex
		var wg sync.WaitGroup

		for _, h := range hosts {
			if !h.Enabled {
				continue
			}
			wg.Add(1)
			go func(host DockerHostRow) {
				defer wg.Done()
				client, baseURL := dockerHTTPClient(host)
				containers, err := fetchContainersWithStats(client, baseURL)
				entry := DockerHostData{DockerHostRow: host}
				if err != nil {
					logErrorf("DOCKER", "host %s (%s) error: %v", host.Name, host.Type, err)
					entry.Error = err.Error()
					entry.Containers = []DockerContainer{}
				} else {
					entry.Containers = containers
				}
				mu.Lock()
				result = append(result, entry)
				mu.Unlock()
			}(h)
		}
		wg.Wait()

		// Sort result to match original host order
		ordered := make([]DockerHostData, 0, len(result))
		for _, h := range hosts {
			if !h.Enabled {
				continue
			}
			for _, d := range result {
				if d.ID == h.ID {
					ordered = append(ordered, d)
					break
				}
			}
		}
		writeJSON(w, http.StatusOK, ordered)
	}
}

func DockerContainerAction(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		vars := mux.Vars(r)
		hostID := vars["hostId"]
		containerID := vars["containerId"]
		action := vars["action"] // "start", "stop", "restart"

		var enabledStr string
		db.QueryRow("SELECT value FROM app_config WHERE key='docker_enabled'").Scan(&enabledStr)
		if enabledStr != "true" {
			writeError(w, http.StatusForbidden, "docker not enabled")
			return
		}
		if !userHasDockerAccess(db, claims.UserID, claims.Role) {
			writeError(w, http.StatusForbidden, "access denied")
			return
		}

		if action != "start" && action != "stop" && action != "restart" {
			writeError(w, http.StatusBadRequest, "invalid action")
			return
		}

		var host DockerHostRow
		var enabled int
		err := db.QueryRow("SELECT id, name, type, url, enabled FROM docker_hosts WHERE id=?", hostID).
			Scan(&host.ID, &host.Name, &host.Type, &host.URL, &enabled)
		if err != nil {
			writeError(w, http.StatusNotFound, "host not found")
			return
		}
		host.Enabled = enabled == 1

		client, baseURL := dockerHTTPClient(host)
		url := fmt.Sprintf("%s/containers/%s/%s", baseURL, containerID, action)
		req, _ := http.NewRequest("POST", url, nil)
		resp, err := client.Do(req)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 400 {
			body, _ := io.ReadAll(resp.Body)
			writeError(w, http.StatusBadGateway, string(body))
			return
		}

		logDebugf("DOCKER", "%s container %s on host %s by user %s", action, containerID[:12], host.Name, claims.Username)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
