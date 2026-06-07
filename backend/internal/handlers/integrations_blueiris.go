package handlers

import (
	"bytes"
	"crypto/md5"
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

type BlueIrisCamera struct {
	ShortName    string  `json:"shortName"`
	Name         string  `json:"name"`
	FPS          float64 `json:"fps"`
	Width        int     `json:"width"`
	Height       int     `json:"height"`
	IsOnline     bool    `json:"isOnline"`
	IsEnabled    bool    `json:"isEnabled"`
	IsRecording  bool    `json:"isRecording"`
	IsMotion     bool    `json:"isMotion"`
	IsAlerting   bool    `json:"isAlerting"`
	IsTriggered  bool    `json:"isTriggered"`
	IsPaused     bool    `json:"isPaused"`
	IsNoSignal   bool    `json:"isNoSignal"`
	IsGroup      bool    `json:"isGroup"`
	HasPTZ       bool    `json:"hasPtz"`
	HasAudio     bool    `json:"hasAudio"`
	NClips       int     `json:"nClips"`
	NTriggers    int     `json:"nTriggers"`
	NAlerts      int     `json:"nAlerts"`
	NNoSignal    int     `json:"nNoSignal"`
}

type BlueIrisAlert struct {
	Camera string `json:"camera"`
	Time   string `json:"time"` // RFC3339
	Path   string `json:"path"`
	Memo   string `json:"memo"`
	Level  int    `json:"level"`
}

type BlueIrisPanelData struct {
	UIURL            string           `json:"uiUrl"`
	IntegrationID    string           `json:"integrationId"`
	SystemName       string           `json:"systemName"`
	Version          string           `json:"version"`
	Signal           int              `json:"signal"`          // 0=red,1=green,2=yellow
	ActiveProfile    int              `json:"activeProfile"`
	Profiles         []string         `json:"profiles"`
	IsAdmin          bool             `json:"isAdmin"`
	TotalCameras     int              `json:"totalCameras"`
	OnlineCameras    int              `json:"onlineCameras"`
	RecordingCameras int              `json:"recordingCameras"`
	AlertingCameras  int              `json:"alertingCameras"`
	Cameras          []BlueIrisCamera `json:"cameras"`
	RecentAlerts     []BlueIrisAlert  `json:"recentAlerts"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func biPost(client *http.Client, baseURL string, payload interface{}) ([]byte, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	url := strings.TrimRight(baseURL, "/") + "/json"
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Blue Iris", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// biLogin authenticates and returns the session, hash, and initial system data.
func biLogin(baseURL, username, password string, skipTLS bool) (session, hash string, out *BlueIrisPanelData, client *http.Client, err error) {
	client = httpClient(skipTLS)

	// Step 1: get session token
	body1, err := biPost(client, baseURL, map[string]interface{}{"cmd": "login"})
	if err != nil {
		return "", "", nil, nil, fmt.Errorf("Blue Iris connection failed: %w", err)
	}
	var step1 struct {
		Session string `json:"session"`
	}
	if json.Unmarshal(body1, &step1) != nil || step1.Session == "" {
		return "", "", nil, nil, fmt.Errorf("unexpected response — is this a Blue Iris server?")
	}

	// Step 2: authenticate with MD5(username:session:password)
	hash = fmt.Sprintf("%x", md5.Sum([]byte(username+":"+step1.Session+":"+password)))
	body2, err := biPost(client, baseURL, map[string]interface{}{
		"cmd":      "login",
		"session":  step1.Session,
		"response": hash,
	})
	if err != nil {
		return "", "", nil, nil, err
	}
	var step2 struct {
		Result string `json:"result"`
		Data   struct {
			Name     string   `json:"system name"`
			Version  string   `json:"version"`
			Profiles []string `json:"profiles"`
			Admin    bool     `json:"admin"`
		} `json:"data"`
	}
	if json.Unmarshal(body2, &step2) != nil || step2.Result != "success" {
		return "", "", nil, nil, fmt.Errorf("Blue Iris authentication failed — check username and password")
	}

	out = &BlueIrisPanelData{
		SystemName:  step2.Data.Name,
		Version:     step2.Data.Version,
		Profiles:    step2.Data.Profiles,
		IsAdmin:     step2.Data.Admin,
		Signal:      1, // default green
		ActiveProfile: -1,
	}
	return step1.Session, hash, out, client, nil
}

// biCmd sends an authenticated command and returns the data payload.
func biCmd(client *http.Client, baseURL, session, hash, cmdName string, extra map[string]interface{}) ([]byte, error) {
	payload := map[string]interface{}{
		"cmd":      cmdName,
		"session":  session,
		"response": hash,
	}
	for k, v := range extra {
		payload[k] = v
	}
	body, err := biPost(client, baseURL, payload)
	if err != nil {
		return nil, err
	}
	var envelope struct {
		Result string          `json:"result"`
		Data   json.RawMessage `json:"data"`
	}
	if json.Unmarshal(body, &envelope) == nil {
		if envelope.Result != "success" && envelope.Result != "" {
			return nil, fmt.Errorf("Blue Iris error: %s", envelope.Result)
		}
		if len(envelope.Data) > 0 {
			return envelope.Data, nil
		}
	}
	return body, nil
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchBlueIrisPanelData(db *sql.DB, config map[string]interface{}) (*BlueIrisPanelData, error) {
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

	// Parse username:password from apiKey
	username, password := "", ""
	if idx := strings.Index(apiKey, ":"); idx > 0 {
		username = apiKey[:idx]
		password = apiKey[idx+1:]
	} else {
		return nil, fmt.Errorf("Blue Iris requires username:password in the API key field")
	}

	session, hash, out, client, err := biLogin(baseURL, username, password, skipTLS)
	if err != nil {
		return nil, err
	}
	out.UIURL = uiURL
	out.IntegrationID = integrationID

	// ── System status (signal + active profile) ───────────────────────────────
	if statusData, err := biCmd(client, baseURL, session, hash, "status", nil); err == nil {
		var s struct {
			Signal  int `json:"signal"`
			Profile int `json:"profile"`
		}
		if json.Unmarshal(statusData, &s) == nil {
			out.Signal = s.Signal
			out.ActiveProfile = s.Profile
		}
	}

	// ── Camera list ───────────────────────────────────────────────────────────
	if camData, err := biCmd(client, baseURL, session, hash, "camlist", nil); err == nil {
		var rawCams []struct {
			ShortName    string  `json:"optionValue"`
			Name         string  `json:"optionDisplay"`
			FPS          float64 `json:"FPS"`
			Width        int     `json:"width"`
			Height       int     `json:"height"`
			IsOnline     bool    `json:"isOnline"`
			IsEnabled    bool    `json:"isEnabled"`
			IsRecording  bool    `json:"isRecording"`
			IsMotion     bool    `json:"isMotion"`
			IsAlerting   bool    `json:"isAlerting"`
			IsTriggered  bool    `json:"isTriggered"`
			IsPaused     bool    `json:"isPaused"`
			IsNoSignal   bool    `json:"isNoSignal"`
			Group        bool    `json:"group"`
			PTZ          bool    `json:"ptz"`
			Audio        bool    `json:"audio"`
			ClipsCreated int     `json:"clipsCreated"`
			NTriggers    int     `json:"nTriggers"`
			NAlerts      int     `json:"nAlerts"`
			NNoSignal    int     `json:"nNoSignal"`
		}
		if json.Unmarshal(camData, &rawCams) == nil {
			for _, c := range rawCams {
				// Skip virtual/aggregate entries
				if strings.HasPrefix(c.ShortName, "@") {
					continue
				}
				cam := BlueIrisCamera{
					ShortName:    c.ShortName,
					Name:         c.Name,
					FPS:          c.FPS,
					Width:        c.Width,
					Height:       c.Height,
					IsOnline:     c.IsOnline,
					IsEnabled:    c.IsEnabled,
					IsRecording:  c.IsRecording,
					IsMotion:     c.IsMotion,
					IsAlerting:   c.IsAlerting,
					IsTriggered:  c.IsTriggered,
					IsPaused:     c.IsPaused,
					IsNoSignal:   c.IsNoSignal,
					IsGroup:      c.Group,
					HasPTZ:       c.PTZ,
					HasAudio:     c.Audio,
					NClips:       c.ClipsCreated,
					NTriggers:    c.NTriggers,
					NAlerts:      c.NAlerts,
					NNoSignal:    c.NNoSignal,
				}
				out.TotalCameras++
				if c.IsOnline {
					out.OnlineCameras++
				}
				if c.IsRecording {
					out.RecordingCameras++
				}
				if c.IsAlerting {
					out.AlertingCameras++
				}
				out.Cameras = append(out.Cameras, cam)
			}
			// Sort: alerting → no-signal → offline → online; then alpha
			sort.Slice(out.Cameras, func(i, j int) bool {
				rank := func(c BlueIrisCamera) int {
					if c.IsAlerting || c.IsNoSignal { return 0 }
					if !c.IsOnline || !c.IsEnabled { return 2 }
					return 1
				}
				ri, rj := rank(out.Cameras[i]), rank(out.Cameras[j])
				if ri != rj { return ri < rj }
				return out.Cameras[i].Name < out.Cameras[j].Name
			})
		}
	}

	// ── Recent alerts ─────────────────────────────────────────────────────────
	if alertData, err := biCmd(client, baseURL, session, hash, "alertlist", map[string]interface{}{
		"camera": "@Index",
	}); err == nil {
		var rawAlerts []struct {
			Camera string  `json:"camera"`
			Date   float64 `json:"date"`
			Path   string  `json:"path"`
			Memo   string  `json:"memo"`
			Level  int     `json:"level"`
		}
		if json.Unmarshal(alertData, &rawAlerts) == nil {
			limit := 10
			for i, a := range rawAlerts {
				if i >= limit {
					break
				}
				t := time.Unix(int64(a.Date), 0).UTC()
				out.RecentAlerts = append(out.RecentAlerts, BlueIrisAlert{
					Camera: a.Camera,
					Time:   t.Format(time.RFC3339),
					Path:   a.Path,
					Memo:   a.Memo,
					Level:  a.Level,
				})
			}
		}
	}

	return out, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testBlueIrisConnection(baseURL, apiKey string, skipTLS bool) error {
	username, password := "", ""
	if idx := strings.Index(apiKey, ":"); idx > 0 {
		username = apiKey[:idx]
		password = apiKey[idx+1:]
	} else {
		return fmt.Errorf("Blue Iris requires username:password in the API key field")
	}
	_, _, out, _, err := biLogin(baseURL, username, password, skipTLS)
	if err != nil {
		return err
	}
	if out.Version == "" {
		return fmt.Errorf("unexpected response from Blue Iris")
	}
	return nil
}
