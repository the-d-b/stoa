import { useEffect, useState, useCallback } from 'react'
import { Glyph } from '../../api'

// WMO weather codes → simple emoji
const wmoEmoji = (code: number): string => {
  if (code === 0) return '☀️'
  if (code <= 2) return '⛅'
  if (code <= 3) return '☁️'
  if (code <= 49) return '🌫️'
  if (code <= 59) return '🌧️'
  if (code <= 69) return '🌨️'
  if (code <= 79) return '🌨️'
  if (code <= 82) return '🌦️'
  if (code <= 84) return '🌧️'
  if (code <= 94) return '⛈️'
  return '🌩️'
}

export default function WeatherGlyph({ glyph }: { glyph: Glyph }) {
  const config = (() => { try { return JSON.parse(glyph.config) } catch { return {} } })()
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const lat = config.lat
  const lon = config.lon
  const unitSym = (config.unit || config.units) === 'metric' || (config.unit || config.units) === 'c' ? '°C' : '°F'
  const refreshSecs = config.refreshSecs || 1800

  const load = useCallback(async () => {
    if (!lat || !lon) { setError('No location set'); setLoading(false); return }
    try {
      const tempUnit = unitSym === '°C' ? 'celsius' : 'fahrenheit'
      const windUnit = unitSym === '°C' ? 'ms' : 'mph'
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,weathercode,windspeed_10m` +
        `&daily=temperature_2m_max,temperature_2m_min` +
        `&temperature_unit=${tempUnit}&windspeed_unit=${windUnit}&timezone=auto&forecast_days=1`
      const res = await fetch(url)
      const d = await res.json()
      setData(d); setError('')
    } catch {
      setError('Failed to load')
    } finally { setLoading(false) }
  }, [lat, lon, unitSym])

  useEffect(() => {
    load()
    const iv = setInterval(load, refreshSecs * 1000)
    return () => clearInterval(iv)
  }, [load, refreshSecs])

  if (loading) return <div style={{ fontSize: 16 }}>⛅</div>
  if (error || !data?.current) return <div style={{ fontSize: 10, color: 'var(--red)' }} title={error}>⚠</div>

  const temp = Math.round(data.current.temperature_2m)
  const code = data.current.weathercode
  const hi = Math.round(data.daily?.temperature_2m_max?.[0] ?? temp)
  const lo = Math.round(data.daily?.temperature_2m_min?.[0] ?? temp)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 22, lineHeight: 1 }}>{wmoEmoji(code)}</span>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{temp}{unitSym}</span>
        <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>H:{hi} L:{lo}</span>
      </div>
    </div>
  )
}
