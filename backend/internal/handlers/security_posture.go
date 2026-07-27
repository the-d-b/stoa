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
// Two fetch modes, per product (see securityPostureCPE):
//   - CPE mode: for products with clean NVD CPE coverage, CVEs are fetched by
//     CPE match and carry NVD's STRUCTURED affected-version ranges. Those
//     (unlike free-text ranges) are safe to match against, so the panel filters
//     the list to the running version automatically — precise, no noise.
//   - keyword mode: for everything else, CVEs are fetched by free-text keyword
//     (broad, noisy, version-blind). The panel does NOT guess applicability from
//     keyword results — it shows the list next to the detected version and lets
//     a human draw the conclusion, optionally aided by the per-integration
//     "ignore CVEs before <date>" filter (auto-stamped on a detected upgrade).

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/the-d-b/stoa/internal/models"
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
	"keycloak":  "Keycloak",
	"nextcloud": "Nextcloud",
	"omada":     "Omada Controller",
	"unifi":     "UniFi Network",
	"pihole":    "Pi-hole",
	"adguard":   "AdGuard Home",
	"tailscale": "Tailscale",
	"netbird":   "Netbird",
	// CPE-mode products (see securityPostureCPE) are listed here too so they
	// count as "covered"; for them the keyword is an unused fallback.
	"plex":          "Plex Media Server",
	"jellyfin":      "Jellyfin",
	"grafana":       "Grafana",
	"homeassistant": "Home Assistant",
}

// cpeSlug identifies an NVD CPE product: part (a/o/h), vendor, product.
type cpeSlug struct{ part, vendor, product string }

// securityPostureCPE lists the types fetched via NVD CPE match instead of
// keyword search. Their CVEs carry NVD's structured affected-version ranges, so
// the panel filters them to the running version exactly — no keyword false
// positives, and no ignore-date guesswork. Only products verified to have
// clean, single-product CPE coverage with real version ranges belong here (see
// the CPE-coverage investigation in docs/integrations/security-posture/).
// Multiple slugs per type cover historical vendor renames (e.g. Traefik was
// filed under "containous" before "traefik").
var securityPostureCPE = map[string][]cpeSlug{
	"opnsense":      {{"a", "opnsense", "opnsense"}},
	"authentik":     {{"a", "goauthentik", "authentik"}},
	"traefik":       {{"a", "traefik", "traefik"}, {"a", "containous", "traefik"}},
	"plex":          {{"a", "plex", "media_server"}, {"a", "plex", "plex_media_server"}},
	"jellyfin":      {{"a", "jellyfin", "jellyfin"}},
	"grafana":       {{"a", "grafana", "grafana"}},
	"homeassistant": {{"a", "home-assistant", "home-assistant"}},
}

const secPostureRefreshInterval = 24 * time.Hour

type CVEItem struct {
	ID          string  `json:"id"`
	Description string  `json:"description"`
	Severity    string  `json:"severity"` // CRITICAL/HIGH/MEDIUM/LOW/UNKNOWN
	CVSSScore   float64 `json:"cvssScore"`
	Published   string  `json:"published"` // YYYY-MM-DD
	URL         string  `json:"url"`
	// ranges holds the affected-version ranges NVD attached to this CVE for the
	// matched product (CPE mode only). Used to filter to the running version;
	// unexported so it never reaches the frontend.
	ranges []cveVersionRange
}

// cveVersionRange is one affected-version window from an NVD CPE match. Empty
// bound strings mean "unbounded on that side". exact pins a single version;
// unbounded means the match had no version constraint at all (applies to every
// version of the product).
type cveVersionRange struct {
	startIncluding string
	startExcluding string
	endIncluding   string
	endExcluding   string
	exact          string
	unbounded      bool
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

// nvdCVE is one CVE object from the NVD CVE 2.0 API.
type nvdCVE struct {
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
	Configurations []struct {
		Nodes []struct {
			CpeMatch []struct {
				Criteria              string `json:"criteria"`
				VersionStartIncluding string `json:"versionStartIncluding"`
				VersionStartExcluding string `json:"versionStartExcluding"`
				VersionEndIncluding   string `json:"versionEndIncluding"`
				VersionEndExcluding   string `json:"versionEndExcluding"`
			} `json:"cpeMatch"`
		} `json:"nodes"`
	} `json:"configurations"`
}

// nvdResponse is one page of the NVD CVE 2.0 API result.
type nvdResponse struct {
	TotalResults    int `json:"totalResults"`
	Vulnerabilities []struct {
		CVE nvdCVE `json:"cve"`
	} `json:"vulnerabilities"`
}

// nvdBuildItem converts a raw NVD CVE into the trimmed CVEItem the panel uses.
// Version ranges, if any, are attached separately by the CPE fetch path.
func nvdBuildItem(c nvdCVE) CVEItem {
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
	return CVEItem{
		ID: c.ID, Description: desc, Severity: strings.ToUpper(severity),
		CVSSScore: score, Published: published,
		URL: "https://nvd.nist.gov/vuln/detail/" + c.ID,
	}
}

// nvdExtractRanges pulls the affected-version ranges NVD recorded for any of
// the given product slugs from a CVE's CPE applicability config. These are
// structured fields (not the free-text ranges the panel refuses to parse), so
// matching a running version against them is safe.
func nvdExtractRanges(c nvdCVE, slugs []cpeSlug) []cveVersionRange {
	var out []cveVersionRange
	for _, cfg := range c.Configurations {
		for _, node := range cfg.Nodes {
			for _, m := range node.CpeMatch {
				f := strings.Split(m.Criteria, ":")
				if len(f) < 6 {
					continue
				}
				matched := false
				for _, s := range slugs {
					if f[2] == s.part && f[3] == s.vendor && f[4] == s.product {
						matched = true
						break
					}
				}
				if !matched {
					continue
				}
				r := cveVersionRange{
					startIncluding: m.VersionStartIncluding,
					startExcluding: m.VersionStartExcluding,
					endIncluding:   m.VersionEndIncluding,
					endExcluding:   m.VersionEndExcluding,
				}
				if r.startIncluding == "" && r.startExcluding == "" &&
					r.endIncluding == "" && r.endExcluding == "" {
					if f[5] != "*" && f[5] != "-" {
						r.exact = f[5] // criteria pins one exact version
					} else {
						r.unbounded = true // no constraint — applies to all versions
					}
				}
				out = append(out, r)
			}
		}
	}
	return out
}

func nvdSortItems(items []CVEItem) {
	sort.Slice(items, func(i, j int) bool {
		si, sj := severityRank[items[i].Severity], severityRank[items[j].Severity]
		if si != sj {
			return si > sj
		}
		return items[i].Published > items[j].Published
	})
}

// nvdFetchPaged walks all result pages for a CVE query, invoking onCVE for each
// CVE. resultsPerPage max is 2000, so covered products fit in one page today;
// the loop only matters if a product ever exceeds it. Without walking pages we
// would silently drop everything past the first — and since NVD's default order
// is not by severity, that tail can hide the worst CVEs.
func nvdFetchPaged(query url.Values, apiKey string, onCVE func(nvdCVE)) error {
	const pageSize = 2000
	startIndex := 0
	for {
		params := url.Values{}
		for k, v := range query {
			params[k] = v
		}
		params.Set("resultsPerPage", strconv.Itoa(pageSize))
		params.Set("startIndex", strconv.Itoa(startIndex))
		apiURL := "https://services.nvd.nist.gov/rest/json/cves/2.0?" + params.Encode()
		req, err := http.NewRequest("GET", apiURL, nil)
		if err != nil {
			return err
		}
		req.Header.Set("User-Agent", "Stoa/1.0")
		if apiKey != "" {
			req.Header.Set("apiKey", apiKey)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return err
		}
		if resp.StatusCode == 403 || resp.StatusCode == 429 {
			resp.Body.Close()
			return fmt.Errorf("NVD rate limited or forbidden (HTTP %d)", resp.StatusCode)
		}
		if resp.StatusCode >= 400 {
			resp.Body.Close()
			return fmt.Errorf("NVD API HTTP %d", resp.StatusCode)
		}
		var parsed nvdResponse
		derr := json.NewDecoder(resp.Body).Decode(&parsed)
		resp.Body.Close()
		if derr != nil {
			return derr
		}
		for _, v := range parsed.Vulnerabilities {
			onCVE(v.CVE)
		}
		startIndex += len(parsed.Vulnerabilities)
		if len(parsed.Vulnerabilities) == 0 || startIndex >= parsed.TotalResults {
			break
		}
		time.Sleep(6 * time.Second) // NVD's requested pacing between requests
	}
	return nil
}

// nvdFetchCVEs fetches CVEs by free-text keyword (products without clean CPE
// coverage). Broad but noisy: matches CVE description text, so it can include
// false positives and can't be filtered by version.
func nvdFetchCVEs(searchTerm, apiKey string) ([]CVEItem, error) {
	var items []CVEItem
	if err := nvdFetchPaged(url.Values{"keywordSearch": {searchTerm}}, apiKey, func(c nvdCVE) {
		items = append(items, nvdBuildItem(c))
	}); err != nil {
		return nil, err
	}
	nvdSortItems(items)
	return items, nil
}

// nvdFetchCVEsByCPE fetches CVEs formally linked to the given product CPE(s),
// carrying their structured version ranges so the panel can filter to the
// running version. Multiple slugs cover historical vendor renames; results are
// merged and de-duplicated by CVE ID (ranges are extracted across all slugs on
// first sight, so a later duplicate adds nothing).
func nvdFetchCVEsByCPE(slugs []cpeSlug, apiKey string) ([]CVEItem, error) {
	var items []CVEItem
	seen := map[string]bool{}
	for i, s := range slugs {
		if i > 0 {
			time.Sleep(6 * time.Second) // pace multi-slug products under NVD's limit
		}
		vms := fmt.Sprintf("cpe:2.3:%s:%s:%s:*:*:*:*:*:*:*:*", s.part, s.vendor, s.product)
		err := nvdFetchPaged(url.Values{"virtualMatchString": {vms}}, apiKey, func(c nvdCVE) {
			if seen[c.ID] {
				return
			}
			seen[c.ID] = true
			it := nvdBuildItem(c)
			it.ranges = nvdExtractRanges(c, slugs)
			items = append(items, it)
		})
		if err != nil {
			return nil, err
		}
	}
	nvdSortItems(items)
	return items, nil
}

// parseVersion extracts the dotted-numeric core of a version string into
// comparable integer components, stopping at the first build/pre-release
// separator (e.g. "24.7.11_1" -> [24 7 11], "v1.6.6" -> [1 6 6]).
func parseVersion(s string) []int {
	s = strings.TrimLeft(strings.TrimSpace(s), "vV")
	var out []int
	cur := ""
	flush := func() {
		if cur != "" {
			n, _ := strconv.Atoi(cur)
			out = append(out, n)
			cur = ""
		}
	}
	for _, ch := range s {
		switch {
		case ch >= '0' && ch <= '9':
			cur += string(ch)
		case ch == '.':
			flush()
		default:
			flush()
			return out // stop at first suffix separator (-, _, +, letters, …)
		}
	}
	flush()
	return out
}

// compareVersions returns -1/0/1 comparing two parsed versions component-wise,
// padding the shorter with zeros.
func compareVersions(a, b []int) int {
	n := len(a)
	if len(b) > n {
		n = len(b)
	}
	for i := 0; i < n; i++ {
		av, bv := 0, 0
		if i < len(a) {
			av = a[i]
		}
		if i < len(b) {
			bv = b[i]
		}
		if av != bv {
			if av < bv {
				return -1
			}
			return 1
		}
	}
	return 0
}

// cveAppliesToVersion reports whether running falls within any of the CVE's
// affected-version ranges. An unknown or unparseable running version, or a CVE
// with no ranges, is treated as "applies" — the panel never hides something it
// can't rule out.
func cveAppliesToVersion(c CVEItem, running string) bool {
	if running == "" || len(c.ranges) == 0 {
		return true
	}
	rv := parseVersion(running)
	if len(rv) == 0 {
		return true
	}
	for _, r := range c.ranges {
		if r.unbounded {
			return true
		}
		if r.exact != "" {
			if compareVersions(rv, parseVersion(r.exact)) == 0 {
				return true
			}
			continue
		}
		ok := true
		if r.startIncluding != "" && compareVersions(rv, parseVersion(r.startIncluding)) < 0 {
			ok = false
		}
		if ok && r.startExcluding != "" && compareVersions(rv, parseVersion(r.startExcluding)) <= 0 {
			ok = false
		}
		if ok && r.endIncluding != "" && compareVersions(rv, parseVersion(r.endIncluding)) > 0 {
			ok = false
		}
		if ok && r.endExcluding != "" && compareVersions(rv, parseVersion(r.endExcluding)) >= 0 {
			ok = false
		}
		if ok {
			return true
		}
	}
	return false
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
	// Runs every tick regardless of CVE-fetch due-ness — a detected date only
	// needs day granularity, and hourly is far finer than upgrades happen.
	secPostureTrackVersions(db)

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
		var items []CVEItem
		var err error
		var label string
		if slugs, ok := securityPostureCPE[t]; ok {
			label = "cpe"
			items, err = nvdFetchCVEsByCPE(slugs, apiKey)
		} else {
			label = securityPostureTypes[t]
			items, err = nvdFetchCVEs(label, apiKey)
		}
		secPostureCacheMu.Lock()
		secPostureLastFetch[t] = now
		secPostureCacheMu.Unlock()
		if err != nil {
			logErrorf("SECPOSTURE", "fetch %s (%s): %v", t, label, err)
			continue
		}
		secPostureCacheMu.Lock()
		secPostureCVECache[t] = items
		secPostureCacheMu.Unlock()
		logDebugf("SECPOSTURE", "refreshed %s (%s): %d CVEs", t, label, len(items))
	}
}

// secPostureTrackVersions watches each covered integration's running version
// (read from its existing panel cache, no extra upstream call) and, on a
// genuine change, stamps cveIgnoreBefore with today's date so the CVE list
// re-baselines to "published since I upgraded".
//
// Rules, deliberately conservative:
//   - version unknown (cold cache / no version field) → record nothing.
//   - first observation of a version → store it as the baseline but set NO
//     date: we can't know when a pre-existing version was actually installed,
//     and guessing "today" would wrongly hide every older CVE that may still
//     apply.
//   - a previously-seen version changing to a different non-empty version →
//     treat as an upgrade/rollback, store the new version AND set
//     cveIgnoreBefore = today.
//
// The stamped date is only a starting point: the user can override it in the
// integration form (e.g. to a real release date they've correlated by hand),
// and that manual value survives because we rewrite ONLY on an actual version
// transition, never on an unchanged tick. detectedVersion is kept in the same
// config JSON as cveIgnoreBefore — no schema change, and the integration form
// already round-trips unknown config keys.
func secPostureTrackVersions(db *sql.DB) {
	rows, err := db.Query(`SELECT id, type, COALESCE(config,'{}') FROM integrations WHERE enabled=1`)
	if err != nil {
		return
	}
	type target struct{ id, igType, config string }
	var targets []target
	for rows.Next() {
		var t target
		if rows.Scan(&t.id, &t.igType, &t.config) == nil {
			if _, ok := securityPostureTypes[t.igType]; ok {
				targets = append(targets, t)
			}
		}
	}
	rows.Close()

	today := time.Now().Format("2006-01-02")
	for _, t := range targets {
		if _, isCPE := securityPostureCPE[t.igType]; isCPE {
			// CPE-mode types filter by version range directly, so the ignore-date
			// isn't used for them — and auto-stamping it would wrongly hide CVEs
			// that DO apply to the running version but were published earlier.
			continue
		}
		running := strings.TrimSpace(secPostureDetectVersion(t.igType, t.id))
		if running == "" {
			continue // cold cache / version unknown — don't record anything
		}
		var cfg map[string]interface{}
		if json.Unmarshal([]byte(t.config), &cfg) != nil || cfg == nil {
			cfg = map[string]interface{}{}
		}
		stored, _ := cfg["detectedVersion"].(string)
		if stored == running {
			continue // no change
		}
		cfg["detectedVersion"] = running
		if stored != "" {
			// Genuine transition (not first observation) — re-baseline the filter.
			cfg["cveIgnoreBefore"] = today
		}
		newConfig, merr := json.Marshal(cfg)
		if merr != nil {
			continue
		}
		if _, uerr := db.Exec(`UPDATE integrations SET config=? WHERE id=?`, string(newConfig), t.id); uerr != nil {
			logErrorf("SECPOSTURE", "version-track update %s: %v", t.id, uerr)
			continue
		}
		if stored != "" {
			logDebugf("SECPOSTURE", "version change %s (%s): %q -> %q, cveIgnoreBefore=%s", t.id, t.igType, stored, running, today)
		} else {
			logDebugf("SECPOSTURE", "version baseline %s (%s): %q", t.id, t.igType, running)
		}
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

// fetchSecurityPosturePanelData auto-discovers configured integrations whose
// type is in the covered list and joins each with its cached version and its
// type's cached CVE list. No per-panel source picker: this is meant as a
// holistic overview, not something you'd hand-curate — but it only surfaces
// integrations the requesting user can actually see, using the identical
// visibility rule ListIntegrations already applies for "My Integrations":
// your own integrations, plus system integrations with no group restriction,
// plus system integrations restricted to a group you're in. Admins see all
// system integrations regardless of group restriction, same as elsewhere —
// but, matching ListIntegrations, NOT other individual users' personal
// integrations. A panel shared to someone who can't see the underlying
// integrations shows fewer (or zero) entries rather than everything; that's
// deliberate, not a bug — see docs/integrations/security-posture/.
func fetchSecurityPosturePanelData(db *sql.DB, config map[string]interface{}) (*SecPosturePanelData, error) {
	userID := stringVal(config, "_userId")
	isAdmin := stringVal(config, "_userRole") == string(models.RoleAdmin)

	var rows *sql.Rows
	var err error
	if isAdmin {
		rows, err = db.Query(`
			SELECT id, name, type, ui_url, COALESCE(config,'{}') FROM integrations
			WHERE enabled=1 AND (created_by='SYSTEM' OR created_by=?)
		`, userID)
	} else {
		rows, err = db.Query(`
			SELECT DISTINCT i.id, i.name, i.type, i.ui_url, COALESCE(i.config,'{}')
			FROM integrations i
			WHERE i.enabled=1 AND (
				i.created_by = ?
				OR (i.created_by = 'SYSTEM' AND NOT EXISTS (
					SELECT 1 FROM integration_groups WHERE integration_id = i.id
				))
				OR (i.created_by = 'SYSTEM' AND EXISTS (
					SELECT 1 FROM integration_groups ig
					JOIN user_groups ug ON ig.group_id = ug.group_id
					WHERE ig.integration_id = i.id AND ug.user_id = ?
				))
			)
		`, userID, userID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	data := &SecPosturePanelData{Entries: []SecPostureEntry{}}
	for rows.Next() {
		var id, name, igType, uiURL, configStr string
		if rows.Scan(&id, &name, &igType, &uiURL, &configStr) != nil {
			continue
		}
		if _, ok := securityPostureTypes[igType]; !ok {
			continue
		}
		entry := SecPostureEntry{
			IntegrationID: id, Type: igType, Name: name, UIURL: uiURL,
			Version: secPostureDetectVersion(igType, id),
		}
		var igConfig struct {
			CVEIgnoreBefore string `json:"cveIgnoreBefore"` // YYYY-MM-DD
		}
		json.Unmarshal([]byte(configStr), &igConfig) //nolint:errcheck
		if cves, ok := secPostureGetCVEs(igType); ok {
			if _, isCPE := securityPostureCPE[igType]; isCPE {
				// CPE mode: filter to CVEs whose NVD version ranges include the
				// running version. Exact, so the ignore-date is not applied here.
				filtered := make([]CVEItem, 0, len(cves))
				for _, c := range cves {
					if cveAppliesToVersion(c, entry.Version) {
						filtered = append(filtered, c)
					}
				}
				entry.CVEs = filtered
			} else if igConfig.CVEIgnoreBefore != "" {
				// keyword mode: publish-date noise filter
				filtered := make([]CVEItem, 0, len(cves))
				for _, c := range cves {
					if c.Published >= igConfig.CVEIgnoreBefore {
						filtered = append(filtered, c)
					}
				}
				entry.CVEs = filtered
			} else {
				entry.CVEs = cves
			}
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
		"authentik": "version", "keycloak": "version", "nginxpm": "version",
		"openwrt": "version", "omada": "version",
		"plex": "version", "jellyfin": "version", "grafana": "version",
		"homeassistant": "version",
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
			// No single account-level version — each device reports its own
			// clientVersion, and a tailnet's devices can genuinely be on
			// different releases. Use whichever version the most devices
			// share as the representative one.
			if raw, ok := probe["devices"]; ok {
				var devices []struct {
					ClientVersion string `json:"clientVersion"`
				}
				if json.Unmarshal(raw, &devices) == nil {
					versions := make([]string, len(devices))
					for i, d := range devices {
						versions[i] = d.ClientVersion
					}
					best := secPostureMostCommonVersion(versions)
					// Tailscale client versions look like "1.98.8-t1241b225b-
					// gbcbaf1889" — everything after the first dash is a build/
					// commit identifier, not part of the release number.
					if idx := strings.Index(best, "-"); idx >= 0 {
						best = best[:idx]
					}
					return best
				}
			}
		}
		if igType == "netbird" {
			// Same situation as Tailscale — no account-level version, only
			// per-peer. Use whichever version the most peers share.
			if raw, ok := probe["peers"]; ok {
				var peers []struct {
					Version string `json:"version"`
				}
				if json.Unmarshal(raw, &peers) == nil {
					versions := make([]string, len(peers))
					for i, p := range peers {
						versions[i] = p.Version
					}
					return secPostureMostCommonVersion(versions)
				}
			}
		}
		return ""
	}
	raw, ok := probe[field]
	if !ok {
		return ""
	}
	var s string
	json.Unmarshal(raw, &s) //nolint:errcheck
	return s
}

// secPostureMostCommonVersion returns whichever non-empty value appears most
// often, breaking ties lexicographically greatest for determinism. Used for
// products (Tailscale, Netbird) that report a version per-device/per-peer
// rather than a single account-level version.
func secPostureMostCommonVersion(versions []string) string {
	counts := map[string]int{}
	for _, v := range versions {
		if v != "" {
			counts[v]++
		}
	}
	best, bestN := "", 0
	for v, n := range counts {
		if n > bestN || (n == bestN && v > best) {
			best, bestN = v, n
		}
	}
	return best
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
