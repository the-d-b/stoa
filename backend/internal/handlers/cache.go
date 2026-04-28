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

// WorkerManager controls worker lifecycle based on active SSE client count.
// Workers spin up when the first client connects and spin down after all clients
// disconnect (with a configurable grace period).
type WorkerManager struct {
	db          *sql.DB
	mu          sync.Mutex
	clientCount int
	running     bool
	gracePeriod time.Duration
	cancelSpin  func() // cancels the current pending spin-down, nil if none
}

// GlobalWorkerManager is the singleton used by SSEHandler.
var GlobalWorkerManager *WorkerManager

// NewWorkerManager creates the manager. Workers do NOT start yet — they wait
// for the first SSE client connection.
func NewWorkerManager(db *sql.DB, gracePeriod time.Duration) *WorkerManager {
	m := &WorkerManager{
		db:          db,
		gracePeriod: gracePeriod,
	}
	GlobalWorkerManager = m
	log.Printf("[CACHE] worker manager ready — cold start, waiting for first SSE client")
	return m
}

// ClientConnected is called when an SSE client connects.
func (m *WorkerManager) ClientConnected() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.clientCount++
	log.Printf("[CACHE] SSE client connected (total: %d)", m.clientCount)
	// Cancel any pending spin-down
	if m.cancelSpin != nil {
		m.cancelSpin()
		m.cancelSpin = nil
		log.Printf("[CACHE] spin-down cancelled — client reconnected")
	}
	// Spin up if not already running
	if !m.running {
		m.running = true
		m.startAllWorkers()
	}
}

// ClientDisconnected is called when an SSE client disconnects.
func (m *WorkerManager) ClientDisconnected() {
	m.mu.Lock()
	m.clientCount--
	count := m.clientCount
	if count > 0 {
		m.mu.Unlock()
		log.Printf("[CACHE] SSE client disconnected (remaining: %d)", count)
		return
	}
	// Last client — schedule spin-down with cancellable timer
	log.Printf("[CACHE] SSE client disconnected (remaining: 0)")
	log.Printf("[CACHE] no SSE clients — spinning down in %s", m.gracePeriod)
	cancel := make(chan struct{})
	m.cancelSpin = func() { close(cancel) }
	m.mu.Unlock()

	go func() {
		select {
		case <-time.After(m.gracePeriod):
			m.mu.Lock()
			defer m.mu.Unlock()
			if m.clientCount <= 0 && m.running {
				m.running = false
				m.cancelSpin = nil
				m.stopAllWorkers()
				log.Printf("[CACHE] all workers stopped — no active sessions")
			}
		case <-cancel:
			// Cancelled by ClientConnected
		}
	}()
}

func (m *WorkerManager) startAllWorkers() {
	integrations, err := loadAllIntegrations(m.db)
	if err != nil {
		log.Printf("[CACHE] failed to load integrations: %v", err)
		return
	}
	for _, ig := range integrations {
		startWorker(m.db, ig)
	}
	log.Printf("[CACHE] started %d workers (SSE client connected)", len(integrations))
}

func (m *WorkerManager) stopAllWorkers() {
	workerStopMu.Lock()
	defer workerStopMu.Unlock()
	for id, ch := range workerStop {
		close(ch)
		delete(workerStop, id)
	}
	log.Printf("[CACHE] all workers stopped")
}

// StartCacheManager kept for compatibility — now delegates to WorkerManager.
// Call NewWorkerManager instead from main.go.
func StartCacheManager(db *sql.DB) {
	NewWorkerManager(db, 600*time.Second)
}

// StartWorkerForIntegration starts (or restarts) a worker for a single integration.
// Called when an integration is created or updated — only starts if manager is running.
func StartWorkerForIntegration(db *sql.DB, integrationID string) {
	StopWorkerForIntegration(integrationID)
	// Only start if sessions are active
	if GlobalWorkerManager != nil && !GlobalWorkerManager.running {
		log.Printf("[CACHE] skipping worker start for %s — no active sessions", integrationID)
		return
	}
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
	name        string
	igType      string
	refreshSecs int
}

func loadAllIntegrations(db *sql.DB) ([]integrationMeta, error) {
	rows, err := db.Query(`
		SELECT id, COALESCE(name,''), type, COALESCE(refresh_secs, 60)
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
		if err := rows.Scan(&ig.id, &ig.name, &ig.igType, &ig.refreshSecs); err != nil {
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

	// Proxmox uses a fast 3s poll for CPU/mem/net + slow poll for VMs/storage/temps
	if ig.igType == "proxmox" {
		StartProxmoxWorker(db, ig, stop)
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
		RecordIntegrationError(ig.id, ig.name, err.Error())
		return
	}
	ClearIntegrationError(ig.id)
	cacheSet(ig.id, data)
	log.Printf("[CACHE] refreshed %s (%s)", ig.id, ig.igType)
}
