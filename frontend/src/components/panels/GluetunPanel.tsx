import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface GluetunData {
  uiUrl: string; status: string; publicIp: string
  country: string; city: string; hostname: string
  provider: string; serverName: string
}

export default function GluetunPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
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
  const statusText = connected ? 'Connected' : (data.status || 'Disconnected')
  const location = [data.city, data.country].filter(Boolean).join(', ')

  const Pill = ({ label, value, mono }: { label?: string; value: string; mono?: boolean }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
      borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
      {label && <span style={{ color: 'var(--text-dim)' }}>{label}</span>}
      <span style={{ fontFamily: mono ? 'DM Mono, monospace' : undefined,
        fontWeight: mono ? 600 : 500, color: 'var(--text)' }}>{value}</span>
    </div>
  )

  // ── 1x — status + location ────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column',
      justifyContent: 'center', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%',
          background: statusColor, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: statusColor }}>{statusText}</span>
      </div>
      {location && (
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>{location}</div>
      )}
    </div>
  )

  // ── 2x — status + IP + location + provider ────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%',
          background: statusColor, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: statusColor }}>{statusText}</span>
        {data.provider && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 'auto' }}>
            {data.provider}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {data.publicIp && <Pill label="ip" value={data.publicIp} mono />}
        {location && <Pill value={location} />}
      </div>
    </div>
  )

  // ── 4x — full detail ──────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%',
          background: statusColor, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: statusColor }}>{statusText}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {data.publicIp && <Pill label="Public IP" value={data.publicIp} mono />}
        {location && <Pill label="Location" value={location} />}
        {data.hostname && <Pill label="Hostname" value={data.hostname} mono />}
        {data.provider && <Pill label="Provider" value={data.provider} />}
        {data.serverName && <Pill label="Server" value={data.serverName} mono />}
      </div>
    </div>
  )
}
