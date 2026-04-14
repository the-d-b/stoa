package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
)

// ── Transmission types ────────────────────────────────────────────────────────

type TransmissionPanelData struct {
	UIURL         string               `json:"uiUrl"`
	Downloading   int                  `json:"downloading"`
	Seeding       int                  `json:"seeding"`
	Paused        int                  `json:"paused"`
	Checking      int                  `json:"checking"`
	DownSpeedMbps float64              `json:"downSpeedMbps"`
	UpSpeedMbps   float64              `json:"upSpeedMbps"`
	SeedSizeGB    float64              `json:"seedSizeGB"`
	FreeSpaceGB   float64              `json:"freeSpaceGB"`
	Trackers      []TransmissionTracker `json:"trackers"`
	Active        []TransmissionTorrent `json:"active"`
}

type TransmissionTracker struct {
	Host  string `json:"host"`
	Count int    `json:"count"`
}

type TransmissionTorrent struct {
	Name       string  `json:"name"`
	Status     int     `json:"status"` // 4=downloading, 6=seeding
	Progress   float64 `json:"progress"`
	SizeMB     float64 `json:"sizeMb"`
	DownMbps   float64 `json:"downMbps"`
	UpMbps     float64 `json:"upMbps"`
	ETA        int64   `json:"eta"` // seconds, -1 = unknown
}

// Transmission statuses
// 0=stopped, 1=check queued, 2=checking, 3=download queued, 4=downloading, 5=seed queued, 6=seeding

// Session ID cache per integration
var (
	txSessionIDs   = map[string]string{}
	txSessionIDsMu sync.Mutex
)

func fetchTransmissionPanelData(db *sql.DB, config map[string]interface{}) (*TransmissionPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	// apiKey stored as "username:password"
	data := &TransmissionPanelData{UIURL: uiURL}

	// ── Torrent list ──────────────────────────────────────────────────────
	torrentReq := map[string]interface{}{
		"method": "torrent-get",
		"arguments": map[string]interface{}{
			"fields": []string{
				"id", "name", "status", "percentDone",
				"totalSize", "rateDownload", "rateUpload",
				"eta", "trackers", "downloadDir",
			},
		},
	}
	resp, err := txRPC(apiURL, apiKey, integrationID, torrentReq, skipTLS)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Transmission: %v", err)
	}

	var result struct {
		Arguments struct {
			Torrents []struct {
				Name        string  `json:"name"`
				Status      int     `json:"status"`
				PercentDone float64 `json:"percentDone"`
				TotalSize   int64   `json:"totalSize"`
				RateDown    int64   `json:"rateDownload"`
				RateUp      int64   `json:"rateUpload"`
				ETA         int64   `json:"eta"`
				DownloadDir string  `json:"downloadDir"`
				Trackers    []struct {
					Announce string `json:"announce"`
				} `json:"trackers"`
			} `json:"torrents"`
		} `json:"arguments"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, fmt.Errorf("failed to parse Transmission response")
	}

	trackerCounts := map[string]int{}
	var totalSeedBytes int64

	for _, t := range result.Arguments.Torrents {
		switch t.Status {
		case 4:
			data.Downloading++
		case 6:
			data.Seeding++
			totalSeedBytes += t.TotalSize
		case 2:
			data.Checking++
		case 0, 1, 3, 5:
			data.Paused++
		}

		data.DownSpeedMbps += float64(t.RateDown) / 1000000
		data.UpSpeedMbps += float64(t.RateUp) / 1000000

		// Tracker host
		for _, tr := range t.Trackers {
			host := trackerHost(tr.Announce)
			if host != "" {
				trackerCounts[host]++
				break // one tracker per torrent
			}
		}

		// Active torrents — downloading or seeding with active transfer
		if t.Status == 4 || (t.Status == 6 && t.RateUp > 0) {
			data.Active = append(data.Active, TransmissionTorrent{
				Name:     t.Name,
				Status:   t.Status,
				Progress: t.PercentDone * 100,
				SizeMB:   float64(t.TotalSize) / 1048576,
				DownMbps: float64(t.RateDown) / 1000000,
				UpMbps:   float64(t.RateUp) / 1000000,
				ETA:      t.ETA,
			})
		}
	}

	data.SeedSizeGB = float64(totalSeedBytes) / 1073741824

	// Build tracker list sorted by count
	for host, count := range trackerCounts {
		data.Trackers = append(data.Trackers, TransmissionTracker{Host: host, Count: count})
	}
	// Sort descending
	for i := 0; i < len(data.Trackers)-1; i++ {
		for j := i + 1; j < len(data.Trackers); j++ {
			if data.Trackers[j].Count > data.Trackers[i].Count {
				data.Trackers[i], data.Trackers[j] = data.Trackers[j], data.Trackers[i]
			}
		}
	}

	// ── Session stats for free space ─────────────────────────────────────
	statsReq := map[string]interface{}{"method": "session-get",
		"arguments": map[string]interface{}{
			"fields": []string{"download-dir"},
		},
	}
	if statsResp, err := txRPC(apiURL, apiKey, integrationID, statsReq, skipTLS); err == nil {
		var sess struct {
			Arguments struct {
				DownloadDir string `json:"download-dir"`
			} `json:"arguments"`
		}
		if json.Unmarshal(statsResp, &sess) == nil && sess.Arguments.DownloadDir != "" {
			freeReq := map[string]interface{}{
				"method":    "free-space",
				"arguments": map[string]interface{}{"path": sess.Arguments.DownloadDir},
			}
			if freeResp, err := txRPC(apiURL, apiKey, integrationID, freeReq, skipTLS); err == nil {
				var free struct {
					Arguments struct {
						SizeBytes int64 `json:"size-bytes"`
					} `json:"arguments"`
				}
				if json.Unmarshal(freeResp, &free) == nil {
					data.FreeSpaceGB = float64(free.Arguments.SizeBytes) / 1073741824
				}
			}
		}
	}

	return data, nil
}

// txRPC makes a Transmission RPC call, handling 409 session ID refresh automatically
func txRPC(baseURL, apiKey, integID string, payload interface{}, skipTLS bool) ([]byte, error) {
	txSessionIDsMu.Lock()
	sessionID := txSessionIDs[integID]
	txSessionIDsMu.Unlock()

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	for attempts := 0; attempts < 2; attempts++ {
		url := strings.TrimRight(baseURL, "/") + "/transmission/rpc"
		req, err := http.NewRequest("POST", url, bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		if sessionID != "" {
			req.Header.Set("X-Transmission-Session-Id", sessionID)
		}
		// Basic auth from "username:password"
		if apiKey != "" {
			colonIdx := strings.Index(apiKey, ":")
			if colonIdx >= 0 {
				req.SetBasicAuth(apiKey[:colonIdx], apiKey[colonIdx+1:])
			}
		}

		resp, err := httpClient(skipTLS).Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()

		if resp.StatusCode == 409 {
			// Transmission wants us to use the session ID from the header
			newID := resp.Header.Get("X-Transmission-Session-Id")
			if newID != "" {
				txSessionIDsMu.Lock()
				txSessionIDs[integID] = newID
				txSessionIDsMu.Unlock()
				sessionID = newID
				continue // retry with new session ID
			}
			return nil, fmt.Errorf("Transmission 409: no session ID in response")
		}
		if resp.StatusCode >= 400 {
			return nil, fmt.Errorf("HTTP %d from Transmission", resp.StatusCode)
		}
		return io.ReadAll(resp.Body)
	}
	return nil, fmt.Errorf("Transmission: too many session ID retries")
}

func trackerHost(announce string) string {
	// Extract host from announce URL e.g. "https://tracker.example.com:1337/announce"
	s := announce
	for _, prefix := range []string{"https://", "http://", "udp://"} {
		s = strings.TrimPrefix(s, prefix)
	}
	if idx := strings.IndexAny(s, ":/"); idx >= 0 {
		s = s[:idx]
	}
	// Strip leading www.
	s = strings.TrimPrefix(s, "www.")
	return s
}

func testTransmissionConnection(apiURL, apiKey string, skipTLS bool) error {
	req := map[string]interface{}{
		"method":    "session-get",
		"arguments": map[string]interface{}{"fields": []string{"version"}},
	}
	_, err := txRPC(apiURL, apiKey, "test", req, skipTLS)
	return err
}
