import { useState } from 'react'
import { Panel } from '../../api'

interface CalendarConfig {
  firstDay: 0 | 1
}

const DAY_LABELS_SUN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DAY_LABELS_MON = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

export default function CalendarPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const config: CalendarConfig = (() => {
    try { return { firstDay: 0, ...JSON.parse(panel.config || '{}') } }
    catch { return { firstDay: 0 } }
  })()

  const [viewDate, setViewDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate())

  const today = new Date()
  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const dayLabels = config.firstDay === 1 ? DAY_LABELS_MON : DAY_LABELS_SUN

  const isToday = (d: number, m = month, y = year) =>
    d === today.getDate() && m === today.getMonth() && y === today.getFullYear()

  const navBtn = (onClick: () => void, label: string) => (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      color: 'var(--text-muted)', fontSize: 16, padding: '2px 8px',
      borderRadius: 4, lineHeight: 1,
    }}>{label}</button>
  )

  // 1x → week view
  if (heightUnits <= 1) {
    const startOfWeek = new Date(viewDate)
    const dow = startOfWeek.getDay()
    const offset = config.firstDay === 1 ? (dow === 0 ? -6 : 1 - dow) : -dow
    startOfWeek.setDate(startOfWeek.getDate() + offset)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek); d.setDate(d.getDate() + i); return d
    })
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          {navBtn(() => { const d = new Date(viewDate); d.setDate(d.getDate() - 7); setViewDate(d) }, '‹')}
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
            {MONTHS[days[0].getMonth()].slice(0,3)} {days[0].getDate()} – {MONTHS[days[6].getMonth()].slice(0,3)} {days[6].getDate()}
          </span>
          {navBtn(() => { const d = new Date(viewDate); d.setDate(d.getDate() + 7); setViewDate(d) }, '›')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
          {days.map((d, i) => {
            const todayFlag = isToday(d.getDate(), d.getMonth(), d.getFullYear())
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase' }}>
                  {dayLabels[i][0]}
                </span>
                <div style={{
                  width: 26, height: 26, borderRadius: 7, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 12,
                  fontWeight: todayFlag ? 700 : 400,
                  background: todayFlag ? 'var(--accent)' : 'transparent',
                  color: todayFlag ? 'white' : 'var(--text)',
                }}>{d.getDate()}</div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Build month grid
  const firstOfMonth = new Date(year, month, 1)
  let startDow = firstOfMonth.getDay()
  if (config.firstDay === 1) startDow = (startDow + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev  = new Date(year, month, 0).getDate()

  const cells: { day: number; current: boolean }[] = []
  for (let i = startDow - 1; i >= 0; i--) cells.push({ day: daysInPrev - i, current: false })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, current: true })
  while (cells.length % 7 !== 0) cells.push({ day: cells.length - daysInMonth - startDow + 1, current: false })

  const monthGrid = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        {navBtn(() => setViewDate(new Date(year, month - 1, 1)), '‹')}
        <span style={{ fontSize: 13, fontWeight: 600 }}>{MONTHS[month]} {year}</span>
        {navBtn(() => setViewDate(new Date(year, month + 1, 1)), '›')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
        {dayLabels.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-dim)', fontWeight: 700, padding: '1px 0', textTransform: 'uppercase' }}>
            {d[0]}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((cell, i) => {
          const todayFlag = cell.current && isToday(cell.day)
          const selected  = cell.current && cell.day === selectedDay
          return (
            <div key={i}
              onClick={() => cell.current && setSelectedDay(cell.day)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                aspectRatio: '1', borderRadius: 5, fontSize: 11, cursor: cell.current ? 'pointer' : 'default',
                fontWeight: todayFlag ? 700 : 400,
                background: todayFlag ? 'var(--accent)' : selected ? 'var(--surface2)' : 'transparent',
                color: todayFlag ? 'white' : cell.current ? 'var(--text)' : 'var(--text-dim)',
                border: selected && !todayFlag ? '1px solid var(--border2)' : '1px solid transparent',
                transition: 'all 0.1s',
              }}>
              {cell.day}
            </div>
          )
        })}
      </div>
    </>
  )

  // 2x → month only
  if (heightUnits < 4) return <div>{monthGrid}</div>

  // 4x → month + agenda (50/50)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{monthGrid}</div>
      <div style={{ flex: 1, borderTop: '1px solid var(--border)', padding: '10px 0', overflow: 'auto' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {MONTHS[month]} {selectedDay}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
          No events — data sources coming soon
        </div>
      </div>
    </div>
  )
}
