package handlers

import (
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ── TrueNAS WebSocket worker ──────────────────────────────────────────────────
// All WebSocket reads go through a single goroutine to avoid concurrent read races.
// Method call results are dispatched to pending callers via a response map.

type tnMessage struct {
	ID         interface{}     `json:"id,omitempty"`
	Msg        string          `json:"msg"`
	Method     string          `json:"method,omitempty"`
	Params     json.RawMessage `json:"params,omitempty"`
	Result     json.RawMessage `json:"result,omitempty"`
	Error      *struct {
		Error string `json:"error"`
	} `json:"error,omitempty"`
	Collection string          `json:"collection,omitempty"`
	Fields     json.RawMessage `json:"fields,omitempty"`
}

type tnConn struct {
	conn  *websocket.Conn
	mu    sync.Mutex
	msgID int
}

func (c *tnConn) send(v interface{}) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn.WriteJSON(v)
}

func (c *tnConn) nextID() string {
	c.msgID++
	return fmt.Sprintf("%d", c.msgID)
}

func StartTrueNASWorker(db *sql.DB, ig integrationMeta, stop <-chan struct{}) {
	go func() {
		backoff := 5 * time.Second
		for {
			select {
			case <-stop:
				return
			default:
			}
			err := runTrueNASWorker(db, ig, stop)
			if err != nil {
				log.Printf("[TRUENAS] worker error: %v — reconnecting in %s", err, backoff)
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

func runTrueNASWorker(db *sql.DB, ig integrationMeta, stop <-chan struct{}) error {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, ig.id)
	if err != nil {
		return fmt.Errorf("resolve: %w", err)
	}

	wsURL, err := toWebSocketURL(apiURL)
	if err != nil {
		return fmt.Errorf("url: %w", err)
	}
	wsURL += "/websocket"

	tlsCfg := &tls.Config{
		Renegotiation: tls.RenegotiateOnceAsClient,
	}
	if skipTLS {
		tlsCfg.InsecureSkipVerify = true //nolint:gosec
		log.Printf("[TRUENAS] skipTLS enabled")
	}

	dialer := websocket.Dialer{
		HandshakeTimeout: 15 * time.Second,
		ReadBufferSize:   65536,
		WriteBufferSize:  8192,
		TLSClientConfig:  tlsCfg,
	}

	log.Printf("[TRUENAS] connecting to %s", wsURL)
	rawConn, _, err := dialer.Dial(wsURL, http.Header{"User-Agent": []string{"Stoa/1.0"}})
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer rawConn.Close()
	rawConn.SetReadLimit(1 << 20)
	log.Printf("[TRUENAS] connected")

	c := &tnConn{conn: rawConn}

	// ── Single reader goroutine — ALL reads go through here ───────────────
	// This prevents concurrent read races between auth/slow-data and the main loop
	msgCh := make(chan *tnMessage, 64)
	readErrCh := make(chan error, 1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				readErrCh <- fmt.Errorf("read panic: %v", r)
			}
		}()
		for {
			var msg tnMessage
			if err := rawConn.ReadJSON(&msg); err != nil {
				readErrCh <- err
				return
			}
			msgCh <- &msg
		}
	}()

	// readMsg reads the next message from the single reader
	readMsg := func(timeout time.Duration) (*tnMessage, error) {
		select {
		case msg := <-msgCh:
			return msg, nil
		case err := <-readErrCh:
			return nil, err
		case <-time.After(timeout):
			return nil, fmt.Errorf("read timeout after %s", timeout)
		}
	}

	// readUntilMsg reads until a message with the given msg type arrives
	readUntilMsg := func(msgType string) (*tnMessage, error) {
		deadline := time.Now().Add(15 * time.Second)
		for time.Now().Before(deadline) {
			msg, err := readMsg(time.Until(deadline))
			if err != nil {
				return nil, err
			}
			if msg.Msg == msgType {
				return msg, nil
			}
		}
		return nil, fmt.Errorf("timeout waiting for %s", msgType)
	}

	// ── DDP Handshake ─────────────────────────────────────────────────────
	if err := c.send(map[string]interface{}{
		"msg": "connect", "version": "1", "support": []string{"1"},
	}); err != nil {
		return fmt.Errorf("connect send: %w", err)
	}
	if _, err := readUntilMsg("connected"); err != nil {
		return fmt.Errorf("connect recv: %w", err)
	}

	// ── Auth ──────────────────────────────────────────────────────────────
	authID := c.nextID()
	if err := c.send(map[string]interface{}{
		"msg": "method", "id": authID,
		"method": "auth.login_with_api_key",
		"params": []string{apiKey},
	}); err != nil {
		return fmt.Errorf("auth send: %w", err)
	}
	authResp, err := readUntilMsg("result")
	if err != nil {
		return fmt.Errorf("auth recv: %w", err)
	}
	var authOK bool
	json.Unmarshal(authResp.Result, &authOK)
	if !authOK {
		return fmt.Errorf("auth failed — check API key")
	}
	log.Printf("[TRUENAS] authenticated")

	// ── Initial slow data — using shared reader ───────────────────────────
	data := &TrueNASPanelData{UIURL: uiURL}
	if err := tnFetchSlowData(c, data, readMsg); err != nil {
		log.Printf("[TRUENAS] slow data error: %v", err)
	}
	cacheSet(ig.id, data)
	log.Printf("[TRUENAS] initial data cached")

	// ── Subscribe to realtime reporting ───────────────────────────────────
	if err := c.send(map[string]interface{}{
		"msg": "sub", "id": c.nextID(),
		"name":   "reporting.realtime",
		"params": []map[string]bool{{"cpu": true, "memory": true}},
	}); err != nil {
		return fmt.Errorf("subscribe: %w", err)
	}

	// ── Tickers ───────────────────────────────────────────────────────────
	refreshTicker := time.NewTicker(time.Duration(ig.refreshSecs) * time.Second)
	defer refreshTicker.Stop()
	pingTicker := time.NewTicker(30 * time.Second)
	defer pingTicker.Stop()

	// ── Pending method call responses ───────────────────────────────────────
	type pendingEntry struct {
		fn   func(json.RawMessage)
		data *TrueNASPanelData
	}
	pending := map[string]pendingEntry{}
	var pendingMu sync.Mutex

	// ── Main event loop ───────────────────────────────────────────────────
	for {
		select {
		case <-stop:
			return nil
		case err := <-readErrCh:
			return fmt.Errorf("read: %w", err)
		case msg := <-msgCh:
			if (msg.Msg == "changed" || msg.Msg == "added") && msg.Collection == "reporting.realtime" {
				tnHandleRealtime(ig.id, msg.Fields)
			} else if msg.Msg == "result" {
				id, _ := msg.ID.(string)
				pendingMu.Lock()
				entry, ok := pending[id]
				if ok {
					if msg.Error == nil { entry.fn(msg.Result) }
					delete(pending, id)
					// Check if all results for this data object arrived
					allDone := true
					for _, e := range pending {
						if e.data == entry.data { allDone = false; break }
					}
					if allDone {
						cacheSet(ig.id, entry.data)
						log.Printf("[TRUENAS] slow data refreshed")
					}
				}
				pendingMu.Unlock()
			}
		case <-pingTicker.C:
			c.mu.Lock()
			rawConn.WriteMessage(websocket.PingMessage, nil)
			c.mu.Unlock()
		case <-refreshTicker.C:
			// Send slow data requests — add pending handlers to map
			// Responses handled in main msg case below
			existing := tnGetCached(ig.id)
			newIDs := tnSendSlowRequests(c, existing)
			pendingMu.Lock()
			for id, fn := range newIDs {
				pending[id] = pendingEntry{fn: fn, data: existing}
			}
			pendingMu.Unlock()
		}
	}
}

// ── Slow data helpers ─────────────────────────────────────────────────────────

type tnSlowHandler map[string]func(json.RawMessage)

func tnSendSlowRequests(c *tnConn, data *TrueNASPanelData) tnSlowHandler {
	handlers := tnSlowHandler{}
	calls := tnSlowCalls(data)
	for _, call := range calls {
		id := c.nextID()
		handlers[id] = call.handle
		c.send(map[string]interface{}{
			"msg": "method", "id": id,
			"method": call.method, "params": call.params,
		})
	}
	return handlers
}

func tnFetchSlowData(c *tnConn, data *TrueNASPanelData, readMsg func(time.Duration) (*tnMessage, error)) error {
	handlers := tnSendSlowRequests(c, data)
	remaining := len(handlers)
	deadline := time.Now().Add(30 * time.Second)
	for remaining > 0 && time.Now().Before(deadline) {
		msg, err := readMsg(time.Until(deadline))
		if err != nil {
			return err
		}
		if msg.Msg != "result" {
			continue
		}
		id, _ := msg.ID.(string)
		if fn, ok := handlers[id]; ok {
			if msg.Error == nil {
				fn(msg.Result)
			}
			delete(handlers, id)
			remaining--
		}
	}
	return nil
}

type tnCall struct {
	method string
	params json.RawMessage
	handle func(json.RawMessage)
}

func tnSlowCalls(data *TrueNASPanelData) []tnCall {
	return []tnCall{
		{method: "pool.query", params: json.RawMessage(`[]`), handle: func(r json.RawMessage) {
			var pools []struct {
				Name string `json:"name"`; Status string `json:"status"`
				Size int64  `json:"size"`; Allocated int64 `json:"allocated"`
			}
			if json.Unmarshal(r, &pools) != nil { return }
			data.Pools = nil
			for _, p := range pools {
				totalGB := float64(p.Size) / 1073741824
				usedGB := float64(p.Allocated) / 1073741824
				pct := 0.0
				if totalGB > 0 { pct = usedGB / totalGB * 100 }
				data.Pools = append(data.Pools, TrueNASPool{Name: p.Name, Status: p.Status, UsedGB: usedGB, TotalGB: totalGB, Percent: pct})
			}
		}},
		{method: "alert.list", params: json.RawMessage(`[]`), handle: func(r json.RawMessage) {
			var alerts []struct{ Level string `json:"level"`; Formatted string `json:"formatted"`; Dismissed bool `json:"dismissed"` }
			if json.Unmarshal(r, &alerts) != nil { return }
			data.Alerts = nil
			for _, a := range alerts {
				if a.Dismissed { continue }
				msg := a.Formatted
				if len(msg) > 120 { msg = msg[:120] + "…" }
				data.Alerts = append(data.Alerts, TrueNASAlert{Level: a.Level, Message: msg})
			}
		}},
		{method: "disk.query", params: json.RawMessage(`[[],{"extra":{"include_expired":false,"supports_smart":true}}]`), handle: func(r json.RawMessage) {
			var disks []struct{ Name string `json:"name"`; Temperature float64 `json:"temperature"` }
			if json.Unmarshal(r, &disks) != nil { return }
			data.Disks = nil
			for _, d := range disks {
				if d.Temperature > 0 { data.Disks = append(data.Disks, TrueNASDisk{Name: d.Name, TempC: d.Temperature}) }
			}
		}},
		{method: "vm.query", params: json.RawMessage(`[]`), handle: func(r json.RawMessage) {
			var vms []struct{ Name string `json:"name"`; Status struct{ State string `json:"state"` } `json:"status"` }
			if json.Unmarshal(r, &vms) != nil { return }
			data.VMs = nil
			for _, v := range vms { data.VMs = append(data.VMs, TrueNASVM{Name: v.Name, Status: v.Status.State}) }
		}},
		{method: "app.query", params: json.RawMessage(`[]`), handle: func(r json.RawMessage) {
			var apps []struct{ Name string `json:"name"`; State string `json:"state"`; UpdateAvailable bool `json:"update_available"` }
			if json.Unmarshal(r, &apps) != nil { return }
			data.Apps = nil
			for _, a := range apps { data.Apps = append(data.Apps, TrueNASApp{Name: a.Name, Status: a.State, UpdateAvailable: a.UpdateAvailable}) }
		}},
	}
}

// ── Realtime handler ──────────────────────────────────────────────────────────

func tnHandleRealtime(integrationID string, fields json.RawMessage) {
	var rt struct {
		CPU map[string]struct {
			Usage float64  `json:"usage"`
			Temp  *float64 `json:"temp"`
		} `json:"cpu"`
		Memory struct {
			PhysicalTotal     int64 `json:"physical_memory_total"`
			PhysicalAvailable int64 `json:"physical_memory_available"`
			ARCSize           int64 `json:"arc_size"`
		} `json:"memory"`
		Disks struct {
			ReadBytes  float64 `json:"read_bytes"`
			WriteBytes float64 `json:"write_bytes"`
			Busy       float64 `json:"busy"`
		} `json:"disks"`
		Interfaces map[string]struct {
			LinkState     string  `json:"link_state"`
			ReceivedBytes float64 `json:"received_bytes_rate"`
			SentBytes     float64 `json:"sent_bytes_rate"`
		} `json:"interfaces"`
	}
	if json.Unmarshal(fields, &rt) != nil { return }

	// Copy by value so we never mutate the cached pointer
	var fresh TrueNASPanelData
	if p := tnGetCached(integrationID); p != nil {
		fresh = *p
	}

	// CPU — aggregate entry is keyed as "cpu" inside the cpu object
	if agg, ok := rt.CPU["cpu"]; ok {
		fresh.CPUPercent = agg.Usage
		if agg.Temp != nil {
			fresh.CPUTempC = *agg.Temp
		}
	}

	// RAM
	if rt.Memory.PhysicalTotal > 0 {
		totalGB := float64(rt.Memory.PhysicalTotal) / 1073741824
		availGB := float64(rt.Memory.PhysicalAvailable) / 1073741824
		usedGB := totalGB - availGB
		fresh.RAMTotalGB = totalGB
		fresh.RAMUsedGB = usedGB
		fresh.RAMPercent = usedGB / totalGB * 100
	}

	// ARC
	if rt.Memory.ARCSize > 0 {
		fresh.ARCUsedGB = float64(rt.Memory.ARCSize) / 1073741824
	}

	// Disk I/O
	fresh.DiskReadMBs = rt.Disks.ReadBytes / 1048576
	fresh.DiskWriteMBs = rt.Disks.WriteBytes / 1048576
	fresh.DiskBusy = rt.Disks.Busy

	// Network interfaces
	var ifaces []TrueNASIface
	for name, iface := range rt.Interfaces {
		ifaces = append(ifaces, TrueNASIface{
			Name:   name,
			RxMBs:  iface.ReceivedBytes / 1048576,
			TxMBs:  iface.SentBytes / 1048576,
			LinkUp: iface.LinkState == "LINK_STATE_UP",
		})
	}
	fresh.NetInterfaces = ifaces

	cacheSet(integrationID, &fresh)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func tnGetCached(integrationID string) *TrueNASPanelData {
	if cached, ok := cacheGet(integrationID); ok {
		if d, ok := cached.(*TrueNASPanelData); ok {
			return d
		}
	}
	return &TrueNASPanelData{}
}

func toWebSocketURL(apiURL string) (string, error) {
	u, err := url.Parse(strings.TrimRight(apiURL, "/"))
	if err != nil {
		return "", err
	}
	switch u.Scheme {
	case "https":
		u.Scheme = "wss"
	case "http":
		u.Scheme = "ws"
	default:
		u.Scheme = "wss"
	}
	return u.String(), nil
}
