import { useState, useEffect, useCallback } from 'react'
import { integrationsApi } from '../../api'
import { Panel } from '../../api'

interface CalendarConfig { firstDay: 0 | 1 }

const DAY_SUN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DAY_MON = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const MONTHS  = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December']

const NavBtn = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button onClick={onClick} style={{
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-muted)', fontSize: 15, padding: '2px 6px',
    borderRadius: 4, lineHeight: 1, fontFamily: 'inherit',
  }}>{label}</button>
)

interface CalendarEvent {
  date: string; title: string; color: string; source: string; hasFile?: boolean
  // Sonarr
  seriesTitle?: string; epTitle?: string; titleSlug?: string; uiUrl?: string
  // Radarr
  foreignAlbumId?: string
  // Lidarr
  artistName?: string; albumTitle?: string; foreignArtistId?: string
}

export default function CalendarPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const config: CalendarConfig = (() => {
    try { return { firstDay: 0, ...JSON.parse(panel.config || '{}') } }
    catch { return { firstDay: 0 } }
  })()

  const [viewDate, setViewDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate())
  const [events, setEvents] = useState<CalendarEvent[]>([])

  const hasSources = (config as any).sources?.length > 0

  const loadEvents = useCallback(async () => {
    if (!hasSources) return
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      const evts = res.data?.events || []
      console.log('[CalendarPanel] raw response:', res.data)
      console.log('[CalendarPanel] events count:', evts.length)
      console.log('[CalendarPanel] events:', evts)
      setEvents(evts)
    } catch (e) {
      console.error('[CalendarPanel] event load failed:', e)
    }
  }, [panel.id, hasSources])

  useEffect(() => { loadEvents() }, [loadEvents])

  // Get events for a given date string (YYYY-MM-DD)
  const eventsForDate = (year: number, month: number, day: number): CalendarEvent[] => {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    return events.filter(e => e.date?.startsWith(dateStr))
  }

  const eventsForSelected = eventsForDate(viewDate.getFullYear(), viewDate.getMonth(), selectedDay)

  const today = new Date()
  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const dayLabels = config.firstDay === 1 ? DAY_MON : DAY_SUN

  const isToday = (d: number, m = month, y = year) =>
    d === today.getDate() && m === today.getMonth() && y === today.getFullYear()

  // ── 1x — Week view ───────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    const start = new Date(viewDate)
    const dow = start.getDay()
    start.setDate(start.getDate() - (config.firstDay === 1 ? (dow === 0 ? 6 : dow - 1) : dow))
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i); return d
    })
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <NavBtn onClick={() => { const d = new Date(viewDate); d.setDate(d.getDate()-7); setViewDate(d) }} label="‹" />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
            {MONTHS[days[0].getMonth()].slice(0,3)} {days[0].getDate()} – {MONTHS[days[6].getMonth()].slice(0,3)} {days[6].getDate()}
          </span>
          <NavBtn onClick={() => { const d = new Date(viewDate); d.setDate(d.getDate()+7); setViewDate(d) }} label="›" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
          {days.map((d, i) => {
            const todayFlag = isToday(d.getDate(), d.getMonth(), d.getFullYear())
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase' }}>
                  {dayLabels[i][0]}
                </span>
                <div style={{
                  width: 26, height: 26, borderRadius: 7, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 12,
                  fontWeight: todayFlag ? 700 : 400,
                  background: todayFlag ? 'var(--accent)' : 'transparent',
                  color: todayFlag ? 'white' : 'var(--text)',
                  position: 'relative',
                }}>
                  {d.getDate()}
                  {eventsForDate(d.getFullYear(), d.getMonth(), d.getDate()).length > 0 && (
                    <span style={{
                      position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
                      width: 3, height: 3, borderRadius: '50%',
                      background: todayFlag ? 'white' : eventsForDate(d.getFullYear(), d.getMonth(), d.getDate())[0].color,
                    }} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Build month grid (shared by 2x and 4x) ───────────────────────────────
  let startDow = new Date(year, month, 1).getDay()
  if (config.firstDay === 1) startDow = (startDow + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev  = new Date(year, month, 0).getDate()

  const cells: { day: number; current: boolean }[] = []
  for (let i = startDow - 1; i >= 0; i--) cells.push({ day: daysInPrev - i, current: false })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, current: true })
  while (cells.length % 7 !== 0) cells.push({ day: cells.length - daysInMonth - startDow + 1, current: false })

  const monthHeader = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
      <NavBtn onClick={() => setViewDate(new Date(year, month-1, 1))} label="‹" />
      <span style={{ fontSize: 12, fontWeight: 600 }}>{MONTHS[month]} {year}</span>
      <NavBtn onClick={() => setViewDate(new Date(year, month+1, 1))} label="›" />
    </div>
  )

  const dayHeaderRow = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
      {dayLabels.map(d => (
        <div key={d} style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', padding: '1px 0' }}>
          {d[0]}
        </div>
      ))}
    </div>
  )

  // Cell size adapts to available space — smaller for 2x (more weeks), comfortable for 4x
  const cellSize = heightUnits >= 4 ? 26 : 22

  const dayGrid = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
      {cells.map((cell, i) => {
        const todayFlag = cell.current && isToday(cell.day)
        const selected  = cell.current && cell.day === selectedDay
        return (
          <div key={i}
            onClick={() => cell.current && setSelectedDay(cell.day)}
            style={{
              height: cellSize, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 5, fontSize: 11, cursor: cell.current ? 'pointer' : 'default',
              fontWeight: todayFlag ? 700 : 400,
              background: todayFlag ? 'var(--accent)' : selected ? 'var(--surface2)' : 'transparent',
              color: todayFlag ? 'white' : cell.current ? 'var(--text)' : 'var(--text-dim)',
              border: selected && !todayFlag ? '1px solid var(--border2)' : '1px solid transparent',
              transition: 'all 0.1s', position: 'relative',
            }}>
            {cell.day}
            {cell.current && (() => {
              const dayEvs = eventsForDate(year, month, cell.day)
              if (dayEvs.length === 0) return null
              // Deduplicate by source color, show up to 3 dots
              const seen = new Set<string>()
              const dots: string[] = []
              for (const ev of dayEvs) {
                if (!seen.has(ev.color)) { seen.add(ev.color); dots.push(ev.color) }
                if (dots.length >= 3) break
              }
              return (
                <span style={{
                  position: 'absolute', bottom: 1, left: '50%', transform: 'translateX(-50%)',
                  display: 'flex', gap: 2,
                }}>
                  {dots.map((color, di) => (
                    <span key={di} style={{
                      width: 3, height: 3, borderRadius: '50%',
                      background: todayFlag ? 'white' : color,
                      flexShrink: 0,
                    }} />
                  ))}
                </span>
              )
            })()}
          </div>
        )
      })}
    </div>
  )

  // ── 2x — Month only ─────────────────────────────────────────────────────
  if (heightUnits < 4) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {monthHeader}
        {dayHeaderRow}
        {dayGrid}
      </div>
    )
  }

  // ── 4x — Month + agenda (50/50) ──────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: '0 0 auto' }}>
        {monthHeader}
        {dayHeaderRow}
        {dayGrid}
      </div>
      <div style={{ flex: 1, borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 8, overflow: 'auto', minHeight: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {MONTHS[month]} {selectedDay}
        </div>
        {eventsForSelected.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
            {hasSources ? 'No events' : 'No data sources — configure in Admin → Panels'}
          </div>
        ) : eventsForSelected.map((ev, i) => {
          const href = (() => {
            if (!ev.uiUrl) return null
            if (ev.source === 'sonarr' && ev.titleSlug) return `${ev.uiUrl}/series/${ev.titleSlug}`
            if (ev.source === 'radarr' && ev.titleSlug) return `${ev.uiUrl}/movie/${ev.titleSlug}`
            if (ev.source === 'lidarr' && ev.foreignArtistId) return `${ev.uiUrl}/artist/${ev.foreignArtistId}`
            return null
          })()
          const displayTitle = ev.source === 'sonarr' ? (ev.seriesTitle || ev.title) : ev.title
          const displaySub = ev.source === 'sonarr' ? ev.epTitle : null
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: ev.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {href
                  ? <a href={href} target="_blank" rel="noopener noreferrer"
                      style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}
                      onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'}
                      onMouseOut={e => e.currentTarget.style.textDecoration = 'none'}>
                      {displayTitle}
                    </a>
                  : <span style={{ fontWeight: 500 }}>{displayTitle}</span>
                }
                {displaySub && <span style={{ color: 'var(--text-dim)' }}> — {displaySub}</span>}
              </span>
            </div>
          )
        })}
      </div>
      </div>
  )
}
