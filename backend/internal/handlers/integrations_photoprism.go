package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
)

// ── PhotoPrism types ──────────────────────────────────────────────────────────

type PhotoPrismPanelData struct {
	UIURL       string  `json:"uiUrl"`
	Photos      int     `json:"photos"`
	Videos      int     `json:"videos"`
	Albums      int     `json:"albums"`
	Folders     int     `json:"folders"`
	Moments     int     `json:"moments"`
	People      int     `json:"people"`
	Places      int     `json:"places"`
	Labels      int     `json:"labels"`
	Version     string  `json:"version"`
}

// Session token cache per integration
var (
	ppSessionTokens   = map[string]string{}
	ppSessionTokensMu sync.Mutex
)

func fetchPhotoPrismPanelData(db *sql.DB, config map[string]interface{}) (*PhotoPrismPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &PhotoPrismPanelData{UIURL: uiURL}

	// Auth: if no apiKey, try unauthenticated (API may be publicly accessible)
	var token string
	if apiKey != "" {
		var err2 error
		token, err2 = ppGetToken(apiURL, apiKey, integrationID, skipTLS)
		if err2 != nil {
			return nil, fmt.Errorf("PhotoPrism auth failed: %v", err2)
		}
	}

	// All counts come from /api/v1/config in a single call — no pagination needed
	cfgBody, err := ppGet(apiURL, token, "/api/v1/config", skipTLS)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch PhotoPrism config: %v", err)
	}
	var cfg struct {
		Version string `json:"version"`
		Count   struct {
			Photos  int `json:"photos"`
			Videos  int `json:"videos"`
			Albums  int `json:"albums"`
			Folders int `json:"folders"`
			Moments int `json:"moments"`
			People  int `json:"people"`
			Places  int `json:"places"`
			Labels  int `json:"labels"`
		} `json:"count"`
	}
	if err := json.Unmarshal(cfgBody, &cfg); err == nil {
		data.Version = cfg.Version
		data.Photos  = cfg.Count.Photos
		data.Videos  = cfg.Count.Videos
		data.Albums  = cfg.Count.Albums
		data.Folders = cfg.Count.Folders
		data.Moments = cfg.Count.Moments
		data.People  = cfg.Count.People
		data.Places  = cfg.Count.Places
		data.Labels  = cfg.Count.Labels
	}

	return data, nil
}

func ppGetToken(baseURL, apiKey, integID string, skipTLS bool) (string, error) {
	ppSessionTokensMu.Lock()
	token := ppSessionTokens[integID]
	ppSessionTokensMu.Unlock()

	if token != "" {
		return token, nil
	}

	// Split "username:password"
	username, password := "", ""
	colonIdx := strings.Index(apiKey, ":")
	if colonIdx >= 0 {
		username = apiKey[:colonIdx]
		password = apiKey[colonIdx+1:]
	} else {
		username = apiKey
	}

	loginBody := fmt.Sprintf(`{"username":%q,"password":%q}`, username, password)
	url := strings.TrimRight(baseURL, "/") + "/api/v1/session"
	req, err := http.NewRequest("POST", url, strings.NewReader(loginBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var result struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &result); err != nil || result.ID == "" {
		return "", fmt.Errorf("no session token in response")
	}

	ppSessionTokensMu.Lock()
	ppSessionTokens[integID] = result.ID
	ppSessionTokensMu.Unlock()

	return result.ID, nil
}

func ppGet(baseURL, token, path string, skipTLS bool) ([]byte, error) {
	url := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	if token != "" {
		req.Header.Set("X-Auth-Token", token)
	}
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 {
		return nil, fmt.Errorf("unauthorized — token expired")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from PhotoPrism", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func testPhotoPrismConnection(apiURL, apiKey string, skipTLS bool) error {
	token := ""
	if apiKey != "" {
		var err error
		token, err = ppGetToken(apiURL, apiKey, "test", skipTLS)
		if err != nil {
			return err
		}
	}
	_, err := ppGet(apiURL, token, "/api/v1/config", skipTLS)
	return err
}
