package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type RTorrentPanelData struct {
	UIURL         string            `json:"uiUrl"`
	Downloading   int               `json:"downloading"`
	Seeding       int               `json:"seeding"`
	Paused        int               `json:"paused"`
	Checking      int               `json:"checking"`
	DownSpeedMbps float64           `json:"downSpeedMbps"`
	UpSpeedMbps   float64           `json:"upSpeedMbps"`
	SeedSizeGB    float64           `json:"seedSizeGB"`
	FreeSpaceGB   float64           `json:"freeSpaceGB"`
	Active        []RTorrentTorrent `json:"active"`
	Trackers      []RTorrentTracker `json:"trackers"`
}

type RTorrentTorrent struct {
	Name     string  `json:"name"`
	State    string  `json:"state"`
	Progress float64 `json:"progress"` // 0–100
	SizeMB   float64 `json:"sizeMb"`
	DownMbps float64 `json:"downMbps"`
	UpMbps   float64 `json:"upMbps"`
	ETA      int64   `json:"eta"` // seconds; 0 = unknown
	Ratio    float64 `json:"ratio"`
}

type RTorrentTracker struct {
	Host  string `json:"host"`
	Count int    `json:"count"`
}

// ── httprpc helper ────────────────────────────────────────────────────────────

func rtorrentPost(baseURL, username, password, mode string, skipTLS bool) ([]byte, error) {
	u := strings.TrimRight(baseURL, "/") + "/plugins/httprpc/action.php"
	req, err := http.NewRequest("POST", u, strings.NewReader("mode="+mode))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if username != "" || password != "" {
		req.SetBasicAuth(username, password)
	}
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("ruTorrent: authentication failed (HTTP %d) — check username and password", resp.StatusCode)
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("ruTorrent: HTTP %d — is the httprpc plugin installed?", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Field helpers ─────────────────────────────────────────────────────────────

// rtStr extracts a string value from a positional field array.
// JSON decodes numbers as float64, so we handle both types.
func rtStr(fields []interface{}, idx int) string {
	if idx >= len(fields) {
		return ""
	}
	switch v := fields[idx].(type) {
	case string:
		return v
	case float64:
		return strconv.FormatInt(int64(v), 10)
	}
	return ""
}

func rtInt64(fields []interface{}, idx int) int64 {
	n, _ := strconv.ParseInt(rtStr(fields, idx), 10, 64)
	return n
}

// rtorrentClassify maps rTorrent's composite boolean state fields to a
// simple state string. Field indices from the httprpc mode=list response:
//
//	idx 1  d.is_open
//	idx 2  d.is_hash_checking
//	idx 4  d.get_state
//	idx 6  d.get_size_bytes
//	idx 9  d.bytes_done
//	idx 24 d.get_hashing
//	idx 29 d.is_active
func rtorrentClassify(fields []interface{}) string {
	if rtStr(fields, 2) == "1" {
		return "checking"
	}
	if h := rtStr(fields, 24); h != "" && h != "0" {
		return "checking"
	}
	if rtStr(fields, 1) == "0" || rtStr(fields, 4) == "0" {
		return "paused"
	}
	if rtStr(fields, 29) == "1" {
		if sz := rtInt64(fields, 6); sz > 0 && rtInt64(fields, 9) >= sz {
			return "seeding"
		}
		return "downloading"
	}
	return "paused"
}

// ── Data fetch ────────────────────────────────────────────────────────────────

func fetchRTorrentPanelData(db *sql.DB, config map[string]interface{}) (*RTorrentPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	username, password := omvParseCredentials(apiKey)

	// ── Torrent list ──────────────────────────────────────────────────────────
	listBody, err := rtorrentPost(apiURL, username, password, "list", skipTLS)
	if err != nil {
		return nil, err
	}
	var listResp struct {
		Torrents map[string][]interface{} `json:"t"`
	}
	if err := json.Unmarshal(listBody, &listResp); err != nil {
		return nil, fmt.Errorf("ruTorrent: unexpected list response (is the httprpc plugin installed?)")
	}

	// ── Tracker data (optional — mode=trkl may not be available) ─────────────
	// trkl returns per-torrent tracker arrays: hash → [[url, type, ...], ...]
	trackerURLs := map[string]string{} // hash → primary tracker announce URL
	if trkBody, trkErr := rtorrentPost(apiURL, username, password, "trkl", skipTLS); trkErr == nil {
		var trkResp struct {
			Torrents map[string][][]interface{} `json:"t"`
		}
		if json.Unmarshal(trkBody, &trkResp) == nil {
			for hash, trklist := range trkResp.Torrents {
				for _, trk := range trklist {
					if len(trk) == 0 {
						continue
					}
					if u, ok := trk[0].(string); ok && u != "" && !strings.HasPrefix(u, "dht") {
						trackerURLs[hash] = u
						break
					}
				}
			}
		}
	}

	data := &RTorrentPanelData{UIURL: uiURL}
	trackerCounts := map[string]int{}
	var totalDown, totalUp, seedBytes int64
	var freeSpaceGB float64
	freeSet := false

	for hash, fields := range listResp.Torrents {
		state := rtorrentClassify(fields)
		sizeBytes := rtInt64(fields, 6)
		bytesDone := rtInt64(fields, 9)
		downRate := rtInt64(fields, 13)
		upRate := rtInt64(fields, 12)
		freeSpace := rtInt64(fields, 32)

		totalDown += downRate
		totalUp += upRate

		if !freeSet && freeSpace > 0 {
			freeSpaceGB = float64(freeSpace) / 1073741824
			freeSet = true
		}

		switch state {
		case "downloading":
			data.Downloading++
		case "seeding":
			data.Seeding++
			seedBytes += sizeBytes
		case "checking":
			data.Checking++
		case "paused":
			data.Paused++
		}

		if u := trackerURLs[hash]; u != "" {
			if host := trackerHost(u); host != "" {
				trackerCounts[host]++
			}
		}

		// Active list: all downloading + seeding torrents with live upload traffic
		isDownloading := state == "downloading"
		isActiveSeeding := state == "seeding" && upRate > 0
		if isDownloading || isActiveSeeding {
			progress := 0.0
			if sizeBytes > 0 {
				progress = float64(bytesDone) / float64(sizeBytes) * 100
			}
			// Compute ETA from left_bytes (idx 20) / down_rate
			eta := int64(0)
			if leftBytes := rtInt64(fields, 20); downRate > 0 && leftBytes > 0 {
				eta = leftBytes / downRate
			}
			data.Active = append(data.Active, RTorrentTorrent{
				Name:     rtStr(fields, 5),
				State:    state,
				Progress: progress,
				SizeMB:   float64(sizeBytes) / 1048576,
				DownMbps: float64(downRate) / 1000000,
				UpMbps:   float64(upRate) / 1000000,
				ETA:      eta,
				Ratio:    float64(rtInt64(fields, 11)) / 1000, // ratio stored as integer ×1000
			})
		}
	}

	data.DownSpeedMbps = float64(totalDown) / 1000000
	data.UpSpeedMbps = float64(totalUp) / 1000000
	data.FreeSpaceGB = freeSpaceGB
	data.SeedSizeGB = float64(seedBytes) / 1073741824

	for host, count := range trackerCounts {
		data.Trackers = append(data.Trackers, RTorrentTracker{Host: host, Count: count})
	}
	// Sort descending by count
	for i := 0; i < len(data.Trackers)-1; i++ {
		for j := i + 1; j < len(data.Trackers); j++ {
			if data.Trackers[j].Count > data.Trackers[i].Count {
				data.Trackers[i], data.Trackers[j] = data.Trackers[j], data.Trackers[i]
			}
		}
	}

	return data, nil
}

func testRTorrentConnection(apiURL, apiKey string, skipTLS bool) error {
	username, password := omvParseCredentials(apiKey)
	body, err := rtorrentPost(apiURL, username, password, "list", skipTLS)
	if err != nil {
		return err
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(body, &resp); err != nil {
		return fmt.Errorf("ruTorrent: unexpected response (is the httprpc plugin installed?)")
	}
	return nil
}
