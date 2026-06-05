import { useEffect, useState, useCallback, useRef } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface ABSItem {
  id: string
  mediaType: string
  title: string
  author: string
  currentTime: number
  duration: number
  progress: number
  trackFile: string
  trackLocalTime: number
}

interface ABSData {
  uiUrl: string
  integrationId: string
  bookCount: number
  podcastCount: number
  totalListeningTime: number
  itemsFinished: number
  inProgress: ABSItem[]
}

function fmtTime(secs: number) {
  if (!secs || isNaN(secs)) return '0:00'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtHours(secs: number) {
  if (!secs) return '0h'
  const h = Math.round(secs / 3600)
  return `${h.toLocaleString()}h`
}

// ── Authenticated image (cover art) ──────────────────────────────────────────

function AuthCover({ src, title }: { src: string; title: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!src) return
    let cancelled = false
    const token = localStorage.getItem('stoa_token')
    fetch(src, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => { if (!r.ok) throw new Error(''); return r.blob() })
      .then(blob => {
        if (cancelled) return
        const u = URL.createObjectURL(blob)
        urlRef.current = u
        setObjectUrl(u)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
    }
  }, [src])

  if (!objectUrl) return (
    <div style={{ width: '100%', height: '100%', background: 'var(--surface2)',
      borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 24 }}>🎧</span>
    </div>
  )
  return (
    <img src={objectUrl} alt={title}
      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6, display: 'block' }} />
  )
}

// ── Mini player ───────────────────────────────────────────────────────────────

function MiniPlayer({ item, integrationId, uiUrl }: {
  item: ABSItem; integrationId: string; uiUrl: string
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(item.trackLocalTime)
  const [duration, setDuration] = useState(0)
  const [seeking, setSeeking] = useState(false)
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const token = localStorage.getItem('stoa_token') ?? ''

  const streamUrl = `/api/abs/${integrationId}/stream/${item.id}` +
    (item.trackFile ? `?track=${encodeURIComponent(item.trackFile)}` : '')

  // Progress sync back to ABS
  const syncProgress = useCallback(async (time: number) => {
    if (!item.duration) return
    const globalTime = (item.currentTime - item.trackLocalTime) + time
    const progress = Math.min(1, globalTime / item.duration)
    try {
      await fetch(`/api/abs/${integrationId}/progress/${item.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ currentTime: globalTime, duration: item.duration, progress }),
      })
    } catch {}
  }, [integrationId, item, token])

  useEffect(() => {
    const audio = new Audio()
    audioRef.current = audio

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration)
      // Seek to resume position within this track
      if (item.trackLocalTime > 0 && item.trackLocalTime < audio.duration) {
        audio.currentTime = item.trackLocalTime
        setCurrentTime(item.trackLocalTime)
      }
    })
    audio.addEventListener('timeupdate', () => {
      if (!seeking) setCurrentTime(audio.currentTime)
    })
    audio.addEventListener('play',  () => setPlaying(true))
    audio.addEventListener('pause', () => setPlaying(false))
    audio.addEventListener('ended', () => { setPlaying(false); syncProgress(audio.duration) })

    // Set src via XHR blob to include auth header (audio element can't set headers natively)
    const ctrl = new AbortController()
    fetch(streamUrl, {
      headers: token ? { Authorization: `Bearer ${token}`, Range: 'bytes=0-' } : {},
      signal: ctrl.signal,
    })
      .then(r => { if (!r.ok) throw new Error(''); return r.blob() })
      .then(blob => {
        if (ctrl.signal.aborted) return
        audio.src = URL.createObjectURL(blob)
      })
      .catch(() => {
        // Fallback: try with token in query param (ABS supports ?token=)
        if (!ctrl.signal.aborted) {
          audio.src = streamUrl + (streamUrl.includes('?') ? '&' : '?') + `token=${token}`
        }
      })

    return () => {
      ctrl.abort()
      audio.pause()
      if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src)
      audio.src = ''
    }
  }, [item.id, item.trackFile]) // eslint-disable-line react-hooks/exhaustive-deps

  // Periodic progress sync every 30s while playing
  useEffect(() => {
    if (!playing) {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current)
      return
    }
    syncTimerRef.current = setInterval(() => {
      if (audioRef.current) syncProgress(audioRef.current.currentTime)
    }, 30000)
    return () => { if (syncTimerRef.current) clearInterval(syncTimerRef.current) }
  }, [playing, syncProgress])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) { audio.pause(); syncProgress(audio.currentTime) }
    else audio.play().catch(() => {})
  }

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value)
    setCurrentTime(t)
    if (audioRef.current) audioRef.current.currentTime = t
  }

  const coverUrl = `/api/abs/${integrationId}/cover/${item.id}`
  const itemUrl = uiUrl ? `${uiUrl}/item/${item.id}` : undefined

  const skip = (secs: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Math.max(0, Math.min(audio.currentTime + secs, audio.duration || 0))
  }

  return (
    <div style={{ display: 'flex', gap: 10, padding: '8px 0', flexShrink: 0 }}>
      {/* Cover */}
      <div style={{ flexShrink: 0, width: 64, height: 64 }}>
        {itemUrl
          ? <a href={itemUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: '100%', height: '100%' }}>
              <AuthCover src={coverUrl} title={item.title} />
            </a>
          : <AuthCover src={coverUrl} title={item.title} />}
      </div>

      {/* Controls */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {itemUrl
              ? <a href={itemUrl} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'inherit', textDecoration: 'none' }}>{item.title}</a>
              : item.title}
          </div>
          {item.author && (
            <div style={{ fontSize: 10, color: 'var(--text-dim)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.author}
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div>
          <input type="range" min={0} max={duration || 1} step={1}
            value={currentTime}
            onMouseDown={() => setSeeking(true)}
            onMouseUp={() => setSeeking(false)}
            onChange={seek}
            style={{ width: '100%', height: 3, accentColor: 'var(--accent)', cursor: 'pointer' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between',
            fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', marginTop: 1 }}>
            <span>{fmtTime(currentTime)}</span>
            <span>{fmtTime(duration || item.duration)}</span>
          </div>
        </div>

        {/* Playback buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => skip(-30)}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-dim)', fontSize: 11, padding: '2px 4px', borderRadius: 4 }}
            title="Back 30s">⟨30</button>
          <button onClick={togglePlay}
            style={{
              background: 'var(--accent)', border: 'none', cursor: 'pointer',
              color: '#fff', width: 28, height: 28, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, flexShrink: 0,
            }}>
            {playing ? '⏸' : '▶'}
          </button>
          <button onClick={() => skip(30)}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-dim)', fontSize: 11, padding: '2px 4px', borderRadius: 4 }}
            title="Forward 30s">30⟩</button>
        </div>
      </div>
    </div>
  )
}

// ── Item row (queue) ──────────────────────────────────────────────────────────

function ItemRow({ item, integrationId, uiUrl, active, onSelect }: {
  item: ABSItem; integrationId: string; uiUrl: string; active: boolean
  onSelect: () => void
}) {
  const pct = Math.round(item.progress * 100)
  const icon = item.mediaType === 'podcast' ? '🎙️' : '🎧'
  const coverUrl = `/api/abs/${integrationId}/cover/${item.id}`
  const itemUrl = uiUrl ? `${uiUrl}/item/${item.id}` : undefined

  return (
    <div onClick={onSelect} style={{
      display: 'flex', gap: 8, padding: '5px 0',
      borderBottom: '1px solid var(--border)', cursor: 'pointer',
      opacity: active ? 1 : 0.8,
    }}>
      <div style={{ flexShrink: 0, width: 36, height: 36, position: 'relative' }}>
        <AuthCover src={coverUrl} title={item.title} />
        {active && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: 'var(--accent)', fontSize: 12 }}>▶</span>
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: active ? 600 : 500, color: active ? 'var(--accent)' : 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ marginRight: 4 }}>{icon}</span>
          {itemUrl
            ? <a href={itemUrl} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ color: 'inherit', textDecoration: 'none' }}>{item.title}</a>
            : item.title}
        </div>
        {item.author && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.author}
          </div>
        )}
        {/* Progress bar */}
        <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, marginTop: 3 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 1 }} />
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 1,
          fontFamily: 'DM Mono, monospace' }}>
          {pct}% · {fmtTime(item.currentTime)} / {fmtTime(item.duration)}
        </div>
      </div>
    </div>
  )
}

// ── Stats row ─────────────────────────────────────────────────────────────────

function StatsRow({ data }: { data: ABSData }) {
  return (
    <div style={{ display: 'flex', gap: 14, fontSize: 12, flexShrink: 0, flexWrap: 'wrap' }}>
      {data.bookCount > 0 && (
        <span style={{ color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>{data.bookCount.toLocaleString()}</strong> books
        </span>
      )}
      {data.podcastCount > 0 && (
        <span style={{ color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>{data.podcastCount.toLocaleString()}</strong> podcasts
        </span>
      )}
      {data.itemsFinished > 0 && (
        <span style={{ color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--green)' }}>{data.itemsFinished}</strong> finished
        </span>
      )}
      {data.totalListeningTime > 0 && (
        <span style={{ color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>{fmtHours(data.totalListeningTime)}</strong> listened
        </span>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function AudiobookshelfPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<ABSData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeIdx, setActiveIdx] = useState(0)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setData(res.data); setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  const sseData = useSSE<ABSData>(integrationId)
  useEffect(() => { if (sseData !== null) setData(sseData) }, [sseData])
  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)   return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 16, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data)   return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const integId = data.integrationId
  const inProgress = data.inProgress ?? []
  const activeItem = inProgress[Math.min(activeIdx, inProgress.length - 1)]

  // ── 1x — stats inline ─────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 12,
      height: '100%', overflow: 'hidden' }}>
      <span style={{ fontSize: 18 }}>🎧</span>
      <StatsRow data={data} />
    </div>
  )

  // ── 2x-3x — stats + in-progress list ──────────────────────────────────────
  if (heightUnits <= 3) return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      <StatsRow data={data} />
      {inProgress.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Nothing in progress</div>
      )}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {inProgress.map((item, i) => (
          <ItemRow key={item.id} item={item} integrationId={integId} uiUrl={uiUrl}
            active={i === activeIdx} onSelect={() => setActiveIdx(i)} />
        ))}
      </div>
    </div>
  )

  // ── 4x+ — mini player + queue ─────────────────────────────────────────────
  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      <StatsRow data={data} />

      {activeItem ? (
        <MiniPlayer
          key={activeItem.id + activeItem.trackFile}
          item={activeItem}
          integrationId={integId}
          uiUrl={uiUrl}
        />
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>Nothing in progress</div>
      )}

      {inProgress.length > 1 && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>
            Continue listening
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {inProgress.map((item, i) => (
              <ItemRow key={item.id} item={item} integrationId={integId} uiUrl={uiUrl}
                active={i === activeIdx} onSelect={() => setActiveIdx(i)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
