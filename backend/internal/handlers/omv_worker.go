package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"time"
)

func StartOMVWorker(db *sql.DB, ig integrationMeta, stop <-chan struct{}) {
	go func() {
		backoff := 5 * time.Second
		for {
			select {
			case <-stop:
				return
			default:
			}
			err := runOMVWorker(db, ig, stop)
			if err != nil {
				logErrorf("OMV", "worker error: %v — reconnecting in %s", err, backoff)
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

func runOMVWorker(db *sql.DB, ig integrationMeta, stop <-chan struct{}) error {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, ig.id)
	if err != nil {
		return fmt.Errorf("resolve: %w", err)
	}
	username, password := omvParseCredentials(apiKey)

	sessionID, err := omvLogin(apiURL, username, password, skipTLS)
	if err != nil {
		return fmt.Errorf("login: %w", err)
	}
	omvSetSession(ig.id, sessionID)
	logDebugf("OMV", "authenticated for %s", ig.id)

	// prevNet carries cumulative byte counters across poll cycles for rate calculation.
	prevNet := map[string]omvNetSnapshot{}

	data, err := omvFetchAll(apiURL, sessionID, uiURL, prevNet, skipTLS)
	if err != nil {
		return fmt.Errorf("initial fetch: %w", err)
	}
	cacheSet(ig.id, data)
	ClearIntegrationError(ig.id, ig.name)
	logDebugf("OMV", "initial data cached for %s (%s)", ig.id, data.Hostname)

	ticker := time.NewTicker(time.Duration(ig.refreshSecs) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-stop:
			return nil
		case <-ticker.C:
			fresh, fetchErr := omvFetchAll(apiURL, sessionID, uiURL, prevNet, skipTLS)
			if fetchErr != nil {
				if errors.Is(fetchErr, errOMVUnauth) {
					// Session expired — re-authenticate once and retry
					logErrorf("OMV", "session expired for %s — re-authenticating", ig.id)
					omvClearSession(ig.id)
					sessionID, err = omvLogin(apiURL, username, password, skipTLS)
					if err != nil {
						logErrorf("OMV", "re-auth failed for %s: %v", ig.id, err)
						RecordIntegrationError(ig.id, ig.name, err.Error())
						continue
					}
					omvSetSession(ig.id, sessionID)
					fresh, fetchErr = omvFetchAll(apiURL, sessionID, uiURL, prevNet, skipTLS)
					if fetchErr != nil {
						logErrorf("OMV", "fetch error after re-auth for %s: %v", ig.id, fetchErr)
						RecordIntegrationError(ig.id, ig.name, fetchErr.Error())
						continue
					}
				} else {
					logErrorf("OMV", "fetch error for %s: %v", ig.id, fetchErr)
					RecordIntegrationError(ig.id, ig.name, fetchErr.Error())
					continue
				}
			}
			ClearIntegrationError(ig.id, ig.name)
			cacheSet(ig.id, fresh)
			logDebugf("OMV", "refreshed %s (%s)", ig.id, ig.name)
		}
	}
}
