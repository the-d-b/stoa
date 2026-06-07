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

// sabParsePct parses a percentage that SABnzbd may return as a string or number.
func sabParsePct(raw json.RawMessage) float64 {
	s := strings.Trim(string(raw), `"`)
	f, _ := strconv.ParseFloat(s, 64)
	return f
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

func fetchSABnzbdPanelData(db *sql.DB, config map[string]interface{}) (*SABnzbdPanelData, error) {
	baseURL, _ := config["apiUrl"].(string)
	apiKey, _ := config["apiKey"].(string)
	uiURL, _ := config["uiUrl"].(string)
	integrationID, _ := config["integrationId"].(string)
	skipTLS, _ := config["skipTls"].(bool)

	qBody, err := sabGet(baseURL, apiKey, "queue", skipTLS)
	if err != nil {
		return nil, fmt.Errorf("queue: %w", err)
	}

	var qResp struct {
		Queue struct {
			Status    string  `json:"status"`
			Speed     string  `json:"speed"`
			KBPerSec  float64 `json:"kbpersec"`
			MBLeft    float64 `json:"mbleft"`
			TimeLeft  string  `json:"timeleft"`
			Paused    bool    `json:"paused"`
			NoOfSlots int     `json:"noofslots"`
			Slots     []struct {
				Filename   string          `json:"filename"`
				Percentage json.RawMessage `json:"percentage"`
				MB         float64         `json:"mb"`
				MBLeft     float64         `json:"mbleft"`
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
	slots := make([]SABSlot, 0, len(q.Slots))
	for _, s := range q.Slots {
		slots = append(slots, SABSlot{
			Filename:   s.Filename,
			Percentage: sabParsePct(s.Percentage),
			MB:         s.MB,
			MBLeft:     s.MBLeft,
			TimeLeft:   s.TimeLeft,
			Status:     s.Status,
			Category:   s.Cat,
			AvgAge:     s.AvgAge,
		})
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

	hBody, err := sabGet(baseURL, apiKey, "history", skipTLS, "limit=10")
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
	history := []SABHistorySlot{}
	if err := json.Unmarshal(hBody, &hResp); err == nil {
		for _, h := range hResp.History.Slots {
			history = append(history, SABHistorySlot{
				Name:        h.Name,
				Status:      h.Status,
				Size:        h.Size,
				Completed:   h.Completed,
				FailMessage: h.FailMessage,
			})
		}
	}

	return &SABnzbdPanelData{
		UIURL:         uiURL,
		IntegrationID: integrationID,
		Speed:         q.Speed,
		SpeedKBPS:     q.KBPerSec,
		MBLeft:        q.MBLeft,
		TimeLeft:      q.TimeLeft,
		Status:        status,
		Paused:        q.Paused,
		QueueCount:    q.NoOfSlots,
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
