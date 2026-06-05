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
	"time"

	"github.com/gorilla/websocket"
)

// ── UniFi WebSocket worker ────────────────────────────────────────────────────
// Maintains a persistent WebSocket connection to the UniFi event stream.
// Real-time events (client connects/disconnects, device state changes) are
// appended to the cached panel data immediately. A configurable REST ticker
// keeps device stats and client lists fresh.

func StartUniFiWorker(db *sql.DB, ig integrationMeta, stop <-chan struct{}) {
	go func() {
		backoff := 10 * time.Second
		for {
			select {
			case <-stop:
				return
			default:
			}
			err := runUniFiWorker(db, ig, stop)
			if err != nil {
				log.Printf("[UNIFI] worker error: %v — reconnecting in %s", err, backoff)
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

type unifiWSEnvelope struct {
	Meta struct {
		Message string `json:"message"`
	} `json:"meta"`
	Data json.RawMessage `json:"data"`
}

func runUniFiWorker(db *sql.DB, ig integrationMeta, stop <-chan struct{}) error {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, ig.id)
	if err != nil {
		return fmt.Errorf("resolve: %w", err)
	}

	sess, err := unifiLogin(apiURL, apiKey, skipTLS)
	if err != nil {
		return fmt.Errorf("auth: %w", err)
	}
	unifiSessionsMu.Lock()
	unifiSessions[ig.id] = sess
	unifiSessionsMu.Unlock()

	// Initial full REST fetch
	data, err := unifiFullFetch(sess, uiURL, ig.id)
	if err != nil {
		return fmt.Errorf("initial fetch: %w", err)
	}
	cacheSet(ig.id, data)
	ClearIntegrationError(ig.id, ig.name)
	log.Printf("[UNIFI] initial data cached for %s (%d devices, %d clients)", ig.id, data.TotalDevices, data.TotalClients)

	// Open WebSocket for real-time events (best-effort)
	wsConn, wsErr := unifiDialWS(sess, skipTLS)
	wsMsgCh := make(chan []byte, 64)
	wsErrCh := make(chan error, 1)

	if wsErr == nil {
		log.Printf("[UNIFI] WebSocket connected for %s", ig.id)
		go func() {
			defer func() {
				if r := recover(); r != nil {
					wsErrCh <- fmt.Errorf("ws panic: %v", r)
				}
			}()
			for {
				_, msg, err := wsConn.ReadMessage()
				if err != nil {
					wsErrCh <- err
					return
				}
				wsMsgCh <- msg
			}
		}()
	} else {
		log.Printf("[UNIFI] WebSocket unavailable for %s (%v) — REST-only mode", ig.id, wsErr)
	}

	restInterval := time.Duration(ig.refreshSecs) * time.Second
	restTicker := time.NewTicker(restInterval)
	defer restTicker.Stop()

	pingTicker := time.NewTicker(30 * time.Second)
	defer pingTicker.Stop()

	if wsConn != nil {
		defer wsConn.Close()
	}

	for {
		select {
		case <-stop:
			return nil

		case err := <-wsErrCh:
			// WS dropped — return to trigger full reconnect
			return fmt.Errorf("websocket: %w", err)

		case raw := <-wsMsgCh:
			unifiHandleWSMessage(ig.id, raw)

		case <-pingTicker.C:
			if wsConn != nil {
				wsConn.WriteMessage(websocket.PingMessage, nil) //nolint:errcheck
			}

		case <-restTicker.C:
			// Refresh session if near expiry (session auth only)
			if !sess.isAPIKey && time.Now().After(sess.expiresAt.Add(-5*time.Minute)) {
				newSess, err := unifiLogin(apiURL, apiKey, skipTLS)
				if err != nil {
					log.Printf("[UNIFI] session refresh failed for %s: %v", ig.id, err)
				} else {
					sess = newSess
					unifiSessionsMu.Lock()
					unifiSessions[ig.id] = sess
					unifiSessionsMu.Unlock()
				}
			}
			fresh, err := unifiFullFetch(sess, uiURL, ig.id)
			if err != nil {
				log.Printf("[UNIFI] REST refresh error for %s: %v", ig.id, err)
				RecordIntegrationError(ig.id, ig.name, err.Error())
				if unifiIsAuthErr(err) {
					unifiInvalidateSession(ig.id)
					return fmt.Errorf("auth expired: %w", err)
				}
			} else {
				cacheSet(ig.id, fresh)
				ClearIntegrationError(ig.id, ig.name)
			}
		}
	}
}

func unifiFullFetch(sess *unifiSession, uiURL, integrationID string) (*UniFiPanelData, error) {
	devices, err := uniFiFetchDevices(sess)
	if err != nil {
		return nil, err
	}
	clients, _ := uniFiFetchClients(sess)

	// Preserve cached events when live event fetch fails (events are non-critical)
	var events []UniFiEvent
	if freshEvents, err := uniFiFetchEvents(sess); err == nil {
		events = freshEvents
	} else if prev := unifiGetCached(integrationID); len(prev.Events) > 0 {
		events = prev.Events
	}

	// Cache site name after first successful fetch
	siteName := ""
	if prev := unifiGetCached(integrationID); prev.SiteName != "" {
		siteName = prev.SiteName
	} else {
		siteName = uniFiFetchSiteName(sess)
	}

	return uniFiBuildPanelData(devices, clients, events, siteName, uiURL, integrationID), nil
}

func unifiHandleWSMessage(integrationID string, raw []byte) {
	var env unifiWSEnvelope
	if err := json.Unmarshal(raw, &env); err != nil {
		return
	}
	if env.Meta.Message != "events" {
		return
	}

	var rawEvents []struct {
		Key       string `json:"key"`
		Subsystem string `json:"subsystem"`
		Msg       string `json:"msg"`
		Time      int64  `json:"time"`
	}
	if err := json.Unmarshal(env.Data, &rawEvents); err != nil || len(rawEvents) == 0 {
		return
	}

	prev := unifiGetCached(integrationID)
	if prev.IntegrationID == "" {
		return
	}
	fresh := *prev // copy by value to avoid mutating cached pointer

	for _, re := range rawEvents {
		msg := re.Msg
		if len(msg) > 120 {
			msg = msg[:120] + "…"
		}
		evt := UniFiEvent{
			Key:       re.Key,
			Subsystem: re.Subsystem,
			Message:   msg,
			Time:      re.Time,
		}
		fresh.Events = append([]UniFiEvent{evt}, fresh.Events...)
	}
	if len(fresh.Events) > 30 {
		fresh.Events = fresh.Events[:30]
	}
	cacheSet(integrationID, &fresh)
}

func unifiDialWS(sess *unifiSession, skipTLS bool) (*websocket.Conn, error) {
	tlsCfg := &tls.Config{Renegotiation: tls.RenegotiateOnceAsClient}
	if skipTLS {
		tlsCfg.InsecureSkipVerify = true //nolint:gosec
	}

	header := http.Header{
		"User-Agent": []string{"Stoa/1.0"},
	}
	for k, v := range sess.headers {
		header.Set(k, v)
	}

	// Attach session cookies for cookie-based auth
	if !sess.isAPIKey && sess.client.Jar != nil {
		// Parse a URL from apiBase to look up cookies
		if u, err := url.Parse(sess.apiBase); err == nil {
			// Use just scheme+host for cookie lookup
			cookieURL := &url.URL{Scheme: u.Scheme, Host: u.Host}
			cookies := sess.client.Jar.Cookies(cookieURL)
			if len(cookies) > 0 {
				cookieParts := make([]string, 0, len(cookies))
				for _, c := range cookies {
					cookieParts = append(cookieParts, c.Name+"="+c.Value)
				}
				header.Set("Cookie", strings.Join(cookieParts, "; "))
			}
		}
	}

	wsURL := sess.wsBase + "/events"
	dialer := websocket.Dialer{
		HandshakeTimeout: 15 * time.Second,
		TLSClientConfig:  tlsCfg,
	}

	conn, _, err := dialer.Dial(wsURL, header)
	if err != nil {
		return nil, err
	}
	conn.SetReadLimit(1 << 20)
	return conn, nil
}

func unifiIsAuthErr(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "401") || strings.Contains(s, "403") || strings.Contains(s, "auth error")
}
