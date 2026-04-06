import { useEffect, useState, useCallback } from 'react'
import { glyphsApi, Glyph } from '../../api'

interface WeatherData {
  main: { temp: number; feels_like: number; humidity: number; temp_min: number; temp_max: number }
  weather: { description: string; icon: string; main: string }[]
  name: string
  wind: { speed: number }
}

export default function WeatherGlyph({ glyph }: { glyph: Glyph }) {
  const [data, setData] = useState<WeatherData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => {
    try { return JSON.parse(glyph.config) } catch { return {} }
  })()

  const refreshSecs = config.refreshSecs || 3600

  const fetch = useCallback(async () => {
    try {
      const res = await glyphsApi.getData(glyph.id)
      setData(res.data)
      setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load weather')
    } finally { setLoading(false) }
  }, [glyph.id])

  useEffect(() => {
    fetch()
    const interval = setInterval(fetch, refreshSecs * 1000)
    return () => clearInterval(interval)
  }, [fetch, refreshSecs])

  if (loading) return <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>⛅</div>
  if (error) return <div style={{ fontSize: 10, color: 'var(--red)' }} title={error}>⚠</div>
  if (!data) return null

  const temp = Math.round(data.main.temp)
  const units = config.units === 'metric' ? '°C' : '°F'
  const icon = data.weather[0]?.icon
  const desc = data.weather[0]?.main || ''
  const hi = Math.round(data.main.temp_max)
  const lo = Math.round(data.main.temp_min)

  const displayName = config.label || data.name

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={`${displayName} · ${desc} · H:${hi}${units} L:${lo}${units}`}>
      {icon && (
        <img
          src={`https://openweathermap.org/img/wn/${icon}.png`}
          style={{ width: 24, height: 24 }}
          alt={desc}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        {displayName && (
          <span style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {displayName}
          </span>
        )}
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{temp}{units}</span>
        <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>H:{hi} L:{lo}</span>
      </div>
    </div>
  )
}
