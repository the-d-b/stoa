package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"crypto/tls"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

// ── Glyph CRUD ────────────────────────────────────────────────────────────────

func ListGlyphs(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		rows, err := db.Query(`
			SELECT id, type, zone, position, config, enabled, created_at
			FROM glyphs WHERE user_id = ?
			ORDER BY zone ASC, position ASC
		`, claims.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query glyphs")
			return
		}
		defer rows.Close()

		type GlyphRow struct {
			ID        string    `json:"id"`
			Type      string    `json:"type"`
			Zone      string    `json:"zone"`
			Position  int       `json:"position"`
			Config    string    `json:"config"`
			Enabled   bool      `json:"enabled"`
			CreatedAt time.Time `json:"createdAt"`
		}
		glyphs := []GlyphRow{}
		for rows.Next() {
			var g GlyphRow
			var enabled int
			rows.Scan(&g.ID, &g.Type, &g.Zone, &g.Position, &g.Config, &enabled, &g.CreatedAt)
			g.Enabled = enabled == 1
			glyphs = append(glyphs, g)
		}
		writeJSON(w, http.StatusOK, glyphs)
	}
}

func CreateGlyph(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var req struct {
			Type     string `json:"type"`
			Zone     string `json:"zone"`
			Position int    `json:"position"`
			Config   string `json:"config"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Type == "" {
			writeError(w, http.StatusBadRequest, "type required")
			return
		}
		if req.Config == "" {
			req.Config = "{}"
		}
		validZones := map[string]bool{
			"header-left": true, "header-right": true,
			"footer-left": true, "footer-center": true, "footer-right": true,
		}
		if !validZones[req.Zone] {
			req.Zone = "header-right"
		}

		id := generateID()
		_, err := db.Exec(`
			INSERT INTO glyphs (id, user_id, type, zone, position, config, enabled)
			VALUES (?, ?, ?, ?, ?, ?, 1)
		`, id, claims.UserID, req.Type, req.Zone, req.Position, req.Config)
		if err != nil {
			log.Printf("[GLYPHS] create error: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to create glyph")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"id": id})
	}
}

func UpdateGlyph(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]

		// Use pointers so we can detect which fields were sent
		var req struct {
			Zone     *string `json:"zone"`
			Position *int    `json:"position"`
			Config   *string `json:"config"`
			Enabled  *bool   `json:"enabled"`
		}
		json.NewDecoder(r.Body).Decode(&req)

		// Only update fields that were included in the request
		if req.Zone != nil {
			db.Exec("UPDATE glyphs SET zone=? WHERE id=? AND user_id=?", *req.Zone, id, claims.UserID)
		}
		if req.Position != nil {
			db.Exec("UPDATE glyphs SET position=? WHERE id=? AND user_id=?", *req.Position, id, claims.UserID)
		}
		if req.Config != nil {
			db.Exec("UPDATE glyphs SET config=? WHERE id=? AND user_id=?", *req.Config, id, claims.UserID)
		}
		if req.Enabled != nil {
			db.Exec("UPDATE glyphs SET enabled=? WHERE id=? AND user_id=?", boolToInt(*req.Enabled), id, claims.UserID)
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func DeleteGlyph(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		db.Exec("DELETE FROM glyphs WHERE id=? AND user_id=?", id, claims.UserID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Glyph data proxy ──────────────────────────────────────────────────────────

func GetGlyphData(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]

		// Load glyph
		var glyphType, configStr string
		err := db.QueryRow(`
			SELECT type, config FROM glyphs WHERE id=? AND user_id=?
		`, id, claims.UserID).Scan(&glyphType, &configStr)
		if err != nil {
			writeError(w, http.StatusNotFound, "glyph not found")
			return
		}

		var config map[string]interface{}
		json.Unmarshal([]byte(configStr), &config)

		switch glyphType {
		case "weather":
			data, err := fetchWeather(db, config)
			if err != nil {
				log.Printf("[GLYPHS] weather fetch error: %v", err)
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, data)
		case "clock":
			// Clock has no server-side data — config only
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"serverTime": time.Now().UTC(),
			})
		case "kuma":
			data, err := fetchKumaGlyphData(db, config)
			if err != nil {
				log.Printf("[GLYPHS] kuma fetch error: %v", err)
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, data)
		case "truenas":
			data, err := fetchTrueNASGlyphData(db, config)
			if err != nil {
				log.Printf("[GLYPHS] truenas fetch error: %v", err)
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, data)
		case "opnsense":
			data, err := fetchOPNsenseGlyphData(db, config)
			if err != nil {
				log.Printf("[GLYPHS] opnsense fetch error: %v", err)
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, data)
		case "proxmox":
			data, err := fetchProxmoxGlyphData(db, config)
			if err != nil {
				log.Printf("[GLYPHS] proxmox fetch error: %v", err)
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, data)
		case "ping":
			data, err := fetchPingGlyphData(config)
			if err != nil {
				log.Printf("[GLYPHS] ping fetch error: %v", err)
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, data)
		case "text":
			// Static text — no server data needed, config only
			writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true})
		default:
			writeError(w, http.StatusBadRequest, "unknown glyph type")
		}
	}
}

// ── Weather fetch ─────────────────────────────────────────────────────────────

func fetchWeather(db *sql.DB, config map[string]interface{}) (interface{}, error) {
	zip := stringVal(config, "zip")
	country := stringVal(config, "country")
	if country == "" {
		country = "US"
	}
	units := stringVal(config, "units")
	if units == "" {
		units = "imperial"
	}
	secretID := stringVal(config, "secretId")

	if zip == "" {
		return nil, fmt.Errorf("zip code not configured")
	}
	if secretID == "" {
		return nil, fmt.Errorf("API key secret not configured")
	}

	// Resolve secret value
	var encryptedVal string
	err := db.QueryRow("SELECT value FROM secrets WHERE id=?", secretID).Scan(&encryptedVal)
	if err != nil {
		return nil, fmt.Errorf("secret not found")
	}
	apiKey := decryptSecret(encryptedVal)

	url := fmt.Sprintf(
		"https://api.openweathermap.org/data/2.5/weather?zip=%s,%s&appid=%s&units=%s",
		zip, country, apiKey, units,
	)

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("weather API unreachable")
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("weather API returned %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return nil, fmt.Errorf("failed to read response")
	}

	var result interface{}
	json.Unmarshal(body, &result)
	return result, nil
}

func decryptSecret(val string) string {
	// Currently stored as "enc:<plaintext>" — proper encryption in future
	if len(val) > 4 && val[:4] == "enc:" {
		return val[4:]
	}
	return val
}

func stringVal(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// ── Ticker CRUD ───────────────────────────────────────────────────────────────

func ListTickers(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		rows, err := db.Query(`
			SELECT id, type, zone, position, symbols, config, enabled, created_at
			FROM tickers WHERE user_id = ?
			ORDER BY zone ASC, position ASC
		`, claims.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query tickers")
			return
		}
		defer rows.Close()

		type TickerRow struct {
			ID        string    `json:"id"`
			Type      string    `json:"type"`
			Zone      string    `json:"zone"`
			Position  int       `json:"position"`
			Symbols   string    `json:"symbols"`
			Config    string    `json:"config"`
			Enabled   bool      `json:"enabled"`
			CreatedAt time.Time `json:"createdAt"`
		}
		tickers := []TickerRow{}
		for rows.Next() {
			var t TickerRow
			var enabled int
			rows.Scan(&t.ID, &t.Type, &t.Zone, &t.Position, &t.Symbols, &t.Config, &enabled, &t.CreatedAt)
			t.Enabled = enabled == 1
			tickers = append(tickers, t)
		}
		writeJSON(w, http.StatusOK, tickers)
	}
}

func CreateTicker(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var req struct {
			Type     string `json:"type"`
			Zone     string `json:"zone"`
			Position int    `json:"position"`
			Symbols  string `json:"symbols"`
			Config   string `json:"config"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Type == "" {
			writeError(w, http.StatusBadRequest, "type required")
			return
		}
		if req.Symbols == "" {
			req.Symbols = "[]"
		}
		if req.Config == "" {
			req.Config = "{}"
		}
		id := generateID()
		db.Exec(`
			INSERT INTO tickers (id, user_id, type, zone, position, symbols, config, enabled)
			VALUES (?, ?, ?, ?, ?, ?, ?, 1)
		`, id, claims.UserID, req.Type, req.Zone, req.Position, req.Symbols, req.Config)
		writeJSON(w, http.StatusCreated, map[string]string{"id": id})
	}
}

func UpdateTicker(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		var req struct {
			Zone     *string `json:"zone"`
			Position *int    `json:"position"`
			Symbols  *string `json:"symbols"`
			Config   *string `json:"config"`
			Enabled  *bool   `json:"enabled"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		if req.Zone != nil {
			db.Exec("UPDATE tickers SET zone=? WHERE id=? AND user_id=?", *req.Zone, id, claims.UserID)
		}
		if req.Position != nil {
			db.Exec("UPDATE tickers SET position=? WHERE id=? AND user_id=?", *req.Position, id, claims.UserID)
		}
		if req.Symbols != nil {
			db.Exec("UPDATE tickers SET symbols=? WHERE id=? AND user_id=?", *req.Symbols, id, claims.UserID)
		}
		if req.Config != nil {
			db.Exec("UPDATE tickers SET config=? WHERE id=? AND user_id=?", *req.Config, id, claims.UserID)
		}
		if req.Enabled != nil {
			db.Exec("UPDATE tickers SET enabled=? WHERE id=? AND user_id=?", boolToInt(*req.Enabled), id, claims.UserID)
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func DeleteTicker(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]
		db.Exec("DELETE FROM tickers WHERE id=? AND user_id=?", id, claims.UserID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ── Ticker data ───────────────────────────────────────────────────────────────

func GetTickerData(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		id := mux.Vars(r)["id"]

		var tickerType, symbolsStr, configStr string
		err := db.QueryRow(`
			SELECT type, symbols, config FROM tickers WHERE id=? AND user_id=?
		`, id, claims.UserID).Scan(&tickerType, &symbolsStr, &configStr)
		if err != nil {
			writeError(w, http.StatusNotFound, "ticker not found")
			return
		}

		var symbols []string
		json.Unmarshal([]byte(symbolsStr), &symbols)

		var config map[string]interface{}
		json.Unmarshal([]byte(configStr), &config)

		// Resolve API key — only needed for stocks/crypto
		apiKey := ""
		if secretID := stringVal(config, "secretId"); secretID != "" {
			var encryptedVal string
			if db.QueryRow("SELECT value FROM secrets WHERE id=?", secretID).Scan(&encryptedVal) == nil {
				apiKey = decryptSecret(encryptedVal)
			}
		}
		_ = apiKey // used by stocks/crypto below

		switch tickerType {
		case "stocks":
			if apiKey == "" { writeError(w, http.StatusBadRequest, "API key secret required for stocks"); return }
			data, err := fetchStockQuotes(symbols, apiKey)
			if err != nil {
				log.Printf("[TICKERS] stock fetch error: %v", err)
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, data)
		case "crypto":
			if apiKey == "" { writeError(w, http.StatusBadRequest, "API key secret required for crypto"); return }
			data, err := fetchCryptoQuotes(symbols, apiKey)
			if err != nil {
				log.Printf("[TICKERS] crypto fetch error: %v", err)
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, data)
		case "weather":
			// No API key needed — Open-Meteo is free
			data, err := fetchWeatherTicker(config)
			if err != nil {
				log.Printf("[TICKERS] weather fetch error: %v", err)
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, data)
		case "sports":
			data, err := fetchSportsTicker(config)
			if err != nil {
				log.Printf("[TICKERS] sports fetch error: %v", err)
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, data)
		case "rss":
			data, err := fetchRSSTicker(config)
			if err != nil {
				log.Printf("[TICKERS] rss fetch error: %v", err)
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, data)
		default:
			writeError(w, http.StatusBadRequest, "unknown ticker type")
		}
	}
}

type Quote struct {
	Symbol string  `json:"symbol"`
	Price  float64 `json:"price"`
	Delta  float64 `json:"delta"`  // absolute change
	DeltaP float64 `json:"deltaP"` // percent change
}

func fetchStockQuotes(symbols []string, apiKey string) ([]Quote, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	quotes := []Quote{}

	for _, sym := range symbols {
		url := fmt.Sprintf("https://finnhub.io/api/v1/quote?symbol=%s&token=%s", sym, apiKey)
		resp, err := client.Get(url)
		if err != nil {
			log.Printf("[TICKERS] finnhub error for %s: %v", sym, err)
			continue
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			log.Printf("[TICKERS] finnhub %d for %s", resp.StatusCode, sym)
			continue
		}

		var result struct {
			C float64 `json:"c"` // current price
			D float64 `json:"d"` // change
			Dp float64 `json:"dp"` // percent change
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 8*1024))
		json.Unmarshal(body, &result)

		if result.C == 0 {
			continue // invalid symbol or market closed
		}

		quotes = append(quotes, Quote{
			Symbol: sym,
			Price:  result.C,
			Delta:  result.D,
			DeltaP: result.Dp,
		})
	}
	return quotes, nil
}

func fetchCryptoQuotes(symbols []string, apiKey string) ([]Quote, error) {
	// CoinMarketCap API - fetch all symbols in one call
	if len(symbols) == 0 {
		return []Quote{}, nil
	}

	client := &http.Client{Timeout: 10 * time.Second}
	symList := ""
	for i, s := range symbols {
		if i > 0 {
			symList += ","
		}
		symList += s
	}

	url := fmt.Sprintf(
		"https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=%s&convert=USD",
		symList,
	)
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("X-CMC_PRO_API_KEY", apiKey)
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("CoinMarketCap unreachable")
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("CoinMarketCap returned %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))

	var result struct {
		Data map[string]struct {
			Quote map[string]struct {
				Price            float64 `json:"price"`
				PercentChange24h float64 `json:"percent_change_24h"`
			} `json:"quote"`
		} `json:"data"`
	}
	json.Unmarshal(body, &result)

	quotes := []Quote{}
	for _, sym := range symbols {
		if d, ok := result.Data[sym]; ok {
			if q, ok := d.Quote["USD"]; ok {
				delta := q.Price * q.PercentChange24h / 100
				quotes = append(quotes, Quote{
					Symbol: sym,
					Price:  q.Price,
					Delta:  delta,
					DeltaP: q.PercentChange24h,
				})
			}
		}
	}
	return quotes, nil
}

// ── Kuma glyph fetch ──────────────────────────────────────────────────────────

func fetchKumaGlyphData(db *sql.DB, config map[string]interface{}) (interface{}, error) {
	data, err := fetchKumaPanelData(db, config)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"upCount":    data.UpCount,
		"downCount":  data.DownCount,
		"pauseCount": data.PauseCount,
		"total":      len(data.Monitors),
		"uiUrl":      data.UIURL,
	}, nil
}

// ── TrueNAS glyph — reads from cache (worker keeps it fresh) ─────────────────
func fetchTrueNASGlyphData(db *sql.DB, config map[string]interface{}) (interface{}, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	// Pull from live cache — TrueNAS worker updates this continuously
	if cached, ok := cacheGet(integrationID); ok {
		switch v := cached.(type) {
		case *TrueNASPanelData:
			return map[string]interface{}{
				"cpuPercent": v.CPUPercent,
				"cpuTempC":   v.CPUTempC,
				"ramPercent": v.RAMPercent,
				"hostname":   v.Hostname,
				"alerts":     len(v.Alerts),
			}, nil
		}
	}
	// Cache miss — do a live fetch
	data, err := fetchTrueNASPanelData(db, config)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"cpuPercent": data.CPUPercent,
		"cpuTempC":   data.CPUTempC,
		"ramPercent": data.RAMPercent,
		"hostname":   data.Hostname,
		"alerts":     len(data.Alerts),
	}, nil
}

// ── OPNsense glyph — reads from cache ────────────────────────────────────────
func fetchOPNsenseGlyphData(db *sql.DB, config map[string]interface{}) (interface{}, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	if cached, ok := cacheGet(integrationID); ok {
		switch v := cached.(type) {
		case *OPNsensePanelData:
			totalIn, totalOut := 0.0, 0.0
			for _, iface := range v.Interfaces {
				totalIn += iface.InMbps
				totalOut += iface.OutMbps
			}
			anyDown := false
			for _, gw := range v.Gateways {
				if gw.Status == "offline" {
					anyDown = true
					break
				}
			}
			return map[string]interface{}{
				"totalInMbps":  totalIn,
				"totalOutMbps": totalOut,
				"gatewayDown":  anyDown,
				"pfStates":     v.PFStates,
			}, nil
		}
	}
	// Cache miss — fetch live
	data, err := fetchOPNsensePanelData(db, config)
	if err != nil {
		return nil, err
	}
	totalIn, totalOut := 0.0, 0.0
	for _, iface := range data.Interfaces {
		totalIn += iface.InMbps
		totalOut += iface.OutMbps
	}
	return map[string]interface{}{
		"totalInMbps":  totalIn,
		"totalOutMbps": totalOut,
		"pfStates":     data.PFStates,
	}, nil
}

// ── Proxmox glyph ─────────────────────────────────────────────────────────────
func fetchProxmoxGlyphData(db *sql.DB, config map[string]interface{}) (interface{}, error) {
	data, err := fetchProxmoxPanelData(db, config)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		// CPU.Used and Memory.Used are already percentages (0-100) from the panel data
		"cpuPercent": data.CPU.Used,
		"memPercent": data.Memory.Used,
		"node":       data.Node,
		"loadAvg":    data.LoadAvg,
	}, nil
}

// ── Ping glyph ────────────────────────────────────────────────────────────────
func fetchPingGlyphData(config map[string]interface{}) (interface{}, error) {
	host := stringVal(config, "host")
	if host == "" {
		return nil, fmt.Errorf("no host configured")
	}
	// Use HTTP GET as a proxy for connectivity — more reliable than exec ping
	// and works cross-platform without elevated privileges
	scheme := "http"
	if strings.HasPrefix(host, "https://") || strings.HasPrefix(host, "http://") {
		// Already a full URL
	} else {
		host = scheme + "://" + host
	}
	client := &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}},
	}
	start := time.Now()
	resp, err := client.Get(host)
	ms := time.Since(start).Milliseconds()
	if err != nil {
		return map[string]interface{}{"ms": -1, "up": false, "host": host}, nil
	}
	resp.Body.Close()
	return map[string]interface{}{"ms": ms, "up": true, "host": host}, nil
}

// ── Weather ticker — Open-Meteo (no API key) ──────────────────────────────────
// Supports multiple locations via a "locations" array in config, or a single lat/lon.
func fetchWeatherTicker(config map[string]interface{}) (interface{}, error) {
	// Build list of locations to fetch
	type loc struct{ lat, lon, city, unit string }
	var locations []loc

	// Check for locations array first
	if locs, ok := config["locations"].([]interface{}); ok && len(locs) > 0 {
		for _, l := range locs {
			if m, ok := l.(map[string]interface{}); ok {
				locations = append(locations, loc{
					lat:  stringVal(m, "lat"),
					lon:  stringVal(m, "lon"),
					city: stringVal(m, "city"),
					unit: stringVal(m, "unit"),
				})
			}
		}
	}
	// Fall back to single location fields
	if len(locations) == 0 {
		lat := stringVal(config, "lat")
		lon := stringVal(config, "lon")
		if lat == "" || lon == "" {
			return nil, fmt.Errorf("location not configured")
		}
		locations = []loc{{ lat: lat, lon: lon, city: stringVal(config, "city"), unit: stringVal(config, "unit") }}
	}

	client := &http.Client{Timeout: 8 * time.Second}
	type weatherResult map[string]interface{}
	var results []weatherResult

	for _, l := range locations {
		unit := l.unit
		url := fmt.Sprintf(
			"https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s"+
				"&current=temperature_2m,weathercode,precipitation_probability&timezone=auto",
			l.lat, l.lon,
		)
		resp, err := client.Get(url)
		if err != nil { continue }
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
		resp.Body.Close()

		var raw struct {
			Current struct {
				Temp         float64 `json:"temperature_2m"`
				Code         int     `json:"weathercode"`
				PrecipChance float64 `json:"precipitation_probability"`
			} `json:"current"`
		}
		if json.Unmarshal(body, &raw) != nil { continue }

		temp := raw.Current.Temp
		unitLabel := "°C"
		if unit == "f" {
			temp = temp*9/5 + 32
			unitLabel = "°F"
		}
		results = append(results, weatherResult{
			"city":         l.city,
			"temp":         fmt.Sprintf("%.0f%s", temp, unitLabel),
			"code":         raw.Current.Code,
			"precipChance": raw.Current.PrecipChance,
		})
	}

	if len(results) == 0 {
		return nil, fmt.Errorf("no weather data returned")
	}
	if len(results) == 1 {
		return results[0], nil
	}
	return results, nil
}

// ── Sports ticker — ESPN unofficial API ───────────────────────────────────────
// Supports multiple leagues via "leagues" array in config.
func fetchSportsTicker(config map[string]interface{}) (interface{}, error) {
	espnPath := map[string]string{
		"nfl": "football/nfl",
		"nba": "basketball/nba",
		"nhl": "hockey/nhl",
		"mlb": "baseball/mlb",
	}

	// Build league list — support both "leagues" array and legacy "league" string
	var leagues []string
	if lArr, ok := config["leagues"].([]interface{}); ok && len(lArr) > 0 {
		for _, l := range lArr {
			if s, ok := l.(string); ok && s != "" {
				leagues = append(leagues, strings.ToLower(s))
			}
		}
	}
	if len(leagues) == 0 {
		if leg := stringVal(config, "league"); leg != "" {
			leagues = []string{strings.ToLower(leg)}
		} else {
			leagues = []string{"nba"}
		}
	}

	type GameResult struct {
		League    string `json:"league"`
		Home      string `json:"home"`
		Away      string `json:"away"`
		HomeScore string `json:"homeScore"`
		AwayScore string `json:"awayScore"`
		Status    string `json:"status"`
		Clock     string `json:"clock"`
		Period    int    `json:"period"`
		ShortName string `json:"shortName"`
	}

	client := &http.Client{Timeout: 8 * time.Second}
	var allGames []GameResult

	for _, league := range leagues {
		path, ok := espnPath[league]
		if !ok { continue }

		url := fmt.Sprintf("https://site.api.espn.com/apis/site/v2/sports/%s/scoreboard", path)
		resp, err := client.Get(url)
		if err != nil { continue }
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
		resp.Body.Close()

		var raw struct {
			Events []struct {
				ShortName string `json:"shortName"`
				Status    struct {
					Type         struct{ Description string `json:"description"` } `json:"type"`
					DisplayClock string `json:"displayClock"`
					Period       int    `json:"period"`
				} `json:"status"`
				Competitions []struct {
					Competitors []struct {
						HomeAway string `json:"homeAway"`
						Score    string `json:"score"`
						Team     struct{ Abbreviation string `json:"abbreviation"` } `json:"team"`
					} `json:"competitors"`
				} `json:"competitions"`
			} `json:"events"`
		}
		if json.Unmarshal(body, &raw) != nil { continue }

		for _, ev := range raw.Events {
			g := GameResult{
				League:    strings.ToUpper(league),
				ShortName: ev.ShortName,
				Status:    ev.Status.Type.Description,
				Clock:     ev.Status.DisplayClock,
				Period:    ev.Status.Period,
			}
			if len(ev.Competitions) > 0 {
				for _, comp := range ev.Competitions[0].Competitors {
					if comp.HomeAway == "home" {
						g.Home = comp.Team.Abbreviation
						g.HomeScore = comp.Score
					} else {
						g.Away = comp.Team.Abbreviation
						g.AwayScore = comp.Score
					}
				}
			}
			allGames = append(allGames, g)
		}
	}

	if allGames == nil {
		allGames = []GameResult{}
	}
	return map[string]interface{}{
		"leagues": leagues,
		"games":   allGames,
	}, nil
}

// decodeHTMLEntities replaces common HTML entities with their unicode equivalents.
func decodeHTMLEntities(s string) string {
	replacer := strings.NewReplacer(
		"&amp;",  "&",
		"&lt;",   "<",
		"&gt;",   ">",
		"&quot;", `"`,
		"&#39;",  "'",
		"&apos;", "'",
		"&ndash;", "–",
		"&mdash;", "—",
		"&lsquo;", "'",
		"&rsquo;", "'",
		"&ldquo;", "\"",
		"&rdquo;", "\"",
		"&nbsp;",  " ",
		"&hellip;", "…",
		"&#8220;", "\"",
		"&#8221;", "\"",
		"&#8216;", "'",
		"&#8217;", "'",
		"&#8211;", "–",
		"&#8212;", "—",
		"&#38;",   "&",
	)
	return replacer.Replace(s)
}

// ── RSS ticker — fetch and parse headlines ────────────────────────────────────
func fetchRSSTicker(config map[string]interface{}) (interface{}, error) {
	feedURL := stringVal(config, "url")
	if feedURL == "" {
		return nil, fmt.Errorf("RSS URL not configured")
	}

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get(feedURL)
	if err != nil {
		return nil, fmt.Errorf("RSS feed unreachable")
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 256*1024))

	// Simple RSS/Atom title extraction without full XML parsing
	// Works for both RSS 2.0 and Atom feeds
	var headlines []string
	bodyStr := string(body)

	// Extract <title> tags, skipping the first (feed title)
	start := 0
	firstSkipped := false
	for {
		ti := strings.Index(bodyStr[start:], "<title")
		if ti < 0 {
			break
		}
		ti += start
		end := strings.Index(bodyStr[ti:], "</title>")
		if end < 0 {
			break
		}
		end += ti
		// Extract content between > and </title>
		inner := bodyStr[ti : end+8]
		gt := strings.Index(inner, ">")
		if gt < 0 {
			start = end + 8
			continue
		}
		title := strings.TrimSpace(inner[gt+1 : len(inner)-8])
		// Strip CDATA
		if strings.HasPrefix(title, "<![CDATA[") {
			title = strings.TrimSuffix(strings.TrimPrefix(title, "<![CDATA["), "]]>")
		}
		title = strings.TrimSpace(title)
		// Decode common HTML entities
		title = decodeHTMLEntities(title)
		if title != "" && title != "&#xFEFF;" {
			if !firstSkipped {
				firstSkipped = true
			} else if len(headlines) < 20 {
				headlines = append(headlines, title)
			}
		}
		start = end + 8
	}

	return map[string]interface{}{
		"headlines": headlines,
		"count":     len(headlines),
	}, nil
}
