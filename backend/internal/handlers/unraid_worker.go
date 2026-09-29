package handlers

import (
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ── graphql-transport-ws connection ───────────────────────────────────────────

type unraidWSMsg struct {
	ID      string          `json:"id,omitempty"`
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

type unraidConn struct {
	conn  *websocket.Conn
	mu    sync.Mutex
	msgID int
}

func (c *unraidConn) send(v interface{}) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn.WriteJSON(v)
}

func (c *unraidConn) nextID() string {
	c.msgID++
	return fmt.Sprintf("u%d", c.msgID)
}

// ── Worker entrypoint ─────────────────────────────────────────────────────────

func StartUnraidWorker(db *sql.DB, ig integrationMeta, stop <-chan struct{}) {
	go func() {
		backoff := 5 * time.Second
		for {
			select {
			case <-stop:
				return
			default:
			}
			err := runUnraidWorker(db, ig, stop)
			if err != nil {
				logErrorf("UNRAID", "worker error: %v — reconnecting in %s", err, backoff)
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

func runUnraidWorker(db *sql.DB, ig integrationMeta, stop <-chan struct{}) error {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, ig.id)
	if err != nil {
		return fmt.Errorf("resolve: %w", err)
	}

	// Initial HTTP fetch — populates the cache before WebSocket is ready
	initial, err := unraidFetchAll(ig.id, apiURL, apiKey, skipTLS, true)
	if err != nil {
		return fmt.Errorf("initial fetch: %w", err)
	}
	initial.UIURL = uiURL
	cacheSet(ig.id, initial)
	ClearIntegrationError(ig.id, ig.name)
	logDebugf("UNRAID", "initial data cached for %s (%s)", ig.id, initial.Hostname)

	// Attempt WebSocket for live CPU/memory/network metrics
	wsBase, err := toWebSocketURL(apiURL)
	if err != nil {
		logErrorf("UNRAID", "cannot build WS URL — using HTTP poll: %v", err)
		return unraidPollLoop(db, ig, apiURL, uiURL, apiKey, skipTLS, stop)
	}
	wsURL := strings.TrimRight(wsBase, "/") + "/graphql"

	tlsCfg := &tls.Config{Renegotiation: tls.RenegotiateOnceAsClient}
	if skipTLS {
		tlsCfg.InsecureSkipVerify = true //nolint:gosec
	}

	dialer := websocket.Dialer{
		HandshakeTimeout: 15 * time.Second,
		ReadBufferSize:   65536,
		WriteBufferSize:  8192,
		TLSClientConfig:  tlsCfg,
		Subprotocols:     []string{"graphql-transport-ws"},
	}

	rawConn, _, dialErr := dialer.Dial(wsURL, http.Header{"User-Agent": []string{"Stoa/1.0"}})
	if dialErr != nil {
		logErrorf("UNRAID", "WebSocket unavailable (%v) — using HTTP poll", dialErr)
		return unraidPollLoop(db, ig, apiURL, uiURL, apiKey, skipTLS, stop)
	}
	defer rawConn.Close()
	rawConn.SetReadLimit(1 << 20)
	logDebugf("UNRAID", "WebSocket connected to %s", wsURL)

	c := &unraidConn{conn: rawConn}

	// ── Single reader goroutine — all reads go through here ───────────────
	msgCh := make(chan *unraidWSMsg, 64)
	readErrCh := make(chan error, 1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				readErrCh <- fmt.Errorf("read panic: %v", r)
			}
		}()
		for {
			var msg unraidWSMsg
			if err := rawConn.ReadJSON(&msg); err != nil {
				readErrCh <- err
				return
			}
			msgCh <- &msg
		}
	}()

	readMsg := func(timeout time.Duration) (*unraidWSMsg, error) {
		select {
		case msg := <-msgCh:
			return msg, nil
		case err := <-readErrCh:
			return nil, err
		case <-time.After(timeout):
			return nil, fmt.Errorf("read timeout after %s", timeout)
		}
	}

	readUntilType := func(wantType string) (*unraidWSMsg, error) {
		deadline := time.Now().Add(15 * time.Second)
		for time.Now().Before(deadline) {
			msg, err := readMsg(time.Until(deadline))
			if err != nil {
				return nil, err
			}
			if msg.Type == "ping" {
				c.send(map[string]string{"type": "pong"}) //nolint:errcheck
			}
			if msg.Type == wantType {
				return msg, nil
			}
		}
		return nil, fmt.Errorf("timeout waiting for %s", wantType)
	}

	// ── connection_init ───────────────────────────────────────────────────
	initPayload, _ := json.Marshal(map[string]string{"x-api-key": apiKey})
	if err := c.send(map[string]interface{}{
		"type":    "connection_init",
		"payload": json.RawMessage(initPayload),
	}); err != nil {
		logErrorf("UNRAID", "WebSocket init send failed (%v) — using HTTP poll", err)
		return unraidPollLoop(db, ig, apiURL, uiURL, apiKey, skipTLS, stop)
	}
	if _, err := readUntilType("connection_ack"); err != nil {
		logErrorf("UNRAID", "WebSocket ack failed (%v) — using HTTP poll", err)
		return unraidPollLoop(db, ig, apiURL, uiURL, apiKey, skipTLS, stop)
	}
	logDebugf("UNRAID", "WebSocket authenticated for %s", ig.id)

	// ── Subscribe to live metrics ─────────────────────────────────────────
	cpuSubID := c.nextID()
	memSubID := c.nextID()
	netSubID := c.nextID()
	arraySubID := c.nextID()

	// Subscription return types are the SAME CpuUtilization/NetworkMetrics
	// types the regular polling query already uses successfully (confirmed
	// live: Unraid's error response named the exact type when the original
	// field guesses — cpuUsage/iface — were wrong) — so these reuse the same
	// field names as unraidCoreQuery rather than guessing a subscription-
	// specific shape.
	c.send(map[string]interface{}{ //nolint:errcheck
		"id": cpuSubID, "type": "subscribe",
		"payload": map[string]string{
			"query": `subscription { systemMetricsCpu { percentTotal } }`,
		},
	})
	c.send(map[string]interface{}{ //nolint:errcheck
		"id": memSubID, "type": "subscribe",
		"payload": map[string]string{
			"query": `subscription { systemMetricsMemory { total used free } }`,
		},
	})
	c.send(map[string]interface{}{ //nolint:errcheck
		"id": netSubID, "type": "subscribe",
		"payload": map[string]string{
			"query": `subscription { systemMetricsNetwork { name rxSec txSec } }`,
		},
	})
	// arraySubscription pushes the same array/disk/pool shape as the regular
	// query live — used here so IOPS (diffed from numReads/numWrites) gets
	// genuine few-second resolution instead of only updating once per
	// refreshSecs slow poll, which would understate an "IOPS" figure by
	// averaging it over up to a minute of activity.
	c.send(map[string]interface{}{ //nolint:errcheck
		"id": arraySubID, "type": "subscribe",
		"payload": map[string]string{
			"query": `subscription { arraySubscription { ` + unraidArraySubQuery + ` } }`,
		},
	})

	// ── Subscription handlers (closures over sub IDs) ─────────────────────
	type subHandler func(data json.RawMessage, fresh *UnraidPanelData) bool

	subHandlers := map[string]subHandler{
		cpuSubID: func(data json.RawMessage, fresh *UnraidPanelData) bool {
			var d struct {
				SystemMetricsCpu struct {
					PercentTotal float64 `json:"percentTotal"`
				} `json:"systemMetricsCpu"`
			}
			if json.Unmarshal(data, &d) != nil {
				return false
			}
			fresh.CPUPercent = d.SystemMetricsCpu.PercentTotal
			return true
		},
		memSubID: func(data json.RawMessage, fresh *UnraidPanelData) bool {
			var d struct {
				SystemMetricsMemory struct {
					Total unraidBigInt `json:"total"`
					Used  unraidBigInt `json:"used"`
					Free  unraidBigInt `json:"free"`
				} `json:"systemMetricsMemory"`
			}
			if json.Unmarshal(data, &d) == nil && d.SystemMetricsMemory.Total > 0 {
				totalGB := float64(d.SystemMetricsMemory.Total) / 1073741824
				usedGB := float64(d.SystemMetricsMemory.Used) / 1073741824
				if usedGB == 0 {
					freeGB := float64(d.SystemMetricsMemory.Free) / 1073741824
					usedGB = totalGB - freeGB
				}
				fresh.RAMTotalGB = totalGB
				fresh.RAMUsedGB = usedGB
				if totalGB > 0 {
					fresh.RAMPercent = usedGB / totalGB * 100
				}
				return true
			}
			return false
		},
		// systemMetricsNetwork returns [NetworkMetrics!]! — a list of every
		// interface per event, confirmed against the schema's Subscription
		// type (the earlier "cannot query field iface" error only named the
		// element type, not the list wrapper, which led to an incorrect
		// single-object struct here that silently failed to unmarshal an
		// array with no error path — hence updates vanishing with no log at
		// all). Updates whichever existing interfaces match by name rather
		// than replacing the whole list, since the slow poll decides which
		// interfaces are real (filtering out loopback/no-IP ones).
		netSubID: func(data json.RawMessage, fresh *UnraidPanelData) bool {
			var d struct {
				SystemMetricsNetwork []struct {
					Name  string  `json:"name"`
					RxSec float64 `json:"rxSec"`
					TxSec float64 `json:"txSec"`
				} `json:"systemMetricsNetwork"`
			}
			if err := json.Unmarshal(data, &d); err != nil {
				logErrorf("UNRAID", "net subscription payload parse error: %v", err)
				return false
			}
			updated := false
			for _, entry := range d.SystemMetricsNetwork {
				for i, iface := range fresh.NetInterfaces {
					if iface.Name == entry.Name {
						fresh.NetInterfaces[i].RxMBs = entry.RxSec / 1048576
						fresh.NetInterfaces[i].TxMBs = entry.TxSec / 1048576
						updated = true
						break
					}
				}
			}
			return updated
		},
		arraySubID: func(data json.RawMessage, fresh *UnraidPanelData) bool {
			var d struct {
				ArraySubscription unraidArrayPayload `json:"arraySubscription"`
			}
			if err := json.Unmarshal(data, &d); err != nil {
				logErrorf("UNRAID", "array subscription payload parse error: %v", err)
				return false
			}
			totalReads, totalWrites := unraidApplyArray(fresh, d.ArraySubscription)
			fresh.ReadIOPS, fresh.WriteIOPS = unraidTrackIOPS(ig.id, totalReads, totalWrites)
			return true
		},
	}

	// ── Tickers ───────────────────────────────────────────────────────────
	refreshTicker := time.NewTicker(time.Duration(ig.refreshSecs) * time.Second)
	defer refreshTicker.Stop()
	pingTicker := time.NewTicker(30 * time.Second)
	defer pingTicker.Stop()

	// ── Main event loop ───────────────────────────────────────────────────
	for {
		select {
		case <-stop:
			return nil
		case err := <-readErrCh:
			return fmt.Errorf("ws read: %w", err)
		case msg := <-msgCh:
			switch msg.Type {
			case "ping":
				c.send(map[string]string{"type": "pong"}) //nolint:errcheck
			case "next":
				handler, ok := subHandlers[msg.ID]
				if !ok {
					break
				}
				var wrapper struct {
					Data json.RawMessage `json:"data"`
				}
				if json.Unmarshal(msg.Payload, &wrapper) != nil || wrapper.Data == nil {
					break
				}
				// Value copy — never mutate the cached pointer directly
				current := unraidGetCached(ig.id)
				var fresh UnraidPanelData
				if current != nil {
					fresh = *current
				}
				if handler(wrapper.Data, &fresh) {
					cacheSet(ig.id, &fresh)
				}
			case "error":
				// Payload was previously discarded, hiding the actual reason
				// a subscription failed — graphql-transport-ws sends an array
				// of GraphQL error objects here.
				var gqlErrs []struct {
					Message string `json:"message"`
				}
				if json.Unmarshal(msg.Payload, &gqlErrs) == nil && len(gqlErrs) > 0 {
					logErrorf("UNRAID", "subscription error id=%s: %s", msg.ID, gqlErrs[0].Message)
				} else {
					logErrorf("UNRAID", "subscription error id=%s: %s", msg.ID, strings.TrimSpace(string(msg.Payload)))
				}
			}
		case <-pingTicker.C:
			c.mu.Lock()
			rawConn.WriteMessage(websocket.PingMessage, nil) //nolint:errcheck
			c.mu.Unlock()
		case <-refreshTicker.C:
			// Re-poll slow-changing data (docker, VMs, shares, notifications).
			// trackIOPS=false — arraySubscription already feeds IOPS on its
			// own, faster cadence; see unraidFetchAll's doc comment.
			rebuilt, pollErr := unraidFetchAll(ig.id, apiURL, apiKey, skipTLS, false)
			if pollErr != nil {
				logErrorf("UNRAID", "slow refresh error: %v", pollErr)
				RecordIntegrationError(ig.id, ig.name, pollErr.Error())
				continue
			}
			rebuilt.UIURL = uiURL
			// Preserve live metrics that subscriptions keep up-to-date
			if cur := unraidGetCached(ig.id); cur.CPUPercent > 0 {
				rebuilt.CPUPercent = cur.CPUPercent
			}
			if cur := unraidGetCached(ig.id); cur.RAMUsedGB > 0 {
				rebuilt.RAMUsedGB = cur.RAMUsedGB
				rebuilt.RAMTotalGB = cur.RAMTotalGB
				rebuilt.RAMPercent = cur.RAMPercent
			}
			if cur := unraidGetCached(ig.id); len(cur.NetInterfaces) > 0 {
				rebuilt.NetInterfaces = cur.NetInterfaces
			}
			if cur := unraidGetCached(ig.id); cur.ReadIOPS > 0 || cur.WriteIOPS > 0 {
				rebuilt.ReadIOPS = cur.ReadIOPS
				rebuilt.WriteIOPS = cur.WriteIOPS
			}
			ClearIntegrationError(ig.id, ig.name)
			cacheSet(ig.id, rebuilt)
			logDebugf("UNRAID", "slow data refreshed for %s", ig.id)
		}
	}
}

// unraidPollLoop is used when WebSocket is unavailable.
func unraidPollLoop(db *sql.DB, ig integrationMeta, apiURL, uiURL, apiKey string, skipTLS bool, stop <-chan struct{}) error {
	ticker := time.NewTicker(time.Duration(ig.refreshSecs) * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return nil
		case <-ticker.C:
			fresh, err := unraidFetchAll(ig.id, apiURL, apiKey, skipTLS, true)
			if err != nil {
				logErrorf("UNRAID", "poll error: %v", err)
				RecordIntegrationError(ig.id, ig.name, err.Error())
				continue
			}
			fresh.UIURL = uiURL
			ClearIntegrationError(ig.id, ig.name)
			cacheSet(ig.id, fresh)
			logDebugf("UNRAID", "polled %s (%s)", ig.id, ig.name)
		}
	}
}
