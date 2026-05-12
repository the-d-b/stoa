package handlers

import (
	"database/sql"
	"log"
	"time"
)

// Market worker — refreshes during market hours more frequently
// Stocks: every 5min during market hours (9:30-16:00 ET weekdays), every 30min otherwise
// Crypto: every 15min always (24/7 market)
func StartMarketWorker(db *sql.DB, ig integrationMeta, stop chan struct{}) {
	go func() {
		log.Printf("[MARKET] worker started: %s", ig.name)
		for {
			interval := marketRefreshAndGetInterval(db, ig)
			select {
			case <-time.After(interval):
			case <-stop:
				log.Printf("[MARKET] worker stopped: %s", ig.name)
				return
			}
		}
	}()
}

func isMarketHours() bool {
	now := time.Now().UTC()
	// Market hours: Mon-Fri 13:30-20:00 UTC (9:30-16:00 ET)
	wd := now.Weekday()
	if wd == time.Saturday || wd == time.Sunday {
		return false
	}
	h, m := now.Hour(), now.Minute()
	mins := h*60 + m
	return mins >= 810 && mins < 1200 // 13:30 to 20:00 UTC
}

func marketRefreshAndGetInterval(db *sql.DB, ig integrationMeta) time.Duration {
	var data *MarketData
	var err error
	if ig.igType == "crypto" {
		data, err = FetchCryptoData(db, ig.id)
	} else {
		data, err = FetchStocksData(db, ig.id)
	}
	if err != nil {
		log.Printf("[MARKET] fetch error %s: %v", ig.name, err)
		RecordIntegrationError(ig.id, ig.name, err.Error())
		return 5 * time.Minute
	}
	ClearIntegrationError(ig.id)
	cacheSet(ig.id, data)
	log.Printf("[MARKET] refreshed %s (%s) -- %d quotes", ig.name, ig.igType, len(data.Quotes))

	if ig.igType == "crypto" {
		return 15 * time.Minute
	}
	if isMarketHours() {
		return 5 * time.Minute
	}
	return 30 * time.Minute
}
