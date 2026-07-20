package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/gorilla/mux"
)

// ── Kapowarr types ────────────────────────────────────────────────────────────

type KapowarrPanelData struct {
	UIURL         string            `json:"uiUrl"`
	IntegrationID string            `json:"integrationId"`
	Volumes       int               `json:"volumes"`
	Issues        int               `json:"issues"`
	Downloaded    int               `json:"downloaded"`
	Monitored     int               `json:"monitored"`
	VolumeList    []KapowarrVolume  `json:"volumeList"`
	Queue         []KapowarrQueItem `json:"queue"`
}

type KapowarrVolume struct {
	ID    int    `json:"id"`
	Title string `json:"title"`
	Year  int    `json:"year"`
}

type KapowarrQueItem struct {
	VolumeID int    `json:"volumeId"`
	Title    string `json:"title"`
	Status   string `json:"status"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func kapowarrGet(apiURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	u := strings.TrimRight(apiURL, "/") + "/api" + path
	if apiKey != "" {
		u += "?api_key=" + url.QueryEscape(apiKey)
	}
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return nil, err
	}
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("kapowarr: HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Fetcher ───────────────────────────────────────────────────────────────────

func fetchKapowarrPanelData(db *sql.DB, config map[string]interface{}) (*KapowarrPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &KapowarrPanelData{
		UIURL:         uiURL,
		IntegrationID: integrationID,
		VolumeList:    []KapowarrVolume{},
		Queue:         []KapowarrQueItem{},
	}

	// ── Stats — primary data; error means service is unreachable/misconfigured ──
	body, err := kapowarrGet(apiURL, apiKey, "/volumes/stats", skipTLS)
	if err != nil {
		return nil, err
	}
	var statsRaw map[string]interface{}
	if json.Unmarshal(body, &statsRaw) == nil {
		stats := statsRaw
		if res, ok := statsRaw["result"].(map[string]interface{}); ok {
			stats = res
		}
		data.Volumes = kapowarrInt(stats, "volumes", "total_volume_count")
		data.Issues = kapowarrInt(stats, "issues", "total_issue_count")
		data.Downloaded = kapowarrInt(stats, "downloaded_issues", "downloaded_issue_count")
		data.Monitored = kapowarrInt(stats, "monitored", "monitored_volume_count")
	}

	// ── Volumes list ──────────────────────────────────────────────────────────
	body, err = kapowarrGet(apiURL, apiKey, "/volumes", skipTLS)
	if err != nil {
		logErrorf("KAPOWARR", "volumes error: %v", err)
	} else {
		arr := kapowarrUnwrapArray(body)
		for _, v := range arr {
			vol := KapowarrVolume{
				Title: stringVal(v, "title"),
				Year:  int(floatVal(v, "year")),
			}
			if id, ok := v["id"].(float64); ok {
				vol.ID = int(id)
			}
			if vol.Title != "" {
				data.VolumeList = append(data.VolumeList, vol)
			}
		}
		if data.Volumes == 0 {
			data.Volumes = len(data.VolumeList)
		}
	}

	// ── Download queue ────────────────────────────────────────────────────────
	body, err = kapowarrGet(apiURL, apiKey, "/activity/queue", skipTLS)
	if err != nil {
		logErrorf("KAPOWARR", "queue error: %v", err)
	} else {
		volTitles := map[int]string{}
		for _, v := range data.VolumeList {
			volTitles[v.ID] = v.Title
		}
		arr := kapowarrUnwrapArray(body)
		for _, q := range arr {
			item := KapowarrQueItem{
				Status: stringVal(q, "status"),
			}
			if vid, ok := q["volume_id"].(float64); ok {
				item.VolumeID = int(vid)
				item.Title = volTitles[item.VolumeID]
			}
			data.Queue = append(data.Queue, item)
		}
	}

	return data, nil
}

// ── Upcoming releases (calendar source) ───────────────────────────────────────

// kapowarrFetchReleaseItems collects future issue release dates as dueItems.
// Kapowarr has no calendar endpoint, so this lists volumes and fetches each
// monitored volume's detail (which includes its issues with release dates).
// Capped at 300 volumes as a safety bound; results are cached for an hour by
// the caller since release dates change rarely.
func kapowarrFetchReleaseItems(apiURL, uiURL, apiKey string, skipTLS bool) ([]dueItem, error) {
	body, err := kapowarrGet(apiURL, apiKey, "/volumes", skipTLS)
	if err != nil {
		return nil, err
	}
	vols := kapowarrUnwrapArray(body)
	today := timeNow().Format("2006-01-02")

	var items []dueItem
	checked := 0
	for _, v := range vols {
		if mon, ok := v["monitored"].(bool); ok && !mon {
			continue
		}
		idF, ok := v["id"].(float64)
		if !ok {
			continue
		}
		if checked >= 300 {
			logDebugf("KAPOWARR", "releases: volume cap reached, skipping remainder")
			break
		}
		checked++
		volID := int(idF)

		dBody, derr := kapowarrGet(apiURL, apiKey, fmt.Sprintf("/volumes/%d", volID), skipTLS)
		if derr != nil {
			logErrorf("KAPOWARR", "releases: volume %d detail error: %v", volID, derr)
			continue
		}
		var wrapper struct {
			Result struct {
				Title  string `json:"title"`
				Issues []struct {
					IssueNumber string  `json:"issue_number"`
					Date        *string `json:"date"`
				} `json:"issues"`
			} `json:"result"`
		}
		if json.Unmarshal(dBody, &wrapper) != nil {
			continue
		}
		link := strings.TrimRight(uiURL, "/") + fmt.Sprintf("/volumes/%d", volID)
		for _, is := range wrapper.Result.Issues {
			if is.Date == nil || *is.Date < today {
				continue
			}
			title := wrapper.Result.Title
			if is.IssueNumber != "" {
				title = fmt.Sprintf("%s #%s", title, is.IssueNumber)
			}
			items = append(items, dueItem{Title: title, DueDate: *is.Date, Link: link})
		}
	}
	return items, nil
}

// kapowarrInt reads an integer from a map, trying multiple candidate keys.
func kapowarrInt(m map[string]interface{}, keys ...string) int {
	for _, k := range keys {
		if f, ok := m[k].(float64); ok {
			return int(f)
		}
	}
	return 0
}

// kapowarrUnwrapArray handles both a direct JSON array and a {"result": [...]} wrapper.
func kapowarrUnwrapArray(body []byte) []map[string]interface{} {
	var arr []map[string]interface{}
	if json.Unmarshal(body, &arr) == nil {
		return arr
	}
	var wrapper map[string]interface{}
	if json.Unmarshal(body, &wrapper) != nil {
		return nil
	}
	raw, ok := wrapper["result"].([]interface{})
	if !ok {
		return nil
	}
	result := make([]map[string]interface{}, 0, len(raw))
	for _, v := range raw {
		if m, ok := v.(map[string]interface{}); ok {
			result = append(result, m)
		}
	}
	return result
}

// ── Cover proxy ───────────────────────────────────────────────────────────────

func ProxyKapowarrCover(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		integID := vars["integrationId"]
		volumeID := vars["volumeId"]

		apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, integID)
		if err != nil {
			http.Error(w, "integration not found", http.StatusNotFound)
			return
		}

		body, err := kapowarrGet(apiURL, apiKey, "/volumes/"+volumeID+"/cover", skipTLS)
		if err != nil {
			http.Error(w, "cover fetch failed", http.StatusBadGateway)
			return
		}

		w.Header().Set("Content-Type", http.DetectContentType(body))
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.Write(body)
	}
}
