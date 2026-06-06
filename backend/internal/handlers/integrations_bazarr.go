package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type BazarrProvider struct {
	Name   string `json:"name"`
	Status string `json:"status"` // "Good" or throttle/error description
	Retry  string `json:"retry"`  // "-" or retry timestamp
	OK     bool   `json:"ok"`
}

type BazarrPanelData struct {
	UIURL           string           `json:"uiUrl"`
	IntegrationID   string           `json:"integrationId"`
	Version         string           `json:"version"`
	MissingEpisodes int              `json:"missingEpisodes"`
	MissingMovies   int              `json:"missingMovies"`
	HealthIssues    int              `json:"healthIssues"`
	Providers       []BazarrProvider `json:"providers"`
	ProvidersTotal  int              `json:"providersTotal"`
	ProvidersOk     int              `json:"providersOk"`
	ProvidersIssues int              `json:"providersIssues"`
	DownloadedSeries int             `json:"downloadedSeries"` // last month
	DownloadedMovies int             `json:"downloadedMovies"` // last month
	SonarrLive      bool             `json:"sonarrLive"`
	RadarrLive      bool             `json:"radarrLive"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func bazarrGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	fullURL := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", fullURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if apiKey != "" {
		req.Header.Set("X-API-KEY", apiKey)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed: check API key")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Bazarr", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchBazarrPanelData(db *sql.DB, config map[string]interface{}) (*BazarrPanelData, error) {
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

	out := &BazarrPanelData{UIURL: uiURL, IntegrationID: integrationID}

	// ── System status / version ───────────────────────────────────────────────
	if body, err := bazarrGet(baseURL, apiKey, "/api/system/status", skipTLS); err == nil {
		var r struct {
			Data struct {
				BazarrVersion string `json:"bazarr_version"`
			} `json:"data"`
		}
		if json.Unmarshal(body, &r) == nil {
			out.Version = r.Data.BazarrVersion
		}
	}

	// ── Badges ────────────────────────────────────────────────────────────────
	if body, err := bazarrGet(baseURL, apiKey, "/api/badges", skipTLS); err != nil {
		return nil, fmt.Errorf("badges: %w", err)
	} else {
		var r struct {
			Episodes     int    `json:"episodes"`
			Movies       int    `json:"movies"`
			Providers    int    `json:"providers"`
			Status       int    `json:"status"`
			SonarrSignal string `json:"sonarr_signalr"`
			RadarrSignal string `json:"radarr_signalr"`
		}
		if json.Unmarshal(body, &r) == nil {
			out.MissingEpisodes = r.Episodes
			out.MissingMovies = r.Movies
			out.HealthIssues = r.Status
			out.SonarrLive = r.SonarrSignal == "LIVE"
			out.RadarrLive = r.RadarrSignal == "LIVE"
		}
	}

	// ── Providers ─────────────────────────────────────────────────────────────
	if body, err := bazarrGet(baseURL, apiKey, "/api/providers", skipTLS); err == nil {
		var r struct {
			Data []struct {
				Name   string `json:"name"`
				Status string `json:"status"`
				Retry  string `json:"retry"`
			} `json:"data"`
		}
		if json.Unmarshal(body, &r) == nil {
			for _, p := range r.Data {
				ok := p.Status == "Good"
				prov := BazarrProvider{
					Name:   p.Name,
					Status: p.Status,
					Retry:  p.Retry,
					OK:     ok,
				}
				out.Providers = append(out.Providers, prov)
				out.ProvidersTotal++
				if ok {
					out.ProvidersOk++
				} else {
					out.ProvidersIssues++
				}
			}
			// Issues first, then alphabetical
			sort.Slice(out.Providers, func(i, j int) bool {
				if out.Providers[i].OK != out.Providers[j].OK {
					return !out.Providers[i].OK
				}
				return out.Providers[i].Name < out.Providers[j].Name
			})
		}
	}

	// ── History stats (last month) ────────────────────────────────────────────
	if body, err := bazarrGet(baseURL, apiKey, "/api/history/stats?timeframe=month", skipTLS); err == nil {
		var r struct {
			Series []struct{ Count int `json:"count"` } `json:"series"`
			Movies []struct{ Count int `json:"count"` } `json:"movies"`
		}
		if json.Unmarshal(body, &r) == nil {
			for _, d := range r.Series {
				out.DownloadedSeries += d.Count
			}
			for _, d := range r.Movies {
				out.DownloadedMovies += d.Count
			}
		}
	}

	return out, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testBazarrConnection(baseURL, apiKey string, skipTLS bool) error {
	body, err := bazarrGet(baseURL, apiKey, "/api/system/status", skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		Data struct {
			BazarrVersion string `json:"bazarr_version"`
		} `json:"data"`
	}
	if json.Unmarshal(body, &r) != nil || r.Data.BazarrVersion == "" {
		return fmt.Errorf("unexpected response from Bazarr")
	}
	return nil
}
