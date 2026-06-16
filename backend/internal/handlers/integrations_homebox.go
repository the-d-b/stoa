package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type HomeboxLocation struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ItemCount int    `json:"itemCount"`
}

type HomeboxPanelData struct {
	TotalItems        int               `json:"totalItems"`
	TotalLocations    int               `json:"totalLocations"`
	TotalLabels       int               `json:"totalLabels"`
	TotalWithWarranty int               `json:"totalWithWarranty"`
	TotalItemPrice    float64           `json:"totalItemPrice"`
	Locations         []HomeboxLocation `json:"locations"`
}

// ── Auth ──────────────────────────────────────────────────────────────────────

func homeboxLogin(baseURL, apiKey string, skipTLS bool) (string, error) {
	idx := strings.Index(apiKey, ":")
	if idx < 0 {
		return "", fmt.Errorf("homebox: apiKey must be email:password")
	}
	email := apiKey[:idx]
	password := apiKey[idx+1:]

	client := httpClient(skipTLS)
	body, _ := json.Marshal(map[string]interface{}{
		"username": email,
		"password": password,
	})
	req, err := http.NewRequest("POST", strings.TrimRight(baseURL, "/")+"/api/v1/users/login", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("homebox: login failed (HTTP %d) — check email and password", resp.StatusCode)
	}
	b, _ := io.ReadAll(resp.Body)
	var r struct {
		Token string `json:"token"`
	}
	if json.Unmarshal(b, &r) != nil || r.Token == "" {
		return "", fmt.Errorf("homebox: no token in login response")
	}
	return r.Token, nil
}

func homeboxGet(baseURL, token, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("homebox: HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Connection test ───────────────────────────────────────────────────────────

func testHomeboxConnection(baseURL, apiKey string, skipTLS bool) error {
	_, err := homeboxLogin(baseURL, apiKey, skipTLS)
	return err
}

// ── Panel data ────────────────────────────────────────────────────────────────

func fetchHomeboxPanelData(db *sql.DB, config map[string]interface{}) (*HomeboxPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("homebox: no integration configured")
	}
	baseURL, _, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if baseURL == "" {
		return nil, fmt.Errorf("homebox: baseURL not configured")
	}

	token, err := homeboxLogin(baseURL, apiKey, skipTLS)
	if err != nil {
		return nil, err
	}

	out := &HomeboxPanelData{Locations: []HomeboxLocation{}}

	// Group statistics
	if b, err := homeboxGet(baseURL, token, "/api/v1/groups/statistics", skipTLS); err == nil {
		var s struct {
			TotalItems        int     `json:"totalItems"`
			TotalLocations    int     `json:"totalLocations"`
			TotalLabels       int     `json:"totalLabels"`
			TotalWithWarranty int     `json:"totalWithWarranty"`
			TotalItemPrice    float64 `json:"totalItemPrice"`
		}
		if json.Unmarshal(b, &s) == nil {
			out.TotalItems = s.TotalItems
			out.TotalLocations = s.TotalLocations
			out.TotalLabels = s.TotalLabels
			out.TotalWithWarranty = s.TotalWithWarranty
			out.TotalItemPrice = s.TotalItemPrice
		}
	}

	// Location breakdown (includes itemCount per location)
	if b, err := homeboxGet(baseURL, token, "/api/v1/locations", skipTLS); err == nil {
		var locs []struct {
			ID        string `json:"id"`
			Name      string `json:"name"`
			ItemCount int    `json:"itemCount"`
		}
		if json.Unmarshal(b, &locs) == nil {
			for _, l := range locs {
				out.Locations = append(out.Locations, HomeboxLocation{
					ID:        l.ID,
					Name:      l.Name,
					ItemCount: l.ItemCount,
				})
			}
			sort.Slice(out.Locations, func(i, j int) bool {
				return out.Locations[i].ItemCount > out.Locations[j].ItemCount
			})
		}
	}

	return out, nil
}
