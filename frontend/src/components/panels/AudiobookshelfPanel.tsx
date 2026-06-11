import { useEffect, useState, useCallback, useRef } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface ABSTrack {
  index: number       // 1-based, used in /public/session/{id}/track/N
  startOffset: number // seconds from start of book
  duration: number
}

interface ABSItem {
  id: string
  mediaType: string
  title: string
  author: string
  currentTime: number
  duration: number
  progress: number
  episodeId: string   // non-empty for podcast items
  hasAudio: boolean   // false for ebooks
  tracks: ABSTrack[]  // non-empty for multi-track audiobooks
}

interface ABSLibrary {
  id: string
  name: string
  mediaType: string
  itemCount: number
}

interface ABSData {
  uiUrl: string
  integrationId: string
  libraries: ABSLibrary[]
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

// ── Track helpers (multi-track audiobooks) ────────────────────────────────────

function trackForTime(tracks: ABSTrack[], globalTime: number): { track: ABSTrack; localTime: number } | null {
  if (!tracks || tracks.length === 0) return null
  for (const t of tracks) {
    if (globalTime <= t.startOffset + t.duration) {
      return { track: t, localTime: Math.max(0, globalTime - t.startOffset) }
    }
  }
  const last = tracks[tracks.length - 1]
  return { track: last, localTime: last.duration }
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
  const [currentTime, setCurrentTime] = useState(item.currentTime)
  const [duration, setDuration] = useState(item.duration || 0)
  const [seeking, setSeeking] = useState(false)
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const trackOffsetRef = useRef<number>(0)      // global startOffset of the currently streaming track
  const currentTrackRef = useRef<ABSTrack | null>(null) // which track is loaded right now
  const seekToRef = useRef<number>(0)           // local seek target for next loadedmetadata; 0 = start of track
  const token = localStorage.getItem('stoa_token') ?? ''

  // Progress sync back to ABS — always sends the GLOBAL position
  const syncProgress = useCallback(async (localTime: number) => {
    if (!item.duration) return
    const globalTime = trackOffsetRef.current + localTime
    const progress = Math.min(1, globalTime / item.duration)
    try {
      await fetch(`/api/abs/${integrationId}/progress/${item.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          currentTime: globalTime,
          duration: item.duration,
          progress,
          episodeId: item.episodeId || '',
        }),
      })
    } catch {}
  }, [integrationId, item, token])

  // Load a specific track into the audio element and optionally auto-play.
  const loadTrack = useCallback((audio: HTMLAudioElement, track: ABSTrack, seekTo: number, autoPlay: boolean) => {
    trackOffsetRef.current = track.startOffset
    currentTrackRef.current = track
    seekToRef.current = seekTo
    const params = new URLSearchParams({ token })
    if (item.episodeId) params.set('episode', item.episodeId)
    if (track.index > 1) params.set('track', String(track.index))
    audio.src = `/api/abs/${integrationId}/stream/${item.id}?${params}`
    if (autoPlay) audio.play().catch(() => {})
  }, [integrationId, item.id, item.episodeId, token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const audio = new Audio()
    audioRef.current = audio

    // For multi-track audiobooks, find the right track and local seek offset.
    // Podcasts and single-track books have no tracks array.
    const info = item.tracks?.length && item.currentTime > 0
      ? trackForTime(item.tracks, item.currentTime)
      : null
    const initialTrack: ABSTrack = info?.track ?? { index: 1, startOffset: 0, duration: item.duration || 0 }
    const initialSeek = info?.localTime ?? item.currentTime

    audio.addEventListener('loadedmetadata', () => {
      if (!item.tracks?.length) setDuration(audio.duration)
      const st = seekToRef.current
      if (st > 0 && st < audio.duration) {
        audio.currentTime = st
        setCurrentTime(trackOffsetRef.current + st)
      }
    })
    audio.addEventListener('timeupdate', () => {
      if (!seeking) setCurrentTime(trackOffsetRef.current + audio.currentTime)
    })
    audio.addEventListener('play',  () => setPlaying(true))
    audio.addEventListener('pause', () => setPlaying(false))
    audio.addEventListener('ended', () => {
      syncProgress(audio.duration)
      // Advance to the next track if this is a multi-track audiobook.
      const tracks = item.tracks
      const cur = currentTrackRef.current
      if (tracks?.length && cur) {
        const next = tracks.find(t => t.index === cur.index + 1)
        if (next) {
          loadTrack(audio, next, 0, true)
          return
        }
      }
      // No next track — finished.
      setPlaying(false)
    })

    loadTrack(audio, initialTrack, initialSeek, false)

    return () => {
      audio.pause()
      audio.src = ''
    }
  }, [item.id, item.episodeId]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const globalT = parseFloat(e.target.value)
    setCurrentTime(globalT)
    if (audioRef.current) {
      const localT = Math.max(0, globalT - trackOffsetRef.current)
      audioRef.current.currentTime = Math.min(localT, audioRef.current.duration || localT)
    }
  }

  const coverUrl = `/api/abs/${integrationId}/cover/${item.id}`
  const itemUrl = uiUrl ? `${uiUrl}/item/${item.id}` : undefined

  const skip = (secs: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Math.max(0, Math.min(audio.currentTime + secs, audio.duration || 0))
    setCurrentTime(trackOffsetRef.current + audio.currentTime)
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
          <input type="range" min={0} max={item.duration || duration || 1} step={1}
            value={currentTime}
            onMouseDown={() => setSeeking(true)}
            onMouseUp={() => setSeeking(false)}
            onChange={seek}
            style={{ width: '100%', height: 3, accentColor: 'var(--accent)', cursor: 'pointer' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between',
            fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', marginTop: 1 }}>
            <span>{fmtTime(currentTime)}</span>
            <span>{fmtTime(item.duration || duration)}</span>
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

function StatsRow({ data, compact }: { data: ABSData; compact?: boolean }) {
  const libs = data.libraries ?? []
  return (
    <div style={{ display: 'flex', gap: compact ? 10 : 14, fontSize: compact ? 11 : 12,
      flexShrink: 1, flexWrap: 'wrap', overflow: 'hidden', minWidth: 0 }}>
      {libs.map(lib => (
        <span key={lib.id} style={{ color: 'var(--text-dim)', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <strong style={{ color: 'var(--text)' }}>{lib.itemCount.toLocaleString()}</strong>{' '}{lib.name}
        </span>
      ))}
      {data.itemsFinished > 0 && (
        <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>
          <strong style={{ color: 'var(--green)' }}>{data.itemsFinished}</strong> finished
        </span>
      )}
      {data.totalListeningTime > 0 && (
        <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>
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
  const playable = inProgress.filter(i => i.hasAudio)
  const readOnly = inProgress.filter(i => !i.hasAudio)
  const activeItem = playable[Math.min(activeIdx, playable.length - 1)]

  // ── 1x — stats inline ─────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10,
      height: '100%', overflow: 'hidden', minWidth: 0 }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>🎧</span>
      <StatsRow data={data} compact />
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
        {playable.map((item, i) => (
          <ItemRow key={item.id} item={item} integrationId={integId} uiUrl={uiUrl}
            active={i === activeIdx} onSelect={() => setActiveIdx(i)} />
        ))}
        {readOnly.map(item => {
          const itemUrl = uiUrl ? `${uiUrl}/item/${item.id}` : undefined
          return (
            <div key={item.id} onClick={() => itemUrl && window.open(itemUrl, '_blank')}
              style={{ display: 'flex', gap: 8, padding: '5px 0',
                borderBottom: '1px solid var(--border)', cursor: itemUrl ? 'pointer' : 'default',
                opacity: 0.8 }}>
              <div style={{ flexShrink: 0, width: 36, height: 36 }}>
                <AuthCover src={`/api/abs/${integId}/cover/${item.id}`} title={item.title} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ marginRight: 4 }}>📖</span>{item.title}
                </div>
                {item.author && (
                  <div style={{ fontSize: 10, color: 'var(--text-dim)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.author}
                  </div>
                )}
                <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 1 }}>
                  {Math.round(item.progress * 100)}% read
                </div>
              </div>
            </div>
          )
        })}
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
          key={activeItem.id + (activeItem.episodeId || '')}
          item={activeItem}
          integrationId={integId}
          uiUrl={uiUrl}
        />
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>Nothing in progress</div>
      )}

      {playable.length > 1 && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>
            Continue listening
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {playable.map((item, i) => (
              <ItemRow key={item.id} item={item} integrationId={integId} uiUrl={uiUrl}
                active={i === activeIdx} onSelect={() => setActiveIdx(i)} />
            ))}
          </div>
        </div>
      )}

      {readOnly.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4 }}>
            Continue reading
          </div>
          {readOnly.map(item => {
            const itemUrl = uiUrl ? `${uiUrl}/item/${item.id}` : undefined
            return (
              <div key={item.id} onClick={() => itemUrl && window.open(itemUrl, '_blank')}
                style={{ display: 'flex', gap: 8, padding: '5px 0',
                  borderBottom: '1px solid var(--border)', cursor: itemUrl ? 'pointer' : 'default',
                  alignItems: 'center' }}>
                <div style={{ flexShrink: 0, width: 32, height: 32 }}>
                  <AuthCover src={`/api/abs/${integId}/cover/${item.id}`} title={item.title} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ marginRight: 4 }}>📖</span>{item.title}
                  </div>
                  {item.author && (
                    <div style={{ fontSize: 10, color: 'var(--text-dim)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.author}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
                  {Math.round(item.progress * 100)}%
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
