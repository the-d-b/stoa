import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface LastFmTrack {
  name: string
  artist: string
  album: string
  imageUrl: string
  nowPlaying: boolean
  playedAt: string
  trackUrl: string
}

interface LastFmTopArtist {
  name: string
  playCount: string
  artistUrl: string
}

interface LastFmTopTrack {
  name: string
  artist: string
  playCount: string
  imageUrl: string
  trackUrl: string
}

interface LastFmTopAlbum {
  name: string
  artist: string
  playCount: string
  imageUrl: string
}

interface LastFmData {
  username: string
  realName: string
  totalScrobbles: string
  memberSince: string
  profileUrl: string
  recentTracks: LastFmTrack[]
  topArtists: LastFmTopArtist[]
  topTracks: LastFmTopTrack[]
  topAlbums: LastFmTopAlbum[]
}

function fmtRelative(iso: string) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmtNumber(s: string) {
  const n = parseInt(s, 10)
  if (isNaN(n)) return s
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return s
}

function NowPlayingDot() {
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: '#e4194a', flexShrink: 0,
      animation: 'lfm-pulse 1.4s ease-in-out infinite',
    }} />
  )
}

function TrackRow({ track, showImage }: { track: LastFmTrack; showImage?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0',
      borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      {showImage && track.imageUrl && (
        <img src={track.imageUrl} alt={track.album}
          style={{ width: 28, height: 28, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} />
      )}
      {track.nowPlaying && <NowPlayingDot />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: 'var(--text)', fontWeight: track.nowPlaying ? 600 : 400 }}>
          {track.name}
        </div>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: 'var(--text-dim)', fontSize: 11 }}>
          {track.artist}
        </div>
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
        fontFamily: 'DM Mono, monospace' }}>
        {track.nowPlaying ? 'now' : fmtRelative(track.playedAt)}
      </span>
    </div>
  )
}

function ArtistBar({ artist, max }: { artist: LastFmTopArtist; max: number }) {
  const pct = max > 0 ? Math.max(8, (parseInt(artist.playCount) / max) * 100) : 8
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: 'var(--text)', maxWidth: '70%' }}>
            {artist.name}
          </span>
          <span style={{ color: 'var(--text-dim)', fontSize: 11, flexShrink: 0,
            fontFamily: 'DM Mono, monospace' }}>
            {artist.playCount}
          </span>
        </div>
        <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
          <div style={{ width: `${pct}%`, height: '100%',
            background: '#e4194a', borderRadius: 2 }} />
        </div>
      </div>
    </div>
  )
}

export default function LastFmPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<LastFmData | null>(null)
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

  const recents = data.recentTracks ?? []
  const np = recents.find(t => t.nowPlaying) ?? null
  const history = recents.filter(t => !t.nowPlaying)
  const topArtists = data.topArtists ?? []
  const topTracks = data.topTracks ?? []
  const topAlbums = data.topAlbums ?? []

  const maxArtistPlays = topArtists.reduce((m, a) => Math.max(m, parseInt(a.playCount) || 0), 0)

  // ── 1x ───────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    const current = np ?? recents[0]
    return (
      <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8,
        height: '100%', overflow: 'hidden' }}>
        {np && <NowPlayingDot />}
        {!np && <span style={{ fontSize: 14 }}>🎵</span>}
        {current ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
              {current.name}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{current.artist}</span>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{data.username}</span>
        )}
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
          fontFamily: 'DM Mono, monospace' }}>
          {fmtNumber(data.totalScrobbles)} scrobbles
        </span>
      </div>
    )
  }

  // ── 2x–3x ────────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {np && <NowPlayingDot />}
        <div style={{ flex: 1, minWidth: 0 }}>
          {np ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {np.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {np.artist}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              <strong style={{ color: 'var(--text)' }}>{data.username}</strong>
              {' '}· {fmtNumber(data.totalScrobbles)} scrobbles
            </div>
          )}
        </div>
        {!np && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
            since {data.memberSince}
          </span>
        )}
      </div>
      {/* Recent tracks — exclude now-playing (already shown in header) */}
      {history.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {history.slice(0, heightUnits <= 2 ? 4 : 7).map((t, i) => <TrackRow key={i} track={t} />)}
        </div>
      )}
    </div>
  )

  // ── 4x+ ──────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Now playing / last track with art */}
      {(np ?? recents[0]) && (() => {
        const current = np ?? recents[0]
        return (
          <div style={{ flexShrink: 0, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {current.imageUrl && (
              <img src={current.imageUrl} alt={current.album}
                style={{ width: 64, height: 64, borderRadius: 5, objectFit: 'cover', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {np && <NowPlayingDot />}
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {current.name}
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {current.artist}
              </div>
              {current.album && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {current.album}
                </div>
              )}
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                {np ? 'Scrobbling now' : fmtRelative(current.playedAt)}
                {' · '}
                <span style={{ fontFamily: 'DM Mono, monospace' }}>
                  {fmtNumber(data.totalScrobbles)}
                </span> total scrobbles · since {data.memberSince}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Top artists this week — bar chart */}
      {topArtists.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4 }}>Top artists · 7 days</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {topArtists.map((a, i) => (
              <ArtistBar key={i} artist={a} max={maxArtistPlays} />
            ))}
          </div>
        </div>
      )}

      {/* Top albums → top tracks → recent scrobbles (single scrollable column) */}
      {(topAlbums.length > 0 || topTracks.length > 0 || history.length > 0) && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 8 }}>
          {topAlbums.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 4 }}>Top albums · 7 days</div>
              {topAlbums.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6,
                  padding: '2px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  {a.imageUrl && (
                    <img src={a.imageUrl} alt={a.name}
                      style={{ width: 24, height: 24, borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: 'var(--text)' }}>{a.name}</div>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: 'var(--text-dim)', fontSize: 11 }}>{a.artist}</div>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
                    fontFamily: 'DM Mono, monospace' }}>{a.playCount}×</span>
                </div>
              ))}
            </div>
          )}
          {topTracks.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 4 }}>Top tracks · 7 days</div>
              {topTracks.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6,
                  padding: '2px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  {t.imageUrl && (
                    <img src={t.imageUrl} alt={t.name}
                      style={{ width: 24, height: 24, borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: 'var(--text)' }}>{t.name}</div>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: 'var(--text-dim)', fontSize: 11 }}>{t.artist}</div>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
                    fontFamily: 'DM Mono, monospace' }}>{t.playCount}×</span>
                </div>
              ))}
            </div>
          )}
          {heightUnits >= 5 && history.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 4 }}>Recent scrobbles</div>
              {history.slice(0, 3).map((t, i) => <TrackRow key={i} track={t} showImage />)}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes lfm-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
