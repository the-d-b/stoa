package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"time"
)

func StartQNAPWorker(db *sql.DB, ig integrationMeta, stop <-chan struct{}) {
	go func() {
		backoff := 5 * time.Second
		for {
			select {
			case <-stop:
				return
			default:
			}
			err := runQNAPWorker(db, ig, stop)
			if err != nil {
				log.Printf("[QNAP] worker error: %v — reconnecting in %s", err, backoff)
				RecordIntegrationError(ig.id, ig.name, err.Error())
			}
			select {
			case <-stop:
				return
			case <-time.After(backoff):
				if backoff < 5*time.Minute {
					backoff *= 2
				}
			}
		}
	}()
}

func runQNAPWorker(db *sql.DB, ig integrationMeta, stop <-chan struct{}) error {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, ig.id)
	if err != nil {
		return fmt.Errorf("resolve: %w", err)
	}
	username, password := omvParseCredentials(apiKey)

	sid, err := qnapLogin(apiURL, username, password, skipTLS)
	if err != nil {
		return fmt.Errorf("login: %w", err)
	}
	qnapSetSession(ig.id, sid)
	log.Printf("[QNAP] authenticated for %s", ig.id)

	data, err := qnapFetchAll(apiURL, sid, uiURL, skipTLS)
	if err != nil {
		return fmt.Errorf("initial fetch: %w", err)
	}
	cacheSet(ig.id, data)
	ClearIntegrationError(ig.id, ig.name)
	log.Printf("[QNAP] initial data cached for %s (%s %s)", ig.id, data.Model, data.Hostname)

	ticker := time.NewTicker(time.Duration(ig.refreshSecs) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-stop:
			return nil
		case <-ticker.C:
			fresh, fetchErr := qnapFetchAll(apiURL, sid, uiURL, skipTLS)
			if fetchErr != nil {
				if errors.Is(fetchErr, errQNAPUnauth) {
					log.Printf("[QNAP] session expired for %s — re-authenticating", ig.id)
					qnapClearSession(ig.id)
					sid, err = qnapLogin(apiURL, username, password, skipTLS)
					if err != nil {
						log.Printf("[QNAP] re-auth failed for %s: %v", ig.id, err)
						RecordIntegrationError(ig.id, ig.name, err.Error())
						continue
					}
					qnapSetSession(ig.id, sid)
					fresh, fetchErr = qnapFetchAll(apiURL, sid, uiURL, skipTLS)
					if fetchErr != nil {
						log.Printf("[QNAP] fetch error after re-auth for %s: %v", ig.id, fetchErr)
						RecordIntegrationError(ig.id, ig.name, fetchErr.Error())
						continue
					}
				} else {
					log.Printf("[QNAP] fetch error for %s: %v", ig.id, fetchErr)
					RecordIntegrationError(ig.id, ig.name, fetchErr.Error())
					continue
				}
			}
			ClearIntegrationError(ig.id, ig.name)
			cacheSet(ig.id, fresh)
			log.Printf("[QNAP] refreshed %s (%s)", ig.id, ig.name)
		}
	}
}
