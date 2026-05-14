package handlers

import (
	"database/sql"
	"log"
	"time"
)

// StartSportsWorker runs a sports integration worker with dynamic refresh intervals:
// - Live game in progress: refresh every 60s
// - Game day (games scheduled today but not started): refresh every 5 min
// - No games today: refresh every 6 hours
// - Off-season (no games in next 7 days): refresh once daily
func StartSportsWorker(db *sql.DB, ig integrationMeta, stop chan struct{}) {
	go func() {
		log.Printf("[SPORTS] worker started: %s", ig.name)
		for {
			interval := sportsRefreshAndGetInterval(db, ig)
			select {
			case <-time.After(interval):
				// loop again
			case <-stop:
				log.Printf("[SPORTS] worker stopped: %s", ig.name)
				return
			}
		}
	}()
}

func sportsRefreshAndGetInterval(db *sql.DB, ig integrationMeta) time.Duration {
	data, err := FetchSportsData(db, ig.id)
	if err != nil {
		log.Printf("[SPORTS] fetch error %s: %v", ig.name, err)
		RecordIntegrationError(ig.id, ig.name, err.Error())
		return 5 * time.Minute // retry in 5 min on error
	}
	ClearIntegrationError(ig.id, ig.name)
	cacheSet(ig.id, data)
	log.Printf("[SPORTS] refreshed %s — %d games, live=%v", ig.name, len(data.Games), data.HasLive)

	// Determine next interval based on game state
	if data.HasLive {
		// Game in progress — poll every 60 seconds
		return 60 * time.Second
	}

	// Check if any games are scheduled today but not started
	hasGameToday := false
	for _, g := range data.Games {
		if g.Status == "pre" {
			hasGameToday = true
			break
		}
	}
	if hasGameToday {
		return 5 * time.Minute
	}

	// Check if any games in next 7 days (from schedule)
	hasUpcoming := false
	cutoff := time.Now().AddDate(0, 0, 7)
	for _, g := range data.Schedule {
		if t, err := time.Parse(time.RFC3339, g.StartTime); err == nil {
			if t.Before(cutoff) {
				hasUpcoming = true
				break
			}
		}
	}
	if hasUpcoming {
		return 6 * time.Hour
	}

	// Off-season or nothing upcoming
	return 24 * time.Hour
}
