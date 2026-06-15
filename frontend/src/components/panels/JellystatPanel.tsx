import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, panelsApi, myPanelsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface JellystatViews { audio: number; movie: number; series: number; other: number }
interface JellystatUser { name: string; plays: number }
interface JellystatItem { name: string; plays: number }
interface JellystatData {
  uiUrl: string
  views: JellystatViews
  topUsers: JellystatUser[]
  topMovies: JellystatItem[]
  topSeries: JellystatItem[]
}

const TIME_RANGES = [
  { label: '1d', value: 1 },
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '∞', value: 0 },
]

function rangLabel(v: number) {
  if (v === 0) return '∞'
  if (v === 1) return '1d'
  return `${v}d`
}

export default function JellystatPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<JellystatData | null>(null)
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
  useEffect(() => { if (sseSignal !== null) load() }, [sseSignal, load])
  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)   return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data)   return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const views = data.views || { audio: 0, movie: 0, series: 0, other: 0 }
  const totalPlays = views.movie + views.series + views.audio + views.other
  const userCount = (data.topUsers || []).length

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

  // ── 1x: stat tiles — same structure as Tracearr/Tautulli ─────────────────
  const StatTiles = () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignContent: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
        <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>{totalPlays}</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>plays</span>
      </div>
      {userCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>{userCount}</span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>users</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', padding: '3px 6px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
        <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>{rangLabel(timeRange)}</span>
      </div>
    </div>
  )

  // ── summary chips for 2x/4x ───────────────────────────────────────────────
  const ViewsChips = () => {
    const items = [
      { icon: '🎬', label: 'movies', val: views.movie },
      { icon: '📺', label: 'series', val: views.series },
      { icon: '🎵', label: 'audio',  val: views.audio },
      ...(views.other > 0 ? [{ icon: '▶', label: 'other', val: views.other }] : []),
    ]
    return (
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
        {items.map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
            <span style={{ fontSize: 12 }}>{item.icon}</span>
            <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--text)' }}>{item.val.toLocaleString()}</span>
          </div>
        ))}
        {totalPlays > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--text)' }}>{totalPlays}</span>
            <span style={{ color: 'var(--text-dim)' }}>total</span>
          </div>
        )}
        {userCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--text)' }}>{userCount}</span>
            <span style={{ color: 'var(--text-dim)' }}>users</span>
          </div>
        )}
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
            <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{u.name}</span>
            <div style={{ flex: 1, height: 3, background: 'var(--surface2)', borderRadius: 2 }}>
              <div style={{ width: `${(u.plays / maxPlays) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, fontFamily: 'DM Mono, monospace', textAlign: 'right', width: 30 }}>{u.plays}</span>
          </div>
        ))}
      </div>
    )
  }

  const ItemList = ({ items, limit }: { items: JellystatItem[]; limit: number }) => {
    const visible = (items || []).slice(0, limit)
    if (visible.length === 0) return <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No plays in this period</div>
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {visible.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 7px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }} title={item.name}>{item.name}</span>
            <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>{item.plays}</span>
          </div>
        ))}
      </div>
    )
  }

  // ── 1x — stat tiles ───────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      <StatTiles />
    </div>
  )

  // ── 2x — range picker + view chips + top viewers ──────────────────────────
  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <TimeRangePills />
      <ViewsChips />
      {sectionTitle('Top viewers')}
      <TopUsersSection limit={5} />
    </div>
  )

  // ── 4x — range + views + top viewers + top movies + top series ────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <TimeRangePills />
      <ViewsChips />
      {sectionTitle('Top viewers')}
      <TopUsersSection limit={5} />
      {sectionTitle('Top movies')}
      <ItemList items={data.topMovies} limit={6} />
      {sectionTitle('Top series')}
      <ItemList items={data.topSeries} limit={6} />
    </div>
  )
}
