/**
 * AddEventModal — create a calendar event on a writable source (Google today;
 * CalDAV later). Opened from the CalendarPanel "+" (works on mobile) and the
 * CalendarOverlay agenda. Anyone who can see the panel can write to its
 * writable sources.
 */
import { useState, useEffect } from 'react'
import { integrationsApi } from '../../api'

export interface WritableCalSource {
  integrationId: string
  calendarId?: string
  label?: string
}

export default function AddEventModal({ panelId, sources, defaultDate, onCreated, onClose }: {
  panelId: string
  sources: WritableCalSource[]
  defaultDate: string
  onCreated: () => void
  onClose: () => void
}) {
  const [targetIdx, setTargetIdx] = useState(0)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const submit = async () => {
    if (!title.trim() || !date) return
    const src = sources[targetIdx]
    if (!src) return
    setSaving(true)
    setError('')
    const body: any = {
      action: 'create_event',
      integrationId: src.integrationId,
      calendarId: src.calendarId || 'primary',
      title: title.trim(),
      date,
    }
    if (startTime) {
      body.startDT = new Date(`${date}T${startTime}`).toISOString()
      if (endTime) body.endDT = new Date(`${date}T${endTime}`).toISOString()
    }
    try {
      await integrationsApi.panelAction(panelId, body)
      onCreated()
      onClose()
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to create event')
    } finally {
      setSaving(false)
    }
  }

  return (
    // Above CalendarOverlay (500) and KanbanOverlay (600/700)
    <div style={{ position: 'fixed', inset: 0, zIndex: 750,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)',
        borderRadius: 12, padding: '20px 22px', width: 'min(440px, 92vw)',
        display: 'flex', flexDirection: 'column', gap: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>New event</div>

        {sources.length > 1 && (
          <div>
            <label className="label">Calendar</label>
            <select className="input" value={targetIdx} onChange={e => setTargetIdx(Number(e.target.value))}
              style={{ cursor: 'pointer' }}>
              {sources.map((s, i) => (
                <option key={i} value={i}>{s.label || s.calendarId || s.integrationId}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label">Title</label>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Event title" autoFocus />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 130px' }}>
            <label className="label">Date</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 100px' }}>
            <label className="label">Start <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span></label>
            <input className="input" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 100px' }}>
            <label className="label">End <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span></label>
            <input className="input" type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
              disabled={!startTime} />
          </div>
        </div>
        {!startTime && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: -6 }}>
            Leave start empty for an all-day event.
          </div>
        )}

        {error && (
          <div style={{ fontSize: 12, color: 'var(--red)', lineHeight: 1.4 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={submit} disabled={saving || !title.trim() || !date}>
            {saving ? <span className="spinner" /> : 'Add event'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
