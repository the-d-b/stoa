import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, panelsApi, myPanelsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface TracearrStreamSummary { total: number; transcodes: number; directPlays: number }
interface TracearrStream {
  username: string; mediaTitle: string; showTitle: string; mediaType: string
  state: string; progressMs: number; durationMs: number
  isTranscode: boolean; platform: string; serverName: string
}
interface TracearrUser { username: string; plays: number }
interface TracearrHistoryItem {
  username: string; mediaTitle: string; showTitle: string; mediaType: string
  durationMs: number; watched: boolean; startedAt: string
  platform: string; serverName: string; isTranscode: boolean
}
interface TracearrViolation {
  severity: string; ruleType: string; ruleName: string
  username: string; createdAt: string
}
interface TracearrData {
  uiUrl: string
  summary: TracearrStreamSummary
  streams: TracearrStream[]
  totalPlays: number
  topUsers: TracearrUser[]
  recentHistory: TracearrHistoryItem[]
  violations: TracearrViolation[]
}

const TIME_RANGES = [
  { label: '1d', value: 1 },
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '∞', value: 0 },
]

const MEDIA_ICON: Record<string, string> = {
  movie: '🎬', episode: '📺', track: '🎵', photo: '📷'
}

const SEVERITY_COLOR: Record<string, string> = {
  high: '#ef4444', warning: 'var(--amber)', low: 'var(--text-dim)'
}

const RULE_LABEL: Record<string, string> = {
  concurrent_streams:      'Concurrent Streams',
  simultaneous_locations:  'Simultaneous Locations',
  device_velocity:         'Device Velocity',
  impossible_travel:       'Impossible Travel',
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

export default function TracearrPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<TracearrData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined
  const [timeRange, setTimeRange] = useState<number>(config.timeRange ?? 30)
  const isSystem = !panel.createdBy || panel.createdBy === 'SYSTEM'

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id, { timeRange })
      setData(res.data); setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id, timeRange])

  const changeTimeRange = async (val: number) => {
    setTimeRange(val)
    setSaving(true)
    try {
      const newConfig = JSON.stringify({ ...config, timeRange: val })
      if (isSystem) await panelsApi.update(panel.id, { title: panel.title, config: newConfig })
      else await myPanelsApi.update(panel.id, { title: panel.title, config: newConfig })
    } finally { setSaving(false) }
  }

  const sseSignal = useSSE<any>(integrationId)
  useEffect(() => {
    if (sseSignal !== null) load()
  }, [sseSignal, load])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)   return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data)   return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const streams = data.streams || []
  const summary = data.summary || { total: 0, transcodes: 0, directPlays: 0 }

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 5, marginTop: 8 }}>{text}</div>
  )

  const TimeRangePills = () => (
    <div style={{ display: 'flex', gap: 4, marginBottom: 8, alignItems: 'center' }}>
      {TIME_RANGES.map(tr => (
        <button key={tr.value} onClick={() => changeTimeRange(tr.value)} disabled={saving}
          style={{
            padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600,
            cursor: 'pointer', border: 'none', transition: 'all 0.12s',
            background: timeRange === tr.value ? 'var(--accent)' : 'var(--surface2)',
            color: timeRange === tr.value ? 'white' : 'var(--text-muted)',
          }}>
          {tr.label}
        </button>
      ))}
      {saving && <span style={{ fontSize: 10, color: 'var(--text-dim)', alignSelf: 'center' }}>…</span>}
      {uiUrl && <a href={uiUrl} target="_blank" rel="noopener noreferrer"
        style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)', textDecoration: 'none' }}
        onMouseOver={e => e.currentTarget.style.color = 'var(--accent2)'}
        onMouseOut={e => e.currentTarget.style.color = 'var(--text-dim)'}>↗</a>}
    </div>
  )

  const StreamSummaryBar = () => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
      <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
          fontSize: 11, textDecoration: 'none', color: 'inherit' }}
        onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
        onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
        <span style={{ color: summary.total > 0 ? 'var(--green)' : 'var(--text-dim)' }}>●</span>
        <span style={{ color: 'var(--text-muted)' }}>{summary.total} streaming</span>
      </a>
      {summary.transcodes > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid #f59e0b30', fontSize: 11 }}>
          <span style={{ color: 'var(--amber)', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{summary.transcodes}</span>
          <span style={{ color: 'var(--text-dim)' }}>transcode</span>
        </div>
      )}
      {summary.directPlays > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
          <span style={{ color: 'var(--green)', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{summary.directPlays}</span>
          <span style={{ color: 'var(--text-dim)' }}>direct</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
        borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
        <span style={{ color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{data.totalPlays}</span>
        <span style={{ color: 'var(--text-dim)' }}>plays</span>
      </div>
    </div>
  )

  const StreamRow = ({ s }: { s: TracearrStream }) => {
    const pct = s.durationMs > 0 ? Math.min((s.progressMs / s.durationMs) * 100, 100) : 0
    const title = s.showTitle || s.mediaTitle
    const subTitle = s.showTitle ? s.mediaTitle : null
    const isDirect = !s.isTranscode
    const isPlaying = s.state === 'playing'
    return (
      <div style={{ margin: '4px 0', borderRadius: 8,
        background: 'var(--surface2)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'var(--border)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, height: 2,
            width: `${pct}%`, background: isDirect ? 'var(--accent)' : 'var(--amber)',
            transition: 'width 1s linear',
            boxShadow: isPlaying ? `0 0 6px ${isDirect ? 'var(--accent)' : '#f59e0b'}` : 'none',
          }} />
          <div style={{ padding: '6px 10px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: isPlaying ? 'var(--green)' : 'var(--amber)',
                boxShadow: isPlaying ? '0 0 0 2px var(--green)30' : 'none' }} />
              <span style={{ fontSize: 12, fontWeight: 600, flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title}
              </span>
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
              <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>{s.username}</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>{s.serverName}</span>
              <span style={{ fontSize: 10, color: isDirect ? 'var(--green)' : 'var(--amber)', flexShrink: 0 }}>
                {isDirect ? '⚡ direct' : '⚙ transcode'}
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const TopUsersSection = ({ limit }: { limit: number }) => {
    const users = (data.topUsers || []).slice(0, limit)
    if (users.length === 0) return null
    const maxPlays = Math.max(...users.map(u => u.plays), 1)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {users.map((u, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 80,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              flexShrink: 0 }}>{u.username}</span>
            <div style={{ flex: 1, height: 3, background: 'var(--surface2)', borderRadius: 2 }}>
              <div style={{ width: `${(u.plays / maxPlays) * 100}%`, height: '100%',
                background: 'var(--accent)', borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
              fontFamily: 'DM Mono, monospace', textAlign: 'right', width: 24 }}>
              {u.plays}
            </span>
          </div>
        ))}
      </div>
    )
  }

  const HistorySection = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {(data.recentHistory || []).map((h, i) => {
        const title = h.showTitle ? `${h.showTitle} — ${h.mediaTitle}` : h.mediaTitle
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 7px', borderRadius: 6,
            background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, flexShrink: 0 }}>{MEDIA_ICON[h.mediaType] || '▶'}</span>
            <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', color: 'var(--text-muted)' }} title={title}>{title}</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>{h.username}</span>
            <span style={{ fontSize: 10, color: h.watched ? 'var(--green)' : 'var(--text-dim)',
              flexShrink: 0, fontFamily: 'DM Mono, monospace' }}>
              {h.watched ? '✓' : '○'}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
              fontFamily: 'DM Mono, monospace' }}>{timeAgo(h.startedAt)}</span>
          </div>
        )
      })}
    </div>
  )

  const ViolationsSection = () => {
    const items = data.violations || []
    if (items.length === 0) return (
      <div style={{ fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 5 }}>
        <span>✓</span><span>No active alerts</span>
      </div>
    )
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map((v, i) => {
          const color = SEVERITY_COLOR[v.severity] || 'var(--text-dim)'
          const label = RULE_LABEL[v.ruleType] || v.ruleName || v.ruleType
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6,
              padding: '3px 7px', borderRadius: 6,
              background: 'var(--surface2)', border: `1px solid ${color}30` }}>
              <span style={{ fontSize: 10, color, flexShrink: 0 }}>▲</span>
              <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{label}</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>{v.username}</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
                fontFamily: 'DM Mono, monospace' }}>{timeAgo(v.createdAt)}</span>
            </div>
          )
        })}
      </div>
    )
  }

  // ── 1x ───────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {streams.length > 0
        ? streams.map((s, i) => <StreamRow key={i} s={s} />)
        : <div style={{ display: 'flex', alignItems: 'center', height: '100%',
            fontSize: 12, color: 'var(--text-dim)' }}>○ Nothing playing</div>}
    </div>
  )

  // ── 2x-3x ────────────────────────────────────────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <TimeRangePills />
      <StreamSummaryBar />
      {streams.length > 0 && streams.map((s, i) => <StreamRow key={i} s={s} />)}
      {streams.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>○ Nothing playing</div>}
      {sectionTitle('Top viewers')}
      <TopUsersSection limit={4} />
    </div>
  )

  // ── 4x+ ──────────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <TimeRangePills />
      <StreamSummaryBar />
      {streams.length > 0 && streams.map((s, i) => <StreamRow key={i} s={s} />)}
      {streams.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>○ Nothing playing</div>}
      {sectionTitle('Top viewers')}
      <TopUsersSection limit={5} />
      {sectionTitle('Recent plays')}
      <HistorySection />
      {sectionTitle('Alerts')}
      <ViolationsSection />
    </div>
  )
}
