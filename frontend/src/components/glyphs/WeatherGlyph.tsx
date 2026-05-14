import { useEffect, useState, useCallback } from 'react'
import { glyphsApi, Glyph } from '../../api'

export default function WeatherGlyph({ glyph }: { glyph: Glyph }) {
  const config = (() => { try { return JSON.parse(glyph.config) } catch { return {} } })()
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const refreshSecs = config.refreshSecs || 1800

  const load = useCallback(async () => {
    if (!config.integrationId) {
      setError('No integration')
      setLoading(false)
      return
    }
    try {
      const r = await glyphsApi.getData(glyph.id)
      setData(r.data); setError('')
    } catch {
      setError('Failed to load')
    } finally { setLoading(false) }
  }, [glyph.id, config.integrationId])

  useEffect(() => {
    load()
    const iv = setInterval(load, refreshSecs * 1000)
    return () => clearInterval(iv)
  }, [load, refreshSecs])

  if (loading) return <div style={{ fontSize: 16 }}>⛅</div>
  if (error || !data) return <div style={{ fontSize: 10, color: 'var(--red)' }} title={error}>⚠</div>

  const icon = data.icon || '🌡️'
  const temp = data.temp != null ? `${Math.round(data.temp)}°` : '—'
  const unitLabel = data.unit === 'c' ? 'C' : 'F'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 1, cursor: 'default' }}>
      <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 10, fontWeight: 700, lineHeight: 1 }}>{temp}{unitLabel}</span>
    </div>
  )
}
