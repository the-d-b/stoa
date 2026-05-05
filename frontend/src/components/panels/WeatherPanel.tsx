import { useState, useEffect } from 'react'
import { integrationsApi } from '../../api'

interface WeatherCurrent {
  tempC: number; tempF: number
  feelsLikeC: number; feelsLikeF: number
  humidity: number
  windKph: number; windMph: number; windDir: string
  precipMm: number
  weatherCode: number; icon: string; label: string
  isDay: number
}

interface WeatherDay {
  date: string
  maxC: number; maxF: number
  minC: number; minF: number
  precipMm: number
  weatherCode: number; icon: string; label: string
}

interface WeatherHour {
  time: string
  tempC: number; tempF: number
  weatherCode: number; icon: string
  precipMm: number
}

interface WeatherData {
  city: string; unit: string
  current: WeatherCurrent
  daily: WeatherDay[]
  hourly: WeatherHour[]
}

function dayLabel(dateStr: string, i: number) {
  if (i === 0) return 'Today'
  if (i === 1) return 'Tomorrow'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString([], { weekday: 'short' })
}

function hourLabel(timeStr: string) {
  const d = new Date(timeStr)
  return d.toLocaleTimeString([], { hour: 'numeric', hour12: true })
}

export default function WeatherPanel({ panel, heightUnits = 2 }: { panel: any; heightUnits?: number }) {
  const [data, setData] = useState<WeatherData | null>(null)
  const [error, setError] = useState('')

  const cfg = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const useF = (data?.unit || 'f') === 'f'

  useEffect(() => {
    const integrationId = cfg.integrationId
    if (!integrationId) { setError('No weather integration configured'); return }
    integrationsApi.getPanelData(panel.id)
      .then(r => { setData(r.data); setError('') })
      .catch(() => setError('Weather unavailable'))
  }, [panel.config, panel.id])

  if (error) return (
    <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>{error}</div>
  )
  if (!data) return (
    <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>Loading weather...</div>
  )

  const cur = data.current
  const temp = useF ? `${cur.tempF}°F` : `${cur.tempC}°C`
  const feels = useF ? `${cur.feelsLikeF}°F` : `${cur.feelsLikeC}°C`
  const wind = useF ? `${cur.windMph} mph` : `${cur.windKph} km/h`

  // ── 1x — ultra compact ────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 24 }}>{cur.icon}</span>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{temp}</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{data.city} · {cur.label}</div>
      </div>
    </div>
  )

  // ── 2x–3x — current + today's range ──────────────────────────────────────
  if (heightUnits <= 3) return (
    <div style={{ padding: '12px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>{data.city}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <span style={{ fontSize: 42, fontWeight: 700, lineHeight: 1 }}>{temp}</span>
            <span style={{ fontSize: 32, lineHeight: 1.1 }}>{cur.icon}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>{cur.label}</div>
        </div>
        {data.daily.length > 0 && (
          <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
            <div>↑ {useF ? data.daily[0].maxF : data.daily[0].maxC}°</div>
            <div>↓ {useF ? data.daily[0].minF : data.daily[0].minC}°</div>
          </div>
        )}
      </div>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-dim)',
        borderTop: '1px solid var(--border)', paddingTop: 10 }}>
        <span>Feels {feels}</span>
        <span>💧 {cur.humidity}%</span>
        <span>💨 {wind} {cur.windDir}</span>
        {cur.precipMm > 0 && <span>🌧 {cur.precipMm}mm</span>}
      </div>
    </div>
  )

  // ── 4x–5x — current + 7-day forecast ─────────────────────────────────────
  if (heightUnits <= 5) return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* Current */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 36 }}>{cur.icon}</span>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{data.city}</div>
          <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{temp}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{cur.label} · Feels {feels}</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-dim)', textAlign: 'right' }}>
          <div>💧 {cur.humidity}%</div>
          <div>💨 {wind} {cur.windDir}</div>
        </div>
      </div>
      {/* 7-day */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, flex: 1 }}>
        {data.daily.map((d, i) => (
          <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 8,
            padding: '3px 0', borderBottom: i < data.daily.length-1 ? '1px solid var(--border)' : 'none' }}>
            <span style={{ width: 72, fontSize: 12, fontWeight: i === 0 ? 600 : 400 }}>{dayLabel(d.date, i)}</span>
            <span style={{ fontSize: 16, width: 24 }}>{d.icon}</span>
            <span style={{ flex: 1, fontSize: 11, color: 'var(--text-dim)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
            {d.precipMm > 0 && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>🌧 {d.precipMm}mm</span>}
            <span style={{ fontSize: 12, fontWeight: 600, width: 32, textAlign: 'right' }}>
              {useF ? d.maxF : d.maxC}°
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)', width: 32, textAlign: 'right' }}>
              {useF ? d.minF : d.minC}°
            </span>
          </div>
        ))}
      </div>
    </div>
  )

  // ── 6x+ — current + hourly + 7-day ───────────────────────────────────────
  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* Current */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 40 }}>{cur.icon}</span>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{data.city}</div>
          <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1 }}>{temp}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{cur.label} · Feels {feels}</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-dim)', textAlign: 'right' }}>
          <div>💧 Humidity {cur.humidity}%</div>
          <div>💨 {wind} {cur.windDir}</div>
          {cur.precipMm > 0 && <div>🌧 {cur.precipMm}mm now</div>}
        </div>
      </div>

      {/* Hourly strip */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 6 }}>Next 24 hours</div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {data.hourly.slice(0, 12).map((h, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 2, flexShrink: 0, minWidth: 44 }}>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{hourLabel(h.time)}</span>
              <span style={{ fontSize: 18 }}>{h.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 500 }}>{useF ? h.tempF : h.tempC}°</span>
              {h.precipMm > 0 && <span style={{ fontSize: 9, color: '#60a5fa' }}>{h.precipMm}mm</span>}
            </div>
          ))}
        </div>
      </div>

      {/* 7-day */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 6 }}>7-Day Forecast</div>
        {data.daily.map((d, i) => (
          <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 0', borderBottom: i < data.daily.length-1 ? '1px solid var(--border)' : 'none' }}>
            <span style={{ width: 80, fontSize: 12, fontWeight: i === 0 ? 600 : 400 }}>{dayLabel(d.date, i)}</span>
            <span style={{ fontSize: 18, width: 24 }}>{d.icon}</span>
            <span style={{ flex: 1, fontSize: 11, color: 'var(--text-dim)' }}>{d.label}</span>
            {d.precipMm > 0 && <span style={{ fontSize: 10, color: '#60a5fa' }}>🌧 {d.precipMm}mm</span>}
            <span style={{ fontSize: 12, fontWeight: 600, width: 36, textAlign: 'right' }}>
              {useF ? d.maxF : d.maxC}°
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)', width: 36, textAlign: 'right' }}>
              {useF ? d.minF : d.minC}°
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
