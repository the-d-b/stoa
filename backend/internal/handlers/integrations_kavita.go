package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
)

// ── Kavita types ──────────────────────────────────────────────────────────────

type KavitaSeries struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	LibraryID   int    `json:"libraryId"`
	LibraryName string `json:"libraryName"`
	Created     string `json:"created"`
}

type KavitaLibrary struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type KavitaLibraryStrip struct {
	LibraryID   int            `json:"libraryId"`
	LibraryName string         `json:"libraryName"`
	Series      []KavitaSeries `json:"series"`
}

type KavitaPanelData struct {
	UIURL         string               `json:"uiUrl"`
	IntegrationID string               `json:"integrationId"`
	SeriesCount   int                  `json:"seriesCount"`
	Libraries     []KavitaLibrary      `json:"libraries"`
	RecentlyAdded []KavitaSeries       `json:"recentlyAdded"`
	LibraryStrips []KavitaLibraryStrip `json:"libraryStrips"`
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

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

// kavitaPost sends an authenticated POST with a JSON body using the x-api-key
// header. Returns the body and response headers (pagination metadata lives in
// a Pagination header).
func kavitaPost(baseURL, apiKey, path string, body interface{}, skipTLS bool) ([]byte, http.Header, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, nil, err
	}
	req, err := http.NewRequest("POST", strings.TrimRight(baseURL, "/")+path, bytes.NewReader(payload))
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, nil, fmt.Errorf("kavita: HTTP %d", resp.StatusCode)
	}
	respBody, err := io.ReadAll(resp.Body)
	return respBody, resp.Header, err
}

// ── Test ──────────────────────────────────────────────────────────────────────

// Uses the libraries endpoint — reachable by any authenticated user, unlike
// /api/Stats which requires the admin role.
func testKavitaConnection(apiURL, apiKey string, skipTLS bool) error {
	_, err := kavitaGet(apiURL, apiKey, "/api/Library/libraries", skipTLS)
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
		LibraryStrips: []KavitaLibraryStrip{},
	}

	get := func(path string) ([]byte, error) {
		return kavitaGet(apiURL, apiKey, path, skipTLS)
	}
	post := func(path string, body interface{}) ([]byte, http.Header, error) {
		return kavitaPost(apiURL, apiKey, path, body, skipTLS)
	}

	// SeriesFilterV2Dto — empty filter matches everything
	statements := []interface{}{}
	// Age rating filter — allowedRatings holds a max AgeRating enum value
	// (Everyone=3 … X18Plus=14). Two AND'd statements bound the range:
	// ageRating <= max AND ageRating >= EarlyChildhood(2), which fails closed
	// on Unknown(0)/NotApplicable(-1)/RatingPending(1) series.
	// Field 4 = AgeRating; comparison 4 = LessThanEqual, 2 = GreaterThanEqual.
	if maxRating := stringVal(config, "allowedRatings"); maxRating != "" {
		statements = append(statements,
			map[string]interface{}{"comparison": 4, "field": 4, "value": maxRating},
			map[string]interface{}{"comparison": 2, "field": 4, "value": "2"},
		)
	}
	filterBody := map[string]interface{}{
		"statements":  statements,
		"combination": 1, // And
		"limitTo":     0,
	}

	anyOK := false

	// Total series via pagination metadata. /api/Stats/server/stats requires
	// the admin role (403 for regular users), but the series listing works for
	// any authenticated user — pageSize=1 keeps the response tiny and the
	// Pagination response header carries the library-wide total.
	if _, hdr, cerr := post("/api/Series/all-v2?pageNumber=1&pageSize=1", filterBody); cerr == nil {
		anyOK = true
		pag := hdr.Get("Pagination")
		if pag == "" {
			pag = hdr.Get("X-Pagination")
		}
		var meta struct {
			TotalItems int `json:"totalItems"`
			TotalCount int `json:"totalCount"`
		}
		if pag != "" && json.Unmarshal([]byte(pag), &meta) == nil {
			data.SeriesCount = meta.TotalItems
			if data.SeriesCount == 0 {
				data.SeriesCount = meta.TotalCount
			}
		} else {
			logDebugf("Kavita", "series count: missing or unparseable Pagination header: %q", pag)
		}
	} else {
		logErrorf("Kavita", "series count error: %v", cerr)
	}

	// Libraries — v0.9 path
	if libBody, lerr := get("/api/Library/libraries"); lerr == nil {
		var libs []struct {
			ID   int    `json:"id"`
			Name string `json:"name"`
		}
		anyOK = true
		if json.Unmarshal(libBody, &libs) == nil {
			for _, l := range libs {
				data.Libraries = append(data.Libraries, KavitaLibrary{ID: l.ID, Name: l.Name})
			}
		}
	} else {
		logErrorf("Kavita", "libraries error: %v", lerr)
	}

	// Recently added series — v0.9 uses POST with SeriesFilterV2Dto body
	if recentBody, _, rerr := post("/api/Series/recently-added-v2?pageNumber=1&pageSize=30", filterBody); rerr == nil {
		anyOK = true
		var series []struct {
			ID          int    `json:"id"`
			Name        string `json:"name"`
			LibraryID   int    `json:"libraryId"`
			LibraryName string `json:"libraryName"`
			Created     string `json:"created"`
		}
		if json.Unmarshal(recentBody, &series) == nil {
			for _, s := range series {
				data.RecentlyAdded = append(data.RecentlyAdded, KavitaSeries{
					ID:          s.ID,
					Name:        s.Name,
					LibraryID:   s.LibraryID,
					LibraryName: s.LibraryName,
					Created:     s.Created,
				})
			}
		} else {
			logErrorf("Kavita", "recently-added-v2 unmarshal error on body: %s", string(recentBody))
		}
	} else {
		logErrorf("Kavita", "recently-added-v2 error: %v", rerr)
	}

	// Group recently added by library for per-library cover strips
	libStripMap := map[int]*KavitaLibraryStrip{}
	var libOrder []int
	for _, s := range data.RecentlyAdded {
		if _, exists := libStripMap[s.LibraryID]; !exists {
			libStripMap[s.LibraryID] = &KavitaLibraryStrip{
				LibraryID:   s.LibraryID,
				LibraryName: s.LibraryName,
				Series:      []KavitaSeries{},
			}
			libOrder = append(libOrder, s.LibraryID)
		}
		libStripMap[s.LibraryID].Series = append(libStripMap[s.LibraryID].Series, s)
	}
	for _, id := range libOrder {
		data.LibraryStrips = append(data.LibraryStrips, *libStripMap[id])
	}

	// Every endpoint failed — surface the error instead of rendering zeros
	// (typical causes: TLS trust for internal CAs, wrong key, wrong URL)
	if !anyOK {
		return nil, fmt.Errorf("kavita unreachable — check URL, API key, and TLS settings (see server log for details)")
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

		body, err := kavitaGet(apiURL, apiKey, "/api/Image/series-cover?seriesId="+seriesID+"&apiKey="+apiKey, skipTLS)
		if err != nil {
			http.Error(w, "cover fetch failed", http.StatusBadGateway)
			return
		}

		w.Header().Set("Content-Type", http.DetectContentType(body))
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.Write(body)
	}
}
