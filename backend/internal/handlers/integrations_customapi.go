package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ── Custom API types ──────────────────────────────────────────────────────────

type CustomAPIPanelData struct {
	Fields      []CustomAPIField `json:"fields"`
	RawResponse interface{}      `json:"rawResponse,omitempty"`
}

type CustomAPIField struct {
	Label string      `json:"label"`
	Value interface{} `json:"value"`
}

func fetchCustomAPIPanelData(db *sql.DB, config map[string]interface{}) (*CustomAPIPanelData, error) {
	// URL comes directly from config (not from an integration)
	url := stringVal(config, "url")
	if url == "" {
		return nil, fmt.Errorf("no URL configured")
	}

	apiKey := stringVal(config, "apiKey") // optional bearer token
	skipTLS := false
	if v, ok := config["skipTls"].(bool); ok {
		skipTLS = v
	}

	// Fetch the URL
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("invalid URL: %v", err)
	}
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from API", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %v", err)
	}

	// Parse JSON
	var raw interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("invalid JSON response")
	}

	// Resolve mappings — also include raw response for preview/debugging
	data := &CustomAPIPanelData{RawResponse: raw}
	mappings, _ := config["mappings"].([]interface{})
	for _, m := range mappings {
		mapping, ok := m.(map[string]interface{})
		if !ok {
			continue
		}
		label := stringVal(mapping, "label")
		path := stringVal(mapping, "path")
		if path == "" || label == "" {
			continue
		}
		value := resolvePath(raw, path)
		data.Fields = append(data.Fields, CustomAPIField{
			Label: label,
			Value: value,
		})
	}

	return data, nil
}

// PreviewCustomAPI fetches a URL and returns raw JSON — no panel config needed.
// Used by the Test & Preview button before the panel has been saved.
func PreviewCustomAPI(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			URL     string `json:"url"`
			APIKey  string `json:"apiKey"`
			SkipTLS bool   `json:"skipTls"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.URL == "" {
			writeError(w, http.StatusBadRequest, "url required")
			return
		}
		httpReq, err := http.NewRequest("GET", req.URL, nil)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid url: "+err.Error())
			return
		}
		if req.APIKey != "" {
			httpReq.Header.Set("Authorization", "Bearer "+req.APIKey)
		}
		client := httpClient(req.SkipTLS)
		resp, err := client.Do(httpReq)
		if err != nil {
			writeError(w, http.StatusBadGateway, "request failed: "+err.Error())
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 400 {
			writeError(w, http.StatusBadGateway, fmt.Sprintf("HTTP %d from API", resp.StatusCode))
			return
		}
		body, _ := io.ReadAll(resp.Body)
		var raw interface{}
		if err := json.Unmarshal(body, &raw); err != nil {
			writeError(w, http.StatusBadGateway, "invalid JSON response")
			return
		}
		writeJSON(w, http.StatusOK, raw)
	}
}

// resolvePath resolves a dot-notation path like "photos.unsorted" from parsed JSON
func resolvePath(data interface{}, path string) interface{} {
	parts := strings.SplitN(path, ".", 2)
	m, ok := data.(map[string]interface{})
	if !ok {
		return nil
	}
	val, exists := m[parts[0]]
	if !exists {
		return nil
	}
	if len(parts) == 1 {
		return val
	}
	return resolvePath(val, parts[1])
}
