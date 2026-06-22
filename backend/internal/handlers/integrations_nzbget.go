package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type NZBGetGroup struct {
	Name       string  `json:"name"`
	Status     string  `json:"status"`
	Category   string  `json:"category"`
	Percentage int     `json:"percentage"`
	SizeMB     float64 `json:"sizeMb"`
	RemainMB   float64 `json:"remainMb"`
	Paused     bool    `json:"paused"`
}

type NZBGetHistory struct {
	Name        string  `json:"name"`
	Status      string  `json:"status"`
	Category    string  `json:"category"`
	SizeMB      float64 `json:"sizeMb"`
	HistoryTime int64   `json:"historyTime"`
}

type NZBGetPanelData struct {
	UIURL         string          `json:"uiUrl"`
	IntegrationID string          `json:"integrationId"`
	SpeedBPS      int64           `json:"speedBps"`
	RemainMB      float64         `json:"remainMb"`
	DownloadedMB  float64         `json:"downloadedMb"`
	FreeDiskMB    float64         `json:"freeDiskMb"`
	Paused        bool            `json:"paused"`
	QueueCount    int             `json:"queueCount"`
	Downloading   int             `json:"downloading"`
	Queued        int             `json:"queued"`
	PausedCount   int             `json:"pausedCount"`
	PostProc      int             `json:"postProc"`
	Failed        int             `json:"failed"`
	SpeedHistory  []float64       `json:"speedHistory"`
	Stats1d       NZBPeriodStats  `json:"stats1d"`
	Stats7d       NZBPeriodStats  `json:"stats7d"`
	Stats30d      NZBPeriodStats  `json:"stats30d"`
	Groups        []NZBGetGroup   `json:"groups"`
	History       []NZBGetHistory `json:"history"`
}

// ── JSON-RPC helper ───────────────────────────────────────────────────────────

func nzbgetRPC(baseURL, username, password, method string, skipTLS bool) (json.RawMessage, error) {
	client := httpClient(skipTLS)
	payload, _ := json.Marshal(map[string]interface{}{
		"version": "1.1",
		"method":  method,
	})
	req, err := http.NewRequest("POST", strings.TrimRight(baseURL, "/")+"/jsonrpc", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if username != "" || password != "" {
		req.SetBasicAuth(username, password)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	b, _ := io.ReadAll(resp.Body)
	var r struct {
		Result json.RawMessage `json:"result"`
		Error  *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(b, &r); err != nil {
		return nil, err
	}
	if r.Error != nil {
		return nil, fmt.Errorf("NZBGet: %s", r.Error.Message)
	}
	return r.Result, nil
}

func splitNZBGetCreds(apiKey string) (username, password string) {
	idx := strings.Index(apiKey, ":")
	if idx < 0 {
		return "", apiKey
	}
	return apiKey[:idx], apiKey[idx+1:]
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

func fetchNZBGetPanelData(db *sql.DB, config map[string]interface{}) (*NZBGetPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	baseURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	username, password := splitNZBGetCreds(apiKey)

	statusRaw, err := nzbgetRPC(baseURL, username, password, "status", skipTLS)
	if err != nil {
		return nil, fmt.Errorf("status: %w", err)
	}
	var st struct {
		DownloadRate     int64   `json:"DownloadRate"`
		RemainingSizeMB  float64 `json:"RemainingSizeMB"`
		DownloadedSizeMB float64 `json:"DownloadedSizeMB"`
		FreeDiskSpaceMB  float64 `json:"FreeDiskSpaceMB"`
		ServerPaused     bool    `json:"ServerPaused"`
		DownloadPaused   bool    `json:"DownloadPaused"`
	}
	if err := json.Unmarshal(statusRaw, &st); err != nil {
		return nil, fmt.Errorf("status parse: %w", err)
	}

	groupsRaw, err := nzbgetRPC(baseURL, username, password, "listgroups", skipTLS)
	groups := []NZBGetGroup{}
	var downloadingCount, queuedCount, pausedCount, postProcCount, failedCount int
	if err == nil {
		var rawGroups []struct {
			NZBName         string  `json:"NZBName"`
			Status          string  `json:"Status"`
			Category        string  `json:"Category"`
			Percentage      int     `json:"Percentage"`
			FileSizeMB      float64 `json:"FileSizeMB"`
			RemainingSizeMB float64 `json:"RemainingSizeMB"`
			Paused          bool    `json:"Paused"`
		}
		if json.Unmarshal(groupsRaw, &rawGroups) == nil {
			for _, g := range rawGroups {
				groups = append(groups, NZBGetGroup{
					Name:       g.NZBName,
					Status:     g.Status,
					Category:   g.Category,
					Percentage: g.Percentage,
					SizeMB:     g.FileSizeMB,
					RemainMB:   g.RemainingSizeMB,
					Paused:     g.Paused,
				})
				switch g.Status {
				case "DOWNLOADING":
					downloadingCount++
				case "QUEUED":
					queuedCount++
				case "PAUSED":
					pausedCount++
				case "FAILED", "DELETED":
					failedCount++
				default:
					// PP_QUEUED, LOADING_PARS, VERIFYING, REPAIRING, RENAMING, UNPACKING, MOVING, PP_FINISHED
					postProcCount++
				}
			}
		}
	}

	histRaw, _ := nzbgetRPC(baseURL, username, password, "history", skipTLS)
	var history []NZBGetHistory
	var stats1d, stats7d, stats30d NZBPeriodStats
	if histRaw != nil {
		var rawHist []struct {
			NZBName     string  `json:"NZBName"`
			Status      string  `json:"Status"`
			Category    string  `json:"Category"`
			FileSizeMB  float64 `json:"FileSizeMB"`
			HistoryTime int64   `json:"HistoryTime"`
		}
		if json.Unmarshal(histRaw, &rawHist) == nil {
			now := time.Now().Unix()
			for i, h := range rawHist {
				if i < 10 {
					history = append(history, NZBGetHistory{
						Name:        h.NZBName,
						Status:      h.Status,
						Category:    h.Category,
						SizeMB:      h.FileSizeMB,
						HistoryTime: h.HistoryTime,
					})
				}
				age := now - h.HistoryTime
				gb := h.FileSizeMB / 1024
				isOK := strings.HasPrefix(h.Status, "SUCCESS")
				isFail := strings.HasPrefix(h.Status, "FAILURE") || h.Status == "DELETED"
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
	}
	if history == nil {
		history = []NZBGetHistory{}
	}

	return &NZBGetPanelData{
		UIURL:         uiURL,
		IntegrationID: integrationID,
		SpeedBPS:      st.DownloadRate,
		RemainMB:      st.RemainingSizeMB,
		DownloadedMB:  st.DownloadedSizeMB,
		FreeDiskMB:    st.FreeDiskSpaceMB,
		Paused:        st.ServerPaused || st.DownloadPaused,
		QueueCount:    len(groups),
		Downloading:   downloadingCount,
		Queued:        queuedCount,
		PausedCount:   pausedCount,
		PostProc:      postProcCount,
		Failed:        failedCount,
		Stats1d:       stats1d,
		Stats7d:       stats7d,
		Stats30d:      stats30d,
		Groups:        groups,
		History:       history,
	}, nil
}

// ── Test ──────────────────────────────────────────────────────────────────────

func testNZBGetConnection(baseURL, apiKey string, skipTLS bool) error {
	username, password := splitNZBGetCreds(apiKey)
	result, err := nzbgetRPC(baseURL, username, password, "version", skipTLS)
	if err != nil {
		return err
	}
	var v string
	if err := json.Unmarshal(result, &v); err != nil || v == "" {
		return fmt.Errorf("unexpected response from NZBGet")
	}
	return nil
}
