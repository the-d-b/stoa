import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface WgerWeightEntry {
  date: string
  weight: number
}

interface WgerSession {
  date: string
  impression: string
  notes: string
}

interface WgerData {
  uiUrl: string
  totalWorkouts: number
  weightEntries: WgerWeightEntry[]
  recentSessions: WgerSession[]
}

const IMPRESSION: Record<string, { label: string; color: string }> = {
  '1': { label: 'General',   color: 'var(--text-dim)' },
  '2': { label: 'Bad',       color: '#ef4444' },
  '3': { label: 'OK',        color: 'var(--text-dim)' },
  '4': { label: 'Good',      color: 'var(--green)' },
  '5': { label: 'Excellent', color: '#a78bfa' },
}

function fmtDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fmtWeight(w: number) {
  return w % 1 === 0 ? `${w}` : w.toFixed(1)
}

function WeightTrend({ entries }: { entries: WgerWeightEntry[] }) {
  if (entries.length === 0) return null
  // entries are newest-first; reverse for display (oldest → newest)
  const ordered = [...entries].reverse()
  const latest = entries[0]
  const prev = entries[1]
  const delta = prev ? latest.weight - prev.weight : 0
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→'
  const arrowColor = delta > 0 ? '#ef4444' : delta < 0 ? 'var(--green)' : 'var(--text-dim)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
        {fmtWeight(latest.weight)} kg
      </span>
      <span style={{ fontSize: 12, color: arrowColor }}>{arrow}</span>
      {ordered.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 20 }}>
          {ordered.map((e, i) => {
            const min = Math.min(...ordered.map(x => x.weight))
            const max = Math.max(...ordered.map(x => x.weight))
            const range = max - min || 1
            const h = Math.max(3, Math.round(((e.weight - min) / range) * 16))
            return (
              <div key={i} style={{
                width: 4, height: h,
                background: i === ordered.length - 1 ? 'var(--accent)' : 'var(--border)',
                borderRadius: 2,
              }} />
            )
          })}
        </div>
      )}
    </div>
  )
}

function SessionRow({ s }: { s: WgerSession }) {
  const imp = IMPRESSION[s.impression] ?? { label: '', color: 'var(--text-dim)' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0',
      borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      {imp.label && (
        <span style={{ fontSize: 9, color: imp.color, flexShrink: 0, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {imp.label}
        </span>
      )}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: 'var(--text-dim)' }}>
        {s.notes || 'Session'}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
        fontFamily: 'DM Mono, monospace' }}>
        {fmtDate(s.date)}
      </span>
    </div>
  )
}

export default function WgerPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<WgerData | null>(null)
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
  if (error)   return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>🏋️ {error}</div>
  if (!data)   return null

  const sessions = data.recentSessions ?? []
  const weights  = data.weightEntries ?? []
  const latest   = weights[0]

  // ── 1x ───────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 12,
      height: '100%', overflow: 'hidden' }}>
      <span style={{ fontSize: 18 }}>🏋️</span>
      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
        <strong style={{ color: 'var(--text)' }}>{data.totalWorkouts}</strong> workouts
      </span>
      {latest && (
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>{fmtWeight(latest.weight)}</strong> kg
        </span>
      )}
    </div>
  )

  // ── 2x-3x ────────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, flexShrink: 0 }}>
        <span style={{ color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>{data.totalWorkouts}</strong> workouts
        </span>
        {latest && <WeightTrend entries={weights} />}
      </div>
      {sessions.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {sessions.map((s, i) => <SessionRow key={i} s={s} />)}
        </div>
      )}
    </div>
  )

  // ── 4x+ ──────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>{data.totalWorkouts}</strong> workouts
        </span>
        {latest && <WeightTrend entries={weights} />}
      </div>
      {weights.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4 }}>Weight history</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
            {weights.slice(0, 7).map((e, i) => (
              <span key={i} style={{ fontSize: 11, color: i === 0 ? 'var(--text)' : 'var(--text-dim)',
                fontFamily: 'DM Mono, monospace' }}>
                {fmtWeight(e.weight)} <span style={{ fontSize: 9 }}>{fmtDate(e.date)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {sessions.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>Recent sessions</div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {sessions.map((s, i) => <SessionRow key={i} s={s} />)}
          </div>
        </div>
      )}
    </div>
  )
}
