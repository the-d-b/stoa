import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface PlexLibrary { title: string; type: string; count: number }
interface PlexSession {
  user: string; title: string; grandparentTitle: string; type: string
  state: string; progress: number; transcodeDecision: string
  quality: string; player: string
  contentRating?: string
}
interface PlexData {
  uiUrl: string; serverName: string; version: string
  latestVersion: string; updateAvail: boolean
  libraries: PlexLibrary[]; sessions: PlexSession[]
  transcodeCount: number; directCount: number
}

const TYPE_ICON: Record<string, string> = {
  movie: '🎬', show: '📺', artist: '🎵', photo: '📷', other: '📁'
}
const STATE_COLOR: Record<string, string> = {
  playing: 'var(--green)', paused: 'var(--amber)', buffering: 'var(--text-dim)'
}

export default function PlexPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<PlexData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const refreshSecs = config.refreshSecs || 30

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setData(res.data); setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  useEffect(() => {
    load()
    const interval = setInterval(load, refreshSecs * 1000)
    return () => clearInterval(interval)
  }, [load, refreshSecs])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)   return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data)   return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const sessions = data.sessions || []

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 6, marginTop: 8 }}>{text}</div>
  )

  const StreamBar = () => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6, justifyContent: 'center' }}>
      <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
          fontSize: 11, textDecoration: 'none',
          color: 'inherit' }}
        onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
        onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
        <span style={{ color: sessions.length > 0 ? 'var(--green)' : 'var(--text-dim)' }}>●</span>
        <span style={{ color: 'var(--text-muted)' }}>{sessions.length} streaming</span>
      </a>
      {data.directCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
          <span style={{ color: 'var(--green)', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{data.directCount}</span>
          <span style={{ color: 'var(--text-dim)' }}>direct</span>
        </div>
      )}
      {data.transcodeCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid #f59e0b30', fontSize: 11 }}>
          <span style={{ color: 'var(--amber)', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{data.transcodeCount}</span>
          <span style={{ color: 'var(--text-dim)' }}>transcode</span>
        </div>
      )}
    </div>
  )

  const SessionRow = ({ s }: { s: PlexSession }) => {
    const isDirect = s.transcodeDecision === 'directplay' || s.transcodeDecision === 'copy'
    const displayTitle = s.grandparentTitle || s.title
    const subTitle = s.grandparentTitle ? s.title : null
    const stateColor = STATE_COLOR[s.state] || 'var(--text-dim)'
    const pct = Math.min(Math.max(s.progress || 0, 0), 100)
    const isPlaying = s.state === 'playing'
    return (
      <div style={{
        margin: '5px 0', borderRadius: 8,
        background: 'var(--surface2)', border: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        {/* Progress bar as background strip */}
        <div style={{ position: 'relative' }}>
          {/* Track */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
            background: 'var(--border)' }} />
          {/* Fill */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, height: 2,
            width: `${pct}%`,
            background: isDirect ? 'var(--accent)' : 'var(--amber)',
            transition: 'width 1s linear',
            boxShadow: isPlaying ? `0 0 6px ${isDirect ? 'var(--accent)' : '#f59e0b'}` : 'none',
          }} />
          {/* Content */}
          <div style={{ padding: '6px 10px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Animated playing dot */}
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: stateColor,
                boxShadow: isPlaying ? `0 0 0 2px ${stateColor}30` : 'none',
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayTitle}
              </span>
              {s.contentRating && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 3px',
                  borderRadius: 3, border: '1px solid var(--border)',
                  color: 'var(--text-dim)', flexShrink: 0 }}>
                  {s.contentRating}
                </span>
              )}
              <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', fontWeight: 600,
                color: isDirect ? 'var(--green)' : 'var(--amber)', flexShrink: 0 }}>
                {pct.toFixed(0)}%
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 13 }}>
              {subTitle && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {subTitle}
                </span>
              )}
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{s.user}</span>
              {s.quality && (
                <span style={{ fontSize: 10, color: 'var(--text-dim)',
                  fontFamily: 'DM Mono, monospace' }}>{s.quality}p</span>
              )}
              <span style={{ fontSize: 10, color: isDirect ? 'var(--green)' : 'var(--amber)' }}>
                {isDirect ? '⚡ direct' : '⚙ transcode'}
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const LibraryGrid = () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
      {(data.libraries || []).map((lib, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
          fontSize: 11 }}>
          <span style={{ fontSize: 12 }}>{TYPE_ICON[lib.type] || TYPE_ICON.other}</span>
          <span style={{ color: 'var(--text-muted)' }}>{lib.title}</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--text)' }}>
            {lib.count.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )

  const UpdateBanner = () => data.updateAvail ? (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
      padding: '6px 10px', borderRadius: 7,
      background: '#f59e0b10', border: '1px solid #f59e0b30',
    }}>
      <span style={{ fontSize: 13 }}>↑</span>
      <span style={{ fontSize: 12, color: 'var(--amber)', flex: 1 }}>Plex update available</span>
      <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
        style={{ fontSize: 11, color: 'var(--amber)', textDecoration: 'underline' }}>
        {data.latestVersion}
      </a>
    </div>
  ) : null

  // ── 1x ───────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {sessions.length > 0
        ? sessions.map((s, i) => <SessionRow key={i} s={s} />)
        : <div style={{ display: 'flex', alignItems: 'center', height: '100%',
            fontSize: 12, color: 'var(--text-dim)' }}>○ Nothing playing</div>}
    </div>
  )

  // ── 2x ───────────────────────────────────────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <StreamBar />
      {sessions.length > 0 && sessions.map((s, i) => <SessionRow key={i} s={s} />)}
      {sessions.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>○ Nothing playing</div>}
      {sectionTitle('Libraries')}
      <LibraryGrid />
    </div>
  )

  // ── 4x — adds update banner + linked libraries ────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <UpdateBanner />
      <StreamBar />
      {sessions.length > 0 && sessions.map((s, i) => <SessionRow key={i} s={s} />)}
      {sessions.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>○ Nothing playing</div>}
      {sectionTitle('Libraries')}
      <LibraryGrid />
    </div>
  )
}
