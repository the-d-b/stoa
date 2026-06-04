package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
)

var errQBTUnauth = errors.New("qbittorrent: unauthorized")

// ── Types ─────────────────────────────────────────────────────────────────────

type QBTPanelData struct {
	UIURL         string       `json:"uiUrl"`
	Downloading   int          `json:"downloading"`
	Seeding       int          `json:"seeding"`
	Paused        int          `json:"paused"`
	Checking      int          `json:"checking"`
	Errored       int          `json:"errored"`
	DownSpeedMbps float64      `json:"downSpeedMbps"`
	UpSpeedMbps   float64      `json:"upSpeedMbps"`
	SeedSizeGB    float64      `json:"seedSizeGB"`
	FreeSpaceGB   float64      `json:"freeSpaceGB"`
	Active        []QBTTorrent `json:"active"`
	Trackers      []QBTTracker `json:"trackers"`
}

type QBTTorrent struct {
	Name     string  `json:"name"`
	State    string  `json:"state"`
	Progress float64 `json:"progress"`
	SizeMB   float64 `json:"sizeMb"`
	DownMbps float64 `json:"downMbps"`
	UpMbps   float64 `json:"upMbps"`
	ETA      int64   `json:"eta"`
	Ratio    float64 `json:"ratio"`
}

type QBTTracker struct {
	Host  string `json:"host"`
	Count int    `json:"count"`
}

// ── Session cache ─────────────────────────────────────────────────────────────

var (
	qbtSIDs   = map[string]string{}
	qbtSIDsMu sync.Mutex
)

func qbtGetSID(integID string) string {
	qbtSIDsMu.Lock()
	defer qbtSIDsMu.Unlock()
	return qbtSIDs[integID]
}

func qbtSetSID(integID, sid string) {
	qbtSIDsMu.Lock()
	defer qbtSIDsMu.Unlock()
	qbtSIDs[integID] = sid
}

func qbtClearSID(integID string) {
	qbtSIDsMu.Lock()
	defer qbtSIDsMu.Unlock()
	delete(qbtSIDs, integID)
}

// ── Auth ──────────────────────────────────────────────────────────────────────

// qbtLogin authenticates with qBittorrent and returns the SID cookie value.
// qBittorrent 4.6+ enforces Origin/Referer CSRF check — headers included here.
func qbtLogin(baseURL, username, password string, skipTLS bool) (string, error) {
	u := strings.TrimRight(baseURL, "/") + "/api/v2/auth/login"
	form := url.Values{
		"username": {username},
		"password": {password},
	}
	req, err := http.NewRequest("POST", u, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	referer := strings.TrimRight(baseURL, "/") + "/"
	req.Header.Set("Referer", referer)
	req.Header.Set("Origin", strings.TrimRight(baseURL, "/"))

	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	bodyStr := strings.TrimSpace(string(body))

	switch {
	case bodyStr == "Ok.":
		for _, c := range resp.Cookies() {
			if c.Name == "SID" {
				return c.Value, nil
			}
		}
		return "", fmt.Errorf("qBittorrent: login succeeded but no SID cookie in response")
	case bodyStr == "Fails.":
		return "", fmt.Errorf("qBittorrent: invalid username or password")
	case strings.Contains(bodyStr, "Banned"):
		return "", fmt.Errorf("qBittorrent: too many failed login attempts — IP temporarily banned")
	default:
		return "", fmt.Errorf("qBittorrent: unexpected login response: %q", bodyStr)
	}
}

// ── API helper ────────────────────────────────────────────────────────────────

// qbtGet makes an authenticated GET to a qBittorrent API endpoint.
// Returns errQBTUnauth on HTTP 403 (session expired or invalid SID).
func qbtGet(endpoint, baseURL, sid string, skipTLS bool) ([]byte, error) {
	u := strings.TrimRight(baseURL, "/") + endpoint
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Referer", strings.TrimRight(baseURL, "/")+"/")
	if sid != "" {
		req.AddCookie(&http.Cookie{Name: "SID", Value: sid})
	}
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 403 {
		return nil, errQBTUnauth
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from qBittorrent", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Data fetch ────────────────────────────────────────────────────────────────

func fetchQBTPanelData(db *sql.DB, config map[string]interface{}) (*QBTPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	username, password := omvParseCredentials(apiKey)

	for attempt := 0; attempt < 2; attempt++ {
		sid := qbtGetSID(integrationID)
		if sid == "" {
			sid, err = qbtLogin(apiURL, username, password, skipTLS)
			if err != nil {
				return nil, fmt.Errorf("qBittorrent login: %w", err)
			}
			qbtSetSID(integrationID, sid)
		}

		data, fetchErr := qbtFetchAll(apiURL, uiURL, sid, skipTLS)
		if fetchErr != nil {
			if errors.Is(fetchErr, errQBTUnauth) {
				qbtClearSID(integrationID)
				continue
			}
			return nil, fetchErr
		}
		return data, nil
	}
	return nil, fmt.Errorf("qBittorrent: failed to authenticate after retry")
}

func qbtFetchAll(apiURL, uiURL, sid string, skipTLS bool) (*QBTPanelData, error) {
	data := &QBTPanelData{UIURL: uiURL}

	// ── Torrent list ──────────────────────────────────────────────────────────
	torrentsBody, err := qbtGet("/api/v2/torrents/info", apiURL, sid, skipTLS)
	if err != nil {
		return nil, err
	}

	var torrents []struct {
		Name     string  `json:"name"`
		State    string  `json:"state"`
		Progress float64 `json:"progress"`
		Size     int64   `json:"size"`
		DlSpeed  int64   `json:"dlspeed"`
		UpSpeed  int64   `json:"upspeed"`
		ETA      int64   `json:"eta"`
		Tracker  string  `json:"tracker"`
		Ratio    float64 `json:"ratio"`
	}
	if err := json.Unmarshal(torrentsBody, &torrents); err != nil {
		return nil, fmt.Errorf("failed to parse qBittorrent torrent list")
	}

	trackerCounts := map[string]int{}
	var totalSeedBytes int64

	for _, t := range torrents {
		switch t.State {
		case "downloading", "forceDL", "metaDL":
			data.Downloading++
		case "uploading", "forceUP", "stalledUP", "queuedUP":
			data.Seeding++
			totalSeedBytes += t.Size
		case "pausedDL", "pausedUP", "stalledDL", "queuedDL", "moving":
			data.Paused++
		case "checkingDL", "checkingUP", "checkingResumeData":
			data.Checking++
		case "error", "missingFiles":
			data.Errored++
		}

		// Primary tracker — skip DHT-only torrents (empty tracker field)
		if t.Tracker != "" {
			if host := trackerHost(t.Tracker); host != "" {
				trackerCounts[host]++
			}
		}

		// Active list: all downloading + seeding torrents with live upload traffic
		isDownloading := t.State == "downloading" || t.State == "forceDL" || t.State == "metaDL"
		isActiveSeeding := (t.State == "uploading" || t.State == "forceUP") && t.UpSpeed > 0
		if isDownloading || isActiveSeeding {
			data.Active = append(data.Active, QBTTorrent{
				Name:     t.Name,
				State:    t.State,
				Progress: t.Progress * 100,
				SizeMB:   float64(t.Size) / 1048576,
				DownMbps: float64(t.DlSpeed) / 1000000,
				UpMbps:   float64(t.UpSpeed) / 1000000,
				ETA:      t.ETA,
				Ratio:    t.Ratio,
			})
		}
	}

	data.SeedSizeGB = float64(totalSeedBytes) / 1073741824

	for host, count := range trackerCounts {
		data.Trackers = append(data.Trackers, QBTTracker{Host: host, Count: count})
	}
	// Sort descending
	for i := 0; i < len(data.Trackers)-1; i++ {
		for j := i + 1; j < len(data.Trackers); j++ {
			if data.Trackers[j].Count > data.Trackers[i].Count {
				data.Trackers[i], data.Trackers[j] = data.Trackers[j], data.Trackers[i]
			}
		}
	}

	// ── Transfer info — aggregate speeds ──────────────────────────────────────
	if body, err := qbtGet("/api/v2/transfer/info", apiURL, sid, skipTLS); err == nil {
		var transfer struct {
			DlSpeed int64 `json:"dl_info_speed"`
			UpSpeed int64 `json:"up_info_speed"`
		}
		if json.Unmarshal(body, &transfer) == nil {
			data.DownSpeedMbps = float64(transfer.DlSpeed) / 1000000
			data.UpSpeedMbps = float64(transfer.UpSpeed) / 1000000
		}
	}

	// ── Sync/maindata — free space on disk ────────────────────────────────────
	if body, err := qbtGet("/api/v2/sync/maindata", apiURL, sid, skipTLS); err == nil {
		var maindata struct {
			ServerState struct {
				FreeSpace int64 `json:"free_space_on_disk"`
			} `json:"server_state"`
		}
		if json.Unmarshal(body, &maindata) == nil {
			data.FreeSpaceGB = float64(maindata.ServerState.FreeSpace) / 1073741824
		}
	}

	return data, nil
}

func testQBTConnection(apiURL, apiKey string, skipTLS bool) error {
	username, password := omvParseCredentials(apiKey)
	sid, err := qbtLogin(apiURL, username, password, skipTLS)
	if err != nil {
		return err
	}
	_, err = qbtGet("/api/v2/app/version", apiURL, sid, skipTLS)
	return err
}
