package handlers

// Security Posture — for a fixed, curated set of security-relevant
// integration types (network/storage infra that's realistically internet-
// or LAN-attack-surface-facing), tracks the detected running version
// alongside known CVEs for that product from the NVD (National Vulnerability
// Database) API.
//
// CVE data is cached per PRODUCT TYPE, not per integration instance — the
// vulnerability list for "TrueNAS" is the same regardless of how many
// TrueNAS integrations you've configured, so it's fetched once and shared.
// Version data is inherently per INSTANCE (two TrueNAS boxes can run
// different versions) and is read from each integration's own existing
// panel-data cache — no extra calls to the target app at all.
//
// This deliberately does NOT attempt to programmatically determine "is my
// version affected" — CVE affected-version ranges are often unstructured
// free text, and a wrong automated match is worse than no match. Instead it
// shows the CVE list and the detected version side by side and lets a human
// draw the conclusion, same as the "did I just see this bump number
// mentioned" gut-check that prompted this feature.

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

// securityPostureTypes maps a stoa integration type to the NVD keyword
// search term for its product. Curated, not auto-derived — see
// docs/integrations/security-posture/README.md for how this list was
// chosen and verified.
var securityPostureTypes = map[string]string{
	"truenas":   "TrueNAS",
	"unraid":    "Unraid",
	"omv":       "OpenMediaVault",
	"synology":  "Synology",
	"qnap":      "QNAP",
	"proxmox":   "Proxmox VE",
	"opnsense":  "OPNsense",
	"pfsense":   "pfSense",
	"openwrt":   "OpenWrt",
	"traefik":   "Traefik",
	"nginxpm":   "Nginx Proxy Manager",
	"authentik": "Authentik",
	"nextcloud": "Nextcloud",
	"omada":     "Omada Controller",
	"unifi":     "UniFi Network",
	"pihole":    "Pi-hole",
	"adguard":   "AdGuard Home",
	"tailscale": "Tailscale",
	"netbird":   "Netbird",
}

const secPostureRefreshInterval = 24 * time.Hour

type CVEItem struct {
	ID          string  `json:"id"`
	Description string  `json:"description"`
	Severity    string  `json:"severity"` // CRITICAL/HIGH/MEDIUM/LOW/UNKNOWN
	CVSSScore   float64 `json:"cvssScore"`
	Published   string  `json:"published"` // YYYY-MM-DD
	URL         string  `json:"url"`
}

var (
	secPostureCVECache   = map[string][]CVEItem{} // stoa type -> CVEs, sorted severity desc then recency desc
	secPostureLastFetch  = map[string]time.Time{}
	secPostureCacheMu    sync.RWMutex
)

func secPostureGetCVEs(igType string) ([]CVEItem, bool) {
	secPostureCacheMu.RLock()
	defer secPostureCacheMu.RUnlock()
	items, ok := secPostureCVECache[igType]
	return items, ok
}

// ── NVD fetch ─────────────────────────────────────────────────────────────

var severityRank = map[string]int{"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1, "UNKNOWN": 0}

func nvdFetchCVEs(searchTerm, apiKey string) ([]CVEItem, error) {
	params := url.Values{
		"keywordSearch":  {searchTerm},
		"resultsPerPage": {"200"},
	}
	apiURL := "https://services.nvd.nist.gov/rest/json/cves/2.0?" + params.Encode()
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Stoa/1.0")
	if apiKey != "" {
		req.Header.Set("apiKey", apiKey)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 403 || resp.StatusCode == 429 {
		return nil, fmt.Errorf("NVD rate limited or forbidden (HTTP %d)", resp.StatusCode)
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("NVD API HTTP %d", resp.StatusCode)
	}

	var parsed struct {
		Vulnerabilities []struct {
			CVE struct {
				ID           string `json:"id"`
				Published    string `json:"published"`
				Descriptions []struct {
					Lang  string `json:"lang"`
					Value string `json:"value"`
				} `json:"descriptions"`
				Metrics struct {
					CvssMetricV31 []struct {
						CvssData struct {
							BaseScore    float64 `json:"baseScore"`
							BaseSeverity string  `json:"baseSeverity"`
						} `json:"cvssData"`
					} `json:"cvssMetricV31"`
					CvssMetricV30 []struct {
						CvssData struct {
							BaseScore    float64 `json:"baseScore"`
							BaseSeverity string  `json:"baseSeverity"`
						} `json:"cvssData"`
					} `json:"cvssMetricV30"`
					CvssMetricV2 []struct {
						BaseSeverity string `json:"baseSeverity"`
						CvssData     struct {
							BaseScore float64 `json:"baseScore"`
						} `json:"cvssData"`
					} `json:"cvssMetricV2"`
				} `json:"metrics"`
			} `json:"cve"`
		} `json:"vulnerabilities"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}

	items := make([]CVEItem, 0, len(parsed.Vulnerabilities))
	for _, v := range parsed.Vulnerabilities {
		c := v.CVE
		desc := ""
		for _, d := range c.Descriptions {
			if d.Lang == "en" {
				desc = d.Value
				break
			}
		}
		score, severity := 0.0, "UNKNOWN"
		switch {
		case len(c.Metrics.CvssMetricV31) > 0:
			score = c.Metrics.CvssMetricV31[0].CvssData.BaseScore
			severity = c.Metrics.CvssMetricV31[0].CvssData.BaseSeverity
		case len(c.Metrics.CvssMetricV30) > 0:
			score = c.Metrics.CvssMetricV30[0].CvssData.BaseScore
			severity = c.Metrics.CvssMetricV30[0].CvssData.BaseSeverity
		case len(c.Metrics.CvssMetricV2) > 0:
			score = c.Metrics.CvssMetricV2[0].CvssData.BaseScore
			severity = c.Metrics.CvssMetricV2[0].BaseSeverity
		}
		if severity == "" {
			severity = "UNKNOWN"
		}
		published := c.Published
		if len(published) >= 10 {
			published = published[:10]
		}
		items = append(items, CVEItem{
			ID: c.ID, Description: desc, Severity: strings.ToUpper(severity),
			CVSSScore: score, Published: published,
			URL: "https://nvd.nist.gov/vuln/detail/" + c.ID,
		})
	}

	sort.Slice(items, func(i, j int) bool {
		si, sj := severityRank[items[i].Severity], severityRank[items[j].Severity]
		if si != sj {
			return si > sj
		}
		return items[i].Published > items[j].Published
	})
	return items, nil
}

// ── Background worker ─────────────────────────────────────────────────────

// StartSecurityPostureWorker runs for the process lifetime, refreshing CVE
// data once per secPostureRefreshInterval for each covered type that has at
// least one configured integration — no point spending NVD's rate budget on
// products nobody's running.
func StartSecurityPostureWorker(db *sql.DB) {
	go func() {
		logDebugf("SECPOSTURE", "worker started")
		for {
			secPostureTickOnce(db)
			time.Sleep(time.Hour)
		}
	}()
}

func secPostureTickOnce(db *sql.DB) {
	inUse := secPostureTypesInUse(db)
	if len(inUse) == 0 {
		return
	}
	apiKey := secPostureAPIKey(db)
	now := time.Now()

	secPostureCacheMu.RLock()
	var due []string
	for _, t := range inUse {
		if last, ok := secPostureLastFetch[t]; !ok || now.Sub(last) >= secPostureRefreshInterval {
			due = append(due, t)
		}
	}
	secPostureCacheMu.RUnlock()

	for i, t := range due {
		if i > 0 {
			time.Sleep(6 * time.Second) // stay well under NVD's rate limit regardless of key
		}
		term := securityPostureTypes[t]
		items, err := nvdFetchCVEs(term, apiKey)
		secPostureCacheMu.Lock()
		secPostureLastFetch[t] = now
		secPostureCacheMu.Unlock()
		if err != nil {
			logErrorf("SECPOSTURE", "fetch %s (%s): %v", t, term, err)
			continue
		}
		secPostureCacheMu.Lock()
		secPostureCVECache[t] = items
		secPostureCacheMu.Unlock()
		logDebugf("SECPOSTURE", "refreshed %s: %d CVEs", t, len(items))
	}
}

// secPostureTypesInUse returns the distinct covered types that have at
// least one configured integration, system or personal.
func secPostureTypesInUse(db *sql.DB) []string {
	rows, err := db.Query("SELECT DISTINCT type FROM integrations")
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var t string
		if rows.Scan(&t) == nil {
			if _, ok := securityPostureTypes[t]; ok {
				out = append(out, t)
			}
		}
	}
	return out
}

func secPostureAPIKey(db *sql.DB) string {
	var key string
	db.QueryRow("SELECT value FROM app_config WHERE key='nvd_api_key'").Scan(&key)
	return key
}

// ── Panel data ────────────────────────────────────────────────────────────

type SecPostureEntry struct {
	IntegrationID string    `json:"integrationId"`
	Type          string    `json:"type"`
	Name          string    `json:"name"`
	UIURL         string    `json:"uiUrl"`
	Version       string    `json:"version,omitempty"`
	CVEs          []CVEItem `json:"cves"`
}

type SecPosturePanelData struct {
	Entries []SecPostureEntry `json:"entries"`
}

// fetchSecurityPosturePanelData auto-discovers every configured integration
// (system or personal, visible to the requesting context is handled by the
// normal integration listing elsewhere — this reads all of them, matching
// how other cross-cutting panels behave) whose type is in the covered list,
// and joins each with its cached version and its type's cached CVE list.
// No per-panel source picker: this is meant as a holistic overview, not
// something you'd hand-curate.
func fetchSecurityPosturePanelData(db *sql.DB, config map[string]interface{}) (*SecPosturePanelData, error) {
	rows, err := db.Query("SELECT id, name, type, ui_url FROM integrations WHERE enabled=1")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	data := &SecPosturePanelData{Entries: []SecPostureEntry{}}
	for rows.Next() {
		var id, name, igType, uiURL string
		if rows.Scan(&id, &name, &igType, &uiURL) != nil {
			continue
		}
		if _, ok := securityPostureTypes[igType]; !ok {
			continue
		}
		entry := SecPostureEntry{
			IntegrationID: id, Type: igType, Name: name, UIURL: uiURL,
			Version: secPostureDetectVersion(igType, id),
		}
		if cves, ok := secPostureGetCVEs(igType); ok {
			entry.CVEs = cves
		} else {
			entry.CVEs = []CVEItem{}
		}
		data.Entries = append(data.Entries, entry)
	}
	return data, nil
}

// secPostureDetectVersion reads the version stoa's normal integration cache
// already has for this instance — no extra call to the target app. Field
// names vary per type's existing panel-data struct, so this is a small
// manual adapter rather than a shared interface.
func secPostureDetectVersion(igType, integrationID string) string {
	cached, ok := cacheGet(integrationID)
	if !ok {
		return ""
	}
	b, err := json.Marshal(cached)
	if err != nil {
		return ""
	}
	var probe map[string]json.RawMessage
	if json.Unmarshal(b, &probe) != nil {
		return ""
	}
	field := map[string]string{
		"truenas": "version", "unraid": "version", "omv": "version",
		"synology": "dsmVersion", "qnap": "fwVersion", "proxmox": "version",
		"opnsense": "version", "traefik": "version", "nextcloud": "version",
		"unifi": "version", "pihole": "version", "adguard": "version",
		"netbird": "version",
	}[igType]
	if field == "" {
		if igType == "pfsense" {
			// system_version may be a plain string or a nested object
			if raw, ok := probe["version"]; ok {
				var s string
				if json.Unmarshal(raw, &s) == nil {
					return s
				}
			}
		}
		if igType == "tailscale" {
			if raw, ok := probe["clientVersion"]; ok {
				var s string
				json.Unmarshal(raw, &s) //nolint:errcheck
				return s
			}
		}
		return "" // no single representative version (e.g. openwrt/npm/authentik/omada not yet captured)
	}
	raw, ok := probe[field]
	if !ok {
		return ""
	}
	var s string
	json.Unmarshal(raw, &s) //nolint:errcheck
	return s
}

// ── Admin settings: optional NVD API key ────────────────────────────────

func GetNVDConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var key string
		db.QueryRow("SELECT value FROM app_config WHERE key='nvd_api_key'").Scan(&key)
		writeJSON(w, http.StatusOK, map[string]bool{"configured": key != ""})
	}
}

func SaveNVDConfig(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			APIKey string `json:"apiKey"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request")
			return
		}
		db.Exec(`INSERT INTO app_config (key, value) VALUES ('nvd_api_key', ?)
			ON CONFLICT(key) DO UPDATE SET value=excluded.value`, strings.TrimSpace(req.APIKey))
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
