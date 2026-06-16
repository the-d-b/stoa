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
	Processing  []OverseerrRequest `json:"processing"`
	Available   []OverseerrRequest `json:"available"`
	Declined    []OverseerrRequest `json:"declined"`
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
		TmdbID       int    `json:"tmdbId"`
		PosterPath   string `json:"posterPath"`
		Title        string `json:"title"`        // movies
		Name         string `json:"name"`         // TV
		ReleaseDate  string `json:"releaseDate"`  // movies
		FirstAirDate string `json:"firstAirDate"` // TV
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

// ── Fetch helpers ─────────────────────────────────────────────────────────────

func overseerrFetchRequests(apiURL, apiKey, filter string, take int, skipTLS bool) []OverseerrRequest {
	path := fmt.Sprintf("/api/v1/request?filter=%s&sort=added&take=%d", filter, take)
	body, err := overseerrGet(apiURL, apiKey, path, skipTLS)
	if err != nil {
		return []OverseerrRequest{}
	}
	var list overseerrRequestListResp
	if json.Unmarshal(body, &list) != nil {
		return []OverseerrRequest{}
	}
	result := make([]OverseerrRequest, 0, len(list.Results))
	for _, r := range list.Results {
		req := OverseerrRequest{
			ID:          r.ID,
			Type:        r.Type,
			RequestedBy: r.RequestedBy.DisplayName,
			RequestedAt: r.CreatedAt,
			Status:      overseerrStatusLabel(r.Status),
			TmdbID:      r.Media.TmdbID,
			Poster:      r.Media.PosterPath,
		}
		if req.RequestedBy == "" {
			req.RequestedBy = r.RequestedBy.Username
		}
		// Use title/year from the media object inline when available
		if r.Media.Title != "" {
			req.Title = r.Media.Title
			if len(r.Media.ReleaseDate) >= 4 {
				req.Year = r.Media.ReleaseDate[:4]
			}
		} else if r.Media.Name != "" {
			req.Title = r.Media.Name
			if len(r.Media.FirstAirDate) >= 4 {
				req.Year = r.Media.FirstAirDate[:4]
			}
		}
		// Fall back to per-request enrichment only if still missing data
		if (req.Title == "" || req.Poster == "") && r.Media.TmdbID > 0 {
			overseerrEnrich(apiURL, apiKey, skipTLS, &req)
		}
		result = append(result, req)
	}
	return result
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
	data := &OverseerrPanelData{
		UIURL:      uiURL,
		Pending:    []OverseerrRequest{},
		Processing: []OverseerrRequest{},
		Available:  []OverseerrRequest{},
		Declined:   []OverseerrRequest{},
	}

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

	// Fetch all requests in one call and bucket by status — avoids filter name
	// ambiguity ("declined" is not a valid filter value in Overseerr's API).
	for _, req := range overseerrFetchRequests(apiURL, apiKey, "all", 200, skipTLS) {
		switch req.Status {
		case "pending":
			if len(data.Pending) < 20 {
				data.Pending = append(data.Pending, req)
			}
		case "approved", "processing":
			if len(data.Processing) < 20 {
				data.Processing = append(data.Processing, req)
			}
		case "available":
			if len(data.Available) < 20 {
				data.Available = append(data.Available, req)
			}
		case "declined":
			if len(data.Declined) < 20 {
				data.Declined = append(data.Declined, req)
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
