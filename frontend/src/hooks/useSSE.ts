import { useEffect, useRef, useState } from 'react'

// ── SSE singleton ─────────────────────────────────────────────────────────────
// One EventSource connection per browser tab, shared across all panels.

type SSEListener = (data: unknown) => void
export type SSEStatus = 'connected' | 'reconnecting' | 'offline'

interface SSEManager {
  subscribe: (integrationId: string, cb: SSEListener) => () => void
  subscribeChat: (cb: (data: unknown) => void) => () => void
  subscribeTyping: (cb: (data: unknown) => void) => () => void
  subscribeStatus: (cb: (status: SSEStatus) => void) => () => void
  getStatus: () => SSEStatus
  forceReconnect: () => void
}

let manager: SSEManager | null = null

function getSSEManager(): SSEManager {
  if (manager) return manager

  const listeners     = new Map<string, Set<SSEListener>>()
  const chatListeners = new Set<(data: unknown) => void>()
  const typingListeners = new Set<(data: unknown) => void>()
  const statusListeners = new Set<(s: SSEStatus) => void>()

  let status: SSEStatus = 'offline'
  let es: EventSource | null = null
  let lastPingAt: number = Date.now()
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let deadTimer: ReturnType<typeof setInterval> | null = null
  let reconnectCount = 0

  function setStatus(s: SSEStatus) {
    if (status === s) return
    status = s
    statusListeners.forEach(cb => cb(s))
  }

  function scheduleReconnect(delayMs: number) {
    if (reconnectTimer) return // already scheduled
    reconnectCount++
    console.log(`[SSE] scheduling reconnect #${reconnectCount} in ${delayMs}ms`)
    setStatus('reconnecting')
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delayMs)
  }

  // Exponential backoff: 5s → 10s → 20s → 40s → 60s (cap)
  function backoffDelay(): number {
    return Math.min(5000 * Math.pow(2, reconnectCount), 60000)
  }

  function connect() {
    const token = localStorage.getItem('stoa_token')
    if (!token) {
      console.log('[SSE] no token, not connecting')
      setStatus('offline')
      return
    }

    console.log(`[SSE] connecting (attempt #${reconnectCount + 1})`)
    es?.close()
    es = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`)

    es.addEventListener('connected', (e: MessageEvent) => {
      console.log('[SSE] connected', e.data)
      lastPingAt = Date.now()
      reconnectCount = 0 // reset backoff on successful connection
      setStatus('connected')
    })

    es.addEventListener('ping', (_e: MessageEvent) => {
      lastPingAt = Date.now()
    })

    es.addEventListener('cache-update', (e: MessageEvent) => {
      try {
        const { integrationId, data } = JSON.parse(e.data)
        listeners.get(integrationId)?.forEach(cb => cb(data))
      } catch {
        console.warn('[SSE] malformed cache-update event')
      }
    })

    es.addEventListener('chat', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        chatListeners.forEach(cb => cb(data))
      } catch {
        console.warn('[SSE] malformed chat event')
      }
    })

    es.addEventListener('typing', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        typingListeners.forEach(cb => cb(data))
      } catch {}
    })

    es.onerror = (e) => {
      console.warn('[SSE] onerror fired, readyState=', es?.readyState, e)
      es?.close()
      es = null
      scheduleReconnect(backoffDelay())
    }

    // Dead connection detector — if no ping in 60s, force reconnect
    if (deadTimer) clearInterval(deadTimer)
    deadTimer = setInterval(() => {
      const silentMs = Date.now() - lastPingAt
      if (silentMs > 60000 && status !== 'offline') {
        console.warn(`[SSE] no ping in ${Math.round(silentMs/1000)}s — forcing reconnect`)
        es?.close()
        es = null
        reconnectCount = 0 // dead-detector reconnects are not backoff-eligible
        scheduleReconnect(1000)
      }
    }, 15000) // check every 15s
  }

  connect()

  manager = {
    subscribe(integrationId, cb) {
      if (!listeners.has(integrationId)) listeners.set(integrationId, new Set())
      listeners.get(integrationId)!.add(cb)
      return () => listeners.get(integrationId)?.delete(cb)
    },
    subscribeChat(cb) {
      chatListeners.add(cb)
      return () => { chatListeners.delete(cb) }
    },
    subscribeTyping(cb) {
      typingListeners.add(cb)
      return () => { typingListeners.delete(cb) }
    },
    subscribeStatus(cb) {
      statusListeners.add(cb)
      return () => { statusListeners.delete(cb) }
    },
    getStatus: () => status,
    forceReconnect() {
      reconnectCount = 0
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      es?.close()
      es = null
      connect()
    },
  }

  return manager
}

// ── reconnectSSE ──────────────────────────────────────────────────────────────
// Call after login (new token) or logout (token removed) to immediately update
// the connection state without waiting for the dead-detector or backoff timer.
export function reconnectSSE() {
  getSSEManager().forceReconnect()
}

// ── useSSE ────────────────────────────────────────────────────────────────────
export function useSSE<T>(integrationId: string | undefined): T | null {
  const [data, setData] = useState<T | null>(null)
  const cbRef = useRef<SSEListener>()

  useEffect(() => {
    if (!integrationId) return
    const mgr = getSSEManager()
    cbRef.current = (d) => setData(d as T)
    return mgr.subscribe(integrationId, cbRef.current)
  }, [integrationId])

  return data
}

// ── useSSEStatus ──────────────────────────────────────────────────────────────
export function useSSEStatus(): SSEStatus {
  const [status, setStatus] = useState<SSEStatus>(() => getSSEManager().getStatus())
  useEffect(() => {
    const mgr = getSSEManager()
    setStatus(mgr.getStatus())
    return mgr.subscribeStatus(setStatus)
  }, [])
  return status
}

// ── useSSEConnected (legacy) ──────────────────────────────────────────────────
export function useSSEConnected(): boolean {
  return useSSEStatus() === 'connected'
}

// ── useTypingSSE ──────────────────────────────────────────────────────────────
export function useTypingSSE(cb: (ev: unknown) => void) {
  const cbRef = useRef(cb)
  cbRef.current = cb
  useEffect(() => {
    const mgr = getSSEManager()
    return mgr.subscribeTyping((data) => cbRef.current(data))
  }, [])
}

// ── useChatSSE ────────────────────────────────────────────────────────────────
export function useChatSSE(cb: (msg: unknown) => void) {
  const cbRef = useRef(cb)
  cbRef.current = cb
  useEffect(() => {
    const mgr = getSSEManager()
    return mgr.subscribeChat((data) => cbRef.current(data))
  }, [])
}
