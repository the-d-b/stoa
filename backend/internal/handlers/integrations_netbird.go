package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type NetbirdPeer struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	IP           string   `json:"ip"`
	OS           string   `json:"os"`
	Version      string   `json:"version"`
	Connected    bool     `json:"connected"`
	LastSeen     string   `json:"lastSeen"` // RFC3339
	SSHEnabled   bool     `json:"sshEnabled"`
	Groups       []string `json:"groups"`
	LoginExpired bool     `json:"loginExpired"`
}

type NetbirdGroup struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	PeersCount int    `json:"peersCount"`
}

type NetbirdPolicy struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

type NetbirdPanelData struct {
	UIURL          string          `json:"uiUrl"`
	IntegrationID  string          `json:"integrationId"`
	TotalPeers     int             `json:"totalPeers"`
	OnlinePeers    int             `json:"onlinePeers"`
	OfflinePeers   int             `json:"offlinePeers"`
	ExpiredPeers   int             `json:"expiredPeers"`
	TotalGroups    int             `json:"totalGroups"`
	TotalPolicies  int             `json:"totalPolicies"`
	ActivePolicies int             `json:"activePolicies"`
	Peers          []NetbirdPeer   `json:"peers"`
	Groups         []NetbirdGroup  `json:"groups"`
	Policies       []NetbirdPolicy `json:"policies"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func netbirdGet(baseURL, token, path string, skipTLS bool) ([]byte, error) {
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
		return nil, fmt.Errorf("authentication failed — check Netbird Personal Access Token")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Netbird", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchNetbirdPanelData(db *sql.DB, config map[string]interface{}) (*NetbirdPanelData, error) {
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

	out := &NetbirdPanelData{UIURL: uiURL, IntegrationID: integrationID}

	// ── Peers ─────────────────────────────────────────────────────────────────
	if body, err := netbirdGet(baseURL, apiKey, "/api/peers", skipTLS); err == nil {
		var rawPeers []struct {
			ID           string `json:"id"`
			Name         string `json:"name"`
			IP           string `json:"ip"`
			OS           string `json:"os"`
			Version      string `json:"version"`
			Connected    bool   `json:"connected"`
			LastSeen     string `json:"last_seen"`
			SSHEnabled   bool   `json:"ssh_enabled"`
			LoginExpired bool   `json:"login_expired"`
			Groups       []struct {
				Name string `json:"name"`
			} `json:"groups"`
		}
		if json.Unmarshal(body, &rawPeers) == nil {
			for _, p := range rawPeers {
				groups := make([]string, 0, len(p.Groups))
				for _, g := range p.Groups {
					groups = append(groups, g.Name)
				}
				lastSeen := p.LastSeen
				// Normalize last_seen to RFC3339 if not already
				if lastSeen != "" {
					if t, err := time.Parse(time.RFC3339, lastSeen); err == nil {
						lastSeen = t.UTC().Format(time.RFC3339)
					}
				}
				peer := NetbirdPeer{
					ID:           p.ID,
					Name:         p.Name,
					IP:           p.IP,
					OS:           p.OS,
					Version:      p.Version,
					Connected:    p.Connected,
					LastSeen:     lastSeen,
					SSHEnabled:   p.SSHEnabled,
					LoginExpired: p.LoginExpired,
					Groups:       groups,
				}
				out.TotalPeers++
				if p.Connected {
					out.OnlinePeers++
				} else {
					out.OfflinePeers++
				}
				if p.LoginExpired {
					out.ExpiredPeers++
				}
				out.Peers = append(out.Peers, peer)
			}
			// Sort: online first, then by name
			sort.Slice(out.Peers, func(i, j int) bool {
				if out.Peers[i].Connected != out.Peers[j].Connected {
					return out.Peers[i].Connected
				}
				return out.Peers[i].Name < out.Peers[j].Name
			})
		}
	}

	// ── Groups ────────────────────────────────────────────────────────────────
	if body, err := netbirdGet(baseURL, apiKey, "/api/groups", skipTLS); err == nil {
		var rawGroups []struct {
			ID         string `json:"id"`
			Name       string `json:"name"`
			PeersCount int    `json:"peers_count"`
		}
		if json.Unmarshal(body, &rawGroups) == nil {
			for _, g := range rawGroups {
				out.Groups = append(out.Groups, NetbirdGroup{
					ID:         g.ID,
					Name:       g.Name,
					PeersCount: g.PeersCount,
				})
				out.TotalGroups++
			}
			sort.Slice(out.Groups, func(i, j int) bool {
				return out.Groups[i].Name < out.Groups[j].Name
			})
		}
	}

	// ── Policies ──────────────────────────────────────────────────────────────
	if body, err := netbirdGet(baseURL, apiKey, "/api/policies", skipTLS); err == nil {
		var rawPolicies []struct {
			ID      string `json:"id"`
			Name    string `json:"name"`
			Enabled bool   `json:"enabled"`
		}
		if json.Unmarshal(body, &rawPolicies) == nil {
			for _, p := range rawPolicies {
				out.Policies = append(out.Policies, NetbirdPolicy{
					ID:      p.ID,
					Name:    p.Name,
					Enabled: p.Enabled,
				})
				out.TotalPolicies++
				if p.Enabled {
					out.ActivePolicies++
				}
			}
		}
	}

	return out, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testNetbirdConnection(baseURL, apiKey string, skipTLS bool) error {
	body, err := netbirdGet(baseURL, apiKey, "/api/peers", skipTLS)
	if err != nil {
		return err
	}
	// Must be a valid JSON array
	var arr []json.RawMessage
	if json.Unmarshal(body, &arr) != nil {
		return fmt.Errorf("unexpected response from Netbird")
	}
	return nil
}
