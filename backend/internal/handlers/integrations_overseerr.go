package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ── Overseerr types ────────────────────────────────────────────────────────────

type OverseerrPanelData struct {
	UIURL       string             `json:"uiUrl"`
	Version     string             `json:"version"`
	UpdateAvail bool               `json:"updateAvail"`
	Stats       OverseerrStats     `json:"stats"`
	Pending     []OverseerrRequest `json:"pending"`
}

type OverseerrStats struct {
	Pending    int `json:"pending"`
	Processing int `json:"processing"`
	Available  int `json:"available"`
	Declined   int `json:"declined"`
	Total      int `json:"total"`
	Movie      int `json:"movie"`
	TV         int `json:"tv"`
}

type OverseerrRequest struct {
	ID          int    `json:"id"`
	Type        string `json:"type"`
	Title       string `json:"title"`
	Poster      string `json:"poster"`
	Year        string `json:"year"`
	RequestedBy string `json:"requestedBy"`
	RequestedAt string `json:"requestedAt"`
	Status      string `json:"status"`
	TmdbID      int    `json:"tmdbId"`
}

// ── Overseerr API response types ──────────────────────────────────────────────

type overseerrStatusResp struct {
	Version     string `json:"version"`
	UpdateAvail bool   `json:"updateAvailable"`
}

type overseerrCountResp struct {
	Pending    int `json:"pending"`
	Approved   int `json:"approved"`
	Processing int `json:"processing"`
	Available  int `json:"available"`
	Declined   int `json:"declined"`
	Total      int `json:"total"`
	Movie      int `json:"movie"`
	TV         int `json:"tv"`
}

type overseerrRequestListResp struct {
	Results []overseerrRequestItemResp `json:"results"`
}

type overseerrRequestItemResp struct {
	ID        int    `json:"id"`
	Status    int    `json:"status"`
	Type      string `json:"type"`
	CreatedAt string `json:"createdAt"`
	RequestedBy struct {
		DisplayName string `json:"displayName"`
		Username    string `json:"username"`
	} `json:"requestedBy"`
	Media struct {
		TmdbID int `json:"tmdbId"`
	} `json:"media"`
}

type overseerrMovieDetailsResp struct {
	Title       string `json:"title"`
	ReleaseDate string `json:"releaseDate"`
	PosterPath  string `json:"posterPath"`
}

type overseerrTVDetailsResp struct {
	Name         string `json:"name"`
	FirstAirDate string `json:"firstAirDate"`
	PosterPath   string `json:"posterPath"`
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

func fetchOverseerrPanelData(db *sql.DB, config map[string]interface{}) (*OverseerrPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &OverseerrPanelData{UIURL: uiURL}

	// Server version + update info
	if body, err := overseerrGet(apiURL, apiKey, "/api/v1/status", skipTLS); err == nil {
		var status overseerrStatusResp
		if json.Unmarshal(body, &status) == nil {
			data.Version = status.Version
			data.UpdateAvail = status.UpdateAvail
		}
	}

	// Request counts
	if body, err := overseerrGet(apiURL, apiKey, "/api/v1/request/count", skipTLS); err == nil {
		var counts overseerrCountResp
		if json.Unmarshal(body, &counts) == nil {
			data.Stats = OverseerrStats{
				Pending:    counts.Pending,
				Processing: counts.Processing,
				Available:  counts.Available,
				Declined:   counts.Declined,
				Total:      counts.Total,
				Movie:      counts.Movie,
				TV:         counts.TV,
			}
		}
	}

	// Pending requests — fetch and enrich with TMDB media details via Overseerr
	if body, err := overseerrGet(apiURL, apiKey, "/api/v1/request?filter=pending&sort=added&take=12", skipTLS); err == nil {
		var list overseerrRequestListResp
		if json.Unmarshal(body, &list) == nil {
			for _, r := range list.Results {
				req := OverseerrRequest{
					ID:          r.ID,
					Type:        r.Type,
					RequestedBy: r.RequestedBy.DisplayName,
					RequestedAt: r.CreatedAt,
					Status:      overseerrStatusLabel(r.Status),
					TmdbID:      r.Media.TmdbID,
				}
				if req.RequestedBy == "" {
					req.RequestedBy = r.RequestedBy.Username
				}
				if r.Media.TmdbID > 0 {
					overseerrEnrich(apiURL, apiKey, skipTLS, &req)
				}
				data.Pending = append(data.Pending, req)
			}
		}
	}

	return data, nil
}

// overseerrEnrich fetches title/poster/year from Overseerr's TMDB-proxied movie or TV endpoint.
func overseerrEnrich(apiURL, apiKey string, skipTLS bool, req *OverseerrRequest) {
	if req.Type == "movie" {
		body, err := overseerrGet(apiURL, apiKey, fmt.Sprintf("/api/v1/movie/%d", req.TmdbID), skipTLS)
		if err != nil {
			return
		}
		var m overseerrMovieDetailsResp
		if json.Unmarshal(body, &m) == nil {
			req.Title = m.Title
			req.Poster = m.PosterPath
			if len(m.ReleaseDate) >= 4 {
				req.Year = m.ReleaseDate[:4]
			}
		}
	} else if req.Type == "tv" {
		body, err := overseerrGet(apiURL, apiKey, fmt.Sprintf("/api/v1/tv/%d", req.TmdbID), skipTLS)
		if err != nil {
			return
		}
		var t overseerrTVDetailsResp
		if json.Unmarshal(body, &t) == nil {
			req.Title = t.Name
			req.Poster = t.PosterPath
			if len(t.FirstAirDate) >= 4 {
				req.Year = t.FirstAirDate[:4]
			}
		}
	}
}

func overseerrStatusLabel(status int) string {
	switch status {
	case 1:
		return "pending"
	case 2:
		return "approved"
	case 3:
		return "declined"
	case 4:
		return "processing"
	case 5:
		return "available"
	default:
		return "unknown"
	}
}

func overseerrGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	url := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Api-Key", apiKey)
	req.Header.Set("Accept", "application/json")
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Overseerr", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func testOverseerrConnection(apiURL, apiKey string, skipTLS bool) error {
	body, err := overseerrGet(apiURL, apiKey, "/api/v1/status", skipTLS)
	if err != nil {
		return err
	}
	var status overseerrStatusResp
	if json.Unmarshal(body, &status) != nil || status.Version == "" {
		return fmt.Errorf("unexpected response from Overseerr API")
	}
	return nil
}
