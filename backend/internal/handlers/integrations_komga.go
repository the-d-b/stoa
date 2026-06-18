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

// ── Komga types ───────────────────────────────────────────────────────────────

type KomgaLibrary struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type KomgaSeries struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	LibraryID   string `json:"libraryId"`
	LibraryName string `json:"libraryName"`
	BooksCount  int    `json:"booksCount"`
	Created     string `json:"created"`
}

type KomgaLibraryStrip struct {
	LibraryID   string        `json:"libraryId"`
	LibraryName string        `json:"libraryName"`
	Series      []KomgaSeries `json:"series"`
}

type KomgaPanelData struct {
	UIURL         string              `json:"uiUrl"`
	IntegrationID string              `json:"integrationId"`
	SeriesCount   int                 `json:"seriesCount"`
	BookCount     int                 `json:"bookCount"`
	Libraries     []KomgaLibrary      `json:"libraries"`
	RecentlyAdded []KomgaSeries       `json:"recentlyAdded"`
	LibraryStrips []KomgaLibraryStrip `json:"libraryStrips"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

// komgaGet sets auth via Basic (username:password) or X-API-Key (bare value).
func komgaGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	if colonIdx := strings.Index(apiKey, ":"); colonIdx >= 0 {
		req.SetBasicAuth(apiKey[:colonIdx], apiKey[colonIdx+1:])
	} else {
		req.Header.Set("X-API-Key", apiKey)
	}
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("unauthorized (HTTP %d)", resp.StatusCode)
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Komga", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// komgaTotalElements parses the totalElements from a Komga paged response.
func komgaTotalElements(body []byte) int {
	var page struct {
		TotalElements int `json:"totalElements"`
	}
	json.Unmarshal(body, &page)
	return page.TotalElements
}

// ── Main fetch ────────────────────────────────────────────────────────────────

func fetchKomgaPanelData(db *sql.DB, config map[string]interface{}) (*KomgaPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &KomgaPanelData{
		UIURL:         uiURL,
		IntegrationID: integrationID,
		Libraries:     []KomgaLibrary{},
		RecentlyAdded: []KomgaSeries{},
		LibraryStrips: []KomgaLibraryStrip{},
	}

	// Libraries
	libBody, lerr := komgaGet(apiURL, apiKey, "/api/v1/libraries", skipTLS)
	if lerr == nil {
		// Try direct array first, then page wrapper
		var libsArr []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		}
		if json.Unmarshal(libBody, &libsArr) == nil && len(libsArr) > 0 {
			for _, l := range libsArr {
				data.Libraries = append(data.Libraries, KomgaLibrary{ID: l.ID, Name: l.Name})
			}
		} else {
			var page struct {
				Content []struct {
					ID   string `json:"id"`
					Name string `json:"name"`
				} `json:"content"`
			}
			if json.Unmarshal(libBody, &page) == nil {
				for _, l := range page.Content {
					data.Libraries = append(data.Libraries, KomgaLibrary{ID: l.ID, Name: l.Name})
				}
			}
		}
	} else {
		log.Printf("[Komga] libraries error: %v", lerr)
	}

	// Series count (size=1 to avoid transferring full result set)
	if seriesBody, serr := komgaGet(apiURL, apiKey, "/api/v1/series?page=0&size=1", skipTLS); serr == nil {
		data.SeriesCount = komgaTotalElements(seriesBody)
	}

	// Book count
	if booksBody, berr := komgaGet(apiURL, apiKey, "/api/v1/books?page=0&size=1", skipTLS); berr == nil {
		data.BookCount = komgaTotalElements(booksBody)
	}

	// Recently added series
	recentBody, rerr := komgaGet(apiURL, apiKey, "/api/v1/series/new?page=0&size=30", skipTLS)
	if rerr == nil {
		var page struct {
			Content []struct {
				ID         string `json:"id"`
				Name       string `json:"name"`
				LibraryID  string `json:"libraryId"`
				BooksCount int    `json:"booksCount"`
				Created    string `json:"created"`
			} `json:"content"`
		}
		if json.Unmarshal(recentBody, &page) == nil {
			libMap := map[string]string{}
			for _, l := range data.Libraries {
				libMap[l.ID] = l.Name
			}
			for _, s := range page.Content {
				data.RecentlyAdded = append(data.RecentlyAdded, KomgaSeries{
					ID:          s.ID,
					Name:        s.Name,
					LibraryID:   s.LibraryID,
					LibraryName: libMap[s.LibraryID],
					BooksCount:  s.BooksCount,
					Created:     s.Created,
				})
			}
		}
	} else {
		log.Printf("[Komga] recently-added error: %v", rerr)
	}

	// Group recently added by library for per-library cover strips
	libStripMap := map[string]*KomgaLibraryStrip{}
	var libOrder []string
	for _, s := range data.RecentlyAdded {
		if _, exists := libStripMap[s.LibraryID]; !exists {
			libStripMap[s.LibraryID] = &KomgaLibraryStrip{
				LibraryID:   s.LibraryID,
				LibraryName: s.LibraryName,
				Series:      []KomgaSeries{},
			}
			libOrder = append(libOrder, s.LibraryID)
		}
		libStripMap[s.LibraryID].Series = append(libStripMap[s.LibraryID].Series, s)
	}
	for _, id := range libOrder {
		data.LibraryStrips = append(data.LibraryStrips, *libStripMap[id])
	}

	return data, nil
}

// ── Cover proxy ───────────────────────────────────────────────────────────────

// ProxyKomgaCover proxies series thumbnails from Komga, injecting auth headers
// and setting a 24h browser cache.
func ProxyKomgaCover(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		integID := vars["integrationId"]
		seriesID := vars["seriesId"]

		apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, integID)
		if err != nil {
			http.Error(w, "integration not found", http.StatusNotFound)
			return
		}

		body, err := komgaGet(apiURL, apiKey,
			"/api/v1/series/"+seriesID+"/thumbnail", skipTLS)
		if err != nil {
			http.Error(w, "cover fetch failed", http.StatusBadGateway)
			return
		}

		w.Header().Set("Content-Type", http.DetectContentType(body))
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.Write(body)
	}
}

// ── Test ──────────────────────────────────────────────────────────────────────

func testKomgaConnection(apiURL, apiKey string, skipTLS bool) error {
	_, err := komgaGet(apiURL, apiKey, "/api/v1/libraries", skipTLS)
	return err
}
