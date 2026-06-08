import { useState, useEffect } from 'react'
import { integrationsApi } from '../../api'

interface MonicaReminder {
  id: number
  title: string
  nextExpectedDate: string
  contactName: string
  daysUntil: number
}

interface MonicaData {
  totalContacts: number
  reminders: MonicaReminder[]
}

function urgencyColor(days: number) {
  if (days === 0) return '#f59e0b'
  if (days <= 7) return '#eab308'
  return 'var(--text)'
}

function daysLabel(days: number) {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days}d`
}

function fmtDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function ReminderRow({ r }: { r: MonicaReminder }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
      borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: urgencyColor(r.daysUntil),
        flexShrink: 0, width: 68 }}>
        {daysLabel(r.daysUntil)}
      </span>
      <span style={{ flex: 1, fontSize: 12, color: 'var(--text)', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.title}
        {r.contactName && (
          <span style={{ color: 'var(--text-muted)' }}> — {r.contactName}</span>
        )}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
        {fmtDate(r.nextExpectedDate)}
      </span>
    </div>
  )
}

function ReminderCard({ r }: { r: MonicaReminder }) {
  return (
    <div style={{
      background: 'var(--surface2)', borderRadius: 8, padding: '9px 12px',
      borderLeft: `3px solid ${urgencyColor(r.daysUntil)}`,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 40 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: urgencyColor(r.daysUntil) }}>
          {r.daysUntil === 0 ? '!' : r.daysUntil}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          {r.daysUntil === 0 ? 'today' : 'days'}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.title}
        </div>
        {r.contactName && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.contactName}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0, fontSize: 11, color: 'var(--text-dim)' }}>
        {fmtDate(r.nextExpectedDate)}
      </div>
    </div>
  )
}

export default function MonicaPanel({ panel, heightUnits }: { panel: any; heightUnits: number }) {
  const [data, setData] = useState<MonicaData | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    integrationsApi.getPanelData(panel.id)
      .then((r: any) => setData(r.data))
      .catch(() => setErr('Failed to load'))
  }, [panel.id])

  if (err) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>{err}</div>
  if (!data) return <div style={{ padding: 16 }}><span className="spinner" /></div>

  const reminders = data.reminders || []
  const soonCount = reminders.filter(r => r.daysUntil <= 7).length

  // ── 1x ──────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', height: '100%' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', flexShrink: 0 }}>Monica</span>
        <span style={{ fontSize: 12, color: 'var(--text)' }}>
          <b>{data.totalContacts.toLocaleString()}</b>
          <span style={{ color: 'var(--text-muted)' }}> contacts</span>
        </span>
        {reminders.length > 0 && (
          <span style={{ fontSize: 12, color: soonCount > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
            <b>{reminders.length}</b> upcoming{soonCount > 0 ? ` · ${soonCount} this week` : ''}
          </span>
        )}
        {reminders[0] && (
          <span style={{ fontSize: 11, color: urgencyColor(reminders[0].daysUntil), marginLeft: 'auto', flexShrink: 0 }}>
            {daysLabel(reminders[0].daysUntil)}: {reminders[0].title}
          </span>
        )}
      </div>
    )
  }

  // ── 2-3x ────────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
        padding: '10px 12px', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Monica</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {data.totalContacts.toLocaleString()} contacts · {reminders.length} upcoming
          </span>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {reminders.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>No upcoming reminders</div>
            : reminders.map(r => <ReminderRow key={r.id} r={r} />)
          }
        </div>
      </div>
    )
  }

  // ── 4x+ ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
      padding: '12px 14px', gap: 10 }}>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {[
          { label: 'Contacts', value: data.totalContacts.toLocaleString() },
          { label: 'Upcoming', value: reminders.length.toString() },
          { label: 'This Week', value: soonCount.toString(), accent: soonCount > 0 ? '#f59e0b' : undefined },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 7,
            padding: '5px 12px', textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: s.accent ?? 'var(--text)' }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>
      {/* Reminder cards */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {reminders.length === 0
          ? <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '12px 0' }}>No upcoming reminders</div>
          : reminders.map(r => <ReminderCard key={r.id} r={r} />)
        }
      </div>
    </div>
  )
}
