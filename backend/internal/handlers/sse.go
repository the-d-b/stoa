package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/the-d-b/stoa/internal/auth"
)

// ── SSE Broadcaster ───────────────────────────────────────────────────────────
// One SSE connection per browser tab, multiplexed across all integrations.
// Panels subscribe client-side by integrationId — one connection serves all.

type sseClient struct {
	ch     chan sseEvent
	userID string
}

type sseEvent struct {
	IntegrationID string
	Event         string // custom event name (e.g. "chat"), empty = "cache-update"
	Data          interface{}
	RawData       string // pre-serialized JSON, used when Event is set
}

var (
	sseMu      sync.RWMutex
	sseClients = map[string]*sseClient{}
)

// SSEBroadcast pushes a cache update to all connected SSE clients.
// Called from cacheSet whenever panel data is refreshed.
func SSEBroadcast(integrationID string, data interface{}) {
	sseMu.RLock()
	defer sseMu.RUnlock()
	for _, c := range sseClients {
		select {
		case c.ch <- sseEvent{IntegrationID: integrationID, Data: data}:
		default:
			// Client channel full — skip rather than block
		}
	}
}

// SSEHandler streams cache update events to a browser tab.
// Auth: reads JWT from Authorization header or ?token= query param
// (EventSource API cannot set custom headers, so query param is the fallback).
func SSEHandler(db *sql.DB, authSvc *auth.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// ── Auth ──────────────────────────────────────────────────────────
		tokenStr := ""
		if h := r.Header.Get("Authorization"); h != "" {
			tokenStr = h[len("Bearer "):]
		}
		if tokenStr == "" {
			tokenStr = r.URL.Query().Get("token")
		}
		if tokenStr == "" {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		claims, err := authSvc.ValidateToken(tokenStr)
		if err != nil {
			http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
			return
		}

		// ── SSE headers ───────────────────────────────────────────────────
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no") // disable nginx/NPM buffering

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming not supported", http.StatusInternalServerError)
			return
		}

		// ── Register client ───────────────────────────────────────────────
		clientID := fmt.Sprintf("%s-%d", claims.UserID, time.Now().UnixNano())
		client := &sseClient{
			ch:     make(chan sseEvent, 64),
			userID: claims.UserID,
		}
		sseMu.Lock()
		sseClients[clientID] = client
		sseMu.Unlock()

		sseMu.RLock()
		clientCount := len(sseClients)
		sseMu.RUnlock()
		log.Printf("[SSE] connect  user=%s client=%s total=%d ip=%s",
			claims.Username, clientID, clientCount, r.RemoteAddr)

		// Track presence and update last_seen
		MarkUserOnline(claims.UserID)
		go UpdateLastSeen(db, claims.UserID)

		// Register chat broadcast listener for this client
		unregisterChat := RegisterChatListener(func(msg ChatMessage) {
			b, _ := json.Marshal(msg)
			select {
			case client.ch <- sseEvent{Event: "chat", RawData: string(b)}:
			default:
			}
		})

		// Notify worker manager — spins up workers if this is the first client
		if GlobalWorkerManager != nil {
			GlobalWorkerManager.ClientConnected()
		}

		defer func() {
			unregisterChat()
			sseMu.Lock()
			delete(sseClients, clientID)
			remainingClients := len(sseClients)
			sseMu.Unlock()
			log.Printf("[SSE] disconnect user=%s client=%s remaining=%d",
				claims.Username, clientID, remainingClients)
			MarkUserOffline(claims.UserID)
			go UpdateLastSeen(db, claims.UserID)
			// Notify worker manager — may spin down workers after grace period
			if GlobalWorkerManager != nil {
				GlobalWorkerManager.ClientDisconnected()
			}
		}()

		// ── Initial connected event ───────────────────────────────────────
		fmt.Fprintf(w, "event: connected\ndata: {\"clientId\":\"%s\"}\n\n", clientID)
		flusher.Flush()

		// ── Drain current cache and send all known integration states ─────
		// This ensures the browser gets current data immediately on connect
		// rather than waiting for the next cache update
		func() {
			panelCacheMu.RLock()
			defer panelCacheMu.RUnlock()
			for integrationID, entry := range panelCache {
				data, err := json.Marshal(map[string]interface{}{
					"integrationId": integrationID,
					"data":          entry.data,
				})
				if err != nil {
					continue
				}
				fmt.Fprintf(w, "event: cache-update\ndata: %s\n\n", string(data))
			}
		}()
		flusher.Flush()

		// ── Heartbeat — keeps connection alive through proxies ──────────────
		// Named 'ping' event so client can detect dead connections
		heartbeat := time.NewTicker(25 * time.Second)
		defer heartbeat.Stop()

		// ── Event loop ────────────────────────────────────────────────────
		for {
			select {
			case <-r.Context().Done():
				log.Printf("[SSE] context done user=%s client=%s", claims.Username, clientID)
				return
			case <-heartbeat.C:
				// Named ping event — client uses this to detect dead connections
				fmt.Fprintf(w, "event: ping\ndata: {\"t\":%d}\n\n", time.Now().Unix())
				flusher.Flush()
			case evt := <-client.ch:
				if evt.Event != "" {
					// Custom event (e.g. chat)
					fmt.Fprintf(w, "event: %s\ndata: %s\n\n", evt.Event, evt.RawData)
				} else {
					data, err := json.Marshal(map[string]interface{}{
						"integrationId": evt.IntegrationID,
						"data":          evt.Data,
					})
					if err != nil {
						continue
					}
					fmt.Fprintf(w, "event: cache-update\ndata: %s\n\n", string(data))
				}
				flusher.Flush()
			}
		}
	}
}
