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

type PaperlessTag struct {
	ID            int    `json:"id"`
	Name          string `json:"name"`
	Color         string `json:"color"`
	IsInboxTag    bool   `json:"isInboxTag"`
	DocumentCount int    `json:"documentCount"`
}

type PaperlessCorrespondent struct {
	ID            int    `json:"id"`
	Name          string `json:"name"`
	DocumentCount int    `json:"documentCount"`
}

type PaperlessDocType struct {
	ID            int    `json:"id"`
	Name          string `json:"name"`
	DocumentCount int    `json:"documentCount"`
}

type PaperlessDocument struct {
	ID            int    `json:"id"`
	Title         string `json:"title"`
	Created       string `json:"created"`
	Correspondent string `json:"correspondent"` // resolved name
	DocumentType  string `json:"documentType"`  // resolved name
}

type PaperlessPanelData struct {
	UIURL           string                   `json:"uiUrl"`
	IntegrationID   string                   `json:"integrationId"`
	TotalDocuments  int                      `json:"totalDocuments"`
	InboxCount      int                      `json:"inboxCount"`
	RecentDocuments []PaperlessDocument      `json:"recentDocuments"`
	Tags            []PaperlessTag           `json:"tags"`
	Correspondents  []PaperlessCorrespondent `json:"correspondents"`
	DocumentTypes   []PaperlessDocType       `json:"documentTypes"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func paperlessGet(baseURL, token, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	fullURL := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", fullURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Token "+token)
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed — check Paperless-ngx API token")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Paperless-ngx", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchPaperlessPanelData(db *sql.DB, config map[string]interface{}) (*PaperlessPanelData, error) {
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
	if apiKey == "" {
		return nil, fmt.Errorf("API token required — generate one in Paperless-ngx → Settings → API")
	}

	out := &PaperlessPanelData{UIURL: uiURL, IntegrationID: integrationID}

	// ── Total document count ──────────────────────────────────────────────────
	if body, err := paperlessGet(baseURL, apiKey, "/api/documents/?page_size=1", skipTLS); err == nil {
		var r struct {
			Count int `json:"count"`
		}
		if json.Unmarshal(body, &r) == nil {
			out.TotalDocuments = r.Count
		}
	}

	// ── Inbox count (untagged documents) ──────────────────────────────────────
	if body, err := paperlessGet(baseURL, apiKey, "/api/documents/?tags__isnull=true&page_size=1", skipTLS); err == nil {
		var r struct {
			Count int `json:"count"`
		}
		if json.Unmarshal(body, &r) == nil {
			out.InboxCount = r.Count
		}
	}

	// ── Tags (for chart data + inbox tag detection) ───────────────────────────
	if body, err := paperlessGet(baseURL, apiKey, "/api/tags/?page_size=100", skipTLS); err == nil {
		var r struct {
			Results []struct {
				ID            int    `json:"id"`
				Name          string `json:"name"`
				Color         string `json:"colour"`
				IsInboxTag    bool   `json:"is_inbox_tag"`
				DocumentCount int    `json:"document_count"`
			} `json:"results"`
		}
		if json.Unmarshal(body, &r) == nil {
			for _, t := range r.Results {
				out.Tags = append(out.Tags, PaperlessTag{
					ID:            t.ID,
					Name:          t.Name,
					Color:         t.Color,
					IsInboxTag:    t.IsInboxTag,
					DocumentCount: t.DocumentCount,
				})
			}
			// If an inbox tag exists, use its count instead of untagged count
			for _, t := range out.Tags {
				if t.IsInboxTag {
					out.InboxCount = t.DocumentCount
					break
				}
			}
			// Sort tags by document count desc
			sort.Slice(out.Tags, func(i, j int) bool {
				return out.Tags[i].DocumentCount > out.Tags[j].DocumentCount
			})
		}
	}

	// ── Correspondents ────────────────────────────────────────────────────────
	if body, err := paperlessGet(baseURL, apiKey, "/api/correspondents/?page_size=100", skipTLS); err == nil {
		var r struct {
			Results []struct {
				ID            int    `json:"id"`
				Name          string `json:"name"`
				DocumentCount int    `json:"document_count"`
			} `json:"results"`
		}
		if json.Unmarshal(body, &r) == nil {
			for _, c := range r.Results {
				out.Correspondents = append(out.Correspondents, PaperlessCorrespondent{
					ID:            c.ID,
					Name:          c.Name,
					DocumentCount: c.DocumentCount,
				})
			}
			sort.Slice(out.Correspondents, func(i, j int) bool {
				return out.Correspondents[i].DocumentCount > out.Correspondents[j].DocumentCount
			})
		}
	}

	// ── Document types ────────────────────────────────────────────────────────
	if body, err := paperlessGet(baseURL, apiKey, "/api/document_types/?page_size=100", skipTLS); err == nil {
		var r struct {
			Results []struct {
				ID            int    `json:"id"`
				Name          string `json:"name"`
				DocumentCount int    `json:"document_count"`
			} `json:"results"`
		}
		if json.Unmarshal(body, &r) == nil {
			for _, dt := range r.Results {
				out.DocumentTypes = append(out.DocumentTypes, PaperlessDocType{
					ID:            dt.ID,
					Name:          dt.Name,
					DocumentCount: dt.DocumentCount,
				})
			}
			sort.Slice(out.DocumentTypes, func(i, j int) bool {
				return out.DocumentTypes[i].DocumentCount > out.DocumentTypes[j].DocumentCount
			})
		}
	}

	// ── Build lookup maps for resolving IDs ───────────────────────────────────
	corrNames := map[int]string{}
	for _, c := range out.Correspondents {
		corrNames[c.ID] = c.Name
	}
	typeNames := map[int]string{}
	for _, t := range out.DocumentTypes {
		typeNames[t.ID] = t.Name
	}

	// ── Recent documents ──────────────────────────────────────────────────────
	if body, err := paperlessGet(baseURL, apiKey, "/api/documents/?ordering=-created&page_size=10", skipTLS); err == nil {
		var r struct {
			Results []struct {
				ID            int    `json:"id"`
				Title         string `json:"title"`
				Created       string `json:"created"`
				Correspondent *int   `json:"correspondent"`
				DocumentType  *int   `json:"document_type"`
			} `json:"results"`
		}
		if json.Unmarshal(body, &r) == nil {
			for _, d := range r.Results {
				doc := PaperlessDocument{
					ID:      d.ID,
					Title:   d.Title,
					Created: d.Created,
				}
				if d.Correspondent != nil {
					doc.Correspondent = corrNames[*d.Correspondent]
				}
				if d.DocumentType != nil {
					doc.DocumentType = typeNames[*d.DocumentType]
				}
				out.RecentDocuments = append(out.RecentDocuments, doc)
			}
		}
	}

	return out, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testPaperlessConnection(baseURL, apiKey string, skipTLS bool) error {
	if apiKey == "" {
		return fmt.Errorf("API token required")
	}
	body, err := paperlessGet(baseURL, apiKey, "/api/documents/?page_size=1", skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		Count int `json:"count"`
	}
	if json.Unmarshal(body, &r) != nil {
		return fmt.Errorf("unexpected response from Paperless-ngx")
	}
	return nil
}
