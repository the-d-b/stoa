package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

// -- Data types ---------------------------------------------------------------

type MarketQuote struct {
	Symbol    string  `json:"symbol"`
	Name      string  `json:"name"`
	Price     float64 `json:"price"`
	Delta     float64 `json:"delta"`
	DeltaP    float64 `json:"deltaP"`
	MarketCap float64 `json:"marketCap,omitempty"`
	Volume    float64 `json:"volume,omitempty"`
	High52    float64 `json:"high52,omitempty"`
	Low52     float64 `json:"low52,omitempty"`
	IsCrypto  bool    `json:"isCrypto"`
}

type SparkPoint struct {
	T int64   `json:"t"` // unix timestamp
	P float64 `json:"p"` // price
}

type MarketData struct {
	Quotes    []MarketQuote         `json:"quotes"`
	Sparks    map[string][]SparkPoint `json:"sparks"` // symbol -> points for default range
	FetchedAt string                `json:"fetchedAt"`
}

// Stocks config — list of ticker symbols
type StocksConfig struct {
	Symbols []string `json:"symbols"`
}

// Crypto config — list of CoinGecko IDs
type CryptoConfig struct {
	Coins []string `json:"coins"` // CoinGecko IDs e.g. ["bitcoin","ethereum"]
}

func parseStocksConfig(apiURL string) StocksConfig {
	var cfg StocksConfig
	json.Unmarshal([]byte(apiURL), &cfg)
	return cfg
}

func parseCryptoConfig(apiURL string) CryptoConfig {
	var cfg CryptoConfig
	json.Unmarshal([]byte(apiURL), &cfg)
	return cfg
}

// MarketConfig kept for backwards compat but not used for new integrations
type MarketConfig struct {
	Stocks  []string `json:"stocks"`
	Cryptos []string `json:"cryptos"`
}

func parseMarketConfig(apiURL string) MarketConfig {
	var cfg MarketConfig
	json.Unmarshal([]byte(apiURL), &cfg)
	return cfg
}

var marketHTTPClient = &http.Client{Timeout: 15 * time.Second}

func marketGet(url string, headers map[string]string) ([]byte, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := marketHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, url)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 512*1024))
}

// -- Yahoo Finance stocks -----------------------------------------------------

func fetchYahooQuote(symbol string) (*MarketQuote, error) {
	url := fmt.Sprintf(
		"https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=1d&range=1d",
		symbol,
	)
	body, err := marketGet(url, nil)
	if err != nil {
		return nil, err
	}
	var raw struct {
		Chart struct {
			Result []struct {
				Meta struct {
					Symbol             string  `json:"symbol"`
					ShortName          string  `json:"shortName"`
					RegularMarketPrice float64 `json:"regularMarketPrice"`
					PreviousClose      float64 `json:"chartPreviousClose"`
					MarketCap          float64 `json:"marketCap"`
					RegularMarketVolume float64 `json:"regularMarketVolume"`
					FiftyTwoWeekHigh   float64 `json:"fiftyTwoWeekHigh"`
					FiftyTwoWeekLow    float64 `json:"fiftyTwoWeekLow"`
				} `json:"meta"`
			} `json:"result"`
			Error *struct{ Description string } `json:"error"`
		} `json:"chart"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	if raw.Chart.Error != nil {
		return nil, fmt.Errorf("Yahoo: %s", raw.Chart.Error.Description)
	}
	if len(raw.Chart.Result) == 0 {
		return nil, fmt.Errorf("no data for %s", symbol)
	}
	m := raw.Chart.Result[0].Meta
	if m.RegularMarketPrice == 0 {
		return nil, fmt.Errorf("zero price for %s", symbol)
	}
	delta := m.RegularMarketPrice - m.PreviousClose
	deltaP := 0.0
	if m.PreviousClose > 0 {
		deltaP = delta / m.PreviousClose * 100
	}
	return &MarketQuote{
		Symbol:    m.Symbol,
		Name:      m.ShortName,
		Price:     m.RegularMarketPrice,
		Delta:     delta,
		DeltaP:    deltaP,
		MarketCap: m.MarketCap,
		Volume:    m.RegularMarketVolume,
		High52:    m.FiftyTwoWeekHigh,
		Low52:     m.FiftyTwoWeekLow,
		IsCrypto:  false,
	}, nil
}

func fetchYahooSpark(symbol, interval, rangeStr string) ([]SparkPoint, error) {
	url := fmt.Sprintf(
		"https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=%s&range=%s",
		symbol, interval, rangeStr,
	)
	body, err := marketGet(url, nil)
	if err != nil {
		return nil, err
	}
	var raw struct {
		Chart struct {
			Result []struct {
				Timestamps []int64 `json:"timestamp"`
				Indicators struct {
					Quote []struct {
						Close []float64 `json:"close"`
					} `json:"quote"`
				} `json:"indicators"`
			} `json:"result"`
		} `json:"chart"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	if len(raw.Chart.Result) == 0 {
		return nil, nil
	}
	res := raw.Chart.Result[0]
	if len(res.Indicators.Quote) == 0 {
		return nil, nil
	}
	closes := res.Indicators.Quote[0].Close
	var points []SparkPoint
	for i, ts := range res.Timestamps {
		if i >= len(closes) {
			break
		}
		if closes[i] == 0 {
			continue
		}
		points = append(points, SparkPoint{T: ts, P: closes[i]})
	}
	return points, nil
}

// -- CoinGecko crypto ---------------------------------------------------------

func fetchCoinGeckoQuotes(coinIDs []string, apiKey string) ([]MarketQuote, error) {
	if len(coinIDs) == 0 {
		return nil, nil
	}
	ids := strings.Join(coinIDs, ",")
	url := fmt.Sprintf(
		"https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=%s&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h",
		ids,
	)
	headers := map[string]string{"Accept": "application/json"}
	if apiKey != "" { headers["x-cg-demo-api-key"] = apiKey }
	body, err := marketGet(url, headers)
	if err != nil {
		return nil, err
	}
	var raw []struct {
		ID                string  `json:"id"`
		Symbol            string  `json:"symbol"`
		Name              string  `json:"name"`
		CurrentPrice      float64 `json:"current_price"`
		PriceChange24h    float64 `json:"price_change_24h"`
		PriceChangePct24h float64 `json:"price_change_percentage_24h"`
		MarketCap         float64 `json:"market_cap"`
		TotalVolume       float64 `json:"total_volume"`
		High24h           float64 `json:"high_24h"`
		Low24h            float64 `json:"low_24h"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	var quotes []MarketQuote
	for _, c := range raw {
		quotes = append(quotes, MarketQuote{
			Symbol:   strings.ToUpper(c.Symbol),
			Name:     c.Name,
			Price:    c.CurrentPrice,
			Delta:    c.PriceChange24h,
			DeltaP:   c.PriceChangePct24h,
			MarketCap: c.MarketCap,
			Volume:   c.TotalVolume,
			IsCrypto: true,
		})
	}
	return quotes, nil
}

func fetchCoinGeckoSpark(coinID string, days int, apiKey string) ([]SparkPoint, error) {
	daysStr := fmt.Sprintf("%d", days)
	if days <= 0 { daysStr = "max" }
	url := fmt.Sprintf(
		"https://api.coingecko.com/api/v3/coins/%s/market_chart?vs_currency=usd&days=%s",
		coinID, daysStr,
	)
	sparkHeaders := map[string]string{"Accept": "application/json"}
	if apiKey != "" { sparkHeaders["x-cg-demo-api-key"] = apiKey }
	// Retry once after 10s if rate limited
	body, err := marketGet(url, sparkHeaders)
	if err != nil && strings.Contains(err.Error(), "429") {
		log.Printf("[CRYPTO] rate limited, waiting 10s before retry for %s", coinID)
		time.Sleep(10 * time.Second)
		body, err = marketGet(url, sparkHeaders)
	}
	if err != nil {
		return nil, err
	}
	var raw struct {
		Prices [][]float64 `json:"prices"` // [[timestamp_ms, price], ...]
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	var points []SparkPoint
	for _, p := range raw.Prices {
		if len(p) < 2 {
			continue
		}
		points = append(points, SparkPoint{
			T: int64(p[0]) / 1000, // ms to seconds
			P: p[1],
		})
	}
	return points, nil
}

// -- Main fetcher -------------------------------------------------------------

func FetchStocksData(db *sql.DB, integrationID string) (*MarketData, error) {
	cfgJSON, err := readIntegrationConfig(db, integrationID)
	if err != nil {
		return nil, fmt.Errorf("stocks integration not found: %v", err)
	}
	cfg := parseStocksConfig(cfgJSON)
	data := &MarketData{
		Quotes:    []MarketQuote{},
		Sparks:    map[string][]SparkPoint{},
		FetchedAt: time.Now().UTC().Format(time.RFC3339),
	}
	for _, sym := range cfg.Symbols {
		q, err := fetchYahooQuote(sym)
		if err != nil {
			log.Printf("[STOCKS] quote error %s: %v", sym, err)
			continue
		}
		data.Quotes = append(data.Quotes, *q)
		spark, err := fetchYahooSpark(sym, "1d", "1mo")
		if err != nil {
			log.Printf("[STOCKS] spark error %s: %v", sym, err)
		} else if spark != nil {
			data.Sparks[sym] = spark
		}
	}
	return data, nil
}

func FetchCryptoData(db *sql.DB, integrationID string) (*MarketData, error) {
	var secretID string
	db.QueryRow(`SELECT COALESCE(secret_id,'') FROM integrations WHERE id = ?`, integrationID).Scan(&secretID)
	cfgJSON, err := readIntegrationConfig(db, integrationID)
	if err != nil {
		return nil, fmt.Errorf("crypto integration not found: %v", err)
	}
	// Resolve CoinGecko Demo API key if configured
	cgAPIKey := ""
	if secretID != "" {
		var enc string
		if db.QueryRow(`SELECT value FROM secrets WHERE id=?`, secretID).Scan(&enc) == nil {
			cgAPIKey = decryptSecret(enc)
		}
	}
	cfg := parseCryptoConfig(cfgJSON)
	data := &MarketData{
		Quotes:    []MarketQuote{},
		Sparks:    map[string][]SparkPoint{},
		FetchedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if len(cfg.Coins) > 0 {
		quotes, err := fetchCoinGeckoQuotes(cfg.Coins, cgAPIKey)
		if err != nil {
			log.Printf("[CRYPTO] quote error: %v", err)
		} else {
			data.Quotes = append(data.Quotes, quotes...)
		}
		// Build coinID -> symbol map from quotes for spark keying
		coinSymMap := map[string]string{}
		for _, q := range data.Quotes {
			coinSymMap[strings.ToLower(q.Name)] = q.Symbol
		}
		// Cache quotes immediately so panel has prices right away
		cacheSet(integrationID, data)

		// Fetch all spark ranges per coin with delay between calls
		// Range label -> CoinGecko days (0 = max)
		sparkRanges := []struct{ label string; days int }{
			{"1D", 1}, {"5D", 7}, {"1M", 30}, {"3M", 90}, {"1Y", 365},
			// 5Y omitted -- CoinGecko Demo plan capped at 365 days (same as 1Y)
		}
		callCount := 0
		for _, coinID := range cfg.Coins {
			sym := coinSymMap[strings.ToLower(coinID)]
			for _, r := range sparkRanges {
				if callCount > 0 {
					time.Sleep(5 * time.Second)
				}
				callCount++
				spark, err := fetchCoinGeckoSpark(coinID, r.days, cgAPIKey)
				if err != nil {
					log.Printf("[CRYPTO] spark error %s %s: %v", coinID, r.label, err)
					continue
				}
				// Key by both coinID-RANGE and SYMBOL-RANGE
				data.Sparks[coinID+"-"+r.label] = spark
				if sym != "" {
					data.Sparks[sym+"-"+r.label] = spark
				}
				// Also store 1M as the default (no range suffix) for QuoteRow mini sparks
				if r.label == "1M" {
					data.Sparks[coinID] = spark
					if sym != "" { data.Sparks[sym] = spark }
				}
				cacheSet(integrationID, data)
			}
		}
	}
	return data, nil
}

// Panel fetcher wrappers
func fetchStocksPanelData(db *sql.DB, config map[string]interface{}) (interface{}, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" { return nil, fmt.Errorf("no stocks integration configured") }
	return FetchStocksData(db, integrationID)
}

func fetchCryptoPanelData(db *sql.DB, config map[string]interface{}) (interface{}, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" { return nil, fmt.Errorf("no crypto integration configured") }
	return FetchCryptoData(db, integrationID)
}

// FetchMarketData kept for backwards compat
func FetchMarketData(db *sql.DB, integrationID string) (*MarketData, error) {
	return FetchStocksData(db, integrationID)
}

// GetStockSpark serves a proxied Yahoo Finance sparkline for a given symbol/range
// GET /api/market/spark?symbol=AAPL&interval=1d&range=1mo
func GetStockSpark(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		symbol := r.URL.Query().Get("symbol")
		interval := r.URL.Query().Get("interval")
		rangeStr := r.URL.Query().Get("range")

		if symbol == "" || interval == "" || rangeStr == "" {
			writeError(w, http.StatusBadRequest, "symbol, interval, range required")
			return
		}

		points, err := fetchYahooSpark(symbol, interval, rangeStr)
		if err != nil {
			log.Printf("[MARKET] spark error %s: %v", symbol, err)
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"points": points})
	}
}
