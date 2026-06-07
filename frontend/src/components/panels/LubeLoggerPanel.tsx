import { useState, useEffect, useCallback } from 'react'
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
  return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// Single reminder row with urgency left-border
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

// Vehicle card with reminders
function VehicleCard({ v, uiUrl, compact = false }: {
  v: LubeLoggerVehicle; uiUrl: string; compact?: boolean
}) {
  const href = uiUrl ? `${uiUrl}/vehicle/${v.id}` : '#'
  const label = [v.year, v.make, v.model].filter(Boolean).join(' ')
  const overdueReminders = v.reminders.filter(r => r.urgency.toLowerCase() === 'past due')
  const urgentReminders = v.reminders.filter(r =>
    ['very urgent', 'urgent'].includes(r.urgency.toLowerCase()))

  return (
    <div style={{ marginBottom: compact ? 10 : 14 }}>
      {/* Vehicle header */}
      <a href={href} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
          textDecoration: 'none', color: 'inherit' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{label}</span>
        {v.lastOdometer > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
            {fmtOdo(v.lastOdometer)}
          </span>
        )}
        {overdueReminders.length > 0 && (
          <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3,
            background: '#ef444428', color: '#ef4444', fontWeight: 700, flexShrink: 0 }}>
            {overdueReminders.length} overdue
          </span>
        )}
        {urgentReminders.length > 0 && overdueReminders.length === 0 && (
          <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3,
            background: '#f59e0b28', color: '#f59e0b', fontWeight: 700, flexShrink: 0 }}>
            {urgentReminders.length} urgent
          </span>
        )}
      </a>
      {/* Reminders */}
      {v.reminders.length === 0
        ? <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '2px 8px' }}>
            No reminders
          </div>
        : v.reminders.slice(0, compact ? 3 : 999).map((r, i) => <ReminderRow key={i} r={r} />)
      }
    </div>
  )
}

// Service record row
function ServiceRow({ s, vehicleName }: { s: LubeLoggerServiceRecord; vehicleName?: string }) {
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
        {vehicleName && (
          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 1 }}>{vehicleName}</div>
        )}
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

export default function LubeLoggerPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<LubeLoggerData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

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
  const vehicles = data.vehicles || []

  const section = (label: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, marginTop: 10 }}>
      {label}
    </div>
  )

  // All service records across vehicles, sorted newest first
  const allService = vehicles.flatMap(v =>
    (v.recentService || []).map(s => ({ ...s, vehicleName: [v.year, v.make, v.model].filter(Boolean).join(' ') }))
  ).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)

  // ── Summary chips ────────────────────────────────────────────────────────
  const SummaryChips = () => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 6,
          padding: '3px 10px', borderRadius: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          textDecoration: 'none', color: 'inherit', fontSize: 12 }}>
        <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>
          {vehicles.length}
        </span>
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

  // ── 1x ──────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center' }}>
      <SummaryChips />
    </div>
  )

  // ── 2-3x: chips + vehicle reminder list ─────────────────────────────────
  if (heightUnits <= 3) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <SummaryChips />
      {section('Fleet')}
      {vehicles.map(v => <VehicleCard key={v.id} v={v} uiUrl={uiUrl} compact />)}
    </div>
  )

  // ── 4x+: two-column ─────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', gap: 16 }}>
      {/* Left: summary + all vehicles + reminders */}
      <div style={{ width: 240, flexShrink: 0, overflow: 'auto', display: 'flex',
        flexDirection: 'column' }}>
        <SummaryChips />
        {section('Fleet & reminders')}
        {vehicles.map(v => <VehicleCard key={v.id} v={v} uiUrl={uiUrl} />)}
      </div>

      {/* Right: service history */}
      <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        {section('Service history')}
        {allService.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No service records</div>
          : allService.map((s, i) => (
            <ServiceRow key={i} s={s}
              vehicleName={vehicles.length > 1 ? s.vehicleName : undefined} />
          ))
        }
      </div>
    </div>
  )
}
