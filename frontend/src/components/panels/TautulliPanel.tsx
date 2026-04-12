import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, panelsApi, myPanelsApi, Panel } from '../../api'

interface TautulliMediaStat {
  title: string; grandparentTitle: string; mediaType: string
  playCount: number; totalDuration: number
}
interface TautulliUserStat {
  user: string; playCount: number; totalDuration: number
}
interface TautulliHistory {
  user: string; title: string; grandparentTitle: string
  mediaType: string; date: number; duration: number; percentComplete: number
}
interface TautulliData {
  uiUrl: string
  mostPlayed: TautulliMediaStat[]
  userStats: TautulliUserStat[]
  history: TautulliHistory[]
}

const TIME_RANGES = [
  { label: '1d',  value: 1 },
  { label: '7d',  value: 7 },
  { label: '30d', value: 30 },
  { label: 'All', value: 0 },
]

const MEDIA_ICON: Record<string, string> = {
  movie: '🎬', episode: '📺', track: '🎵', photo: '📷'
}

function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function timeAgo(unixSecs: number) {
  const diff = Date.now() / 1000 - unixSecs
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
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
      const res = await integrationsApi.getPanelData(panel.id)
      setData(res.data); setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  // Save timeRange to panel config and reload
  const changeTimeRange = async (val: number) => {
    setTimeRange(val)
    setSaving(true)
    try {
      const newConfig = JSON.stringify({ ...config, timeRange: val })
      if (isSystem) await panelsApi.update(panel.id, { title: panel.title, config: newConfig })
      else await myPanelsApi.update(panel.id, { title: panel.title, config: newConfig })
      // Small delay then reload with new range
      setTimeout(load, 300)
    } finally { setSaving(false) }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 300 * 1000) // 5min refresh
    return () => clearInterval(interval)
  }, [load])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)   return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data)   return null

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 6, marginTop: 10 }}>{text}</div>
  )

  // ── Time range pills ──────────────────────────────────────────────────────
  const TimeRangePills = () => (
    <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
      {TIME_RANGES.map(tr => (
        <button key={tr.value} onClick={() => changeTimeRange(tr.value)}
          disabled={saving}
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
    </div>
  )

  // ── Most played rows ──────────────────────────────────────────────────────
  const MostPlayedSection = ({ limit }: { limit: number }) => {
    const items = (data.mostPlayed || []).slice(0, limit)
    if (items.length === 0) return <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No plays in this period</div>
    return (
      <>
        {items.map((m, i) => {
          const displayTitle = m.grandparentTitle || m.title
          const displaySub = m.grandparentTitle ? m.title : null
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
              padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
              <span style={{ fontSize: 12, flexShrink: 0 }}>{MEDIA_ICON[m.mediaType] || '▶'}</span>
              <span style={{ flex: 1, overflow: 'hidden' }}>
                <span style={{ fontWeight: 500, display: 'block', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayTitle}</span>
                {displaySub && <span style={{ fontSize: 10, color: 'var(--text-dim)', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{displaySub}</span>}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right' }}>
                <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--text)' }}>{m.playCount}</span>
                <span style={{ color: 'var(--text-dim)' }}> plays</span>
              </span>
            </div>
          )
        })}
      </>
    )
  }

  // ── User stats ────────────────────────────────────────────────────────────
  const UserStatsSection = () => {
    const users = data.userStats || []
    if (users.length === 0) return null
    const maxPlays = Math.max(...users.map(u => u.playCount), 1)
    return (
      <>
        {users.map((u, i) => (
          <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 12, flex: 1, fontWeight: 500 }}>{u.user}</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
                {u.playCount} plays · {formatDuration(u.totalDuration)}
              </span>
            </div>
            <div style={{ height: 2, background: 'var(--surface2)', borderRadius: 1 }}>
              <div style={{ width: `${(u.playCount / maxPlays) * 100}%`, height: '100%',
                background: 'var(--accent)', borderRadius: 1 }} />
            </div>
          </div>
        ))}
      </>
    )
  }

  // ── History rows ──────────────────────────────────────────────────────────
  const HistorySection = () => (
    <>
      {(data.history || []).map((h, i) => {
        const displayTitle = h.grandparentTitle ? `${h.grandparentTitle} — ${h.title}` : h.title
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
            padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
            <span style={{ fontSize: 12, flexShrink: 0 }}>{MEDIA_ICON[h.mediaType] || '▶'}</span>
            <span style={{ flex: 1, overflow: 'hidden' }}>
              <span style={{ fontWeight: 500, display: 'block', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayTitle}</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{h.user}</span>
            </span>
            <span style={{ flexShrink: 0, textAlign: 'right' }}>
              <span style={{ display: 'block', fontSize: 10, color: 'var(--text-dim)',
                fontFamily: 'DM Mono, monospace' }}>{timeAgo(h.date)}</span>
              <span style={{ display: 'block', fontSize: 10,
                color: h.percentComplete >= 90 ? 'var(--green)' : 'var(--text-dim)' }}>
                {Math.round(h.percentComplete)}%
              </span>
            </span>
          </div>
        )
      })}
    </>
  )

  // ── 1x — most played (top 5) ──────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <TimeRangePills />
      <MostPlayedSection limit={5} />
    </div>
  )

  // ── 2x — most played + user stats ────────────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <TimeRangePills />
      {sectionTitle('Most played')}
      <MostPlayedSection limit={8} />
      {sectionTitle('Top viewers')}
      <UserStatsSection />
    </div>
  )

  // ── 4x — everything ──────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <TimeRangePills />
      {sectionTitle('Most played')}
      <MostPlayedSection limit={10} />
      {sectionTitle('Top viewers')}
      <UserStatsSection />
      {sectionTitle('Recent plays')}
      <HistorySection />
    </div>
  )
}
