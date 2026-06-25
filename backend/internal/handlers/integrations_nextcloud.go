package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type NextcloudPanelData struct {
	UIURL             string   `json:"uiUrl"`
	IntegrationID     string   `json:"integrationId"`
	Version           string   `json:"version"`
	// Storage
	FreeSpaceBytes    int64    `json:"freeSpaceBytes"`
	NumFiles          int      `json:"numFiles"`
	NumUsers          int      `json:"numUsers"`
	NumDisabledUsers  int      `json:"numDisabledUsers"`
	NumStorages       int      `json:"numStorages"`
	// Active users
	ActiveLast5m      int      `json:"activeLast5m"`
	ActiveLast1h      int      `json:"activeLast1h"`
	ActiveLast24h     int      `json:"activeLast24h"`
	// Shares
	NumShares         int      `json:"numShares"`
	NumSharesLink     int      `json:"numSharesLink"`
	NumSharesUser     int      `json:"numSharesUser"`
	NumSharesGroup    int      `json:"numSharesGroup"`
	// Apps
	NumAppsInstalled  int      `json:"numAppsInstalled"`
	NumAppUpdates     int      `json:"numAppUpdates"`
	// Server
	PHPVersion        string   `json:"phpVersion"`
	DBType            string   `json:"dbType"`
	DBVersion         string   `json:"dbVersion"`
	MemTotalKB        int64    `json:"memTotalKb"`
	MemFreeKB         int64    `json:"memFreeKb"`
	Webserver         string   `json:"webserver"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func ncGet(baseURL, username, password, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	fullURL := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", fullURL, nil)
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(username, password)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("OCS-APIRequest", "true")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed — check Nextcloud username and password")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Nextcloud", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ocsData unwraps the OCS envelope and returns the data payload.
func ocsData(body []byte) (json.RawMessage, error) {
	var env struct {
		OCS struct {
			Meta struct {
				StatusCode int `json:"statuscode"`
			} `json:"meta"`
			Data json.RawMessage `json:"data"`
		} `json:"ocs"`
	}
	if err := json.Unmarshal(body, &env); err != nil {
		return nil, err
	}
	if env.OCS.Meta.StatusCode != 200 && env.OCS.Meta.StatusCode != 0 {
		return nil, fmt.Errorf("OCS status %d", env.OCS.Meta.StatusCode)
	}
	return env.OCS.Data, nil
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchNextcloudPanelData(db *sql.DB, config map[string]interface{}) (*NextcloudPanelData, error) {
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

	username, password := "", ""
	if idx := strings.Index(apiKey, ":"); idx > 0 {
		username = apiKey[:idx]
		password = apiKey[idx+1:]
	} else {
		return nil, fmt.Errorf("Nextcloud requires username:password in the API key field")
	}

	out := &NextcloudPanelData{UIURL: uiURL, IntegrationID: integrationID}

	// ── Server info (main endpoint) ───────────────────────────────────────────
	body, err := ncGet(baseURL, username, password, "/ocs/v2.php/apps/serverinfo/api/v1/info?skipApps=false&skipUpdate=true", skipTLS)
	if err != nil {
		// Fallback: try without apps info
		body, err = ncGet(baseURL, username, password, "/ocs/v2.php/apps/serverinfo/api/v1/info", skipTLS)
		if err != nil {
			return nil, fmt.Errorf("serverinfo: %w", err)
		}
	}

	data, err := ocsData(body)
	if err != nil {
		return nil, fmt.Errorf("parsing serverinfo: %w", err)
	}

	var info struct {
		Nextcloud struct {
			System struct {
				Version    string    `json:"version"`
				FreeSpace  int64     `json:"freespace"`
				CPULoad    []float64 `json:"cpuload"`
				MemTotal   int64     `json:"mem_total"`
				MemFree    int64     `json:"mem_free"`
				Apps       *struct {
					NumInstalled      int `json:"num_installed"`
					NumUpdatesAvailable int `json:"num_updates_available"`
				} `json:"apps"`
			} `json:"system"`
			Storage struct {
				NumUsers         int `json:"num_users"`
				NumDisabledUsers int `json:"num_disabled_users"`
				NumFiles         int `json:"num_files"`
				NumStorages      int `json:"num_storages"`
			} `json:"storage"`
			Shares struct {
				NumShares       int `json:"num_shares"`
				NumSharesUser   int `json:"num_shares_user"`
				NumSharesGroups int `json:"num_shares_groups"`
				NumSharesLink   int `json:"num_shares_link"`
			} `json:"shares"`
		} `json:"nextcloud"`
		Server struct {
			Webserver string `json:"webserver"`
			PHP       struct {
				Version string `json:"version"`
			} `json:"php"`
			Database struct {
				Type    string `json:"type"`
				Version string `json:"version"`
			} `json:"database"`
		} `json:"server"`
		ActiveUsers struct {
			Last5m  int `json:"last5minutes"`
			Last1h  int `json:"last1hour"`
			Last24h int `json:"last24hours"`
		} `json:"activeUsers"`
	}

	if err := json.Unmarshal(data, &info); err != nil {
		return nil, fmt.Errorf("parsing serverinfo data: %w", err)
	}

	out.Version = info.Nextcloud.System.Version
	out.FreeSpaceBytes = info.Nextcloud.System.FreeSpace
	out.MemTotalKB = info.Nextcloud.System.MemTotal
	out.MemFreeKB = info.Nextcloud.System.MemFree
	out.NumUsers = info.Nextcloud.Storage.NumUsers
	out.NumDisabledUsers = info.Nextcloud.Storage.NumDisabledUsers
	out.NumFiles = info.Nextcloud.Storage.NumFiles
	out.NumStorages = info.Nextcloud.Storage.NumStorages
	out.NumShares = info.Nextcloud.Shares.NumShares
	out.NumSharesUser = info.Nextcloud.Shares.NumSharesUser
	out.NumSharesGroup = info.Nextcloud.Shares.NumSharesGroups
	out.NumSharesLink = info.Nextcloud.Shares.NumSharesLink
	out.ActiveLast5m = info.ActiveUsers.Last5m
	out.ActiveLast1h = info.ActiveUsers.Last1h
	out.ActiveLast24h = info.ActiveUsers.Last24h
	out.Webserver = info.Server.Webserver
	out.PHPVersion = info.Server.PHP.Version
	out.DBType = info.Server.Database.Type
	out.DBVersion = info.Server.Database.Version
	if info.Nextcloud.System.Apps != nil {
		out.NumAppsInstalled = info.Nextcloud.System.Apps.NumInstalled
		out.NumAppUpdates = info.Nextcloud.System.Apps.NumUpdatesAvailable
	}

	return out, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testNextcloudConnection(baseURL, apiKey string, skipTLS bool) error {
	username, password := "", ""
	if idx := strings.Index(apiKey, ":"); idx > 0 {
		username = apiKey[:idx]
		password = apiKey[idx+1:]
	} else {
		return fmt.Errorf("Nextcloud requires username:password in the API key field")
	}
	body, err := ncGet(baseURL, username, password, "/ocs/v2.php/cloud/capabilities", skipTLS)
	if err != nil {
		return err
	}
	data, err := ocsData(body)
	if err != nil || len(data) == 0 {
		return fmt.Errorf("unexpected response from Nextcloud")
	}
	return nil
}
