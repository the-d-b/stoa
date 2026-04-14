import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface KumaMonitor {
  name: string; status: number; uptime: number; url: string
}
interface KumaData {
  uiUrl: string; upCount: number; downCount: number; pauseCount: number
  monitors: KumaMonitor[]
}

function statusColor(s: number) {
  if (s === 1) return 'var(--green)'
  if (s === 0) return 'var(--red)'
  return 'var(--text-dim)'
}
function statusLabel(s: number) {
  if (s === 1) return 'up'
  if (s === 0) return 'down'
  return 'paused'
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

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 6, marginTop: 8 }}>{text}</div>
  )

  // ── Summary bar ───────────────────────────────────────────────────────────
  const Summary = () => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
      <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
          fontSize: 11, textDecoration: 'none', color: 'inherit' }}
        onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
        onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
        <span style={{ color: 'var(--green)' }}>●</span>
        <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{data.upCount}</span>
        <span style={{ color: 'var(--text-dim)' }}>up</span>
      </a>
      {data.downCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px',
          borderRadius: 6, background: '#f8717112', border: '1px solid #f8717130', fontSize: 11 }}>
          <span style={{ color: 'var(--red)' }}>●</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--red)' }}>{data.downCount}</span>
          <span style={{ color: 'var(--red)' }}>down</span>
        </div>
      )}
      {data.pauseCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
          <span style={{ color: 'var(--text-dim)' }}>⏸</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{data.pauseCount}</span>
          <span style={{ color: 'var(--text-dim)' }}>paused</span>
        </div>
      )}
    </div>
  )

  // ── Monitor list ─────────────────────────────────────────────────────────
  const MonitorList = ({ items }: { items: KumaMonitor[] }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {items.map((m, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
          padding: '3px 8px', borderRadius: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 12 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: statusColor(m.status) }} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', fontWeight: 500 }}>{m.name}</span>
          {m.uptime > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)',
              fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>
              {m.uptime.toFixed(1)}%
            </span>
          )}
          <span style={{ fontSize: 10, color: statusColor(m.status),
            flexShrink: 0, fontWeight: 600 }}>{statusLabel(m.status)}</span>
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

  // ── 2x — summary + down monitors highlighted ──────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Summary />
      {down.length > 0 && (
        <>
          {sectionTitle('Down')}
          <MonitorList items={down} />
        </>
      )}
      {down.length === 0 && (
        <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12,
          color: 'var(--green)' }}>✓ All monitors up</div>
      )}
    </div>
  )

  // ── 4x — summary + all monitors ──────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Summary />
      {down.length > 0 && (
        <>
          {sectionTitle('Down')}
          <MonitorList items={down} />
        </>
      )}
      {sectionTitle(`All monitors (${monitors.length})`)}
      <MonitorList items={monitors} />
    </div>
  )
}
