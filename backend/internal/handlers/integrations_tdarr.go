package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type TdarrWorkerInfo struct {
	NodeName   string  `json:"nodeName"`
	WorkerType string  `json:"workerType"`
	Status     string  `json:"status"`
	Percentage float64 `json:"percentage"`
	ETA        string  `json:"eta"`
	Idle       bool    `json:"idle"`
	FileName   string  `json:"fileName"`
}

type TdarrPanelData struct {
	Version       string            `json:"version"`
	Workers       []TdarrWorkerInfo `json:"workers"`
	TotalFiles    int               `json:"totalFiles"`
	Transcoded    int               `json:"transcoded"`
	HealthChecked int               `json:"healthChecked"`
	SpaceSavedGB  float64           `json:"spaceSavedGB"`
	ActiveCount   int               `json:"activeCount"`
	IdleCount     int               `json:"idleCount"`
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

func tdarrSetAuth(req *http.Request, apiKey string) {
	if apiKey == "" {
		return
	}
	if idx := strings.Index(apiKey, ":"); idx >= 0 {
		req.SetBasicAuth(apiKey[:idx], apiKey[idx+1:])
	} else {
		req.Header.Set("x-api-key", apiKey)
	}
}

func tdarrGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	tdarrSetAuth(req, apiKey)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("tdarr: HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func tdarrPost(baseURL, apiKey, path string, skipTLS bool, body any) ([]byte, error) {
	client := httpClient(skipTLS)
	b, _ := json.Marshal(body)
	req, err := http.NewRequest("POST", strings.TrimRight(baseURL, "/")+path, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	tdarrSetAuth(req, apiKey)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("tdarr: HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Connection test ───────────────────────────────────────────────────────────

func testTdarrConnection(baseURL, apiKey string, skipTLS bool) error {
	b, err := tdarrGet(baseURL, apiKey, "/api/v2/status", skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(b, &r); err != nil {
		return fmt.Errorf("tdarr: unexpected response")
	}
	if r.Status != "good" {
		return fmt.Errorf("tdarr: server status: %s", r.Status)
	}
	return nil
}

// ── Panel data ────────────────────────────────────────────────────────────────

func fetchTdarrPanelData(_ *sql.DB, config map[string]interface{}) (*TdarrPanelData, error) {
	baseURL, _ := config["baseURL"].(string)
	apiKey, _ := config["apiKey"].(string)
	skipTLS, _ := config["skipTLSVerify"].(bool)
	if baseURL == "" {
		return nil, fmt.Errorf("tdarr: baseURL not configured")
	}

	out := &TdarrPanelData{Workers: []TdarrWorkerInfo{}}

	// Version from status endpoint
	if b, err := tdarrGet(baseURL, apiKey, "/api/v2/status", skipTLS); err == nil {
		var r struct {
			Version string `json:"version"`
		}
		if json.Unmarshal(b, &r) == nil {
			out.Version = r.Version
		}
	}

	// Worker nodes — response is a flat map: { nodeId: { nodeName, workers: { workerId: worker } } }
	if b, err := tdarrGet(baseURL, apiKey, "/api/v2/get-nodes", skipTLS); err == nil {
		var nodes map[string]struct {
			NodeName string `json:"nodeName"`
			Workers  map[string]struct {
				WorkerType string  `json:"workerType"`
				Status     string  `json:"status"`
				Percentage float64 `json:"percentage"`
				ETA        string  `json:"ETA"`
				Idle       bool    `json:"idle"`
				Job        *struct {
					Source string `json:"source"`
				} `json:"job"`
			} `json:"workers"`
		}
		if json.Unmarshal(b, &nodes) == nil {
			for _, node := range nodes {
				for _, w := range node.Workers {
					wi := TdarrWorkerInfo{
						NodeName:   node.NodeName,
						WorkerType: w.WorkerType,
						Status:     w.Status,
						Percentage: w.Percentage,
						ETA:        w.ETA,
						Idle:       w.Idle,
					}
					if w.Job != nil && w.Job.Source != "" {
						wi.FileName = filepath.Base(w.Job.Source)
					}
					if w.Idle {
						out.IdleCount++
					} else {
						out.ActiveCount++
					}
					out.Workers = append(out.Workers, wi)
				}
			}
		}
	}

	// Aggregate library stats — best-effort, gracefully ignored on failure
	statsPayload := map[string]any{
		"data": map[string]any{
			"collection": "StatisticsJSONDB",
			"mode":       "getAll",
			"docID":      "",
			"obj":        map[string]any{},
		},
	}
	if b, err := tdarrPost(baseURL, apiKey, "/api/v2/cruddb", skipTLS, statsPayload); err == nil {
		var statsArr []struct {
			TotalTranscodeCount   int     `json:"totalTranscodeCount"`
			TotalHealthCheckCount int     `json:"totalHealthCheckCount"`
			SizeDiff              float64 `json:"sizeDiff"`
			TotalFileCount        int     `json:"totalFileCount"`
		}
		if json.Unmarshal(b, &statsArr) == nil {
			for _, s := range statsArr {
				out.Transcoded += s.TotalTranscodeCount
				out.HealthChecked += s.TotalHealthCheckCount
				out.SpaceSavedGB += s.SizeDiff
				out.TotalFiles += s.TotalFileCount
			}
		}
	}

	return out, nil
}
