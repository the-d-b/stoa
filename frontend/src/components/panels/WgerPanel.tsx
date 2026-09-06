import { useEffect, useState, useCallback, useRef } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

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
  weightUnit: string
  weightEntries: WgerWeightEntry[]
  recentSessions: WgerSession[]
}

// Confirmed against wger's current source (wger/manager/models/session.py) —
// impression is a 3-value scale (Bad/Neutral/Good), not the 5-value one this
// used to assume, which would have mislabeled every session.
const IMPRESSION: Record<string, { label: string; color: string }> = {
  '1': { label: 'Bad',     color: '#ef4444' },
  '2': { label: 'Neutral', color: 'var(--text-dim)' },
  '3': { label: 'Good',    color: 'var(--green)' },
}

const TIME_RANGES = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '60d', value: 60 },
  { label: '90d', value: 90 },
  { label: 'All', value: 0 },
]

function fmtDate(iso: string) {
  if (!iso) return ''
  // Sessions use a bare "YYYY-MM-DD" (confirmed live — no time component at
  // all). `new Date(iso)` parses that as UTC midnight, which can render as
  // the previous day in a negative UTC offset. Parse date-only values as
  // local midnight instead; weight entries carry a real offset already
  // ("2026-08-01T00:00:00-06:00") and parse correctly as-is.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fmtWeight(w: number) {
  return w % 1 === 0 ? `${w}` : w.toFixed(1)
}

// Compact "latest weight + trend arrow" for the 1x/2-3x header rows — no
// chart here. A chart this small read as a meaningless smudge, not a chart.
function WeightHeader({ entries, unit }: { entries: WgerWeightEntry[]; unit: string }) {
  if (entries.length === 0) return null
  const latest = entries[0]
  const prev = entries[1]
  const delta = prev ? latest.weight - prev.weight : 0
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→'
  const arrowColor = delta > 0 ? '#ef4444' : delta < 0 ? 'var(--green)' : 'var(--text-dim)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <strong style={{ color: 'var(--text)' }}>{fmtWeight(latest.weight)}</strong> {unit}
      <span style={{ color: arrowColor }}>{arrow}</span>
    </span>
  )
}

// The real chart, at 4x+ only. Leads with the two numbers that actually
// matter for "how's this going" — where you started and where you are now —
// then a properly-sized bar chart across every entry in the selected range,
// with start/end dates anchoring the two ends instead of labeling every bar.
function WeightChart({ entries, unit }: { entries: WgerWeightEntry[]; unit: string }) {
  if (entries.length === 0) return null
  const ordered = [...entries].reverse() // oldest → newest
  const start = ordered[0]
  const now = ordered[ordered.length - 1]
  const delta = now.weight - start.weight
  const deltaColor = delta > 0 ? '#ef4444' : delta < 0 ? 'var(--green)' : 'var(--text-dim)'
  const deltaSign = delta > 0 ? '+' : ''
  const min = Math.min(...ordered.map(x => x.weight))
  const max = Math.max(...ordered.map(x => x.weight))
  const range = max - min || 1

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontFamily: 'DM Mono, monospace', color: 'var(--text-dim)' }}>
          {fmtWeight(start.weight)} {unit}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>→</span>
        <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>
          {fmtWeight(now.weight)} {unit}
        </span>
        {ordered.length > 1 && (
          <span style={{ fontSize: 12, fontWeight: 600, color: deltaColor }}>
            ({deltaSign}{fmtWeight(delta)} {unit})
          </span>
        )}
      </div>
      {ordered.length > 1 && (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 50 }}>
            {ordered.map((e, i) => {
              const h = Math.max(4, Math.round(((e.weight - min) / range) * 46))
              return (
                <div key={i} title={`${fmtWeight(e.weight)} ${unit} — ${fmtDate(e.date)}`} style={{
                  flex: 1, maxWidth: 14, height: h,
                  background: i === ordered.length - 1 ? 'var(--accent)' : 'var(--border)',
                  borderRadius: 2,
                }} />
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{fmtDate(start.date)}</span>
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{fmtDate(now.date)}</span>
          </div>
        </>
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
      <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
        fontFamily: 'DM Mono, monospace' }}>
        {fmtDate(s.date)}
      </span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: 'var(--text-dim)' }}>
        {s.notes || 'Session'}
      </span>
    </div>
  )
}

export default function WgerPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [days, setDays] = useState(0)
  const [data, setData] = useState<WgerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const cfg = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId: string | undefined = cfg.integrationId

  const load = useCallback(async () => {
    try {
      const r = await integrationsApi.getPanelData(panel.id, { days })
      setData(r.data)
      setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id, days])

  const loadRef = useRef(load)
  loadRef.current = load

  // Mirrors FittrackeePanel/PiHolePanel's pattern: a background SSE broadcast
  // reflects the integration's default (all-time) fetch, not necessarily
  // whatever period this panel has selected — so on any SSE signal, re-fetch
  // live with the current `days` instead of applying the broadcast directly.
  const sseData = useSSE<WgerData>(integrationId)
  useEffect(() => { if (sseData !== null) loadRef.current() }, [sseData])

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
      {latest && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}><WeightHeader entries={weights} unit={data.weightUnit} /></span>}
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
        {latest && <WeightHeader entries={weights} unit={data.weightUnit} />}
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
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {TIME_RANGES.map(tr => (
          <button key={tr.value} onClick={() => setDays(tr.value)}
            style={{
              padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600,
              cursor: 'pointer', border: 'none', transition: 'all 0.12s',
              background: days === tr.value ? 'var(--accent)' : 'var(--border)',
              color: days === tr.value ? 'white' : 'var(--text-dim)',
            }}>
            {tr.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>{data.totalWorkouts}</strong> workouts
        </span>
      </div>
      {weights.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4 }}>Weight</div>
          <WeightChart entries={weights} unit={data.weightUnit} />
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
