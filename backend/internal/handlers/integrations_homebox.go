package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type HomeboxLocation struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ItemCount int    `json:"itemCount"`
	Link      string `json:"link,omitempty"`
}

// HomeboxPhoto is one item with a photo attached, for the panel's photo strip.
type HomeboxPhoto struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	ThumbURL string `json:"thumbUrl"`
	Link     string `json:"link,omitempty"`
}

type HomeboxPanelData struct {
	TotalItems        int               `json:"totalItems"`
	TotalLocations    int               `json:"totalLocations"`
	TotalLabels       int               `json:"totalLabels"`
	TotalWithWarranty int               `json:"totalWithWarranty"`
	TotalItemPrice    float64           `json:"totalItemPrice"`
	Locations         []HomeboxLocation `json:"locations"`
	// Tags reuses HomeboxLocation's shape (id/name/itemCount/link) — same
	// "breakdown with a count" concept as locations, just scoped to items
	// carrying a given tag instead of items inside a given location.
	Tags   []HomeboxLocation `json:"tags"`
	Photos []HomeboxPhoto    `json:"photos"`
}

// homeboxPhotoURL builds a Stoa image-proxy URL for one item's photo
// attachment, mirroring plexThumbURL's convention (integrations_plex.go).
// Homebox serves attachment bytes at
// /api/v1/entities/{itemID}/attachments/{attachmentID}, auth-gated the same
// as every other API call — the browser can't reach it directly, only Stoa's
// backend (via the "homebox" case added to ImageProxy) can inject the token.
func homeboxPhotoURL(integrationID, itemID, attachmentID string) string {
	if itemID == "" || attachmentID == "" {
		return ""
	}
	upstreamPath := fmt.Sprintf("/api/v1/entities/%s/attachments/%s", itemID, attachmentID)
	return "/api/images/proxy?integration=" + url.QueryEscape(integrationID) + "&url=" + url.QueryEscape(upstreamPath)
}

// homeboxWebLink builds a direct link to Homebox's own web UI (not proxied —
// unlike the API, the UI is a normal page the browser can load itself; its
// own session/login handles auth). Confirmed against Homebox's frontend
// source (sysadminsmedia/homebox, Nuxt 3 pages under frontend/pages/):
// item detail is /item/{id}, location detail is /location/{id}, tag detail
// is /tag/{id}.
func homeboxWebLink(uiURL, kind, id string) string {
	if uiURL == "" || id == "" {
		return ""
	}
	return strings.TrimRight(uiURL, "/") + "/" + kind + "/" + id
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

// homeboxResolveToken returns a usable bearer token for Homebox's API.
// Two supported secret formats, auto-detected:
//   - "email:password" — exchanged for a session JWT via /api/v1/users/login
//     (the original Stoa auth path, kept for existing saved secrets)
//   - a raw API token, no colon — Homebox's own long-lived "API Tokens"
//     feature (Homebox UI → Profile → API Tokens), used directly as the
//     Bearer token with no login call needed
func homeboxResolveToken(baseURL, apiKey string, skipTLS bool) (string, error) {
	if strings.Contains(apiKey, ":") {
		return homeboxLogin(baseURL, apiKey, skipTLS)
	}
	if apiKey == "" {
		return "", fmt.Errorf("homebox: API key or email:password required")
	}
	return apiKey, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testHomeboxConnection(baseURL, apiKey string, skipTLS bool) error {
	token, err := homeboxResolveToken(baseURL, apiKey, skipTLS)
	if err != nil {
		return err
	}
	// A raw API token has no login step to validate against — resolving it
	// always "succeeds" trivially, so confirm it's actually accepted by
	// making a real authenticated call.
	if _, err := homeboxGet(baseURL, token, "/api/v1/groups/statistics", skipTLS); err != nil {
		return fmt.Errorf("homebox: token rejected — check API key or email:password: %w", err)
	}
	return nil
}

// ── Panel data ────────────────────────────────────────────────────────────────

func fetchHomeboxPanelData(db *sql.DB, config map[string]interface{}) (*HomeboxPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("homebox: no integration configured")
	}
	baseURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if baseURL == "" {
		return nil, fmt.Errorf("homebox: baseURL not configured")
	}
	if uiURL == "" {
		uiURL = baseURL
	}

	token, err := homeboxResolveToken(baseURL, apiKey, skipTLS)
	if err != nil {
		return nil, err
	}

	out := &HomeboxPanelData{Locations: []HomeboxLocation{}, Tags: []HomeboxLocation{}, Photos: []HomeboxPhoto{}}
	anyOK := false

	// Group statistics
	if b, err := homeboxGet(baseURL, token, "/api/v1/groups/statistics", skipTLS); err == nil {
		anyOK = true
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
	} else {
		logErrorf("HOMEBOX", "statistics error: %v", err)
	}

	// Location breakdown (includes itemCount per location). Confirmed against
	// Homebox's current source (sysadminsmedia/homebox): the old dedicated
	// /api/v1/locations endpoint no longer exists — locations are now fetched
	// via the unified /api/v1/entities endpoint filtered with isLocation=true,
	// returning a paginated wrapper ({"items":[...],"total":N,...}), not a
	// flat array. Omitting page/pageSize entirely resolves to Homebox's own
	// "no limit" sentinel (-1) server-side, so no explicit pagination params
	// are needed for this to return every location in one call.
	if b, err := homeboxGet(baseURL, token, "/api/v1/entities?isLocation=true", skipTLS); err == nil {
		anyOK = true
		var r struct {
			Total int `json:"total"`
			Items []struct {
				ID        string  `json:"id"`
				Name      string  `json:"name"`
				ItemCount float64 `json:"itemCount"`
			} `json:"items"`
		}
		if json.Unmarshal(b, &r) == nil {
			for _, l := range r.Items {
				// Empty locations aren't worth showing — just clutter, per
				// the user's own explicit call.
				if l.ItemCount <= 0 {
					continue
				}
				out.Locations = append(out.Locations, HomeboxLocation{
					ID:        l.ID,
					Name:      l.Name,
					ItemCount: int(l.ItemCount),
					Link:      homeboxWebLink(uiURL, "location", l.ID),
				})
			}
			sort.Slice(out.Locations, func(i, j int) bool {
				return out.Locations[i].ItemCount > out.Locations[j].ItemCount
			})
			if r.Total > len(r.Items) {
				logErrorf("HOMEBOX", "locations: got %d of %d total — response may be paginated more than expected", len(r.Items), r.Total)
			}
		} else {
			logErrorf("HOMEBOX", "locations: unexpected response: %s", strings.TrimSpace(string(b)))
		}
	} else {
		logErrorf("HOMEBOX", "locations error: %v", err)
	}

	// Tag breakdown. Confirmed live: /api/v1/tags returns a flat array with
	// no item count at all (unlike locations' summary, which carries one
	// directly) — so each tag's count has to be looked up individually via
	// /api/v1/entities?tags={id}, reading the wrapper's "total" (not
	// len(items) — pageSize=1 keeps each lookup's payload minimal since only
	// the count is needed). One extra request per tag; acceptable at
	// personal-inventory scale (a handful to a few dozen tags), not
	// something to over-engineer for now.
	if b, err := homeboxGet(baseURL, token, "/api/v1/tags", skipTLS); err == nil {
		anyOK = true
		var tags []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		}
		if json.Unmarshal(b, &tags) == nil {
			for _, t := range tags {
				path := fmt.Sprintf("/api/v1/entities?isLocation=false&tags=%s&pageSize=1", url.QueryEscape(t.ID))
				cb, cerr := homeboxGet(baseURL, token, path, skipTLS)
				if cerr != nil {
					logErrorf("HOMEBOX", "tag count error (tag=%s): %v", t.Name, cerr)
					continue
				}
				var cr struct {
					Total int `json:"total"`
				}
				if json.Unmarshal(cb, &cr) != nil {
					logErrorf("HOMEBOX", "tag count: unexpected response (tag=%s): %s", t.Name, strings.TrimSpace(string(cb)))
					continue
				}
				// Same "not important, wastes space" rule as empty locations.
				if cr.Total <= 0 {
					continue
				}
				out.Tags = append(out.Tags, HomeboxLocation{
					ID:        t.ID,
					Name:      t.Name,
					ItemCount: cr.Total,
					Link:      homeboxWebLink(uiURL, "tag", t.ID),
				})
			}
			sort.Slice(out.Tags, func(i, j int) bool {
				return out.Tags[i].ItemCount > out.Tags[j].ItemCount
			})
		} else {
			logErrorf("HOMEBOX", "tags: unexpected response: %s", strings.TrimSpace(string(b)))
		}
	} else {
		logErrorf("HOMEBOX", "tags error: %v", err)
	}

	// Item photos, for the panel's photo strip. onlyWithPhoto=true asks
	// Homebox to filter server-side rather than fetching every item and
	// discarding the ones without a photo (confirmed live: each item summary
	// carries an imageId — the full-size attachment — and, when present, a
	// thumbnailId pointing at a separate, smaller image/webp rendition of it;
	// thumbnailId is preferred when available since it's meant for exactly
	// this kind of small display, falling back to the full image otherwise).
	if b, err := homeboxGet(baseURL, token, "/api/v1/entities?isLocation=false&onlyWithPhoto=true", skipTLS); err == nil {
		anyOK = true
		var r struct {
			Total int `json:"total"`
			Items []struct {
				ID          string `json:"id"`
				Name        string `json:"name"`
				ImageID     string `json:"imageId"`
				ThumbnailID string `json:"thumbnailId"`
			} `json:"items"`
		}
		if json.Unmarshal(b, &r) == nil {
			if len(r.Items) == 0 && r.Total > 0 {
				logErrorf("HOMEBOX", "photos: total=%d but 0 items parsed — field names may not match, raw response: %s", r.Total, strings.TrimSpace(string(b)))
			}
			for _, it := range r.Items {
				attachID := it.ThumbnailID
				if attachID == "" {
					attachID = it.ImageID
				}
				if attachID == "" {
					continue
				}
				out.Photos = append(out.Photos, HomeboxPhoto{
					ID:       it.ID,
					Name:     it.Name,
					ThumbURL: homeboxPhotoURL(integrationID, it.ID, attachID),
					Link:     homeboxWebLink(uiURL, "item", it.ID),
				})
			}
		} else {
			logErrorf("HOMEBOX", "photos: unexpected response: %s", strings.TrimSpace(string(b)))
		}
	} else {
		logErrorf("HOMEBOX", "photos error: %v", err)
	}

	// Every endpoint failed — surface the error instead of rendering zeros
	if !anyOK {
		return nil, fmt.Errorf("homebox unreachable — check URL and credentials (see server log for details)")
	}

	return out, nil
}
