package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
)

// ── Geo IP lookup with in-memory cache ───────────────────────────────────────

type geoResult struct {
	Status  string `json:"status"`
	Country string `json:"country"`
	City    string `json:"city"`
	ISP     string `json:"isp"`
}

var (
	geoCache   = map[string]*geoResult{}
	geoCacheMu sync.RWMutex
)

func GeoLookup() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := r.URL.Query().Get("ip")
		if ip == "" {
			writeError(w, http.StatusBadRequest, "ip required")
			return
		}
		// Sanitize — only allow valid IP characters
		for _, c := range ip {
			if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') ||
				(c >= 'A' && c <= 'F') || c == '.' || c == ':') {
				writeError(w, http.StatusBadRequest, "invalid ip")
				return
			}
		}

		// Check cache first
		geoCacheMu.RLock()
		cached, ok := geoCache[ip]
		geoCacheMu.RUnlock()
		if ok {
			writeJSON(w, http.StatusOK, cached)
			return
		}

		// Fetch from ip-api.com (HTTP only for free tier)
		url := fmt.Sprintf("http://ip-api.com/json/%s?fields=status,country,city,isp", ip)
		client := httpClient(false)
		resp, err := client.Get(url)
		if err != nil {
			writeJSON(w, http.StatusOK, &geoResult{Status: "fail"})
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)

		var result geoResult
		if json.Unmarshal(body, &result) != nil {
			result = geoResult{Status: "fail"}
		}

		// Cache regardless of success/fail
		geoCacheMu.Lock()
		geoCache[ip] = &result
		geoCacheMu.Unlock()

		writeJSON(w, http.StatusOK, &result)
	}
}

// isPrivateIP returns true for RFC1918/loopback addresses — no point looking those up
func isPrivateIP(ip string) bool {
	private := []string{"10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.",
		"172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.",
		"172.27.", "172.28.", "172.29.", "172.30.", "172.31.", "127.", "::1", "fc", "fd"}
	for _, p := range private {
		if strings.HasPrefix(ip, p) {
			return true
		}
	}
	return false
}
