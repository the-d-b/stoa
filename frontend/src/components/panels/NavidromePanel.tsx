import { useEffect, useState, useCallback, useRef } from 'react'
import { integrationsApi, panelsApi, myPanelsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface NavSong {
  id: string; title: string; artist: string
  album: string; duration: number; coverArt: string; track: number
}
interface NavPlaylist {
  id: string; name: string; songCount: number; duration: number
}
interface NavData {
  uiUrl: string; integrationId: string; playlistId: string
  playlists: NavPlaylist[]; queue: NavSong[]
}

function fmtTime(secs: number) {
  if (!secs || isNaN(secs)) return '0:00'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtDuration(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// ── Album art ─────────────────────────────────────────────────────────────────

function AlbumArt({ coverArt, integId, title, size = 48 }: {
  coverArt: string; integId: string; title: string; size?: number
}) {
  const [src, setSrc] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!coverArt) return
    let cancelled = false
    const token = localStorage.getItem('stoa_token')
    fetch(`/api/navidrome/${integId}/cover?id=${encodeURIComponent(coverArt)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => { if (!r.ok) throw new Error(''); return r.blob() })
      .then(blob => {
        if (cancelled) return
        const u = URL.createObjectURL(blob)
        urlRef.current = u
        setSrc(u)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
    }
  }, [coverArt, integId])

  const style: React.CSSProperties = {
    width: size, height: size, flexShrink: 0, borderRadius: 4, overflow: 'hidden',
    background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  return (
    <div style={style}>
      {src
        ? <img src={src} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontSize: size * 0.4, color: 'var(--text-dim)' }}>♪</span>}
    </div>
  )
}

// ── Player ────────────────────────────────────────────────────────────────────

function Player({ queue, integId, uiUrl, initialIdx }: {
  queue: NavSong[]; integId: string; uiUrl: string; initialIdx: number
}) {
  const [idx, setIdx] = useState(Math.min(initialIdx, queue.length - 1))
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [seeking, setSeeking] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const token = localStorage.getItem('stoa_token') ?? ''

  const song = queue[idx]

  // Load a new track
  useEffect(() => {
    if (!song) return
    const audio = audioRef.current ?? new Audio()
    audioRef.current = audio

    const onMeta = () => setDuration(audio.duration)
    const onTime = () => { if (!seeking) setCurrentTime(audio.currentTime) }
    const onPlay  = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => {
      if (idx < queue.length - 1) { setIdx(i => i + 1) } else { setPlaying(false) }
    }

    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)

    // Load track via blob fetch to inject auth header
    const ctrl = new AbortController()
    const streamUrl = `/api/navidrome/${integId}/stream?id=${encodeURIComponent(song.id)}`
    setCurrentTime(0); setDuration(0)

    fetch(streamUrl, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Range: 'bytes=0-' },
      signal: ctrl.signal,
    })
      .then(r => { if (!r.ok) throw new Error(''); return r.blob() })
      .then(blob => {
        if (ctrl.signal.aborted) return
        const wasPlaying = !audio.paused
        if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src)
        audio.src = URL.createObjectURL(blob)
        if (wasPlaying) audio.play().catch(() => {})
      })
      .catch(() => {
        if (!ctrl.signal.aborted) {
          // Fallback: pass token as query param (Subsonic supports this)
          if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src)
          audio.src = streamUrl + `&naviToken=${encodeURIComponent(token)}`
        }
      })

    return () => {
      ctrl.abort()
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
    }
  }, [song?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) audio.pause()
    else audio.play().catch(() => {})
  }

  const prev = () => setIdx(i => Math.max(0, i - 1))
  const next = () => setIdx(i => Math.min(queue.length - 1, i + 1))

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value)
    setCurrentTime(t)
    if (audioRef.current) audioRef.current.currentTime = t
  }

  if (!song) return null

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <AlbumArt coverArt={song.coverArt} integId={integId} title={song.title} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {uiUrl
              ? <a href={`${uiUrl}/song/${song.id}`} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'inherit', textDecoration: 'none' }}>{song.title}</a>
              : song.title}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {song.artist}{song.album ? ` · ${song.album}` : ''}
          </div>
        </div>
        {/* Controls */}
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

      {/* Seek bar */}
      <div style={{ marginTop: 6 }}>
        <input type="range" min={0} max={duration || 1} step={1} value={currentTime}
          onMouseDown={() => setSeeking(true)}
          onMouseUp={() => setSeeking(false)}
          onChange={seek}
          style={{ width: '100%', height: 3, accentColor: 'var(--accent)', cursor: 'pointer' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between',
          fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', marginTop: 1 }}>
          <span>{fmtTime(currentTime)}</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>
            {idx + 1} / {queue.length}
          </span>
          <span>{fmtTime(duration || song.duration)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Track row ─────────────────────────────────────────────────────────────────

function TrackRow({ song, active, onClick }: {
  song: NavSong; active: boolean; onClick: () => void
}) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0',
      borderBottom: '1px solid var(--border)', cursor: 'pointer',
      background: active ? 'var(--surface2)' : 'none',
      borderRadius: active ? 4 : 0,
    }}>
      <span style={{ fontSize: 9, fontFamily: 'DM Mono, monospace',
        color: active ? 'var(--accent)' : 'var(--text-dim)', width: 20, textAlign: 'right', flexShrink: 0 }}>
        {active ? '▶' : (song.track || '–')}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: active ? 600 : 400,
          color: active ? 'var(--accent)' : 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {song.title}
        </div>
        {song.artist && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {song.artist}
          </div>
        )}
      </div>
      <span style={{ fontSize: 9, color: 'var(--text-dim)', flexShrink: 0,
        fontFamily: 'DM Mono, monospace' }}>
        {fmtTime(song.duration)}
      </span>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function NavidromePanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<NavData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTrack, setActiveTrack] = useState(0)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined
  const isSystem = !panel.createdBy || panel.createdBy === 'SYSTEM'

  const load = useCallback(async (playlistId?: string) => {
    try {
      const suffix = playlistId ? `?playlistId=${encodeURIComponent(playlistId)}` : ''
      const res = await integrationsApi.getPanelData(panel.id + suffix)
      setData(res.data)
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
      const newConfig = JSON.stringify({ ...config, playlistId: id })
      if (isSystem) await panelsApi.update(panel.id, { title: panel.title, config: newConfig })
      else await myPanelsApi.update(panel.id, { title: panel.title, config: newConfig })
      load(id)
    } finally { setSaving(false) }
  }

  const sseData = useSSE<NavData>(integrationId)
  useEffect(() => { if (sseData !== null) { setData(sseData); setActiveTrack(0) } }, [sseData])
  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)   return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 16, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data)   return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const integId = data.integrationId
  const queue = data.queue ?? []
  const playlists = data.playlists ?? []
  const activePl = playlists.find(p => p.id === data.playlistId) ?? playlists[0]

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
        {playlists.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      {activePl && (
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, whiteSpace: 'nowrap' }}>
          {activePl.songCount} songs · {fmtDuration(activePl.duration)}
        </span>
      )}
    </div>
  )

  // ── 1x — current info compact ──────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 12,
      height: '100%', overflow: 'hidden' }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>🎵</span>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {activePl
          ? <><strong style={{ color: 'var(--text)' }}>{activePl.name}</strong> · {activePl.songCount} songs</>
          : 'No playlists'}
      </div>
    </div>
  )

  // ── 2x-3x — playlist selector + track list (no player) ───────────────────
  if (heightUnits <= 3) return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      <PlaylistSelector />
      {queue.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No tracks</div>}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {queue.map((s, i) => (
          <TrackRow key={s.id} song={s}
            active={i === activeTrack} onClick={() => setActiveTrack(i)} />
        ))}
      </div>
    </div>
  )

  // ── 4x+ — playlist selector + track list + player bar ─────────────────────
  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      <PlaylistSelector />
      {queue.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {queue.map((s, i) => (
            <TrackRow key={s.id} song={s}
              active={i === activeTrack} onClick={() => setActiveTrack(i)} />
          ))}
        </div>
      )}
      {queue.length > 0 && (
        <Player
          key={data.playlistId}
          queue={queue}
          integId={integId}
          uiUrl={uiUrl}
          initialIdx={activeTrack}
        />
      )}
      {queue.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No tracks in playlist</div>}
    </div>
  )
}
