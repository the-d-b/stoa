package handlers

import (
	"database/sql"
	"log"
	"sync"
	"time"
)

// ── Cache entry ───────────────────────────────────────────────────────────────

type cacheEntry struct {
	data      interface{}
	fetchedAt time.Time
}

// ── Cache store ───────────────────────────────────────────────────────────────

var (
	panelCache   = map[string]cacheEntry{} // key: integrationID
	panelCacheMu sync.RWMutex
)

func cacheGet(integrationID string) (interface{}, bool) {
	panelCacheMu.RLock()
	defer panelCacheMu.RUnlock()
	e, ok := panelCache[integrationID]
	if !ok {
		return nil, false
	}
	return e.data, true
}

func cacheSet(integrationID string, data interface{}) {
	panelCacheMu.Lock()
	panelCache[integrationID] = cacheEntry{data: data, fetchedAt: time.Now()}
	panelCacheMu.Unlock()
	// Notify SSE clients of the update
	go SSEBroadcast(integrationID, data)
}

func cacheDelete(integrationID string) {
	panelCacheMu.Lock()
	defer panelCacheMu.Unlock()
	delete(panelCache, integrationID)
}

// ── Background refresh manager ────────────────────────────────────────────────

// workerStop holds cancel channels for each running worker keyed by integrationID
var (
	workerStop   = map[string]chan struct{}{}
	workerStopMu sync.Mutex
)

// StartCacheManager loads all integrations and starts a background worker for each.
// Called once at startup from main.go.
func StartCacheManager(db *sql.DB) {
	log.Printf("[CACHE] starting cache manager")
	integrations, err := loadAllIntegrations(db)
	if err != nil {
		log.Printf("[CACHE] failed to load integrations: %v", err)
		return
	}
	for _, ig := range integrations {
		startWorker(db, ig)
	}
	log.Printf("[CACHE] started %d workers", len(integrations))
}

// StartWorkerForIntegration starts (or restarts) a worker for a single integration.
// Called when an integration is created or updated.
func StartWorkerForIntegration(db *sql.DB, integrationID string) {
	StopWorkerForIntegration(integrationID)
	igs, err := loadAllIntegrations(db)
	if err != nil {
		return
	}
	for _, ig := range igs {
		if ig.id == integrationID {
			startWorker(db, ig)
			return
		}
	}
}

// StopWorkerForIntegration stops the background worker for an integration.
// Called when an integration is deleted.
func StopWorkerForIntegration(integrationID string) {
	workerStopMu.Lock()
	defer workerStopMu.Unlock()
	if ch, ok := workerStop[integrationID]; ok {
		close(ch)
		delete(workerStop, integrationID)
		cacheDelete(integrationID)
		log.Printf("[CACHE] stopped worker for %s", integrationID)
	}
}

// ── Internal ──────────────────────────────────────────────────────────────────

type integrationMeta struct {
	id          string
	igType      string
	refreshSecs int
}

func loadAllIntegrations(db *sql.DB) ([]integrationMeta, error) {
	rows, err := db.Query(`
		SELECT id, type, COALESCE(refresh_secs, 60)
		FROM integrations
		WHERE enabled = 1
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []integrationMeta
	for rows.Next() {
		var ig integrationMeta
		if err := rows.Scan(&ig.id, &ig.igType, &ig.refreshSecs); err != nil {
			continue
		}
		if ig.refreshSecs < 15 {
			ig.refreshSecs = 15
		}
		result = append(result, ig)
	}
	return result, nil
}

func startWorker(db *sql.DB, ig integrationMeta) {
	stop := make(chan struct{})
	workerStopMu.Lock()
	workerStop[ig.id] = stop
	workerStopMu.Unlock()

	log.Printf("[CACHE] worker started: %s (%s) every %ds", ig.id, ig.igType, ig.refreshSecs)

	// TrueNAS uses a persistent WebSocket connection instead of polling
	if ig.igType == "truenas" {
		StartTrueNASWorker(db, ig, stop)
		return
	}

	// OPNsense uses a fast 2s poll for traffic rates + slow 30s poll for other data
	if ig.igType == "opnsense" {
		StartOPNsenseWorker(db, ig, stop)
		return
	}

	go func() {
		// Fetch immediately on start so cache is warm right away
		refreshCache(db, ig)
		ticker := time.NewTicker(time.Duration(ig.refreshSecs) * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				refreshCache(db, ig)
			case <-stop:
				log.Printf("[CACHE] worker stopped: %s", ig.id)
				return
			}
		}
	}()
}

func refreshCache(db *sql.DB, ig integrationMeta) {
	// Build a minimal config map with just the integrationId
	// Panel-specific config (sources, height, etc.) is not relevant at this level —
	// we cache per integration, not per panel
	config := map[string]interface{}{
		"integrationId": ig.id,
	}

	fetcher, ok := panelFetchers[ig.igType]
	if !ok {
		return // type not supported for caching (e.g. calendar has no single integration)
	}

	data, err := fetcher(db, config)
	if err != nil {
		log.Printf("[CACHE] refresh error %s (%s): %v", ig.id, ig.igType, err)
		return
	}
	cacheSet(ig.id, data)
	log.Printf("[CACHE] refreshed %s (%s)", ig.id, ig.igType)
}
