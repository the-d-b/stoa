import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface KumaMonitor {
  name: string; status: number; uptime: number; url: string
}
interface KumaData {
  uiUrl: string; upCount: number; downCount: number; pauseCount: number
  monitors: KumaMonitor[]
}

export default function KumaPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<KumaData | null>(null)
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

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const monitors = data.monitors || []
  const down = monitors.filter(m => m.status === 0)

  // ── 1x — summary pills ───────────────────────────────────────────────────
  const Summary = () => (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
      <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--green)',
          fontSize: 12, textDecoration: 'none', color: 'inherit' }}>
        <span style={{ color: 'var(--green)', fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>
          {data.upCount}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>up</span>
      </a>
      <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px',
          borderRadius: 6, background: 'var(--surface2)',
          border: `1px solid ${data.downCount > 0 ? 'var(--red)' : 'var(--border)'}`,
          fontSize: 12, textDecoration: 'none', color: 'inherit' }}>
        <span style={{ color: data.downCount > 0 ? 'var(--red)' : 'var(--text-dim)',
          fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>
          {data.downCount}
        </span>
        <span style={{ color: data.downCount > 0 ? 'var(--red)' : 'var(--text-muted)' }}>down</span>
      </a>
    </div>
  )

  // ── Monitor pills — colored border by status ──────────────────────────────
  const MonitorPills = ({ items }: { items: KumaMonitor[] }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
      {items.map((m, i) => (
        <div key={i} style={{
          padding: '3px 8px', borderRadius: 6, fontSize: 11,
          background: 'var(--surface2)',
          border: `1px solid ${m.status === 1 ? 'var(--green)' : m.status === 0 ? 'var(--red)' : 'var(--border)'}`,
          color: 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          maxWidth: 160,
        }} title={m.name}>
          {m.name}
        </div>
      ))}
    </div>
  )

  // ── 1x — summary only ────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Summary />
    </div>
  )

  // ── 2x and 4x — summary + all monitors as pills ───────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Summary />
      {down.length > 0 && (
        <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 6, fontSize: 11,
          background: '#f8717112', border: '1px solid #f8717130', color: 'var(--red)',
          marginBottom: 6 }}>
          ● {down.map(m => m.name).join(', ')} — down
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <MonitorPills items={monitors} />
      </div>
    </div>
  )
}
