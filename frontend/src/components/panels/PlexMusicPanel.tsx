import { useEffect, useState, useCallback, useRef, Ref } from 'react'
import { integrationsApi, panelsApi, myPanelsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlexSession {
  user: string
  title: string
  grandparentTitle: string
  type: string
  state: string
  progress: number // percent, 0-100
  positionSecs?: number
  durationSecs?: number
  player: string
  thumbUrl?: string
}

interface PlexMusicPlaylist {
  ratingKey: string
  title: string
  itemCount: number
  thumbUrl?: string
}

interface PlexMusicTrack {
  id: string
  title: string
  artist: string
  album: string
  duration: number // seconds
  thumbUrl?: string
  streamKey: string
}

interface PlexWatchlistItem {
  title: string
  year?: number
  type: string
  thumbUrl?: string
  link?: string
}

interface PlexMusicData {
  username: string
  thumbUrl: string
  nowPlaying?: PlexSession
  artistCount: number
  albumCount: number
  trackCount: number
  playlists: PlexMusicPlaylist[]
  stations: PlexMusicPlaylist[]
  playlistId: string
  queue: PlexMusicTrack[]
  watchlist: PlexWatchlistItem[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(secs: number) {
  if (!secs || isNaN(secs)) return '0:00'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── Now playing (read-only — reflects whatever's playing on your own Plex
// account elsewhere, e.g. Plexamp; Stoa never controls it) ─────────────────

function NowPlayingCard({ session, onNearEnd }: { session: PlexSession; onNearEnd?: () => void }) {
  // The position we get is only as fresh as the last poll/broadcast (up to
  // ~30s stale) — crawl it forward locally between updates using wall-clock
  // time so the bar doesn't look frozen, the same way most "now playing"
  // widgets extrapolate between polls. Resets whenever a fresh position
  // actually arrives, and only ticks while the session reports "playing".
  const [liveSecs, setLiveSecs] = useState(session.positionSecs ?? 0)
  const firedNearEndRef = useRef(false)

  useEffect(() => {
    setLiveSecs(session.positionSecs ?? 0)
    firedNearEndRef.current = false
    if (session.state !== 'playing' || !session.durationSecs) return
    const base = session.positionSecs ?? 0
    const startedAt = Date.now()
    const id = setInterval(() => {
      const next = Math.min(base + (Date.now() - startedAt) / 1000, session.durationSecs!)
      setLiveSecs(next)
      // Once our local estimate says the track has ended, ask for a fresh
      // fetch instead of waiting out the rest of the ~30s poll interval —
      // otherwise this card sits frozen at 100% and then jumps straight to
      // the next track already partway through.
      if (next >= session.durationSecs! && !firedNearEndRef.current) {
        firedNearEndRef.current = true
        onNearEnd?.()
      }
    }, 500)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.positionSecs, session.durationSecs, session.state, session.title])

  const pct = session.durationSecs
    ? Math.min((liveSecs / session.durationSecs) * 100, 100)
    : Math.min(session.progress, 100)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px',
      borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {session.thumbUrl && (
          <img src={session.thumbUrl} alt="" width={48} height={48}
            style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.grandparentTitle}</div>
        </div>
      </div>
      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%',
          background: 'var(--accent)', borderRadius: 2, transition: 'width 0.5s linear' }} />
      </div>
    </div>
  )
}

// ── Stat tiles ────────────────────────────────────────────────────────────────

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ flex: 1, padding: '5px 8px', borderRadius: 7, textAlign: 'center',
      background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)',
        fontFamily: 'DM Mono, monospace' }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.05em', marginTop: 1 }}>{label}</div>
    </div>
  )
}

// ── In-browser player — real <audio>, streamed through Stoa's backend
// proxy (keeps your Plex token out of the browser), same pattern as the
// Navidrome panel's player ──────────────────────────────────────────────────

function Player({ queue, integId, activeIdx, onIndexChange }: {
  queue: PlexMusicTrack[]; integId: string; activeIdx: number; onIndexChange: (i: number) => void
}) {
  const idx = Math.min(activeIdx, queue.length - 1)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [seeking, setSeeking] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Whether playback should resume once the next track's blob has loaded.
  // Can't rely on audio.paused (or the `playing` state) at that point — a
  // natural track-end fires a `pause` event before `ended`, so both would
  // already read "paused" by the time we're deciding whether to auto-advance
  // into playing the next track.
  const wantPlayRef = useRef(false)
  const token = localStorage.getItem('stoa_token') ?? ''

  const track = queue[idx]

  // Load a new track
  useEffect(() => {
    if (!track) return
    const audio = audioRef.current ?? new Audio()
    audioRef.current = audio

    const onMeta = () => setDuration(audio.duration)
    const onTime = () => { if (!seeking) setCurrentTime(audio.currentTime) }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => {
      if (idx < queue.length - 1) { wantPlayRef.current = true; onIndexChange(idx + 1) }
      else { wantPlayRef.current = false; setPlaying(false) }
    }

    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)

    // Load via blob fetch to inject the auth header — <audio src> can't
    // carry custom headers, and the stream route requires one.
    const ctrl = new AbortController()
    const streamUrl = `/api/plexmusic/${integId}/stream?key=${encodeURIComponent(track.streamKey)}`
    setCurrentTime(0); setDuration(0)

    fetch(streamUrl, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Range: 'bytes=0-' },
      signal: ctrl.signal,
    })
      .then(r => { if (!r.ok) throw new Error(''); return r.blob() })
      .then(blob => {
        if (ctrl.signal.aborted) return
        if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src)
        audio.src = URL.createObjectURL(blob)
        if (wantPlayRef.current) audio.play().catch(() => {})
      })
      .catch(() => {})

    return () => {
      ctrl.abort()
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
    }
  }, [track?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) { audio.pause(); wantPlayRef.current = false }
    else { audio.play().catch(() => {}); wantPlayRef.current = true }
  }

  const prev = () => {
    wantPlayRef.current = !!audioRef.current && !audioRef.current.paused
    onIndexChange(Math.max(0, idx - 1))
  }
  const next = () => {
    wantPlayRef.current = !!audioRef.current && !audioRef.current.paused
    onIndexChange(Math.min(queue.length - 1, idx + 1))
  }

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value)
    setCurrentTime(t)
    if (audioRef.current) audioRef.current.currentTime = t
  }

  if (!track) return null

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {track.thumbUrl
          ? <img src={track.thumbUrl} alt="" width={44} height={44}
              style={{ borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          : <div style={{ width: 44, height: 44, borderRadius: 4, background: 'var(--surface2)', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--text-dim)' }}>♪</div>
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {track.artist}{track.album ? ` · ${track.album}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button onClick={prev} disabled={idx === 0}
            style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer',
              color: idx === 0 ? 'var(--text-dim)' : 'var(--text)', fontSize: 14, padding: '2px 4px' }}>
            ⏮
          </button>
          <button onClick={togglePlay}
            style={{
              background: 'var(--accent)', border: 'none', cursor: 'pointer', color: '#fff',
              width: 30, height: 30, borderRadius: '50%', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            {playing ? '⏸' : '▶'}
          </button>
          <button onClick={next} disabled={idx === queue.length - 1}
            style={{ background: 'none', border: 'none', cursor: idx === queue.length - 1 ? 'default' : 'pointer',
              color: idx === queue.length - 1 ? 'var(--text-dim)' : 'var(--text)', fontSize: 14, padding: '2px 4px' }}>
            ⏭
          </button>
        </div>
      </div>

      <div style={{ marginTop: 6 }}>
        <input type="range" min={0} max={duration || 1} step={1} value={currentTime}
          onMouseDown={() => setSeeking(true)}
          onMouseUp={() => setSeeking(false)}
          onChange={seek}
          style={{ width: '100%', height: 3, accentColor: 'var(--accent)', cursor: 'pointer' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between',
          fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', marginTop: 1 }}>
          <span>{fmtTime(currentTime)}</span>
          <span>{idx + 1} / {queue.length}</span>
          <span>{fmtTime(duration || track.duration)}</span>
        </div>
      </div>
    </div>
  )
}

function TrackRow({ track, index, active, onClick, rowRef }: {
  track: PlexMusicTrack; index: number; active: boolean; onClick: () => void
  rowRef?: Ref<HTMLDivElement>
}) {
  return (
    <div ref={rowRef} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0',
      borderBottom: '1px solid var(--border)', cursor: 'pointer',
      background: active ? 'var(--surface2)' : 'none',
      borderRadius: active ? 4 : 0,
    }}>
      <span style={{ fontSize: 9, fontFamily: 'DM Mono, monospace',
        color: active ? 'var(--accent)' : 'var(--text-dim)', width: 20, textAlign: 'right', flexShrink: 0 }}>
        {active ? '▶' : index + 1}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: active ? 600 : 400,
          color: active ? 'var(--accent)' : 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {track.title}
        </div>
        {track.artist && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {track.artist}
          </div>
        )}
      </div>
      <span style={{ fontSize: 9, color: 'var(--text-dim)', flexShrink: 0,
        fontFamily: 'DM Mono, monospace' }}>
        {fmtTime(track.duration)}
      </span>
    </div>
  )
}

// ── Watchlist ─────────────────────────────────────────────────────────────────
// Edge-hover auto-scroll, no visible scrollbar — same interaction as the
// Trakt/TMDB cover strips.
function WatchlistStrip({ items }: { items: PlexWatchlistItem[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const animRef = useRef<number | null>(null)
  const [hoverZone, setHoverZone] = useState<'left' | 'right' | null>(null)

  const scroll = useCallback((dir: 'left' | 'right') => {
    const el = ref.current
    if (!el) return
    el.scrollLeft += dir === 'right' ? 3 : -3
  }, [])

  useEffect(() => {
    if (!hoverZone) {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      animRef.current = null
      return
    }
    const loop = () => {
      scroll(hoverZone)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [hoverZone, scroll])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const w = rect.width
    if (x < w * 0.15) setHoverZone('left')
    else if (x > w * 0.85) setHoverZone('right')
    else setHoverZone(null)
  }

  const visible = items.filter(i => i.thumbUrl)
  if (!visible.length) {
    return <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '6px 0' }}>Nothing on your watchlist</div>
  }

  return (
    <div style={{ position: 'relative' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverZone(null)}>

      {hoverZone === 'left' && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '15%',
          background: 'linear-gradient(to right, var(--surface) 0%, transparent 100%)',
          zIndex: 2, display: 'flex', alignItems: 'center', paddingLeft: 4, pointerEvents: 'none' }}>
          <span style={{ fontSize: 16, color: 'var(--text-muted)', opacity: 0.7 }}>‹</span>
        </div>
      )}
      {hoverZone === 'right' && (
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '15%',
          background: 'linear-gradient(to left, var(--surface) 0%, transparent 100%)',
          zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          paddingRight: 4, pointerEvents: 'none' }}>
          <span style={{ fontSize: 16, color: 'var(--text-muted)', opacity: 0.7 }}>›</span>
        </div>
      )}

      <div ref={ref} style={{ display: 'flex', gap: 6, overflowX: 'auto',
        scrollbarWidth: 'none', maxWidth: '100%', minWidth: 0, padding: '4px 0' }}>
        {visible.map((it, i) => {
          const img = (
            <img src={it.thumbUrl} alt={it.title} title={`${it.title}${it.year ? ` (${it.year})` : ''}`}
              width={54} height={80} style={{ borderRadius: 5, objectFit: 'cover', flexShrink: 0, display: 'block' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          )
          return it.link
            ? <a key={i} href={it.link} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>{img}</a>
            : <div key={i} style={{ flexShrink: 0 }}>{img}</div>
        })}
      </div>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function PlexMusicPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<PlexMusicData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeTrack, setActiveTrack] = useState(0)
  const activeRowRef = useRef<HTMLDivElement>(null)
  const trackListRef = useRef<HTMLDivElement>(null)

  // Keep the currently-playing track scrolled to the top of the track list —
  // matters most when auto-advance moves further down the queue than what's
  // currently visible. Scoped to the track-list container specifically (via
  // getBoundingClientRect deltas) rather than scrollIntoView, which would
  // also scroll the panel's own outer scroll container and jump the whole
  // panel around.
  useEffect(() => {
    const row = activeRowRef.current
    const container = trackListRef.current
    if (!row || !container) return
    const delta = row.getBoundingClientRect().top - container.getBoundingClientRect().top
    container.scrollTo({ top: container.scrollTop + delta, behavior: 'smooth' })
  }, [activeTrack])

  const panelCfg = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId: string | undefined = panelCfg.integrationId
  const isSystem = !panel.createdBy || panel.createdBy === 'SYSTEM'

  const load = useCallback(async (playlistId?: string) => {
    try {
      const r = await integrationsApi.getPanelData(panel.id, playlistId ? { playlistId } : undefined)
      setData(r.data)
      setActiveTrack(0)
      setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  const selectPlaylist = async (id: string) => {
    if (saving) return
    setSaving(true)
    try {
      const newConfig = JSON.stringify({ ...panelCfg, playlistId: id })
      if (isSystem) await panelsApi.update(panel.id, { title: panel.title, config: newConfig })
      else await myPanelsApi.update(panel.id, { title: panel.title, config: newConfig })
      load(id)
    } finally { setSaving(false) }
  }

  // The background cache worker refreshes per-integration, not per-panel, so
  // it has no idea which playlist this panel has selected — its broadcasts
  // always reflect the default (first) playlist. If we blindly applied every
  // broadcast, a manually-selected playlist would get reverted within ~30s.
  // Keep the selected queue/playlistId in that case; take everything else
  // (now playing, stats, watchlist) live as usual.
  const sseData = useSSE<PlexMusicData>(integrationId)
  useEffect(() => {
    if (sseData === null) return
    if (data && data.playlistId && sseData.playlistId !== data.playlistId) {
      setData({ ...sseData, playlistId: data.playlistId, queue: data.queue })
    } else {
      setData(sseData)
      setActiveTrack(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sseData])
  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>Loading…</div>
  if (error)   return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>🎵 {error}</div>
  if (!data)   return null

  const queue = data.queue ?? []
  const playlists = data.playlists ?? []
  const stations = data.stations ?? []
  const activePl = [...playlists, ...stations].find(p => p.ratingKey === data.playlistId) ?? playlists[0]

  const PlaylistSelector = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>Playlist</span>
      <select
        value={data.playlistId || ''}
        onChange={e => selectPlaylist(e.target.value)}
        disabled={saving}
        style={{
          flex: 1, minWidth: 0, fontSize: 11, background: 'var(--surface2)',
          border: '1px solid var(--border)', borderRadius: 5, padding: '2px 6px',
          color: 'var(--text)', cursor: 'pointer',
        }}>
        {playlists.length > 0 && (
          <optgroup label="Playlists">
            {playlists.map(p => (
              <option key={p.ratingKey} value={p.ratingKey}>{p.title}</option>
            ))}
          </optgroup>
        )}
        {stations.length > 0 && (
          <optgroup label="Stations">
            {stations.map(p => (
              <option key={p.ratingKey} value={p.ratingKey}>📻 {p.title}</option>
            ))}
          </optgroup>
        )}
      </select>
      {activePl && (
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, whiteSpace: 'nowrap' }}>
          {activePl.itemCount} tracks
        </span>
      )}
    </div>
  )

  // ── 1× — compact ──────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8,
        height: '100%', overflow: 'hidden' }}>
        {data.nowPlaying ? (
          <>
            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: 'var(--accent)', display: 'inline-block' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.nowPlaying.title}</div>
            </div>
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>@{data.username} — nothing playing</span>
        )}
      </div>
    )
  }

  // ── 2×+ ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column',
      gap: 8, padding: '8px 10px' }}>

      {data.nowPlaying
        ? <NowPlayingCard session={data.nowPlaying} onNearEnd={() => load(data.playlistId)} />
        : <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '6px 2px' }}>Nothing playing right now</div>
      }

      <div style={{ display: 'flex', gap: 6 }}>
        <StatTile value={data.artistCount} label="Artists" />
        <StatTile value={data.albumCount} label="Albums" />
        <StatTile value={data.trackCount} label="Tracks" />
      </div>

      {heightUnits >= 4 && (
        <>
          <PlaylistSelector />
          {queue.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>No tracks in playlist</div>}
          {queue.length > 0 && (
            <div ref={trackListRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {queue.map((t, i) => (
                <TrackRow key={t.id} track={t} index={i}
                  active={i === activeTrack} onClick={() => setActiveTrack(i)}
                  rowRef={i === activeTrack ? activeRowRef : undefined} />
              ))}
            </div>
          )}
          {queue.length > 0 && integrationId && (
            <Player key={data.playlistId} queue={queue} integId={integrationId}
              activeIdx={activeTrack} onIndexChange={setActiveTrack} />
          )}

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 4,
              textTransform: 'uppercase', letterSpacing: '0.04em' }}>Watchlist</div>
            <WatchlistStrip items={data.watchlist ?? []} />
          </div>
        </>
      )}
    </div>
  )
}
