import { useEffect, useState, useCallback, useRef } from 'react'
import { integrationsApi, Panel } from '../../api'

interface SpotifyNowPlaying {
  trackId: string
  trackName: string
  artistName: string
  albumName: string
  albumArt: string
  progressMs: number
  durationMs: number
  isPlaying: boolean
}

interface SpotifyRecentTrack {
  trackId: string
  trackName: string
  artistName: string
  albumName: string
  albumArt: string
  playedAt: string
}

interface SpotifyData {
  integrationId: string
  displayName: string
  isPremium: boolean
  nowPlaying: SpotifyNowPlaying | null
  recentTracks: SpotifyRecentTrack[]
}

function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

async function spotifyControl(integrationId: string, action: string) {
  await fetch(`/api/spotify/playback?integrationId=${integrationId}&action=${action}`, {
    method: 'POST',
    credentials: 'include',
  })
}

function ProgressBar({ progressMs, durationMs, isPlaying }: {
  progressMs: number; durationMs: number; isPlaying: boolean
}) {
  const [local, setLocal] = useState(progressMs)
  const ref = useRef(progressMs)

  useEffect(() => {
    ref.current = progressMs
    setLocal(progressMs)
    if (!isPlaying) return
    const interval = setInterval(() => {
      ref.current = Math.min(ref.current + 1000, durationMs)
      setLocal(ref.current)
    }, 1000)
    return () => clearInterval(interval)
  }, [progressMs, durationMs, isPlaying])

  const pct = durationMs > 0 ? Math.min((local / durationMs) * 100, 100) : 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10,
      color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
      <span>{fmtMs(local)}</span>
      <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%',
          background: 'var(--accent)', borderRadius: 2, transition: 'width 1s linear' }} />
      </div>
      <span>{fmtMs(durationMs)}</span>
    </div>
  )
}

function Controls({ integrationId, isPlaying, onRefresh }: {
  integrationId: string; isPlaying: boolean; onRefresh: () => void
}) {
  const [busy, setBusy] = useState(false)

  const act = async (action: string) => {
    if (busy) return
    setBusy(true)
    try {
      await spotifyControl(integrationId, action)
      setTimeout(onRefresh, 800)
    } finally { setBusy(false) }
  }

  const btn = (label: string, action: string) => (
    <button
      onClick={() => act(action)}
      disabled={busy}
      style={{
        background: 'none', border: 'none', cursor: busy ? 'default' : 'pointer',
        color: 'var(--text)', fontSize: 16, padding: '4px 8px',
        opacity: busy ? 0.5 : 1, borderRadius: 4,
      }}>
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      {btn('⏮', 'previous')}
      {btn(isPlaying ? '⏸' : '▶', isPlaying ? 'pause' : 'play')}
      {btn('⏭', 'next')}
    </div>
  )
}

function RecentRow({ track }: { track: SpotifyRecentTrack }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0',
      borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: 'var(--text)' }}>{track.trackName}</div>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: 'var(--text-dim)', fontSize: 11 }}>{track.artistName}</div>
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
        fontFamily: 'DM Mono, monospace' }}>
        {fmtRelative(track.playedAt)}
      </span>
    </div>
  )
}

export default function SpotifyPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<SpotifyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await integrationsApi.getPanelData(panel.id)
      setData(r.data)
      setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>Loading...</div>
  if (error)   return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>🎵 {error}</div>
  if (!data)   return null

  const np = data.nowPlaying
  const recents = data.recentTracks ?? []
  const integrationId = data.integrationId

  // ── 1x ───────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10,
      height: '100%', overflow: 'hidden' }}>
      <span style={{ fontSize: 16 }}>🎵</span>
      {np ? (
        <>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
              {np.trackName}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{np.artistName}</span>
          </div>
          {np.isPlaying && (
            <span style={{ fontSize: 8, color: 'var(--accent)', flexShrink: 0 }}>●</span>
          )}
        </>
      ) : (
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Nothing playing</span>
      )}
    </div>
  )

  // ── 2x–3x ────────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      {np ? (
        <div style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            {np.isPlaying && <span style={{ fontSize: 8, color: 'var(--accent)' }}>●</span>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {np.trackName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {np.artistName}
              </div>
            </div>
          </div>
          <ProgressBar progressMs={np.progressMs} durationMs={np.durationMs} isPlaying={np.isPlaying} />
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', flexShrink: 0 }}>Nothing playing</div>
      )}
      {recents.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4 }}>Recently played</div>
          {recents.map((t, i) => <RecentRow key={i} track={t} />)}
        </div>
      )}
    </div>
  )

  // ── 4x+ ──────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 10 }}>
      {np ? (
        <div style={{ flexShrink: 0, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {np.albumArt && (
            <img src={np.albumArt} alt={np.albumName}
              style={{ width: 72, height: 72, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {np.isPlaying && <span style={{ fontSize: 8, color: 'var(--accent)', flexShrink: 0 }}>●</span>}
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {np.trackName}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {np.artistName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {np.albumName}
            </div>
            <ProgressBar progressMs={np.progressMs} durationMs={np.durationMs} isPlaying={np.isPlaying} />
            {data.isPremium && (
              <Controls integrationId={integrationId} isPlaying={np.isPlaying} onRefresh={load} />
            )}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', flexShrink: 0 }}>Nothing playing</div>
      )}
      {recents.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>Recently played</div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {recents.map((t, i) => <RecentRow key={i} track={t} />)}
          </div>
        </div>
      )}
    </div>
  )
}
