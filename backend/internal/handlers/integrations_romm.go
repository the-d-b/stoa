package handlers

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type RomMPlatform struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Slug     string `json:"slug"`
	RomCount int    `json:"romCount"`
	LogoURL  string `json:"logoUrl"`
}

type RomMGame struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Platform string `json:"platform"`
	CoverURL string `json:"coverUrl"`
}

type RomMPanelData struct {
	TotalPlatforms int            `json:"totalPlatforms"`
	TotalRoms      int            `json:"totalRoms"`
	TotalSizeBytes int64          `json:"totalSizeBytes"`
	Platforms      []RomMPlatform `json:"platforms"`
	RecentGames    []RomMGame     `json:"recentGames"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func rommGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	if idx := strings.Index(apiKey, ":"); idx >= 0 {
		// username:password → Basic Auth
		enc := base64.StdEncoding.EncodeToString([]byte(apiKey))
		req.Header.Set("Authorization", "Basic "+enc)
	} else if apiKey != "" {
		// pre-generated rmm_ token → Bearer
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("romm: HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func rommCoverURL(baseURL, pathSmall, urlCover string) string {
	if pathSmall != "" {
		if strings.HasPrefix(pathSmall, "/") {
			return strings.TrimRight(baseURL, "/") + pathSmall
		}
		return pathSmall
	}
	return urlCover
}

// ── Connection test ───────────────────────────────────────────────────────────

func testRommConnection(baseURL, apiKey string, skipTLS bool) error {
	b, err := rommGet(baseURL, apiKey, "/api/heartbeat", skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		System struct {
			Version string `json:"VERSION"`
		} `json:"SYSTEM"`
	}
	if json.Unmarshal(b, &r) != nil || r.System.Version == "" {
		return fmt.Errorf("romm: unexpected heartbeat response")
	}
	return nil
}

// ── Panel data ────────────────────────────────────────────────────────────────

func fetchRommPanelData(db *sql.DB, config map[string]interface{}) (*RomMPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("romm: no integration configured")
	}
	baseURL, _, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if baseURL == "" {
		return nil, fmt.Errorf("romm: baseURL not configured")
	}

	out := &RomMPanelData{Platforms: []RomMPlatform{}, RecentGames: []RomMGame{}}

	// Stats
	if b, err := rommGet(baseURL, apiKey, "/api/stats", skipTLS); err == nil {
		var r struct {
			Platforms      int   `json:"PLATFORMS"`
			Roms           int   `json:"ROMS"`
			TotalFileBytes int64 `json:"TOTAL_FILESIZE_BYTES"`
		}
		if json.Unmarshal(b, &r) == nil {
			out.TotalPlatforms = r.Platforms
			out.TotalRoms = r.Roms
			out.TotalSizeBytes = r.TotalFileBytes
		}
	}

	// Platforms (sorted by rom count descending in response)
	if b, err := rommGet(baseURL, apiKey, "/api/platforms", skipTLS); err == nil {
		var platforms []struct {
			ID       int    `json:"id"`
			Name     string `json:"name"`
			Slug     string `json:"slug"`
			RomCount int    `json:"rom_count"`
			URLLogo  string `json:"url_logo"`
		}
		if json.Unmarshal(b, &platforms) == nil {
			for _, p := range platforms {
				if p.RomCount == 0 {
					continue
				}
				out.Platforms = append(out.Platforms, RomMPlatform{
					ID:       p.ID,
					Name:     p.Name,
					Slug:     p.Slug,
					RomCount: p.RomCount,
					LogoURL:  p.URLLogo,
				})
			}
		}
	}

	// Recent games with cover art
	if b, err := rommGet(baseURL, apiKey, "/api/roms?order_by=created_at&order_dir=desc&limit=24", skipTLS); err == nil {
		var r struct {
			Items []struct {
				ID                  int    `json:"id"`
				Name                string `json:"name"`
				PlatformDisplayName string `json:"platform_display_name"`
				PathCoverSmall      string `json:"path_cover_s"`
				PathCoverLarge      string `json:"path_cover_l"`
				URLCover            string `json:"url_cover"`
			} `json:"items"`
		}
		if json.Unmarshal(b, &r) == nil {
			for _, it := range r.Items {
				cover := rommCoverURL(baseURL, it.PathCoverSmall, it.URLCover)
				if cover == "" {
					cover = rommCoverURL(baseURL, it.PathCoverLarge, "")
				}
				out.RecentGames = append(out.RecentGames, RomMGame{
					ID:       it.ID,
					Name:     it.Name,
					Platform: it.PlatformDisplayName,
					CoverURL: cover,
				})
			}
		}
	}

	return out, nil
}
