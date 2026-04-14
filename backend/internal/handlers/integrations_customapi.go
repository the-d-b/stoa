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
	Fields []CustomAPIField `json:"fields"`
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

	// Resolve mappings
	data := &CustomAPIPanelData{}
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
