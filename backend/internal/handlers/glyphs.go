package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
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

		secretID := stringVal(config, "secretId")
		if secretID == "" {
			writeError(w, http.StatusBadRequest, "API key secret not configured")
			return
		}

		var encryptedVal string
		err = db.QueryRow("SELECT value FROM secrets WHERE id=?", secretID).Scan(&encryptedVal)
		if err != nil {
			writeError(w, http.StatusBadRequest, "secret not found")
			return
		}
		apiKey := decryptSecret(encryptedVal)

		switch tickerType {
		case "stocks":
			data, err := fetchStockQuotes(symbols, apiKey)
			if err != nil {
				log.Printf("[TICKERS] stock fetch error: %v", err)
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, data)
		case "crypto":
			data, err := fetchCryptoQuotes(symbols, apiKey)
			if err != nil {
				log.Printf("[TICKERS] crypto fetch error: %v", err)
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
