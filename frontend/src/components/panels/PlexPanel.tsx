import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface PlexLibrary { title: string; type: string; count: number }
interface PlexSession {
  user: string; title: string; grandparentTitle: string; type: string
  state: string; progress: number; transcodeDecision: string; quality: string; player: string
}
interface PlexMedia {
  title: string; grandparentTitle: string; type: string; addedAt: number; year: number
}
interface PlexData {
  uiUrl: string; serverName: string; version: string
  latestVersion: string; updateAvail: boolean
  libraries: PlexLibrary[]; sessions: PlexSession[]; recentlyAdded: PlexMedia[]
}

const TYPE_ICON: Record<string, string> = {
  movie: '🎬', show: '📺', artist: '🎵', photo: '📷', other: '📁'
}

const STATE_COLOR: Record<string, string> = {
  playing: 'var(--green)', paused: 'var(--amber)', buffering: 'var(--text-dim)'
}


function timeAgo(unixSecs: number) {
  const diff = Date.now() / 1000 - unixSecs
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function PlexPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<PlexData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const refreshSecs = config.refreshSecs || 30  // Plex sessions refresh fast

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

  const uiUrl = data.uiUrl || ''

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 6, marginTop: 10 }}>{text}</div>
  )

  // ── Library grid ────────────────────────────────────────────────────────────
  const LibraryGrid = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {(data.libraries || []).map(lib => (
        <div key={lib.title} style={{ display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 8px', borderRadius: 6, background: 'var(--surface2)', fontSize: 12 }}>
          <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>
            {TYPE_ICON[lib.type] || TYPE_ICON.other}
          </span>
          <span style={{ flex: 1, fontWeight: 500 }}>{lib.title}</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text-muted)' }}>
            {lib.count.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )

  // ── Server header with optional update badge ─────────────────────────────
  const ServerHeader = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
        style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}
        onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'}
        onMouseOut={e => e.currentTarget.style.textDecoration = 'none'}>
        {data.serverName || 'Plex'}
      </a>
      {data.version && (
        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
          {data.version}
        </span>
      )}
      {data.updateAvail && (
        <span title={`Update available: ${data.latestVersion}`} style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 10,
          background: '#f59e0b18', border: '1px solid #f59e0b40',
          color: 'var(--amber)', fontWeight: 600, cursor: 'help',
        }}>
          ↑ update
        </span>
      )}
      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
        {(data.sessions || []).length > 0
          ? <span style={{ color: 'var(--green)' }}>● {data.sessions.length} streaming</span>
          : <span>○ idle</span>
        }
      </span>
    </div>
  )

  // ── Session rows ─────────────────────────────────────────────────────────
  const SessionRow = ({ s }: { s: PlexSession }) => {
    const isDirect = s.transcodeDecision === 'directplay' || s.transcodeDecision === 'copy'
    const displayTitle = s.grandparentTitle ? `${s.grandparentTitle} — ${s.title}` : s.title
    return (
      <div style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: STATE_COLOR[s.state] || 'var(--text-dim)' }} />
          <span style={{ fontSize: 12, fontWeight: 500, flex: 1, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayTitle}</span>
          <span style={{ fontSize: 10, color: isDirect ? 'var(--green)' : 'var(--amber)',
            flexShrink: 0, fontFamily: 'DM Mono, monospace' }}>
            {isDirect ? 'direct' : 'transcode'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.user}</span>
          {s.quality && <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>{s.quality}p</span>}
          <div style={{ flex: 1, height: 2, background: 'var(--surface2)', borderRadius: 1 }}>
            <div style={{ width: `${Math.min(s.progress, 100)}%`, height: '100%',
              background: 'var(--accent)', borderRadius: 1 }} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
            {Math.round(s.progress)}%
          </span>
        </div>
      </div>
    )
  }

  // ── 1x — libraries only ──────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <LibraryGrid />
    </div>
  )

  // ── 2x — libraries + active sessions ────────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <ServerHeader />
      <LibraryGrid />
      {(data.sessions || []).length > 0 && (
        <>
          {sectionTitle('Now streaming')}
          {data.sessions.map((s, i) => <SessionRow key={i} s={s} />)}
        </>
      )}
    </div>
  )

  // ── 4x — everything ──────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <ServerHeader />
      <LibraryGrid />

      {(data.sessions || []).length > 0 && (
        <>
          {sectionTitle('Now streaming')}
          {data.sessions.map((s, i) => <SessionRow key={i} s={s} />)}
        </>
      )}

      {(data.recentlyAdded || []).length > 0 && (
        <>
          {sectionTitle('Recently added')}
          {data.recentlyAdded.map((m, i) => {
            const title = m.grandparentTitle ? `${m.grandparentTitle} — ${m.title}` : m.title
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
                padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <span style={{ fontSize: 12, flexShrink: 0 }}>{TYPE_ICON[m.type] || '📁'}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                  {title}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, fontFamily: 'DM Mono, monospace' }}>
                  {timeAgo(m.addedAt)}
                </span>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
