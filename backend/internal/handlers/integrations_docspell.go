package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type DocspellItem struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	Date          string   `json:"date"`
	Correspondent string   `json:"correspondent"`
	Folder        string   `json:"folder"`
	Tags          []string `json:"tags"`
}

type DocspellPanelData struct {
	TotalItems   int            `json:"totalItems"`
	StorageBytes int64          `json:"storageBytes"`
	TagCount     int            `json:"tagCount"`
	RecentItems  []DocspellItem `json:"recentItems"`
}

// ── Auth ──────────────────────────────────────────────────────────────────────

// apiKey format: "account:password" where account is "collective/user" or just "user"
func docspellLogin(baseURL, apiKey string, skipTLS bool) (string, error) {
	idx := strings.Index(apiKey, ":")
	if idx < 0 {
		return "", fmt.Errorf("docspell: API key must be account:password")
	}
	account, password := apiKey[:idx], apiKey[idx+1:]

	client := httpClient(skipTLS)
	body, _ := json.Marshal(map[string]string{"account": account, "password": password})
	req, err := http.NewRequest("POST", strings.TrimRight(baseURL, "/")+"/api/v1/open/auth/login", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("docspell: auth failed (HTTP %d)", resp.StatusCode)
	}
	var r struct {
		Success bool   `json:"success"`
		Token   string `json:"token"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(b, &r); err != nil {
		return "", fmt.Errorf("docspell: invalid auth response")
	}
	if !r.Success {
		msg := r.Message
		if msg == "" {
			msg = "login failed"
		}
		return "", fmt.Errorf("docspell: %s", msg)
	}
	return r.Token, nil
}

func docspellGet(baseURL, token, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Docspell-Auth", token)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("docspell: HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Connection test ───────────────────────────────────────────────────────────

func testDocspellConnection(baseURL, apiKey string, skipTLS bool) error {
	_, err := docspellLogin(baseURL, apiKey, skipTLS)
	return err
}

// ── Panel data ────────────────────────────────────────────────────────────────

func fetchDocspellPanelData(db *sql.DB, config map[string]interface{}) (*DocspellPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("docspell: no integration configured")
	}
	baseURL, _, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if baseURL == "" {
		return nil, fmt.Errorf("docspell: baseURL not configured")
	}

	token, err := docspellLogin(baseURL, apiKey, skipTLS)
	if err != nil {
		return nil, err
	}

	out := &DocspellPanelData{RecentItems: []DocspellItem{}}

	// Collective insights — totals, storage, tag count
	if b, err := docspellGet(baseURL, token, "/api/v1/sec/collective/insights", skipTLS); err == nil {
		var r struct {
			IncomingCount int   `json:"incomingCount"`
			OutgoingCount int   `json:"outgoingCount"`
			ItemSize      int64 `json:"itemSize"`
			TagCloud      struct {
				Items []json.RawMessage `json:"items"`
			} `json:"tagCloud"`
		}
		if json.Unmarshal(b, &r) == nil {
			out.TotalItems = r.IncomingCount + r.OutgoingCount
			out.StorageBytes = r.ItemSize
			out.TagCount = len(r.TagCloud.Items)
		}
	}

	// Recent items
	if b, err := docspellGet(baseURL, token, "/api/v1/sec/item/search?limit=8&offset=0", skipTLS); err == nil {
		var r struct {
			Groups []struct {
				Items []struct {
					ID      string `json:"id"`
					Name    string `json:"name"`
					Date    *int64 `json:"date"`
					CorrOrg *struct {
						Name string `json:"name"`
					} `json:"corrOrg"`
					CorrPerson *struct {
						Name string `json:"name"`
					} `json:"corrPerson"`
					Folder *struct {
						Name string `json:"name"`
					} `json:"folder"`
					Tags []struct {
						Name string `json:"name"`
					} `json:"tags"`
				} `json:"items"`
			} `json:"groups"`
		}
		if json.Unmarshal(b, &r) == nil {
			for _, g := range r.Groups {
				for _, it := range g.Items {
					di := DocspellItem{ID: it.ID, Name: it.Name}
					if it.Date != nil && *it.Date > 0 {
						di.Date = time.Unix(*it.Date/1000, 0).UTC().Format("2006-01-02")
					}
					if it.CorrOrg != nil {
						di.Correspondent = it.CorrOrg.Name
					} else if it.CorrPerson != nil {
						di.Correspondent = it.CorrPerson.Name
					}
					if it.Folder != nil {
						di.Folder = it.Folder.Name
					}
					for _, t := range it.Tags {
						di.Tags = append(di.Tags, t.Name)
					}
					out.RecentItems = append(out.RecentItems, di)
					if len(out.RecentItems) >= 8 {
						break
					}
				}
				if len(out.RecentItems) >= 8 {
					break
				}
			}
		}
	}

	return out, nil
}
