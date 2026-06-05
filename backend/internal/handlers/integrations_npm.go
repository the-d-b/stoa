package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

// ── Token cache ───────────────────────────────────────────────────────────────

var npmTokenCache = struct {
	sync.RWMutex
	m map[string]npmCachedToken
}{m: make(map[string]npmCachedToken)}

type npmCachedToken struct {
	token     string
	expiresAt time.Time
}

// ── Types ─────────────────────────────────────────────────────────────────────

type NPMProxyHost struct {
	ID            int      `json:"id"`
	Domains       []string `json:"domains"`
	ForwardScheme string   `json:"forwardScheme"`
	ForwardHost   string   `json:"forwardHost"`
	ForwardPort   int      `json:"forwardPort"`
	Enabled       bool     `json:"enabled"`
	HasSSL        bool     `json:"hasSSL"`
	SSLForced     bool     `json:"sslForced"`
}

type NPMCertificate struct {
	ID        int      `json:"id"`
	NiceName  string   `json:"niceName"`
	Domains   []string `json:"domains"`
	ExpiresOn string   `json:"expiresOn"`
	DaysLeft  int      `json:"daysLeft"`
	IsExpired bool     `json:"isExpired"`
	Provider  string   `json:"provider"`
}

type NPMRedirectHost struct {
	ID         int      `json:"id"`
	Domains    []string `json:"domains"`
	ForwardURL string   `json:"forwardUrl"`
	Enabled    bool     `json:"enabled"`
	HasSSL     bool     `json:"hasSSL"`
}

type NPMPanelData struct {
	UIURL            string            `json:"uiUrl"`
	IntegrationID    string            `json:"integrationId"`
	ProxyHosts       []NPMProxyHost    `json:"proxyHosts"`
	ProxyTotal       int               `json:"proxyTotal"`
	ProxyEnabled     int               `json:"proxyEnabled"`
	ProxyDisabled    int               `json:"proxyDisabled"`
	ProxySSL         int               `json:"proxySSL"`
	RedirectHosts    []NPMRedirectHost `json:"redirectHosts"`
	RedirectTotal    int               `json:"redirectTotal"`
	RedirectEnabled  int               `json:"redirectEnabled"`
	StreamTotal      int               `json:"streamTotal"`
	StreamEnabled    int               `json:"streamEnabled"`
	Certificates     []NPMCertificate  `json:"certificates"`
	CertTotal        int               `json:"certTotal"`
	CertExpiringSoon int               `json:"certExpiringSoon"` // 1–30 days
	CertExpired      int               `json:"certExpired"`      // already expired
	AccessListTotal  int               `json:"accessListTotal"`
}

// ── Auth ──────────────────────────────────────────────────────────────────────

func npmAuth(baseURL, apiKey string, skipTLS bool) (string, error) {
	identity, secret, ok := strings.Cut(apiKey, ":")
	if !ok {
		return "", fmt.Errorf("API key must be email:password")
	}
	payload, _ := json.Marshal(map[string]string{"identity": identity, "secret": secret})
	client := httpClient(skipTLS)
	url := strings.TrimRight(baseURL, "/") + "/api/tokens"
	req, err := http.NewRequest("POST", url, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return "", fmt.Errorf("authentication failed: check email and password")
	}
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("HTTP %d from Nginx Proxy Manager", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(body, &result); err != nil || result.Token == "" {
		return "", fmt.Errorf("unexpected auth response from Nginx Proxy Manager")
	}
	return result.Token, nil
}

func npmGetToken(cacheKey, baseURL, apiKey string, skipTLS bool) (string, error) {
	npmTokenCache.RLock()
	cached, ok := npmTokenCache.m[cacheKey]
	npmTokenCache.RUnlock()
	if ok && time.Now().Before(cached.expiresAt) {
		return cached.token, nil
	}
	token, err := npmAuth(baseURL, apiKey, skipTLS)
	if err != nil {
		return "", err
	}
	npmTokenCache.Lock()
	npmTokenCache.m[cacheKey] = npmCachedToken{token: token, expiresAt: time.Now().Add(23 * time.Hour)}
	npmTokenCache.Unlock()
	return token, nil
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func npmGet(baseURL, token, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case 401, 403:
		return nil, fmt.Errorf("authentication failed")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Nginx Proxy Manager", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchNPMPanelData(db *sql.DB, config map[string]interface{}) (*NPMPanelData, error) {
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

	token, err := npmGetToken(integrationID, baseURL, apiKey, skipTLS)
	if err != nil {
		return nil, err
	}

	// Re-auth wrapper: clears cache and retries once on auth failure.
	fetch := func(path string) ([]byte, error) {
		data, ferr := npmGet(baseURL, token, path, skipTLS)
		if ferr != nil && strings.Contains(ferr.Error(), "authentication failed") {
			npmTokenCache.Lock()
			delete(npmTokenCache.m, integrationID)
			npmTokenCache.Unlock()
			token, ferr = npmGetToken(integrationID, baseURL, apiKey, skipTLS)
			if ferr != nil {
				return nil, ferr
			}
			return npmGet(baseURL, token, path, skipTLS)
		}
		return data, ferr
	}

	out := &NPMPanelData{UIURL: uiURL, IntegrationID: integrationID}

	// ── Proxy hosts ───────────────────────────────────────────────────────────
	if body, err := fetch("/api/nginx/proxy-hosts"); err == nil {
		var hosts []map[string]interface{}
		if json.Unmarshal(body, &hosts) == nil {
			for _, h := range hosts {
				enabled := npmBool(h["enabled"])
				certID := int(npmFloat64(h["certificate_id"]))
				ph := NPMProxyHost{
					ID:            int(npmFloat64(h["id"])),
					Domains:       npmStrSlice(h["domain_names"]),
					ForwardScheme: npmString(h["forward_scheme"]),
					ForwardHost:   npmString(h["forward_host"]),
					ForwardPort:   int(npmFloat64(h["forward_port"])),
					Enabled:       enabled,
					HasSSL:        certID > 0,
					SSLForced:     npmBool(h["ssl_forced"]),
				}
				out.ProxyHosts = append(out.ProxyHosts, ph)
				out.ProxyTotal++
				if enabled {
					out.ProxyEnabled++
				} else {
					out.ProxyDisabled++
				}
				if certID > 0 {
					out.ProxySSL++
				}
			}
			// Sort: enabled first, then alphabetically by first domain
			sort.SliceStable(out.ProxyHosts, func(i, j int) bool {
				if out.ProxyHosts[i].Enabled != out.ProxyHosts[j].Enabled {
					return out.ProxyHosts[i].Enabled
				}
				di := ""
				if len(out.ProxyHosts[i].Domains) > 0 {
					di = out.ProxyHosts[i].Domains[0]
				}
				dj := ""
				if len(out.ProxyHosts[j].Domains) > 0 {
					dj = out.ProxyHosts[j].Domains[0]
				}
				return di < dj
			})
		}
	}

	// ── Redirection hosts ─────────────────────────────────────────────────────
	if body, err := fetch("/api/nginx/redirection-hosts"); err == nil {
		var hosts []map[string]interface{}
		if json.Unmarshal(body, &hosts) == nil {
			for _, h := range hosts {
				enabled := npmBool(h["enabled"])
				certID := int(npmFloat64(h["certificate_id"]))
				rh := NPMRedirectHost{
					ID:         int(npmFloat64(h["id"])),
					Domains:    npmStrSlice(h["domain_names"]),
					ForwardURL: npmString(h["forward_url"]),
					Enabled:    enabled,
					HasSSL:     certID > 0,
				}
				out.RedirectHosts = append(out.RedirectHosts, rh)
				out.RedirectTotal++
				if enabled {
					out.RedirectEnabled++
				}
			}
		}
	}

	// ── Streams ───────────────────────────────────────────────────────────────
	if body, err := fetch("/api/nginx/streams"); err == nil {
		var streams []map[string]interface{}
		if json.Unmarshal(body, &streams) == nil {
			for _, s := range streams {
				out.StreamTotal++
				if npmBool(s["enabled"]) {
					out.StreamEnabled++
				}
			}
		}
	}

	// ── Certificates ──────────────────────────────────────────────────────────
	if body, err := fetch("/api/nginx/certificates"); err == nil {
		var certs []map[string]interface{}
		if json.Unmarshal(body, &certs) == nil {
			now := time.Now()
			certFormats := []string{
				time.RFC3339,
				"2006-01-02T15:04:05.000Z",
				"2006-01-02T15:04:05Z",
				"2006-01-02 15:04:05",
			}
			for _, c := range certs {
				expiresOn := npmString(c["expires_on"])
				daysLeft := 0
				isExpired := false
				if expiresOn != "" {
					for _, fmt := range certFormats {
						if t, err := time.Parse(fmt, expiresOn); err == nil {
							d := int(t.Sub(now).Hours() / 24)
							daysLeft = d
							isExpired = d < 0
							break
						}
					}
				}
				provider := "other"
				if p := npmString(c["provider"]); strings.Contains(strings.ToLower(p), "letsencrypt") {
					provider = "letsencrypt"
				}
				cert := NPMCertificate{
					ID:        int(npmFloat64(c["id"])),
					NiceName:  npmString(c["nice_name"]),
					Domains:   npmStrSlice(c["domain_names"]),
					ExpiresOn: expiresOn,
					DaysLeft:  daysLeft,
					IsExpired: isExpired,
					Provider:  provider,
				}
				out.Certificates = append(out.Certificates, cert)
				out.CertTotal++
				if isExpired {
					out.CertExpired++
				} else if daysLeft <= 30 {
					out.CertExpiringSoon++
				}
			}
			// Sort: expired first, then ascending by days left
			sort.SliceStable(out.Certificates, func(i, j int) bool {
				return out.Certificates[i].DaysLeft < out.Certificates[j].DaysLeft
			})
		}
	}

	// ── Access lists ──────────────────────────────────────────────────────────
	if body, err := fetch("/api/nginx/access-lists"); err == nil {
		var lists []map[string]interface{}
		if json.Unmarshal(body, &lists) == nil {
			out.AccessListTotal = len(lists)
		}
	}

	return out, nil
}

// ── Value helpers ─────────────────────────────────────────────────────────────

func npmFloat64(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	}
	return 0
}

func npmString(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func npmBool(v interface{}) bool {
	switch n := v.(type) {
	case bool:
		return n
	case float64:
		return n != 0
	}
	return false
}

func npmStrSlice(v interface{}) []string {
	arr, ok := v.([]interface{})
	if !ok {
		return nil
	}
	out := make([]string, 0, len(arr))
	for _, item := range arr {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// ── Connection test ───────────────────────────────────────────────────────────

func testNPMConnection(baseURL, apiKey string, skipTLS bool) error {
	// Use a temporary cache key so test tokens don't pollute integration cache
	cacheKey := "test:" + baseURL
	token, err := npmGetToken(cacheKey, baseURL, apiKey, skipTLS)
	if err != nil {
		return err
	}
	body, err := npmGet(baseURL, token, "/api/nginx/proxy-hosts", skipTLS)
	if err != nil {
		return err
	}
	var result []interface{}
	if json.Unmarshal(body, &result) != nil {
		return fmt.Errorf("unexpected response from Nginx Proxy Manager")
	}
	return nil
}
