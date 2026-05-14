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

// ── HA types ─────────────────────────────────────────────────────────────────

// HAFullData is cached per integration (all entities, no panel-level filter).
// GetPanelData applies entity/domain filters from panel config at serve time.
type HAFullData struct {
	UIURL         string     `json:"uiUrl"`
	LocationName  string     `json:"locationName"`
	Version       string     `json:"version"`
	TotalEntities int        `json:"totalEntities"`
	Entities      []HAEntity `json:"entities"`
}

type HAEntity struct {
	EntityID     string `json:"entityId"`
	FriendlyName string `json:"friendlyName"`
	Domain       string `json:"domain"`
	DeviceClass  string `json:"deviceClass"`
	State        string `json:"state"`
	Unit         string `json:"unit"`
	LastChanged  string `json:"lastChanged"`
}

// ── HA API response shapes ────────────────────────────────────────────────────

type haConfigResponse struct {
	LocationName string `json:"location_name"`
	Version      string `json:"version"`
}

type haStateResponse struct {
	EntityID    string                 `json:"entity_id"`
	State       string                 `json:"state"`
	Attributes  map[string]interface{} `json:"attributes"`
	LastChanged string                 `json:"last_changed"`
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

// fetchHAPanelData fetches ALL entity states plus server info from Home Assistant.
// It returns the full unfiltered data set. Panel-specific entity/domain filtering
// is applied later in GetPanelData via filterHAData so multiple panels sharing
// the same integration can each display different subsets of the same cache entry.
func fetchHAPanelData(db *sql.DB, config map[string]interface{}) (*HAFullData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &HAFullData{UIURL: uiURL}

	// Server info — non-fatal on error, continue to entities
	cfgBody, err := haGet(apiURL, apiKey, "/api/config", skipTLS)
	if err == nil {
		var cfg haConfigResponse
		if json.Unmarshal(cfgBody, &cfg) == nil {
			data.LocationName = cfg.LocationName
			data.Version = cfg.Version
		}
	}

	// All entity states
	statesBody, err := haGet(apiURL, apiKey, "/api/states", skipTLS)
	if err != nil {
		// Return partial (server info only) rather than hard-failing
		return data, nil
	}
	var states []haStateResponse
	if err := json.Unmarshal(statesBody, &states); err != nil {
		return data, nil
	}

	data.TotalEntities = len(states)
	data.Entities = make([]HAEntity, 0, len(states))
	for _, s := range states {
		entity := HAEntity{
			EntityID:    s.EntityID,
			Domain:      haEntityDomain(s.EntityID),
			State:       s.State,
			LastChanged: s.LastChanged,
		}
		if fn, ok := s.Attributes["friendly_name"].(string); ok {
			entity.FriendlyName = fn
		}
		if dc, ok := s.Attributes["device_class"].(string); ok {
			entity.DeviceClass = dc
		}
		if u, ok := s.Attributes["unit_of_measurement"].(string); ok {
			entity.Unit = u
		}
		data.Entities = append(data.Entities, entity)
	}

	// Sort by domain then entity_id for consistent, predictable ordering
	sort.Slice(data.Entities, func(i, j int) bool {
		if data.Entities[i].Domain != data.Entities[j].Domain {
			return data.Entities[i].Domain < data.Entities[j].Domain
		}
		return data.Entities[i].EntityID < data.Entities[j].EntityID
	})

	return data, nil
}

// filterHAData applies entity_id and domain filters from panel config and returns
// a filtered copy. TotalEntities is preserved from the original (reflects HA total).
// When no filters are configured all entities are returned; users who set up the
// panel with no filter see the full list (sorted by the worker at fetch time).
func filterHAData(full *HAFullData, config map[string]interface{}) *HAFullData {
	entityIDsStr := stringVal(config, "entityIds")
	domainsStr   := stringVal(config, "domains")

	if entityIDsStr == "" && domainsStr == "" {
		return full // no filter — serve everything
	}

	// Build lookup sets (case-insensitive)
	entitySet := map[string]bool{}
	for _, id := range haParseList(entityIDsStr) {
		if id != "" {
			entitySet[strings.ToLower(id)] = true
		}
	}
	domainSet := map[string]bool{}
	for _, d := range haParseList(domainsStr) {
		if d != "" {
			domainSet[strings.ToLower(d)] = true
		}
	}

	filtered := make([]HAEntity, 0, len(full.Entities))
	for _, e := range full.Entities {
		if entitySet[strings.ToLower(e.EntityID)] || domainSet[strings.ToLower(e.Domain)] {
			filtered = append(filtered, e)
		}
	}

	return &HAFullData{
		UIURL:         full.UIURL,
		LocationName:  full.LocationName,
		Version:       full.Version,
		TotalEntities: full.TotalEntities,
		Entities:      filtered,
	}
}

// haParseList splits a comma-separated string and trims whitespace from each part.
func haParseList(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		out = append(out, strings.TrimSpace(p))
	}
	return out
}

// haEntityDomain extracts the domain prefix from an entity_id.
// "sensor.living_room_temp" → "sensor"
func haEntityDomain(entityID string) string {
	if idx := strings.IndexByte(entityID, '.'); idx >= 0 {
		return entityID[:idx]
	}
	return entityID
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func haGet(baseURL, token, path string, skipTLS bool) ([]byte, error) {
	url := strings.TrimRight(baseURL, "/") + path
	client := httpClient(skipTLS)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Home Assistant", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Connection test ───────────────────────────────────────────────────────────

// testHAConnection verifies connectivity and token validity by calling GET /api/
// which requires a valid Bearer token and returns {"message": "API running."}.
func testHAConnection(apiURL, token string, skipTLS bool) error {
	body, err := haGet(apiURL, token, "/api/", skipTLS)
	if err != nil {
		return err
	}
	var result map[string]interface{}
	if json.Unmarshal(body, &result) != nil {
		return fmt.Errorf("unexpected response from Home Assistant")
	}
	msg, _ := result["message"].(string)
	if msg != "API running." {
		return fmt.Errorf("unexpected response: %s", msg)
	}
	return nil
}
