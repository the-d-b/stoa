package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type SABSlot struct {
	Filename   string  `json:"filename"`
	Percentage float64 `json:"percentage"`
	MB         float64 `json:"mb"`
	MBLeft     float64 `json:"mbleft"`
	TimeLeft   string  `json:"timeleft"`
	Status     string  `json:"status"`
	Category   string  `json:"category"`
	AvgAge     string  `json:"avgAge"`
}

type SABHistorySlot struct {
	Name        string `json:"name"`
	Status      string `json:"status"`
	Size        string `json:"size"`
	Completed   int64  `json:"completed"`
	FailMessage string `json:"failMessage"`
}

type NZBPeriodStats struct {
	DownloadedGB float64 `json:"downloadedGb"`
	Completed    int     `json:"completed"`
	Failed       int     `json:"failed"`
}

type SABnzbdPanelData struct {
	UIURL         string           `json:"uiUrl"`
	IntegrationID string           `json:"integrationId"`
	Speed         string           `json:"speed"`
	SpeedKBPS     float64          `json:"speedKbps"`
	MBLeft        float64          `json:"mbLeft"`
	TimeLeft      string           `json:"timeLeft"`
	Status        string           `json:"status"`
	Paused        bool             `json:"paused"`
	QueueCount    int              `json:"queueCount"`
	Downloading   int              `json:"downloading"`
	Queued        int              `json:"queued"`
	PausedCount   int              `json:"pausedCount"`
	Failed        int              `json:"failed"`
	FreeDiskGB    float64          `json:"freeDiskGb"`
	SpeedHistory  []float64        `json:"speedHistory"`
	Stats1d       NZBPeriodStats   `json:"stats1d"`
	Stats7d       NZBPeriodStats   `json:"stats7d"`
	Stats30d      NZBPeriodStats   `json:"stats30d"`
	Slots         []SABSlot        `json:"slots"`
	History       []SABHistorySlot `json:"history"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func sabGet(baseURL, apiKey, mode string, skipTLS bool, extra ...string) ([]byte, error) {
	client := httpClient(skipTLS)
	u := strings.TrimRight(baseURL, "/") + "/api?mode=" + mode + "&output=json&apikey=" + apiKey
	for _, e := range extra {
		u += "&" + e
	}
	resp, err := client.Get(u)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// sabParsePct parses a numeric field that SABnzbd may return as a string or number.
func sabParsePct(raw json.RawMessage) float64 {
	s := strings.Trim(string(raw), `"`)
	f, _ := strconv.ParseFloat(s, 64)
	return f
}

// sabParseGB converts SABnzbd size strings ("1.23 GB", "456 MB") to GB.
func sabParseGB(size string) float64 {
	parts := strings.Fields(size)
	if len(parts) != 2 {
		return 0
	}
	val, err := strconv.ParseFloat(parts[0], 64)
	if err != nil {
		return 0
	}
	switch strings.ToUpper(parts[1]) {
	case "TB":
		return val * 1024
	case "GB":
		return val
	case "MB":
		return val / 1024
	case "KB":
		return val / (1024 * 1024)
	}
	return 0
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

func fetchSABnzbdPanelData(db *sql.DB, config map[string]interface{}) (*SABnzbdPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	baseURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}

	qBody, err := sabGet(baseURL, apiKey, "queue", skipTLS)
	if err != nil {
		return nil, fmt.Errorf("queue: %w", err)
	}

	var qResp struct {
		Queue struct {
			Status     string          `json:"status"`
			Speed      string          `json:"speed"`
			KBPerSec   json.RawMessage `json:"kbpersec"`
			MBLeft     json.RawMessage `json:"mbleft"`
			TimeLeft   string          `json:"timeleft"`
			Paused     bool            `json:"paused"`
			NoOfSlots  int             `json:"noofslots"`
			DiskSpace2 json.RawMessage `json:"diskspace2"`
			Slots      []struct {
				Filename   string          `json:"filename"`
				Percentage json.RawMessage `json:"percentage"`
				MB         json.RawMessage `json:"mb"`
				MBLeft     json.RawMessage `json:"mbleft"`
				TimeLeft   string          `json:"timeleft"`
				Status     string          `json:"status"`
				Cat        string          `json:"cat"`
				AvgAge     string          `json:"avg_age"`
			} `json:"slots"`
		} `json:"queue"`
	}
	if err := json.Unmarshal(qBody, &qResp); err != nil {
		return nil, fmt.Errorf("queue parse: %w", err)
	}

	q := qResp.Queue
	var downloadingCount, queuedCount, pausedCount, failedCount int
	slots := make([]SABSlot, 0, len(q.Slots))
	for _, s := range q.Slots {
		slots = append(slots, SABSlot{
			Filename:   s.Filename,
			Percentage: sabParsePct(s.Percentage),
			MB:         sabParsePct(s.MB),
			MBLeft:     sabParsePct(s.MBLeft),
			TimeLeft:   s.TimeLeft,
			Status:     s.Status,
			Category:   s.Cat,
			AvgAge:     s.AvgAge,
		})
		switch strings.ToLower(s.Status) {
		case "downloading", "grabbing", "fetching":
			downloadingCount++
		case "paused":
			pausedCount++
		case "failed":
			failedCount++
		default:
			queuedCount++
		}
	}

	status := q.Status
	if status == "" {
		if q.Paused {
			status = "Paused"
		} else if q.NoOfSlots == 0 {
			status = "Idle"
		} else {
			status = "Downloading"
		}
	}

	// Fetch 500 history items so we can compute 1d/7d/30d stats; display only 10.
	hBody, err := sabGet(baseURL, apiKey, "history", skipTLS, "limit=500")
	if err != nil {
		return nil, fmt.Errorf("history: %w", err)
	}
	var hResp struct {
		History struct {
			Slots []struct {
				Name        string `json:"name"`
				Status      string `json:"status"`
				Size        string `json:"size"`
				Completed   int64  `json:"completed"`
				FailMessage string `json:"fail_message"`
			} `json:"slots"`
		} `json:"history"`
	}
	var history []SABHistorySlot
	var stats1d, stats7d, stats30d NZBPeriodStats
	if err := json.Unmarshal(hBody, &hResp); err == nil {
		now := time.Now().Unix()
		for i, h := range hResp.History.Slots {
			if i < 10 {
				history = append(history, SABHistorySlot{
					Name:        h.Name,
					Status:      h.Status,
					Size:        h.Size,
					Completed:   h.Completed,
					FailMessage: h.FailMessage,
				})
			}
			age := now - h.Completed
			gb := sabParseGB(h.Size)
			isOK := strings.EqualFold(h.Status, "completed")
			isFail := strings.EqualFold(h.Status, "failed")
			if age <= 86400 {
				if isOK {
					stats1d.Completed++
					stats1d.DownloadedGB += gb
				}
				if isFail {
					stats1d.Failed++
				}
			}
			if age <= 7*86400 {
				if isOK {
					stats7d.Completed++
					stats7d.DownloadedGB += gb
				}
				if isFail {
					stats7d.Failed++
				}
			}
			if age <= 30*86400 {
				if isOK {
					stats30d.Completed++
					stats30d.DownloadedGB += gb
				}
				if isFail {
					stats30d.Failed++
				}
			}
		}
	}
	if history == nil {
		history = []SABHistorySlot{}
	}

	return &SABnzbdPanelData{
		UIURL:         uiURL,
		IntegrationID: integrationID,
		Speed:         q.Speed,
		SpeedKBPS:     sabParsePct(q.KBPerSec),
		MBLeft:        sabParsePct(q.MBLeft),
		TimeLeft:      q.TimeLeft,
		Status:        status,
		Paused:        q.Paused,
		QueueCount:    q.NoOfSlots,
		Downloading:   downloadingCount,
		Queued:        queuedCount,
		PausedCount:   pausedCount,
		Failed:        failedCount,
		FreeDiskGB:    sabParsePct(q.DiskSpace2),
		Stats1d:       stats1d,
		Stats7d:       stats7d,
		Stats30d:      stats30d,
		Slots:         slots,
		History:       history,
	}, nil
}

// ── Test ──────────────────────────────────────────────────────────────────────

func testSABnzbdConnection(baseURL, apiKey string, skipTLS bool) error {
	body, err := sabGet(baseURL, apiKey, "version", skipTLS)
	if err != nil {
		return err
	}
	var v struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(body, &v); err != nil || v.Version == "" {
		return fmt.Errorf("unexpected response from SABnzbd")
	}
	return nil
}
