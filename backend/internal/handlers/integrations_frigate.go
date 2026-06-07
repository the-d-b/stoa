package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type FrigateZone struct {
	Name    string   `json:"name"`
	Objects []string `json:"objects"`
}

type FrigateCamera struct {
	Name             string        `json:"name"`
	CameraFPS        float64       `json:"cameraFps"`
	DetectionFPS     float64       `json:"detectionFps"`
	ProcessFPS       float64       `json:"processFps"`
	SkippedFPS       float64       `json:"skippedFps"`
	DetectionEnabled bool          `json:"detectionEnabled"`
	Zones            []FrigateZone `json:"zones"`
}

type FrigateDetector struct {
	Name           string  `json:"name"`
	InferenceSpeed float64 `json:"inferenceSpeed"` // ms
}

type FrigateEvent struct {
	ID        string   `json:"id"`
	Camera    string   `json:"camera"`
	Label     string   `json:"label"`
	Zones     []string `json:"zones"`
	StartTime string   `json:"startTime"` // RFC3339
	TopScore  float64  `json:"topScore"`
	HasClip   bool     `json:"hasClip"`
}

type FrigatePanelData struct {
	UIURL         string            `json:"uiUrl"`
	IntegrationID string            `json:"integrationId"`
	Version       string            `json:"version"`
	UptimeSecs    int               `json:"uptimeSecs"`
	TotalCameras  int               `json:"totalCameras"`
	TotalZones    int               `json:"totalZones"`
	Cameras       []FrigateCamera   `json:"cameras"`
	Detectors     []FrigateDetector `json:"detectors"`
	RecentEvents  []FrigateEvent    `json:"recentEvents"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func frigateGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	fullURL := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", fullURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication required — provide a Bearer token from Frigate → Settings → Users")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Frigate", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchFrigatePanelData(db *sql.DB, config map[string]interface{}) (*FrigatePanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("integrationId required")
	}
	baseURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if uiURL == "" {
		uiURL = baseURL
	}

	out := &FrigatePanelData{UIURL: uiURL, IntegrationID: integrationID}

	// ── Stats (camera fps, detectors, version, uptime) ────────────────────────
	type cameraStatEntry struct {
		CameraFPS        float64 `json:"camera_fps"`
		ProcessFPS       float64 `json:"process_fps"`
		SkippedFPS       float64 `json:"skipped_fps"`
		DetectionFPS     float64 `json:"detection_fps"`
		DetectionEnabled bool    `json:"detection_enabled"`
	}
	statsMap := map[string]cameraStatEntry{}

	if statsBody, err := frigateGet(baseURL, apiKey, "/api/stats", skipTLS); err == nil {
		var statsResp struct {
			Cameras   map[string]cameraStatEntry `json:"cameras"`
			Detectors map[string]struct {
				InferenceSpeed float64 `json:"inference_speed"`
			} `json:"detectors"`
			Service struct {
				Version string `json:"version"`
				Uptime  int    `json:"uptime"`
			} `json:"service"`
		}
		if json.Unmarshal(statsBody, &statsResp) == nil {
			statsMap = statsResp.Cameras
			out.Version = statsResp.Service.Version
			out.UptimeSecs = statsResp.Service.Uptime
			for name, det := range statsResp.Detectors {
				out.Detectors = append(out.Detectors, FrigateDetector{
					Name:           name,
					InferenceSpeed: det.InferenceSpeed,
				})
			}
			sort.Slice(out.Detectors, func(i, j int) bool {
				return out.Detectors[i].Name < out.Detectors[j].Name
			})
		}
	}

	// ── Config (cameras + zones) ───────────────────────────────────────────────
	if configBody, err := frigateGet(baseURL, apiKey, "/api/config", skipTLS); err == nil {
		var configResp struct {
			Cameras map[string]struct {
				Zones map[string]struct {
					Objects []string `json:"objects"`
				} `json:"zones"`
			} `json:"cameras"`
		}
		if json.Unmarshal(configBody, &configResp) == nil {
			names := make([]string, 0, len(configResp.Cameras))
			for name := range configResp.Cameras {
				names = append(names, name)
			}
			sort.Strings(names)

			for _, name := range names {
				camCfg := configResp.Cameras[name]
				cam := FrigateCamera{
					Name:             name,
					DetectionEnabled: true,
				}
				if s, ok := statsMap[name]; ok {
					cam.CameraFPS = s.CameraFPS
					cam.DetectionFPS = s.DetectionFPS
					cam.ProcessFPS = s.ProcessFPS
					cam.SkippedFPS = s.SkippedFPS
					cam.DetectionEnabled = s.DetectionEnabled
				}
				zoneNames := make([]string, 0, len(camCfg.Zones))
				for zname := range camCfg.Zones {
					zoneNames = append(zoneNames, zname)
				}
				sort.Strings(zoneNames)
				for _, zname := range zoneNames {
					z := camCfg.Zones[zname]
					cam.Zones = append(cam.Zones, FrigateZone{
						Name:    zname,
						Objects: z.Objects,
					})
					out.TotalZones++
				}
				out.Cameras = append(out.Cameras, cam)
				out.TotalCameras++
			}
		}
	}

	// ── Recent events ─────────────────────────────────────────────────────────
	if eventsBody, err := frigateGet(baseURL, apiKey, "/api/events?limit=10&include_thumbnails=0", skipTLS); err == nil {
		var rawEvents []struct {
			ID        string   `json:"id"`
			Camera    string   `json:"camera"`
			Label     string   `json:"label"`
			Zones     []string `json:"zones"`
			StartTime float64  `json:"start_time"`
			TopScore  float64  `json:"top_score"`
			HasClip   bool     `json:"has_clip"`
		}
		if json.Unmarshal(eventsBody, &rawEvents) == nil {
			for _, e := range rawEvents {
				t := time.Unix(int64(e.StartTime), 0).UTC()
				out.RecentEvents = append(out.RecentEvents, FrigateEvent{
					ID:        e.ID,
					Camera:    e.Camera,
					Label:     e.Label,
					Zones:     e.Zones,
					StartTime: t.Format(time.RFC3339),
					TopScore:  e.TopScore,
					HasClip:   e.HasClip,
				})
			}
		}
	}

	return out, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testFrigateConnection(baseURL, apiKey string, skipTLS bool) error {
	body, err := frigateGet(baseURL, apiKey, "/api/stats", skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		Service struct {
			Version string `json:"version"`
		} `json:"service"`
	}
	if json.Unmarshal(body, &r) != nil || r.Service.Version == "" {
		return fmt.Errorf("unexpected response from Frigate")
	}
	return nil
}
