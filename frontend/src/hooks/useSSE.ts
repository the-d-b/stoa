import { useEffect, useRef, useState } from 'react'

// ── SSE singleton ─────────────────────────────────────────────────────────────
// One EventSource connection per browser tab, shared across all panels.
// Panels subscribe by integrationId and receive updates when cache changes.

type SSEListener = (data: unknown) => void

interface SSEManager {
  subscribe: (integrationId: string, cb: SSEListener) => () => void
  subscribeChat: (cb: (data: unknown) => void) => () => void
  isConnected: () => boolean
}

let manager: SSEManager | null = null

function getSSEManager(): SSEManager {
  if (manager) return manager

  const listeners = new Map<string, Set<SSEListener>>()
  let connected = false
  let es: EventSource | null = null

  const chatListeners = new Set<(data: unknown) => void>()

  function connect() {
    const token = localStorage.getItem('stoa_token')
    if (!token) return

    es = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`)

    es.addEventListener('connected', () => {
      connected = true
    })

    es.addEventListener('cache-update', (e: MessageEvent) => {
      try {
        const { integrationId, data } = JSON.parse(e.data)
        const cbs = listeners.get(integrationId)
        if (cbs) cbs.forEach(cb => cb(data))
      } catch {
        // malformed event — ignore
      }
    })

    es.addEventListener('chat', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        chatListeners.forEach(cb => cb(data))
      } catch {}
    })

    es.onerror = () => {
      connected = false
      es?.close()
      setTimeout(connect, 5000)
    }
  }

  connect()

  manager = {
    subscribe(integrationId: string, cb: SSEListener) {
      if (!listeners.has(integrationId)) {
        listeners.set(integrationId, new Set())
      }
      listeners.get(integrationId)!.add(cb)
      return () => {
        listeners.get(integrationId)?.delete(cb)
      }
    },
    subscribeChat(cb: (data: unknown) => void) {
      chatListeners.add(cb)
      return () => chatListeners.delete(cb)
    },
    isConnected: () => connected,
  }

  return manager
}

// ── useSSE hook ───────────────────────────────────────────────────────────────
// Drop-in replacement for polling. Returns latest cached data for an integration.
// Falls back to null until first push arrives (panel uses its own initial load).

export function useSSE<T>(integrationId: string | undefined): T | null {
  const [data, setData] = useState<T | null>(null)
  const cbRef = useRef<SSEListener>()

  useEffect(() => {
    if (!integrationId) return
    const mgr = getSSEManager()
    cbRef.current = (d) => setData(d as T)
    const unsub = mgr.subscribe(integrationId, cbRef.current)
    return unsub
  }, [integrationId])

  return data
}

// ── SSE connection status ─────────────────────────────────────────────────────
export function useSSEConnected(): boolean {
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    const interval = setInterval(() => {
      setConnected(getSSEManager().isConnected())
    }, 2000)
    return () => clearInterval(interval)
  }, [])
  return connected
}

// ── useChatSSE hook ───────────────────────────────────────────────────────────
// Calls cb whenever a chat message arrives via SSE
export function useChatSSE(cb: (msg: unknown) => void) {
  const cbRef = useRef(cb)
  cbRef.current = cb
  useEffect(() => {
    const mgr = getSSEManager()
    return mgr.subscribeChat((data) => cbRef.current(data))
  }, [])
}
