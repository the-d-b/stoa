import { useState, useEffect, useCallback } from 'react'
import { integrationsApi } from '../../api'
import { Panel } from '../../api'

interface CalendarConfig {
  firstDay: 0 | 1
}

interface DayForecast {
  date: string      // YYYY-MM-DD
  high: number      // °C always, converted on display
  low: number
  precipChance: number  // 0-100
  code: number      // WMO weather code
}

function wmoDescription(code: number): string {
  if (code === 0) return 'Clear'
  if (code <= 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code <= 49) return 'Foggy'
  if (code <= 57) return 'Drizzle'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Showers'
  if (code <= 86) return 'Snow showers'
  if (code <= 99) return 'Thunderstorm'
  return 'Unknown'
}

function wmoIcon(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2) return '⛅'
  if (code === 3) return '☁️'
  if (code <= 49) return '🌫️'
  if (code <= 57) return '🌦️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌦️'
  if (code <= 86) return '🌨️'
  if (code <= 99) return '⛈️'
  return '🌡️'
}

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
  // Google
  startDT?: string; endDT?: string
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
  const [allForecasts, setAllForecasts] = useState<{ city: string; unit: string; days: DayForecast[] }[]>([])
  // Source filter — null means all visible (resets on unmount)
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set())

  // Fetch 7-day weather for all weather sources
  const weatherSources: any[] = ((config as any).sources || []).filter((s: any) => s.type === 'weather')
  useEffect(() => {
    if (weatherSources.length === 0) return
    // Fetch forecast for all cities in parallel
    Promise.all(weatherSources.map(ws => {
      if (!ws.lat || !ws.lon) return Promise.resolve(null)
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${ws.lat}&longitude=${ws.lon}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode` +
        `&timezone=auto&forecast_days=7`
      return fetch(url).then(r => r.json()).then(d => {
        if (!d.daily) return null
        return {
          city: ws.city,
          unit: ws.unit || 'f',
          days: d.daily.time.map((date: string, i: number) => ({
            date,
            high: d.daily.temperature_2m_max[i],
            low:  d.daily.temperature_2m_min[i],
            precipChance: d.daily.precipitation_probability_max[i] ?? 0,
            code: d.daily.weathercode[i] ?? 0,
          }))
        }
      }).catch(() => null)
    })).then(results => {
      const valid = results.filter(Boolean) as { city: string; unit: string; days: DayForecast[] }[]
      setAllForecasts(valid)
    })
  }, [weatherSources.map(ws => ws.lat + ws.lon).join(',')])

  const loadEvents = useCallback(async () => {
    if (!hasSources) return
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setEvents(res.data?.events || [])
    } catch (e) {
      console.error('[CalendarPanel] event load failed:', e)
    }
  }, [panel.id, hasSources])

  useEffect(() => { loadEvents() }, [loadEvents])

  // Derive unique sources for pill rendering
  const allSources = Array.from(new Map(
    events.map(e => [e.source, { source: e.source, color: e.color }])
  ).values())

  // Get events for a given date string, filtered by hidden sources
  const eventsForDate = (year: number, month: number, day: number): CalendarEvent[] => {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    return events.filter(e => e.date?.startsWith(dateStr) && !hiddenSources.has(e.source))
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
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {MONTHS[month]} {selectedDay}
        </div>
        {/* Source filter pills */}
        {allSources.length > 1 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            {allSources.map(({ source, color }) => {
              const hidden = hiddenSources.has(source)
              return (
                <button key={source} onClick={() => setHiddenSources(prev => {
                    const next = new Set(prev)
                    if (next.has(source)) next.delete(source); else next.add(source)
                    return next
                  })} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 500,
                  cursor: 'pointer', border: `1px solid ${hidden ? 'var(--border)' : color}`,
                  background: hidden ? 'transparent' : color + '22',
                  color: hidden ? 'var(--text-dim)' : 'var(--text)',
                  transition: 'all 0.15s',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                    background: hidden ? 'var(--border)' : color }} />
                  {source}
                </button>
              )
            })}
          </div>
        )}
        {/* Weather for selected day — one tile per city */}
        {allForecasts.length > 0 && (() => {
          const selDate = `${viewDate.getFullYear()}-${String(viewDate.getMonth()+1).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}`
          return allForecasts.map((fc, fi) => {
            const w = fc.days.find(f => f.date === selDate)
            if (!w) return null
            const fcUnit = fc.unit === 'c' ? '°C' : '°F'
            const toFcDisplay = (c: number) => fc.unit === 'f' ? Math.round(c * 9/5 + 32) : Math.round(c)
            return (
              <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6,
                padding: '6px 10px', borderRadius: 8,
                background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 18 }}>{wmoIcon(w.code)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{wmoDescription(w.code)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {fc.city && <span style={{ marginRight: 6 }}>{fc.city}</span>}
                    <span style={{ fontFamily: 'DM Mono, monospace' }}>{w.precipChance}% precip</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'DM Mono, monospace' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{toFcDisplay(w.high)}{fcUnit}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{toFcDisplay(w.low)}{fcUnit}</div>
                </div>
              </div>
            )
          })
        })()}

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
              <span style={{ fontSize: 12, flex: 1, minWidth: 0,
                color: (() => { const today = new Date().toISOString().slice(0,10); return ev.date < today ? 'var(--red)' : 'inherit' })() }}>
                {ev.startDT && (
                  <span style={{ color: 'var(--text-dim)', fontSize: 11, marginRight: 6,
                    fontFamily: 'DM Mono, monospace' }}>
                    {new Date(ev.startDT).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    {ev.endDT && ` – ${new Date(ev.endDT).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                  </span>
                )}
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
