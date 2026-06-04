package handlers

import (
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
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
				log.Printf("[UNRAID] worker error: %v — reconnecting in %s", err, backoff)
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
	raw, err := unraidHTTPQuery(apiURL, apiKey, unraidFullQuery, skipTLS)
	if err != nil {
		return fmt.Errorf("initial fetch: %w", err)
	}
	initial := buildUnraidPanelData(raw)
	initial.UIURL = uiURL
	cacheSet(ig.id, initial)
	ClearIntegrationError(ig.id, ig.name)
	log.Printf("[UNRAID] initial data cached for %s (%s)", ig.id, initial.Hostname)

	// Attempt WebSocket for live CPU/memory/network metrics
	wsBase, err := toWebSocketURL(apiURL)
	if err != nil {
		log.Printf("[UNRAID] cannot build WS URL — using HTTP poll: %v", err)
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
		log.Printf("[UNRAID] WebSocket unavailable (%v) — using HTTP poll", dialErr)
		return unraidPollLoop(db, ig, apiURL, uiURL, apiKey, skipTLS, stop)
	}
	defer rawConn.Close()
	rawConn.SetReadLimit(1 << 20)
	log.Printf("[UNRAID] WebSocket connected to %s", wsURL)

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
		log.Printf("[UNRAID] WebSocket init send failed (%v) — using HTTP poll", err)
		return unraidPollLoop(db, ig, apiURL, uiURL, apiKey, skipTLS, stop)
	}
	if _, err := readUntilType("connection_ack"); err != nil {
		log.Printf("[UNRAID] WebSocket ack failed (%v) — using HTTP poll", err)
		return unraidPollLoop(db, ig, apiURL, uiURL, apiKey, skipTLS, stop)
	}
	log.Printf("[UNRAID] WebSocket authenticated for %s", ig.id)

	// ── Subscribe to live metrics ─────────────────────────────────────────
	cpuSubID := c.nextID()
	memSubID := c.nextID()
	netSubID := c.nextID()

	c.send(map[string]interface{}{ //nolint:errcheck
		"id": cpuSubID, "type": "subscribe",
		"payload": map[string]string{
			"query": `subscription { systemMetricsCpu { cpuUsage { main } } }`,
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
			"query": `subscription { systemMetricsNetwork { iface { name rxSec txSec } } }`,
		},
	})

	// ── Subscription handlers (closures over sub IDs) ─────────────────────
	type subHandler func(data json.RawMessage, fresh *UnraidPanelData) bool

	subHandlers := map[string]subHandler{
		cpuSubID: func(data json.RawMessage, fresh *UnraidPanelData) bool {
			var d struct {
				SystemMetricsCpu struct {
					CpuUsage []struct{ Main float64 `json:"main"` } `json:"cpuUsage"`
				} `json:"systemMetricsCpu"`
			}
			if json.Unmarshal(data, &d) == nil && len(d.SystemMetricsCpu.CpuUsage) > 0 {
				fresh.CPUPercent = d.SystemMetricsCpu.CpuUsage[0].Main
				return true
			}
			return false
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
		netSubID: func(data json.RawMessage, fresh *UnraidPanelData) bool {
			var d struct {
				SystemMetricsNetwork struct {
					Iface []struct {
						Name  string       `json:"name"`
						RxSec unraidBigInt `json:"rxSec"`
						TxSec unraidBigInt `json:"txSec"`
					} `json:"iface"`
				} `json:"systemMetricsNetwork"`
			}
			if json.Unmarshal(data, &d) != nil {
				return false
			}
			var ifaces []UnraidNetIface
			for _, iface := range d.SystemMetricsNetwork.Iface {
				if iface.Name == "lo" {
					continue
				}
				ifaces = append(ifaces, UnraidNetIface{
					Name:  iface.Name,
					RxMBs: float64(iface.RxSec) / 1048576,
					TxMBs: float64(iface.TxSec) / 1048576,
				})
			}
			if len(ifaces) > 0 {
				fresh.NetInterfaces = ifaces
				return true
			}
			return false
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
				log.Printf("[UNRAID] subscription error id=%s", msg.ID)
			}
		case <-pingTicker.C:
			c.mu.Lock()
			rawConn.WriteMessage(websocket.PingMessage, nil) //nolint:errcheck
			c.mu.Unlock()
		case <-refreshTicker.C:
			// Re-poll slow-changing data (array state, disks, docker, VMs, shares)
			pollRaw, pollErr := unraidHTTPQuery(apiURL, apiKey, unraidFullQuery, skipTLS)
			if pollErr != nil {
				log.Printf("[UNRAID] slow refresh error: %v", pollErr)
				RecordIntegrationError(ig.id, ig.name, pollErr.Error())
				continue
			}
			rebuilt := buildUnraidPanelData(pollRaw)
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
			ClearIntegrationError(ig.id, ig.name)
			cacheSet(ig.id, rebuilt)
			log.Printf("[UNRAID] slow data refreshed for %s", ig.id)
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
			raw, err := unraidHTTPQuery(apiURL, apiKey, unraidFullQuery, skipTLS)
			if err != nil {
				log.Printf("[UNRAID] poll error: %v", err)
				RecordIntegrationError(ig.id, ig.name, err.Error())
				continue
			}
			fresh := buildUnraidPanelData(raw)
			fresh.UIURL = uiURL
			ClearIntegrationError(ig.id, ig.name)
			cacheSet(ig.id, fresh)
			log.Printf("[UNRAID] polled %s (%s)", ig.id, ig.name)
		}
	}
}
