package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"

	"github.com/gorilla/mux"
)

// ── Tranga types ──────────────────────────────────────────────────────────────

type TrangaPanelData struct {
	UIURL         string        `json:"uiUrl"`
	IntegrationID string        `json:"integrationId"`
	MangaCount    int           `json:"mangaCount"`
	Downloading   int           `json:"downloading"`
	MangaList     []TrangaManga `json:"mangaList"`
	ActiveJobs    []TrangaJob   `json:"activeJobs"`
}

type TrangaManga struct {
	MangaId string `json:"mangaId"`
	Name    string `json:"name"`
	Status  string `json:"status"`
}

type TrangaJob struct {
	MangaId string `json:"mangaId"`
	Name    string `json:"name"`
	State   string `json:"state"`
}

// ── Fetcher ───────────────────────────────────────────────────────────────────

func fetchTrangaPanelData(db *sql.DB, config map[string]interface{}) (*TrangaPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &TrangaPanelData{
		UIURL:         uiURL,
		IntegrationID: integrationID,
		MangaList:     []TrangaManga{},
		ActiveJobs:    []TrangaJob{},
	}

	// ── All manga ─────────────────────────────────────────────────────────────
	body, err := arrGet(apiURL, apiKey, "/v2/Manga", skipTLS)
	if err != nil {
		log.Printf("[TRANGA] Manga error: %v", err)
	} else {
		var arr []map[string]interface{}
		if json.Unmarshal(body, &arr) == nil {
			data.MangaCount = len(arr)
			for _, m := range arr {
				mg := TrangaManga{
					Name:   trangaString(m, "name", "Name"),
					Status: trangaString(m, "status", "Status"),
					MangaId: trangaString(m, "mangaId", "MangaId"),
				}
				if mg.Name != "" {
					data.MangaList = append(data.MangaList, mg)
				}
			}
		}
	}

	// ── Currently downloading ─────────────────────────────────────────────────
	body, err = arrGet(apiURL, apiKey, "/v2/Manga/Downloading", skipTLS)
	if err != nil {
		log.Printf("[TRANGA] Downloading error: %v", err)
	} else {
		var arr []map[string]interface{}
		if json.Unmarshal(body, &arr) == nil {
			data.Downloading = len(arr)
			// Build name lookup from main list
			nameByID := map[string]string{}
			for _, mg := range data.MangaList {
				nameByID[mg.MangaId] = mg.Name
			}
			for _, m := range arr {
				job := TrangaJob{
					MangaId: trangaString(m, "mangaId", "MangaId"),
					State:   "Downloading",
				}
				if n := trangaString(m, "name", "Name"); n != "" {
					job.Name = n
				} else if job.MangaId != "" {
					job.Name = nameByID[job.MangaId]
				}
				data.ActiveJobs = append(data.ActiveJobs, job)
			}
		}
	}

	return data, nil
}

// trangaString returns the value of the first key that exists and is a non-empty string.
func trangaString(m map[string]interface{}, keys ...string) string {
	for _, k := range keys {
		if s, ok := m[k].(string); ok && s != "" {
			return s
		}
	}
	return ""
}

// ── Cover proxy ───────────────────────────────────────────────────────────────

// ProxyTrangaCover proxies manga cover images from Tranga.
// Uses a query param (?id=...) because Tranga manga IDs may contain path-unsafe chars.
func ProxyTrangaCover(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integID := mux.Vars(r)["integrationId"]
		mangaId := r.URL.Query().Get("id")
		if mangaId == "" {
			http.Error(w, "missing id", http.StatusBadRequest)
			return
		}

		apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, integID)
		if err != nil {
			http.Error(w, "integration not found", http.StatusNotFound)
			return
		}

		// url.PathEscape encodes slashes and other unsafe chars within a single path segment.
		body, err := arrGet(apiURL, apiKey,
			"/v2/Manga/"+url.PathEscape(mangaId)+"/Cover/Small", skipTLS)
		if err != nil {
			http.Error(w, "cover fetch failed", http.StatusBadGateway)
			return
		}

		w.Header().Set("Content-Type", http.DetectContentType(body))
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.Write(body)
	}
}
