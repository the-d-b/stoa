package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Keycloak — admin REST API, not a simple static-token API like most
// integrations. Auth is an OAuth2 client_credentials grant against a
// confidential client with a service account (realm-management roles
// view-events + query-users), so the panel fetcher has to acquire and
// cache a short-lived access token before every batch of admin calls,
// unlike the long-lived Bearer tokens most other integrations use.
//
// Two Keycloak-side setup requirements that aren't obvious from the API
// alone and are easy to get stuck on: (1) event logging is OFF by default
// per realm — Realm Settings → Events → Save Events must be enabled or the
// events endpoint returns an empty array forever, not an error; (2) the
// confidential client needs "Service accounts roles" enabled with
// view-events and query-users assigned under realm-management, or the
// admin calls 403.

// ── Keycloak types ───────────────────────────────────────────────────────────

type KeycloakPanelData struct {
	UIURL          string            `json:"uiUrl"`
	Days           int               `json:"days"`
	Version        string            `json:"version"`
	Logins         int               `json:"logins"`
	Failures       int               `json:"failures"`
	ActiveSessions int               `json:"activeSessions"`
	RecentFailures []KeycloakFailure `json:"recentFailures"`
}

type KeycloakFailure struct {
	Username  string `json:"username"`
	ClientIP  string `json:"clientIp"`
	CreatedAt string `json:"createdAt"`
}

const keycloakInfinityDays = 36500

// ── Credential parsing ───────────────────────────────────────────────────────

// keycloakParseCreds splits the secret field "realm:clientId:clientSecret"
// into its three parts. Only the first two colons are treated as
// separators — clientSecret is whatever remains, so a secret value that
// itself contains a colon still round-trips correctly.
func keycloakParseCreds(apiKey string) (realm, clientID, clientSecret string, err error) {
	parts := strings.SplitN(apiKey, ":", 3)
	if len(parts) != 3 || parts[0] == "" || parts[1] == "" || parts[2] == "" {
		return "", "", "", fmt.Errorf("Keycloak API key must be realm:clientId:clientSecret")
	}
	return parts[0], parts[1], parts[2], nil
}

// ── Token cache ──────────────────────────────────────────────────────────────
// Keycloak access tokens are short-lived by default (often 1-5 minutes),
// unlike the long-lived session tokens most other integrations cache for
// hours — the cache trusts the server's own expires_in rather than
// assuming a long TTL.

var keycloakTokenCache = struct {
	sync.RWMutex
	m map[string]keycloakCachedToken
}{m: make(map[string]keycloakCachedToken)}

type keycloakCachedToken struct {
	token     string
	expiresAt time.Time
}

func keycloakGetToken(cacheKey, baseURL, realm, clientID, clientSecret string, skipTLS bool) (string, error) {
	keycloakTokenCache.RLock()
	cached, ok := keycloakTokenCache.m[cacheKey]
	keycloakTokenCache.RUnlock()
	if ok && time.Now().Before(cached.expiresAt) {
		return cached.token, nil
	}

	form := url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {clientID},
		"client_secret": {clientSecret},
	}
	tokenURL := strings.TrimRight(baseURL, "/") + "/realms/" + url.PathEscape(realm) + "/protocol/openid-connect/token"
	req, err := http.NewRequest("POST", tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return "", fmt.Errorf("authentication failed — check realm, client ID, and client secret")
	}
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("HTTP %d from Keycloak token endpoint", resp.StatusCode)
	}
	var t struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if json.Unmarshal(body, &t) != nil || t.AccessToken == "" {
		return "", fmt.Errorf("no access_token in Keycloak response")
	}
	ttl := time.Duration(t.ExpiresIn) * time.Second
	if ttl <= 10*time.Second {
		ttl = 30 * time.Second // defensive floor if expires_in is missing or unrealistically small
	} else {
		ttl -= 10 * time.Second // refresh a little before actual expiry
	}
	keycloakTokenCache.Lock()
	keycloakTokenCache.m[cacheKey] = keycloakCachedToken{token: t.AccessToken, expiresAt: time.Now().Add(ttl)}
	keycloakTokenCache.Unlock()
	return t.AccessToken, nil
}

func keycloakClearToken(cacheKey string) {
	keycloakTokenCache.Lock()
	delete(keycloakTokenCache.m, cacheKey)
	keycloakTokenCache.Unlock()
}

// ── HTTP helper ──────────────────────────────────────────────────────────────

func keycloakAdminGet(baseURL, token, path string, skipTLS bool) ([]byte, error) {
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed — check the service account's realm-management roles (view-events, query-users)")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Keycloak", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// keycloakEvent is the shape of one item in the /admin/realms/{realm}/events
// response. Username is nested under "details" for both LOGIN and
// LOGIN_ERROR events, not a top-level field — userId (a UUID) is the only
// top-level identity field, hence the eventUsername fallback below.
type keycloakEvent struct {
	Time      int64  `json:"time"` // epoch millis
	UserID    string `json:"userId"`
	IPAddress string `json:"ipAddress"`
	Details   struct {
		Username string `json:"username"`
	} `json:"details"`
}

func keycloakEventUsername(e keycloakEvent) string {
	if e.Details.Username != "" {
		return e.Details.Username
	}
	return e.UserID
}

func keycloakEventTime(e keycloakEvent) string {
	return time.UnixMilli(e.Time).UTC().Format(time.RFC3339)
}

// ── Panel fetcher ────────────────────────────────────────────────────────────

func fetchKeycloakPanelData(db *sql.DB, config map[string]interface{}) (*KeycloakPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	realm, clientID, clientSecret, err := keycloakParseCreds(apiKey)
	if err != nil {
		return nil, err
	}

	days := 7
	if d, ok := config["days"].(float64); ok && d > 0 {
		days = int(d)
	}
	data := &KeycloakPanelData{UIURL: uiURL, Days: days}
	infinite := days >= keycloakInfinityDays

	token, err := keycloakGetToken(integrationID, apiURL, realm, clientID, clientSecret, skipTLS)
	if err != nil {
		return nil, fmt.Errorf("Keycloak auth: %w", err)
	}

	realmPath := "/admin/realms/" + url.PathEscape(realm)
	anyOK := false

	// ── Version — best-effort, doesn't block the rest of the fetch ─────────────
	if vbody, verr := keycloakAdminGet(apiURL, token, "/admin/serverinfo", skipTLS); verr == nil {
		anyOK = true
		var v struct {
			SystemInfo struct {
				Version string `json:"version"`
			} `json:"systemInfo"`
		}
		if json.Unmarshal(vbody, &v) == nil {
			data.Version = v.SystemInfo.Version
		}
	}

	// ── Active sessions — sum "active" across every client's session count ────
	// Keycloak has no single "total active sessions in this realm" endpoint;
	// client-session-stats is the closest available proxy. This can overcount
	// unique users in an SSO setup where one login spans multiple clients,
	// same kind of approximation Tailscale/Netbird's "most common version"
	// already makes elsewhere for a value Keycloak just doesn't expose directly.
	if body, serr := keycloakAdminGet(apiURL, token, realmPath+"/client-session-stats", skipTLS); serr == nil {
		anyOK = true
		var stats []map[string]string
		if json.Unmarshal(body, &stats) == nil {
			total := 0
			for _, s := range stats {
				if n, cerr := strconv.Atoi(s["active"]); cerr == nil {
					total += n
				}
			}
			data.ActiveSessions = total
		}
	}

	// ── Logins + failures ───────────────────────────────────────────────────
	// Keycloak's events endpoint takes a server-side dateFrom filter (epoch
	// millis) directly, unlike Authentik's events log — no need to over-fetch
	// and filter client-side. "max" is a hard server-side cap regardless of
	// window; for the all-time view this means "as many as the server hands
	// back in one page" rather than a true total, since Keycloak's events
	// endpoint has no pagination-count field the way Authentik's does.
	eventsQuery := func(eventType string) string {
		q := realmPath + "/events?type=" + eventType + "&max=1000&direction=desc"
		if !infinite {
			cutoffMillis := time.Now().Add(-time.Duration(days) * 24 * time.Hour).UnixMilli()
			q += fmt.Sprintf("&dateFrom=%d", cutoffMillis)
		}
		return q
	}

	if body, lerr := keycloakAdminGet(apiURL, token, eventsQuery("LOGIN"), skipTLS); lerr == nil {
		anyOK = true
		var events []keycloakEvent
		if json.Unmarshal(body, &events) == nil {
			data.Logins = len(events)
		}
	}

	if body, ferr := keycloakAdminGet(apiURL, token, eventsQuery("LOGIN_ERROR"), skipTLS); ferr == nil {
		anyOK = true
		var events []keycloakEvent
		if json.Unmarshal(body, &events) == nil {
			data.Failures = len(events)
			for i, e := range events {
				if i >= 10 {
					break
				}
				data.RecentFailures = append(data.RecentFailures, KeycloakFailure{
					Username:  keycloakEventUsername(e),
					ClientIP:  e.IPAddress,
					CreatedAt: keycloakEventTime(e),
				})
			}
		}
	}

	// Every endpoint failed — surface the error instead of rendering zeros
	if !anyOK {
		return nil, fmt.Errorf("keycloak unreachable — check URL, realm, and credentials (see server log for details)")
	}

	return data, nil
}

func testKeycloakConnection(apiURL, apiKey string, skipTLS bool) error {
	realm, clientID, clientSecret, err := keycloakParseCreds(apiKey)
	if err != nil {
		return err
	}
	cacheKey := "test:" + apiURL + ":" + realm
	token, err := keycloakGetToken(cacheKey, apiURL, realm, clientID, clientSecret, skipTLS)
	if err != nil {
		return err
	}
	keycloakClearToken(cacheKey) // don't let a connection test warm the shared cache with a throwaway key
	_, err = keycloakAdminGet(apiURL, token, "/admin/realms/"+url.PathEscape(realm)+"/client-session-stats", skipTLS)
	return err
}
