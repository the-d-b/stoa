/**
 * CalendarOverlay — full-screen month calendar opened from CalendarPanel.
 * Desktop-only (the expand affordance is hidden on mobile). Free navigation
 * to any month, past or future — months outside the sources' fetch window
 * simply render empty, which is fine: sometimes you just need to see what
 * day the 1st Saturday in December is.
 */
import { useState, useEffect } from 'react'

const DAY_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

interface CalendarEvent {
  date: string; title: string; color: string; source: string
  seriesTitle?: string; epTitle?: string; titleSlug?: string; uiUrl?: string
  foreignArtistId?: string
  startDT?: string; endDT?: string
  tagId?: string; icon?: string
  boardId?: string
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const dateKey = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`

// Same deep-link logic as the panel's agenda rows
const eventHref = (ev: CalendarEvent): string | null => {
  if (!ev.uiUrl) return null
  if (ev.source === 'sonarr' && ev.titleSlug) return `${ev.uiUrl}/series/${ev.titleSlug}`
  if (ev.source === 'radarr' && ev.titleSlug) return `${ev.uiUrl}/movie/${ev.titleSlug}`
  if (ev.source === 'lidarr' && ev.foreignArtistId) return `${ev.uiUrl}/artist/${ev.foreignArtistId}`
  return ev.uiUrl
}

export default function CalendarOverlay({ events, firstDay, getSourceLabel, onClose }: {
  events: CalendarEvent[]
  firstDay: 0 | 1
  getSourceLabel: (source: string) => string
  onClose: () => void
}) {
  const now = new Date()
  const [viewDate, setViewDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(dateKey(now.getFullYear(), now.getMonth(), now.getDate()))
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set())

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const dayLabels = firstDay === 1 ? DAY_MON : DAY_SUN
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate())

  const allSources = Array.from(new Map(
    events.map(e => [e.source, { source: e.source, color: e.color }])
  ).values())

  // Placement matches the panel: timed events land on their browser-local date
  const eventDateKey = (e: CalendarEvent) =>
    e.startDT ? new Date(e.startDT).toLocaleDateString('en-CA') : (e.date || '').slice(0, 10)

  const eventsForKey = (key: string, includeWeather: boolean): CalendarEvent[] =>
    events.filter(e => {
      if (hiddenSources.has(e.source)) return false
      if (!includeWeather && e.source === 'weather') return false
      if (includeWeather && e.source !== 'weather') return false
      return eventDateKey(e) === key
    }).sort((a, b) => {
      if (!a.startDT && !b.startDT) return 0
      if (!a.startDT) return -1
      if (!b.startDT) return 1
      return new Date(a.startDT).getTime() - new Date(b.startDT).getTime()
    })

  // ── Month grid cells: leading/trailing days belong to adjacent months ──────
  let startDow = new Date(year, month, 1).getDay()
  if (firstDay === 1) startDow = (startDow + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: { y: number; m: number; d: number; current: boolean }[] = []
  for (let i = startDow - 1; i >= 0; i--) {
    const dt = new Date(year, month, -i)
    cells.push({ y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate(), current: false })
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ y: year, m: month, d, current: true })
  let trailing = 1
  while (cells.length % 7 !== 0) {
    const dt = new Date(year, month + 1, trailing++)
    cells.push({ y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate(), current: false })
  }

  const selectCell = (c: { y: number; m: number; d: number; current: boolean }) => {
    setSelectedDate(dateKey(c.y, c.m, c.d))
    if (!c.current) setViewDate(new Date(c.y, c.m, 1))
  }

  const selDate = new Date(selectedDate + 'T00:00:00')
  const selHeading = `${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][selDate.getDay()]}, ${MONTHS[selDate.getMonth()]} ${selDate.getDate()}${selDate.getFullYear() !== now.getFullYear() ? `, ${selDate.getFullYear()}` : ''}`
  const selEvents = eventsForKey(selectedDate, false)
  const selWeather = eventsForKey(selectedDate, true)

  const openKanban = (ev: CalendarEvent) => {
    window.dispatchEvent(new CustomEvent('stoa-open-kanban-board', {
      detail: { boardId: ev.boardId, boardName: ev.source?.split(' › ').pop() ?? '', panelTitle: ev.source?.split(' › ')[0] ?? '' }
    }))
  }

  const fmtTime = (dt: string) =>
    new Date(dt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    // zIndex below KanbanOverlay (600/700) so kanban events opened from here stack on top
    <div style={{ position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, width: 'min(96vw, 1300px)', height: 'min(92vh, 860px)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.4)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setViewDate(new Date(year, month - 1, 1))}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 20, padding: '2px 8px', lineHeight: 1 }}>‹</button>
            <span style={{ fontSize: 16, fontWeight: 700, minWidth: 170, textAlign: 'center' }}>
              {MONTHS[month]} {year}
            </span>
            <button onClick={() => setViewDate(new Date(year, month + 1, 1))}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 20, padding: '2px 8px', lineHeight: 1 }}>›</button>
            <button className="btn btn-ghost" style={{ fontSize: 11 }}
              onClick={() => {
                setViewDate(new Date(now.getFullYear(), now.getMonth(), 1))
                setSelectedDate(todayKey)
              }}>Today</button>
          </div>

          {/* Source filter pills */}
          <div style={{ flex: 1, display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {allSources.map(({ source, color }) => {
              const hidden = hiddenSources.has(source)
              return (
                <button key={source} onClick={() => setHiddenSources(prev => {
                    const next = new Set(prev)
                    if (next.has(source)) next.delete(source); else next.add(source)
                    return next
                  })} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500,
                  cursor: 'pointer', border: `1px solid ${hidden ? 'var(--border)' : color}`,
                  background: hidden ? 'transparent' : color + '22',
                  color: hidden ? 'var(--text-dim)' : 'var(--text)',
                  transition: 'all 0.15s',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                    background: hidden ? 'var(--border)' : color }} />
                  {getSourceLabel(source)}
                </button>
              )
            })}
          </div>

          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-dim)', fontSize: 22, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}>
            ×
          </button>
        </div>

        {/* Body — month grid + day agenda side by side */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>

          {/* Month grid */}
          <div style={{ flex: 1.7, minWidth: 0, display: 'flex', flexDirection: 'column',
            padding: '12px 14px 14px 18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
              {dayLabels.map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-dim)',
                  fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {d}
                </div>
              ))}
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gridAutoRows: '1fr', gap: 4 }}>
              {cells.map((cell, i) => {
                const key = dateKey(cell.y, cell.m, cell.d)
                const isToday = key === todayKey
                const isSelected = key === selectedDate
                const dayEvs = eventsForKey(key, false)
                const weatherEv = eventsForKey(key, true)[0]
                const maxChips = 3
                return (
                  <div key={i} onClick={() => selectCell(cell)}
                    style={{
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 8, padding: '4px 5px', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', gap: 2,
                      background: isSelected ? 'var(--surface2)' : 'transparent',
                      opacity: cell.current ? 1 : 0.4, overflow: 'hidden', minHeight: 0,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 12, fontWeight: isToday ? 700 : 500,
                        width: 20, height: 20, borderRadius: 6,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: isToday ? 'var(--accent)' : 'transparent',
                        color: isToday ? 'white' : 'var(--text)',
                      }}>{cell.d}</span>
                      {weatherEv && (
                        <span style={{ fontSize: 11, marginLeft: 'auto' }} title={weatherEv.title}>
                          {weatherEv.icon}
                        </span>
                      )}
                    </div>
                    {dayEvs.slice(0, maxChips).map((ev, ei) => (
                      <div key={ei} title={ev.title} style={{
                        fontSize: 10, lineHeight: '14px', padding: '0 4px', borderRadius: 3,
                        background: ev.color + '22', borderLeft: `2px solid ${ev.color}`,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        color: 'var(--text)', flexShrink: 0,
                      }}>
                        {ev.startDT && <span style={{ color: 'var(--text-dim)' }}>{fmtTime(ev.startDT)} </span>}
                        {ev.source === 'sonarr' ? (ev.seriesTitle || ev.title) : ev.title}
                      </div>
                    ))}
                    {dayEvs.length > maxChips && (
                      <div style={{ fontSize: 9, color: 'var(--text-dim)', paddingLeft: 4, flexShrink: 0 }}>
                        +{dayEvs.length - maxChips} more
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Day agenda */}
          <div style={{ flex: 1, minWidth: 280, maxWidth: 420, borderLeft: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', padding: '14px 18px', overflow: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10,
              color: 'var(--text)', flexShrink: 0 }}>
              {selHeading}
            </div>

            {selWeather.map((w, wi) => (
              <div key={wi} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
                padding: '7px 11px', borderRadius: 8, flexShrink: 0,
                background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 19 }}>{w.icon}</span>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{w.title}</div>
              </div>
            ))}

            {selEvents.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                No events
              </div>
            ) : selEvents.map((ev, i) => {
              const href = eventHref(ev)
              const displayTitle = ev.source === 'sonarr' ? (ev.seriesTitle || ev.title) : ev.title
              const displaySub = ev.source === 'sonarr' ? ev.epTitle : null
              const isKanban = !!ev.boardId
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: '7px 0', borderBottom: '1px solid var(--border)',
                  cursor: isKanban ? 'pointer' : 'default' }}
                  onClick={isKanban ? () => openKanban(ev) : undefined}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: ev.color,
                    flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13 }}>
                      {href
                        ? <a href={href} target="_blank" rel="noopener noreferrer"
                            style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}
                            onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'}
                            onMouseOut={e => e.currentTarget.style.textDecoration = 'none'}>
                            {displayTitle}
                          </a>
                        : <span style={{ fontWeight: isKanban ? 600 : 500,
                            color: isKanban ? ev.color : 'inherit' }}>{displayTitle}</span>
                      }
                      {displaySub && <span style={{ color: 'var(--text-dim)' }}> — {displaySub}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 1 }}>
                      {ev.startDT && (
                        <span style={{ color: 'var(--text-dim)', fontSize: 11,
                          fontFamily: 'DM Mono, monospace' }}>
                          {fmtTime(ev.startDT)}{ev.endDT && ` – ${fmtTime(ev.endDT)}`}
                        </span>
                      )}
                      <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>
                        {getSourceLabel(ev.source)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
