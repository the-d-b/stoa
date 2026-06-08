package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
)

// ── Kavita types ──────────────────────────────────────────────────────────────

type KavitaSeries struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	LibraryName string `json:"libraryName"`
	Created     string `json:"created"`
}

type KavitaLibrary struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type KavitaPanelData struct {
	UIURL         string          `json:"uiUrl"`
	IntegrationID string          `json:"integrationId"`
	SeriesCount   int             `json:"seriesCount"`
	TotalFiles    int             `json:"totalFiles"`
	Libraries     []KavitaLibrary `json:"libraries"`
	RecentlyAdded []KavitaSeries  `json:"recentlyAdded"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

// kavitaGet sends an authenticated GET using the x-api-key header (Kavita v0.9+).
func kavitaGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-api-key", apiKey)
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("kavita: HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Test ──────────────────────────────────────────────────────────────────────

func testKavitaConnection(apiURL, apiKey string, skipTLS bool) error {
	_, err := kavitaGet(apiURL, apiKey, "/api/Stats/server/stats", skipTLS)
	return err
}

// ── Main fetch ────────────────────────────────────────────────────────────────

func fetchKavitaPanelData(db *sql.DB, config map[string]interface{}) (*KavitaPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}

	data := &KavitaPanelData{
		UIURL:         uiURL,
		IntegrationID: integrationID,
		Libraries:     []KavitaLibrary{},
		RecentlyAdded: []KavitaSeries{},
	}

	get := func(path string) ([]byte, error) {
		return kavitaGet(apiURL, apiKey, path, skipTLS)
	}

	// Server stats
	if statsBody, serr := get("/api/Stats/server/stats"); serr == nil {
		var stats struct {
			SeriesCount int `json:"seriesCount"`
			TotalFiles  int `json:"totalFiles"`
		}
		if json.Unmarshal(statsBody, &stats) == nil {
			data.SeriesCount = stats.SeriesCount
			data.TotalFiles = stats.TotalFiles
		}
	} else {
		log.Printf("[Kavita] stats error: %v", serr)
	}

	// Libraries
	if libBody, lerr := get("/api/Library"); lerr == nil {
		var libs []struct {
			ID   int    `json:"id"`
			Name string `json:"name"`
		}
		if json.Unmarshal(libBody, &libs) == nil {
			for _, l := range libs {
				data.Libraries = append(data.Libraries, KavitaLibrary{ID: l.ID, Name: l.Name})
			}
		}
	}

	// Recently added series
	if recentBody, rerr := get("/api/Series/recently-added?pageNumber=1&pageSize=20"); rerr == nil {
		var series []struct {
			ID          int    `json:"id"`
			Name        string `json:"name"`
			LibraryName string `json:"libraryName"`
			Created     string `json:"created"`
		}
		if json.Unmarshal(recentBody, &series) == nil {
			for _, s := range series {
				data.RecentlyAdded = append(data.RecentlyAdded, KavitaSeries{
					ID:          s.ID,
					Name:        s.Name,
					LibraryName: s.LibraryName,
					Created:     s.Created,
				})
			}
		}
	} else {
		log.Printf("[Kavita] recently-added error: %v", rerr)
	}

	return data, nil
}

// ── Cover proxy ───────────────────────────────────────────────────────────────

// ProxyKavitaCover proxies series cover images from Kavita, keeping auth on the
// backend and caching the result in the browser for 24h.
func ProxyKavitaCover(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		integID := vars["integrationId"]
		seriesID := vars["seriesId"]

		apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, integID)
		if err != nil {
			http.Error(w, "integration not found", http.StatusNotFound)
			return
		}

		body, err := kavitaGet(apiURL, apiKey, "/api/Image/series-cover?seriesId="+seriesID, skipTLS)
		if err != nil {
			http.Error(w, "cover fetch failed", http.StatusBadGateway)
			return
		}

		w.Header().Set("Content-Type", http.DetectContentType(body))
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.Write(body)
	}
}
