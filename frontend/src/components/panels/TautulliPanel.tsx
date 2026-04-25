import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, panelsApi, myPanelsApi, Panel } from '../../api'

interface TautulliMediaStat {
  title: string; grandparentTitle: string; mediaType: string
  playCount: number; totalDuration: number
  thumbUrl?: string; ratingKey?: string
}
interface TautulliUserStat {
  user: string; playCount: number; totalDuration: number
}
interface TautulliHistory {
  user: string; title: string; grandparentTitle: string
  mediaType: string; date: number; percentComplete: number
  ratingKey?: string
}
interface TautulliData {
  uiUrl: string
  mostPlayed: TautulliMediaStat[]
  userStats: TautulliUserStat[]
  history: TautulliHistory[]
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

function tautulliInfoUrl(uiUrl: string, ratingKey?: string) {
  if (!uiUrl || !ratingKey) return uiUrl || ''
  return `${uiUrl}/info?rating_key=${ratingKey}`
}

function timeAgo(unixSecs: number) {
  const diff = Date.now() / 1000 - unixSecs
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function TautulliPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<TautulliData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const [timeRange, setTimeRange] = useState<number>(config.timeRange ?? 30)
  const isSystem = !panel.createdBy || panel.createdBy === 'SYSTEM'

  const load = useCallback(async () => {
    try {
      // Pass timeRange as query param — bypasses cache so filter changes take effect immediately
      const res = await integrationsApi.getPanelData(panel.id, { timeRange })
      setData(res.data); setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id, timeRange])

  const changeTimeRange = async (val: number) => {
    setTimeRange(val)  // triggers load via useEffect dependency on timeRange
    // Persist to panel config so it survives page refresh
    setSaving(true)
    try {
      const newConfig = JSON.stringify({ ...config, timeRange: val })
      if (isSystem) await panelsApi.update(panel.id, { title: panel.title, config: newConfig })
      else await myPanelsApi.update(panel.id, { title: panel.title, config: newConfig })
    } finally { setSaving(false) }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 300 * 1000)
    return () => clearInterval(interval)
  }, [load])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)   return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data)   return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')

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

  const MostPlayedSection = ({ limit }: { limit: number }) => {
    const items = (data.mostPlayed || []).slice(0, limit)
    if (items.length === 0) return <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No plays in this period</div>
    const rows: TautulliMediaStat[][] = []
    for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 5 }}>
            {row.map((m, mi) => {
              const title = m.grandparentTitle || m.title
              return (
                <a key={mi} href={tautulliInfoUrl(data.uiUrl, m.ratingKey)}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 5,
                    padding: '3px 7px', borderRadius: 6, textDecoration: 'none', color: 'inherit',
                    background: 'var(--surface2)', border: '1px solid var(--border)', minWidth: 0,
                  }}>
                  <span style={{ fontSize: 11, flexShrink: 0 }}>{MEDIA_ICON[m.mediaType] || '▶'}</span>
                  <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap', color: 'var(--text-muted)' }} title={title}>{title}</span>
                  <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', fontWeight: 600,
                    color: 'var(--text)', flexShrink: 0 }}>{m.playCount}</span>
                </a>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  const UserStatsSection = ({ limit }: { limit: number }) => {
    const users = (data.userStats || []).slice(0, limit)
    if (users.length === 0) return null
    const maxPlays = Math.max(...users.map(u => u.playCount), 1)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {users.map((u, i) => {
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 80,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                flexShrink: 0 }}>{u.user}</span>
              <div style={{ flex: 1, height: 3, background: 'var(--surface2)', borderRadius: 2 }}>
                <div style={{ width: `${(u.playCount / maxPlays) * 100}%`, height: '100%',
                  background: 'var(--accent)', borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
                fontFamily: 'DM Mono, monospace', textAlign: 'right', width: 60 }}>
                {u.playCount} · {formatDuration(u.totalDuration)}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  const HistorySection = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {(data.history || []).map((h, i) => {
        const title = h.grandparentTitle ? `${h.grandparentTitle} — ${h.title}` : h.title
        return (
          <a key={i} href={tautulliInfoUrl(data.uiUrl, h.ratingKey)}
            target="_blank" rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '3px 7px', borderRadius: 6, textDecoration: 'none', color: 'inherit',
              background: 'var(--surface2)', border: '1px solid var(--border)',
            }}>
            <span style={{ fontSize: 11, flexShrink: 0 }}>{MEDIA_ICON[h.mediaType] || '▶'}</span>
            <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', color: 'var(--text-muted)' }} title={title}>{title}</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>{h.user}</span>
            <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', flexShrink: 0,
              color: h.percentComplete >= 90 ? 'var(--green)' : 'var(--text-dim)' }}>
              {Math.round(h.percentComplete)}%
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
              fontFamily: 'DM Mono, monospace' }}>{timeAgo(h.date)}</span>
          </a>
        )
      })}
    </div>
  )

  if (heightUnits <= 1) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <MostPlayedSection limit={6} />
    </div>
  )

  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <TimeRangePills />
      {sectionTitle('Most played')}
      <MostPlayedSection limit={4} />
      {sectionTitle('Top viewers')}
      <UserStatsSection limit={4} />
    </div>
  )

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <TimeRangePills />
      {sectionTitle('Most played')}
      <MostPlayedSection limit={4} />
      {sectionTitle('Top viewers')}
      <UserStatsSection limit={4} />
      {sectionTitle('Recent plays')}
      <HistorySection />
    </div>
  )
}
