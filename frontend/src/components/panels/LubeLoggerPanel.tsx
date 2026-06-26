import { useState, useEffect, useCallback, useRef } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface LubeLoggerReminder {
  description: string
  urgency: string       // "Not Urgent" | "Urgent" | "Very Urgent" | "Past Due"
  dueDate: string       // "" for mileage-only
  dueOdometer: number   // 0 for date-only
  metric: string
}

interface LubeLoggerServiceRecord {
  date: string
  description: string
  odometer: number
  cost: number
}

interface LubeLoggerVehicle {
  id: number
  year: string
  make: string
  model: string
  imageURL: string
  lastOdometer: number
  reminders: LubeLoggerReminder[]
  recentService: LubeLoggerServiceRecord[]
}

interface LubeLoggerData {
  uiUrl: string
  integrationId: string
  vehicles: LubeLoggerVehicle[]
  overdueCount: number
  urgentCount: number
  totalReminders: number
}

const TODAY = new Date().toISOString().slice(0, 10)

function urgencyColor(u: string): string {
  const l = u.toLowerCase()
  if (l === 'past due') return '#ef4444'
  if (l === 'very urgent') return '#f97316'
  if (l === 'urgent') return '#f59e0b'
  return '#6366f1'
}

function daysLabel(dateStr: string): string {
  if (!dateStr) return ''
  const diff = Math.round((new Date(dateStr).getTime() - new Date(TODAY).getTime()) / 86400000)
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  if (diff === 0) return 'due today'
  if (diff === 1) return 'due tomorrow'
  return `in ${diff}d`
}

function fmtOdo(odo: number): string {
  if (!odo) return ''
  return odo.toLocaleString() + ' mi'
}

function fmtCost(cost: number): string {
  if (!cost) return ''
  return '$' + cost.toFixed(2)
}

function fmtDate(d: string): string {
  if (!d) return ''
  // ISO YYYY-MM-DD needs T12:00:00 to avoid UTC midnight timezone shift; other formats parse directly
  const dt = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00') : new Date(d)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, marginTop: 10 }}>
      {children}
    </div>
  )
}

function ReminderRow({ r }: { r: LubeLoggerReminder }) {
  const color = urgencyColor(r.urgency)
  const dl = r.dueDate ? daysLabel(r.dueDate) : ''
  const isPastDue = r.urgency.toLowerCase() === 'past due'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '4px 8px', borderRadius: 5, marginBottom: 3,
      borderLeft: `3px solid ${color}`,
      background: isPastDue ? color + '0d' : 'transparent',
    }}>
      <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.description}
      </span>
      {dl && (
        <span style={{ fontSize: 10, color, fontWeight: 600, flexShrink: 0,
          fontFamily: 'DM Mono, monospace' }}>
          {dl}
        </span>
      )}
      {!dl && r.dueOdometer > 0 && (
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
          fontFamily: 'DM Mono, monospace' }}>
          {fmtOdo(r.dueOdometer)}
        </span>
      )}
    </div>
  )
}

function ServiceRow({ s }: { s: LubeLoggerServiceRecord }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
      borderBottom: '1px solid var(--border)' }}>
      <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 70 }}>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
          {fmtDate(s.date)}
        </div>
        {s.odometer > 0 && (
          <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
            {fmtOdo(s.odometer)}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.description}
        </div>
      </div>
      {s.cost > 0 && (
        <span style={{ fontSize: 10, color: 'var(--green)', flexShrink: 0,
          fontFamily: 'DM Mono, monospace' }}>
          {fmtCost(s.cost)}
        </span>
      )}
    </div>
  )
}

// One carousel slide — key={v.id} on the parent resets imgError on vehicle change
function CarouselSlide({ v, uiUrl }: { v: LubeLoggerVehicle; uiUrl: string }) {
  const [imgError, setImgError] = useState(false)
  const label = [v.year, v.make, v.model].filter(Boolean).join(' ')
  const reminders = v.reminders || []
  const service = v.recentService || []
  const overdueCount = reminders.filter(r => r.urgency.toLowerCase() === 'past due').length
  const urgentCount = reminders.filter(r => ['very urgent', 'urgent'].includes(r.urgency.toLowerCase())).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {v.imageURL && !imgError && (
        <img
          src={v.imageURL}
          alt={label}
          onError={() => setImgError(true)}
          style={{ width: '100%', maxHeight: 200, objectFit: 'cover',
            borderRadius: 8, marginBottom: 10, display: 'block' }}
        />
      )}
      <a href={uiUrl ? `${uiUrl}/vehicle/${v.id}` : '#'} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          textDecoration: 'none', color: 'inherit' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{label}</span>
        {v.lastOdometer > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
            {fmtOdo(v.lastOdometer)}
          </span>
        )}
        {overdueCount > 0 && (
          <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3,
            background: '#ef444428', color: '#ef4444', fontWeight: 700 }}>
            {overdueCount} overdue
          </span>
        )}
        {urgentCount > 0 && overdueCount === 0 && (
          <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3,
            background: '#f59e0b28', color: '#f59e0b', fontWeight: 700 }}>
            {urgentCount} urgent
          </span>
        )}
      </a>

      {reminders.length > 0 && (
        <>
          <SectionLabel>Reminders</SectionLabel>
          {reminders.map((r, i) => <ReminderRow key={i} r={r} />)}
        </>
      )}
      {reminders.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '2px 8px', marginBottom: 4 }}>
          No reminders
        </div>
      )}

      {service.length > 0 && (
        <>
          <SectionLabel>Recent service</SectionLabel>
          {service.map((s, i) => <ServiceRow key={i} s={s} />)}
        </>
      )}
    </div>
  )
}

export default function LubeLoggerPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<LubeLoggerData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeIdx, setActiveIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setData(res.data); setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  const sseData = useSSE<LubeLoggerData>(integrationId)
  useEffect(() => { if (sseData !== null) setData(sseData) }, [sseData])
  useEffect(() => { load() }, [load])

  const vehicles = data?.vehicles || []

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (vehicles.length <= 1) return
    timerRef.current = setInterval(() => {
      setActiveIdx(i => (i + 1) % vehicles.length)
    }, 30000)
  }, [vehicles.length])

  useEffect(() => {
    startTimer()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [startTimer])

  const goTo = (idx: number) => {
    setActiveIdx(idx)
    startTimer()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  )
  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4,
      color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  )
  if (!data) return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const safeIdx = Math.min(activeIdx, Math.max(0, vehicles.length - 1))

  // ── Summary chips (shared) ───────────────────────────────────────────────
  const SummaryChips = () => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
      <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 6,
          padding: '3px 10px', borderRadius: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          textDecoration: 'none', color: 'inherit', fontSize: 12 }}>
        <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>{vehicles.length}</span>
        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
          {vehicles.length === 1 ? 'vehicle' : 'vehicles'}
        </span>
      </a>
      {data.overdueCount > 0 && (
        <div style={{ padding: '3px 10px', borderRadius: 6,
          background: '#ef444420', border: '1px solid #ef444440', fontSize: 12 }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, color: '#ef4444' }}>
            {data.overdueCount}
          </span>
          <span style={{ color: '#ef4444', fontSize: 11, marginLeft: 4 }}>past due</span>
        </div>
      )}
      {data.urgentCount > 0 && (
        <div style={{ padding: '3px 10px', borderRadius: 6,
          background: '#f59e0b20', border: '1px solid #f59e0b40', fontSize: 12 }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, color: '#f59e0b' }}>
            {data.urgentCount}
          </span>
          <span style={{ color: '#f59e0b', fontSize: 11, marginLeft: 4 }}>urgent</span>
        </div>
      )}
      {data.overdueCount === 0 && data.urgentCount === 0 && data.totalReminders > 0 && (
        <div style={{ padding: '3px 10px', borderRadius: 6,
          background: '#6366f120', border: '1px solid #6366f140', fontSize: 12 }}>
          <span style={{ color: '#6366f1', fontSize: 11 }}>All good ✓</span>
        </div>
      )}
      {data.totalReminders > 0 && (
        <div style={{ padding: '3px 9px', borderRadius: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
            {data.totalReminders}
          </span>
          <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>reminders</span>
        </div>
      )}
    </div>
  )

  // ── Nav dots ─────────────────────────────────────────────────────────────
  const NavDots = () => vehicles.length <= 1 ? null : (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 7, paddingTop: 12 }}>
      {vehicles.map((_, i) => (
        <button key={i} onClick={() => goTo(i)} style={{
          width: i === safeIdx ? 18 : 7, height: 7, borderRadius: 4, border: 'none',
          cursor: 'pointer', padding: 0, transition: 'all 0.2s',
          background: i === safeIdx ? 'var(--text-muted)' : 'var(--border)',
        }} />
      ))}
    </div>
  )

  // ── 1x: chips only ───────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center' }}>
      <SummaryChips />
    </div>
  )

  // ── 2x+: carousel ────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SummaryChips />
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {vehicles.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No vehicles found</div>
          : <CarouselSlide key={vehicles[safeIdx].id} v={vehicles[safeIdx]} uiUrl={uiUrl} />
        }
      </div>
      <NavDots />
    </div>
  )
}
