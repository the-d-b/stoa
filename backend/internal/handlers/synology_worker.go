package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"time"
)

func StartSynologyWorker(db *sql.DB, ig integrationMeta, stop <-chan struct{}) {
	go func() {
		backoff := 5 * time.Second
		for {
			select {
			case <-stop:
				return
			default:
			}
			err := runSynologyWorker(db, ig, stop)
			if err != nil {
				logErrorf("Synology", "worker error: %v — reconnecting in %s", err, backoff)
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

func runSynologyWorker(db *sql.DB, ig integrationMeta, stop <-chan struct{}) error {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, ig.id)
	if err != nil {
		return fmt.Errorf("resolve: %w", err)
	}
	username, password := omvParseCredentials(apiKey)

	sid, err := synoLogin(apiURL, username, password, skipTLS)
	if err != nil {
		return fmt.Errorf("login: %w", err)
	}
	synoSetSession(ig.id, sid)
	logDebugf("Synology", "authenticated for %s", ig.id)

	data, err := synoFetchAll(apiURL, sid, uiURL, skipTLS)
	if err != nil {
		return fmt.Errorf("initial fetch: %w", err)
	}
	cacheSet(ig.id, data)
	ClearIntegrationError(ig.id, ig.name)
	logDebugf("Synology", "initial data cached for %s (%s %s)", ig.id, data.Model, data.Hostname)

	ticker := time.NewTicker(time.Duration(ig.refreshSecs) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-stop:
			return nil
		case <-ticker.C:
			fresh, fetchErr := synoFetchAll(apiURL, sid, uiURL, skipTLS)
			if fetchErr != nil {
				if errors.Is(fetchErr, errSynoUnauth) {
					logErrorf("Synology", "session expired for %s — re-authenticating", ig.id)
					synoClearSession(ig.id)
					sid, err = synoLogin(apiURL, username, password, skipTLS)
					if err != nil {
						logErrorf("Synology", "re-auth failed for %s: %v", ig.id, err)
						RecordIntegrationError(ig.id, ig.name, err.Error())
						continue
					}
					synoSetSession(ig.id, sid)
					fresh, fetchErr = synoFetchAll(apiURL, sid, uiURL, skipTLS)
					if fetchErr != nil {
						logErrorf("Synology", "fetch error after re-auth for %s: %v", ig.id, fetchErr)
						RecordIntegrationError(ig.id, ig.name, fetchErr.Error())
						continue
					}
				} else {
					logErrorf("Synology", "fetch error for %s: %v", ig.id, fetchErr)
					RecordIntegrationError(ig.id, ig.name, fetchErr.Error())
					continue
				}
			}
			ClearIntegrationError(ig.id, ig.name)
			cacheSet(ig.id, fresh)
			logDebugf("Synology", "refreshed %s (%s)", ig.id, ig.name)
		}
	}
}
