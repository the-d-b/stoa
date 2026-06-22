package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
)

var errDelugeUnauth = errors.New("deluge: session invalid")

// ── Types ─────────────────────────────────────────────────────────────────────

type DelugePanelData struct {
	UIURL         string          `json:"uiUrl"`
	Downloading   int             `json:"downloading"`
	Seeding       int             `json:"seeding"`
	Paused        int             `json:"paused"`
	Checking      int             `json:"checking"`
	Errored       int             `json:"errored"`
	DownSpeedMbps float64         `json:"downSpeedMbps"`
	UpSpeedMbps   float64         `json:"upSpeedMbps"`
	SeedSizeGB    float64         `json:"seedSizeGB"`
	FreeSpaceGB   float64         `json:"freeSpaceGB"`
	Active        []DelugeTorrent `json:"active"`
	SeedingList   []DelugeTorrent `json:"seedingList"`
	Trackers      []DelugeTracker `json:"trackers"`
}

type DelugeTorrent struct {
	Name     string  `json:"name"`
	State    string  `json:"state"`
	Progress float64 `json:"progress"` // 0–100
	SizeMB   float64 `json:"sizeMb"`
	DownMbps float64 `json:"downMbps"`
	UpMbps   float64 `json:"upMbps"`
	ETA      int64   `json:"eta"` // seconds; -1 = unknown
	Ratio    float64 `json:"ratio"`
}

type DelugeTracker struct {
	Host  string `json:"host"`
	Count int    `json:"count"`
}

// ── Session cache ─────────────────────────────────────────────────────────────

var (
	delugeSIDs   = map[string]string{}
	delugeSIDsMu sync.Mutex
)

func delugeGetSID(integID string) string {
	delugeSIDsMu.Lock()
	defer delugeSIDsMu.Unlock()
	return delugeSIDs[integID]
}

func delugeSetSID(integID, sid string) {
	delugeSIDsMu.Lock()
	defer delugeSIDsMu.Unlock()
	delugeSIDs[integID] = sid
}

func delugeClearSID(integID string) {
	delugeSIDsMu.Lock()
	defer delugeSIDsMu.Unlock()
	delete(delugeSIDs, integID)
}

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────

type delugeReq struct {
	Method string      `json:"method"`
	Params interface{} `json:"params"`
	ID     int         `json:"id"`
}

type delugeResp struct {
	Result json.RawMessage `json:"result"`
	Error  *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
	ID int `json:"id"`
}

// delugeRPC sends a JSON-RPC request to Deluge's /json endpoint.
// Returns errDelugeUnauth on HTTP 403 (session expired or missing).
func delugeRPC(baseURL, sid string, method string, params interface{}, skipTLS bool) (*delugeResp, error) {
	body, err := json.Marshal(delugeReq{Method: method, Params: params, ID: 1})
	if err != nil {
		return nil, err
	}
	u := strings.TrimRight(baseURL, "/") + "/json"
	req, err := http.NewRequest("POST", u, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if sid != "" {
		req.AddCookie(&http.Cookie{Name: "_session_id", Value: sid})
	}

	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 403 {
		return nil, errDelugeUnauth
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Deluge", resp.StatusCode)
	}

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var r delugeResp
	if err := json.Unmarshal(respBody, &r); err != nil {
		return nil, fmt.Errorf("failed to parse Deluge response")
	}
	if r.Error != nil {
		msg := strings.ToLower(r.Error.Message)
		if strings.Contains(msg, "not authenticated") || strings.Contains(msg, "auth") {
			return nil, errDelugeUnauth
		}
		return nil, fmt.Errorf("Deluge RPC error: %s", r.Error.Message)
	}
	return &r, nil
}

// ── Auth ──────────────────────────────────────────────────────────────────────

// delugeLogin authenticates with the Deluge Web UI (password only — no username)
// and returns the _session_id cookie value.
func delugeLogin(baseURL, password string, skipTLS bool) (string, error) {
	u := strings.TrimRight(baseURL, "/") + "/json"
	body, _ := json.Marshal(delugeReq{Method: "auth.login", Params: []string{password}, ID: 1})

	req, err := http.NewRequest("POST", u, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("HTTP %d from Deluge during login", resp.StatusCode)
	}

	respBody, _ := io.ReadAll(resp.Body)
	var r delugeResp
	if err := json.Unmarshal(respBody, &r); err != nil {
		return "", fmt.Errorf("failed to parse Deluge login response")
	}
	if r.Error != nil {
		return "", fmt.Errorf("Deluge login RPC error: %s", r.Error.Message)
	}

	// result == false means wrong password
	var ok bool
	if err := json.Unmarshal(r.Result, &ok); err != nil || !ok {
		return "", fmt.Errorf("Deluge: invalid password")
	}

	// Extract _session_id from Set-Cookie
	for _, c := range resp.Cookies() {
		if c.Name == "_session_id" {
			return c.Value, nil
		}
	}
	return "", fmt.Errorf("Deluge: login succeeded but no _session_id cookie in response")
}

// ── Data fetch ────────────────────────────────────────────────────────────────

func fetchDelugePanelData(db *sql.DB, config map[string]interface{}) (*DelugePanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	// Deluge Web UI uses a password only — no username
	password := apiKey

	for attempt := 0; attempt < 2; attempt++ {
		sid := delugeGetSID(integrationID)
		if sid == "" {
			sid, err = delugeLogin(apiURL, password, skipTLS)
			if err != nil {
				return nil, fmt.Errorf("Deluge login: %w", err)
			}
			delugeSetSID(integrationID, sid)
		}

		data, fetchErr := delugeFetchAll(apiURL, uiURL, sid, skipTLS)
		if fetchErr != nil {
			if errors.Is(fetchErr, errDelugeUnauth) {
				delugeClearSID(integrationID)
				continue
			}
			return nil, fetchErr
		}
		return data, nil
	}
	return nil, fmt.Errorf("Deluge: failed to authenticate after retry")
}

var delugeFields = []string{
	"name", "state", "progress", "total_size",
	"download_payload_rate", "upload_payload_rate",
	"eta", "tracker_host", "ratio",
}

func delugeFetchAll(apiURL, uiURL, sid string, skipTLS bool) (*DelugePanelData, error) {
	// web.update_ui returns torrents + global stats in one call
	r, err := delugeRPC(apiURL, sid, "web.update_ui", []interface{}{delugeFields, map[string]interface{}{}}, skipTLS)
	if err != nil {
		return nil, err
	}

	var result struct {
		Connected bool `json:"connected"`
		Torrents  map[string]struct {
			Name     string  `json:"name"`
			State    string  `json:"state"`
			Progress float64 `json:"progress"`
			Size     float64 `json:"total_size"`
			DlRate   float64 `json:"download_payload_rate"`
			UpRate   float64 `json:"upload_payload_rate"`
			ETA      float64 `json:"eta"`
			Tracker  string  `json:"tracker_host"`
			Ratio    float64 `json:"ratio"`
		} `json:"torrents"`
		Stats struct {
			DlRate    float64 `json:"download_rate"`
			UpRate    float64 `json:"upload_rate"`
			FreeSpace float64 `json:"free_space"`
		} `json:"stats"`
	}
	if err := json.Unmarshal(r.Result, &result); err != nil {
		return nil, fmt.Errorf("failed to parse Deluge torrent data: %v", err)
	}
	if !result.Connected {
		return nil, fmt.Errorf("Deluge Web UI is not connected to a daemon")
	}

	data := &DelugePanelData{UIURL: uiURL}
	data.DownSpeedMbps = result.Stats.DlRate / 1000000
	data.UpSpeedMbps = result.Stats.UpRate / 1000000
	data.FreeSpaceGB = result.Stats.FreeSpace / 1073741824

	trackerCounts := map[string]int{}
	var totalSeedBytes float64
	var allSeeding []DelugeTorrent

	for _, t := range result.Torrents {
		switch t.State {
		case "Downloading", "Allocating":
			data.Downloading++
		case "Seeding":
			data.Seeding++
			totalSeedBytes += t.Size
			allSeeding = append(allSeeding, DelugeTorrent{
				Name:     t.Name,
				State:    "Seeding",
				Progress: 100,
				SizeMB:   t.Size / 1048576,
				UpMbps:   t.UpRate / 1000000,
				Ratio:    t.Ratio,
			})
		case "Paused", "Queued", "Moving":
			data.Paused++
		case "Checking":
			data.Checking++
		case "Error":
			data.Errored++
		}

		// tracker_host is already a hostname in Deluge
		if t.Tracker != "" {
			trackerCounts[t.Tracker]++
		}

		// Active list: downloading and actively seeding
		isDownloading := t.State == "Downloading" || t.State == "Allocating"
		isActiveSeeding := t.State == "Seeding" && t.UpRate > 0
		if isDownloading || isActiveSeeding {
			data.Active = append(data.Active, DelugeTorrent{
				Name:     t.Name,
				State:    t.State,
				Progress: t.Progress,
				SizeMB:   t.Size / 1048576,
				DownMbps: t.DlRate / 1000000,
				UpMbps:   t.UpRate / 1000000,
				ETA:      int64(t.ETA),
				Ratio:    t.Ratio,
			})
		}
	}

	data.SeedSizeGB = totalSeedBytes / 1073741824

	// Sort seeding list: actively uploading first, then by ratio descending
	for i := 0; i < len(allSeeding)-1; i++ {
		for j := i + 1; j < len(allSeeding); j++ {
			if allSeeding[j].UpMbps > allSeeding[i].UpMbps ||
				(allSeeding[j].UpMbps == allSeeding[i].UpMbps && allSeeding[j].Ratio > allSeeding[i].Ratio) {
				allSeeding[i], allSeeding[j] = allSeeding[j], allSeeding[i]
			}
		}
	}
	if len(allSeeding) > 20 {
		allSeeding = allSeeding[:20]
	}
	data.SeedingList = allSeeding

	for host, count := range trackerCounts {
		data.Trackers = append(data.Trackers, DelugeTracker{Host: host, Count: count})
	}
	// Sort descending
	for i := 0; i < len(data.Trackers)-1; i++ {
		for j := i + 1; j < len(data.Trackers); j++ {
			if data.Trackers[j].Count > data.Trackers[i].Count {
				data.Trackers[i], data.Trackers[j] = data.Trackers[j], data.Trackers[i]
			}
		}
	}

	return data, nil
}

func testDelugeConnection(apiURL, apiKey string, skipTLS bool) error {
	sid, err := delugeLogin(apiURL, apiKey, skipTLS)
	if err != nil {
		return err
	}
	// Verify daemon connectivity — a disconnected web UI is not useful
	r, err := delugeRPC(apiURL, sid, "web.connected", []interface{}{}, skipTLS)
	if err != nil {
		return err
	}
	var connected bool
	if json.Unmarshal(r.Result, &connected) == nil && !connected {
		return fmt.Errorf("Deluge Web UI is running but not connected to a daemon")
	}
	return nil
}
