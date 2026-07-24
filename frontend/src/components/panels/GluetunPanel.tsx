import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface GluetunData {
  uiUrl: string; status: string; publicIp: string
  country: string; city: string; hostname: string
  provider: string; serverName: string; port: number
  warning?: string
}

export default function GluetunPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<GluetunData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setData(res.data); setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  const sseData = useSSE<GluetunData>(integrationId)
  useEffect(() => {
    if (sseData !== null) setData(sseData)
  }, [sseData])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)   return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data)   return null

  const connected = data.status === 'running' || data.status === 'connected'
  const statusColor = connected ? 'var(--green)' : 'var(--red)'
  const location = [data.city, data.country].filter(Boolean).join(', ')

  // Provider/server/hostname are fetched at every size but only worth the
  // space at 4x+ — smaller panels stay compact-only.
  const showDetail = heightUnits >= 4
  const detailRows = showDetail ? [
    { label: 'provider', value: data.provider },
    { label: 'server', value: data.serverName },
    { label: 'hostname', value: data.hostname },
  ].filter(r => r.value) : []

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column',
      justifyContent: showDetail ? 'flex-start' : 'center', gap: 6,
      overflowY: showDetail ? 'auto' : undefined }}>
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
      {/* Detail rows — 4x+ only */}
      {detailRows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.07em' }}>
            Connection
          </div>
          {detailRows.map(row => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 10px', borderRadius: 6, background: 'var(--surface2)',
              border: '1px solid var(--border)', fontSize: 11 }}>
              <span style={{ color: 'var(--text-dim)', width: 56, flexShrink: 0 }}>{row.label}</span>
              <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap' }}>{row.value}</span>
            </div>
          ))}
        </div>
      )}
      {data.warning && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 10,
          color: 'var(--amber)', lineHeight: 1.4 }}>
          <span>⚠</span>
          <span>{data.warning}</span>
        </div>
      )}
    </div>
  )
}
