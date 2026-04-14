import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface GluetunData {
  uiUrl: string; status: string; publicIp: string
  country: string; city: string; hostname: string
  provider: string; serverName: string; port: number
}

export default function GluetunPanel({ panel }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<GluetunData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const refreshSecs = config.refreshSecs || 60

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setData(res.data); setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  useEffect(() => {
    load()
    const interval = setInterval(load, refreshSecs * 1000)
    return () => clearInterval(interval)
  }, [load, refreshSecs])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)   return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data)   return null

  const connected = data.status === 'running' || data.status === 'connected'
  const statusColor = connected ? 'var(--green)' : 'var(--red)'
  const location = [data.city, data.country].filter(Boolean).join(', ')

  // All sizes show the same compact layout — enough content for 1x
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column',
      justifyContent: 'center', gap: 6 }}>
      {/* Row 1: status + IP */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px',
          borderRadius: 6, background: 'var(--surface2)', border: `1px solid ${statusColor}30`,
          fontSize: 11, flex: 1 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%',
            background: statusColor, flexShrink: 0 }} />
          <span style={{ fontWeight: 600, color: statusColor }}>
            {connected ? 'Connected' : (data.status || 'Disconnected')}
          </span>
        </div>
        {data.publicIp && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px',
            borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
            fontSize: 11, flex: 1 }}>
            <span style={{ color: 'var(--text-dim)' }}>ip</span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600,
              fontSize: 10 }}>{data.publicIp}</span>
          </div>
        )}
      </div>
      {/* Row 2: location + port */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {location && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px',
            borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
            fontSize: 11, flex: 1 }}>
            <span style={{ color: 'var(--text-muted)' }}>{location}</span>
          </div>
        )}
        {data.port > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px',
            borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
            fontSize: 11, flex: 1 }}>
            <span style={{ color: 'var(--text-dim)' }}>port</span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{data.port}</span>
          </div>
        )}
      </div>
    </div>
  )
}
