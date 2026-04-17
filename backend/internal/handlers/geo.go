package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
)

// ── Geo IP lookup — in-memory + DB persistent cache ───────────────────────────
// Lookup order: memory → DB → ip-api.com
// IPs are cached permanently — geolocation rarely changes.

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

func GeoLookup(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := r.URL.Query().Get("ip")
		if ip == "" {
			writeError(w, http.StatusBadRequest, "ip required")
			return
		}
		for _, c := range ip {
			if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') ||
				(c >= 'A' && c <= 'F') || c == '.' || c == ':') {
				writeError(w, http.StatusBadRequest, "invalid ip")
				return
			}
		}

		// 1. Check in-memory cache
		geoCacheMu.RLock()
		cached, ok := geoCache[ip]
		geoCacheMu.RUnlock()
		if ok {
			writeJSON(w, http.StatusOK, cached)
			return
		}

		// 2. Check DB cache
		var result geoResult
		err := db.QueryRow(
			"SELECT status, country, city, isp FROM geo_ip_cache WHERE ip=?", ip,
		).Scan(&result.Status, &result.Country, &result.City, &result.ISP)
		if err == nil {
			// Found in DB — warm memory cache and return
			geoCacheMu.Lock()
			geoCache[ip] = &result
			geoCacheMu.Unlock()
			writeJSON(w, http.StatusOK, &result)
			return
		}

		// 3. Fetch from ip-api.com (HTTP only — HTTPS requires paid plan)
		url := fmt.Sprintf("http://ip-api.com/json/%s?fields=status,country,city,isp", ip)
		resp, err := httpClient(false).Get(url)
		if err != nil {
			writeJSON(w, http.StatusOK, &geoResult{Status: "fail"})
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)

		if json.Unmarshal(body, &result) != nil {
			result = geoResult{Status: "fail"}
		}

		// Store in both DB and memory (even failures — avoids hammering the API)
		db.Exec(
			"INSERT OR REPLACE INTO geo_ip_cache (ip, status, country, city, isp) VALUES (?, ?, ?, ?, ?)",
			ip, result.Status, result.Country, result.City, result.ISP,
		)
		geoCacheMu.Lock()
		geoCache[ip] = &result
		geoCacheMu.Unlock()

		writeJSON(w, http.StatusOK, &result)
	}
}

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
