import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

const withToken = (url?: string) => {
  if (!url) return undefined
  const t = localStorage.getItem('stoa_token')
  return t ? url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(t) : url
}

interface JellyfinLibrary { title: string; type: string; count: number }
interface JellyfinSession {
  user: string; title: string; grandparentTitle: string; type: string
  state: string; progress: number; transcodeDecision: string; player: string
  thumbUrl?: string
}
interface JellyfinData {
  uiUrl: string; serverName: string; version: string
  libraries: JellyfinLibrary[]; sessions: JellyfinSession[]
  transcodeCount: number; directCount: number
}

const TYPE_ICON: Record<string, string> = {
  movie: '🎬', show: '📺', artist: '🎵', photo: '📷', book: '📚', other: '📁'
}
const STATE_COLOR: Record<string, string> = {
  playing: 'var(--green)', paused: 'var(--amber)', buffering: 'var(--text-dim)'
}
const CHEVRON_COLOR = '#aa5cc3'  // Jellyfin purple

const Chevron = ({ size = 14 }: { size?: number }) => (
  <svg width={size * (8 / 14)} height={size} viewBox="0 0 8 14" fill={CHEVRON_COLOR} style={{ display: 'block', flexShrink: 0 }}>
    <polygon points="0,0 5,0 8,7 5,14 0,14 3,7" />
  </svg>
)

const ScrubBar = ({ pct }: { pct: number }) => {
  const p = Math.min(Math.max(pct, 0), 100)
  return (
    <div style={{ position: 'relative', height: 14 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.07)', borderRadius: 3 }} />
      {p > 0 && (
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: `${p}%`, background: 'rgba(170,92,195,0.28)',
          borderRadius: '3px 0 0 3px', transition: 'width 1s linear',
        }} />
      )}
      <div style={{
        position: 'absolute', top: '50%', left: `${p}%`,
        transform: 'translateX(-50%) translateY(-50%)',
        transition: 'left 1s linear', zIndex: 1,
        filter: `drop-shadow(0 0 4px ${CHEVRON_COLOR})`,
      }}>
        <Chevron size={14} />
      </div>
    </div>
  )
}

export default function JellyfinPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<JellyfinData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

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

  const sseData = useSSE<JellyfinData>(integrationId)
  useEffect(() => { if (sseData !== null) setData(sseData) }, [sseData])
  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)   return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data)   return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const sessions = data.sessions || []

  // ── 1x: compact inline chips ──────────────────────────────────────────────
  const LibraryTileGrid = () => (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 4,
      alignContent: 'center', justifyContent: 'center', height: '100%',
    }}>
      {(data.libraries || []).map((lib, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '3px 7px', borderRadius: 5,
          background: 'var(--surface2)', border: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 12, lineHeight: 1 }}>{TYPE_ICON[lib.type] || TYPE_ICON.other}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{lib.title}</span>
          <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--text)' }}>
            {lib.count.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )

  const LibraryChips = () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
      {(data.libraries || []).map((lib, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '3px 7px', borderRadius: 5,
          background: 'var(--surface2)', border: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 12, lineHeight: 1 }}>{TYPE_ICON[lib.type] || TYPE_ICON.other}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{lib.title}</span>
          <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--text)' }}>
            {lib.count.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )

  // ── Stream count bar ───────────────────────────────────────────────────────
  const StreamBar = () => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, justifyContent: 'center' }}>
      <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
          fontSize: 11, textDecoration: 'none', color: 'inherit',
        }}
        onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
        onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
        <span style={{ color: sessions.length > 0 ? 'var(--green)' : 'var(--text-dim)' }}>●</span>
        <span style={{ color: 'var(--text-muted)' }}>{sessions.length} streaming</span>
      </a>
      {data.directCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11,
        }}>
          <span style={{ color: 'var(--green)', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{data.directCount}</span>
          <span style={{ color: 'var(--text-dim)' }}>direct</span>
        </div>
      )}
      {data.transcodeCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid #f59e0b30', fontSize: 11,
        }}>
          <span style={{ color: 'var(--amber)', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{data.transcodeCount}</span>
          <span style={{ color: 'var(--text-dim)' }}>transcode</span>
        </div>
      )}
    </div>
  )

  // ── 2x: one line per session — title inside the scrubber bar ──────────────
  const SessionList = () => {
    if (sessions.length === 0) return <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>○ Nothing playing</div>
    const barH = 22
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {sessions.map((s, i) => {
          const pct = Math.min(Math.max(s.progress || 0, 0), 100)
          const stateColor = STATE_COLOR[s.state] || 'var(--text-dim)'
          const label = s.grandparentTitle ? `${s.grandparentTitle} · ${s.title}` : s.title
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, position: 'relative', height: barH }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.07)' }} />
                  {pct > 0 && (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, bottom: 0,
                      width: `${pct}%`, background: 'rgba(170,92,195,0.28)',
                      transition: 'width 1s linear',
                    }} />
                  )}
                </div>
                <div style={{
                  position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 4,
                  display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: stateColor }} />
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    textShadow: '0 1px 4px rgba(0,0,0,0.7)',
                  }}>
                    {label}
                  </span>
                </div>
                <div style={{
                  position: 'absolute', top: '50%', left: `${pct}%`,
                  transform: 'translateX(-50%) translateY(-50%)',
                  transition: 'left 1s linear', zIndex: 2,
                  filter: `drop-shadow(0 0 4px ${CHEVRON_COLOR})`,
                }}>
                  <Chevron size={barH} />
                </div>
              </div>
              <span style={{
                fontSize: 10, fontFamily: 'DM Mono, monospace', fontWeight: 600,
                color: CHEVRON_COLOR, flexShrink: 0, width: 28, textAlign: 'right',
              }}>
                {pct.toFixed(0)}%
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  // ── 4x: artwork cards with scrubber ───────────────────────────────────────
  const SessionCard = ({ s }: { s: JellyfinSession }) => {
    const isDirect = s.transcodeDecision === 'directplay'
    const displayTitle = s.grandparentTitle || s.title
    const subTitle = s.grandparentTitle ? s.title : null
    const stateColor = STATE_COLOR[s.state] || 'var(--text-dim)'
    const pct = Math.min(Math.max(s.progress || 0, 0), 100)
    const isPlaying = s.state === 'playing'
    const isMusic = s.type === 'audio'
    const meta = [s.user, s.player].filter(Boolean).join(' · ')

    return (
      <div style={{
        display: 'flex', borderRadius: 10,
        background: 'var(--surface2)', border: '1px solid var(--border)',
        overflow: 'hidden', margin: '4px 0', minHeight: 72,
      }}>
        {/* Artwork */}
        <div style={{
          width: isMusic ? 64 : 52, flexShrink: 0,
          background: 'var(--surface3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', position: 'relative',
        }}>
          {s.thumbUrl
            ? <img src={withToken(s.thumbUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : <span style={{ fontSize: 22, opacity: 0.5 }}>{TYPE_ICON[s.type] || TYPE_ICON.other}</span>
          }
          <div style={{
            position: 'absolute', bottom: 5, left: 5,
            width: 8, height: 8, borderRadius: '50%',
            background: stateColor,
            boxShadow: `0 0 0 2px var(--surface2)${isPlaying ? `, 0 0 5px ${stateColor}` : ''}`,
          }} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, padding: '8px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayTitle}
            </span>
          </div>
          {subTitle && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {subTitle}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, marginTop: 'auto' }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {meta}
            </span>
            <span style={{ fontSize: 10, color: CHEVRON_COLOR, fontFamily: 'DM Mono, monospace', fontWeight: 600, flexShrink: 0 }}>
              {pct.toFixed(0)}%
            </span>
            <span style={{ fontSize: 10, color: isDirect ? 'var(--green)' : 'var(--amber)', flexShrink: 0 }}>
              {isDirect ? '⚡' : '⚙'}
            </span>
          </div>
          <ScrubBar pct={pct} />
        </div>
      </div>
    )
  }

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, marginTop: 8 }}>
      {text}
    </div>
  )

  const NothingPlaying = () => (
    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>○ Nothing playing</div>
  )

  // ── 1x — library count chips ──────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <LibraryTileGrid />
    </div>
  )

  // ── 2x — stream bar + compact session list ────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <StreamBar />
      <SessionList />
    </div>
  )

  // ── 4x — artwork cards + libraries ───────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <StreamBar />
      {sessions.length > 0
        ? sessions.map((s, i) => <SessionCard key={i} s={s} />)
        : <NothingPlaying />
      }
      {sectionTitle('Libraries')}
      <LibraryChips />
    </div>
  )
}
