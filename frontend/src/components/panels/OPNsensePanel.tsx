import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface OPNsenseGateway {
  name: string; status: string; rtt: string; loss: string; address: string
}
interface OPNsenseInterface {
  name: string; device: string; status: string; inMbps: number; outMbps: number; ipAddr: string
}
interface OPNsenseData {
  uiUrl: string; version: string; updateAvail: boolean
  gateways: OPNsenseGateway[]; interfaces: OPNsenseInterface[]
}

function fmtMbps(mbps: number) {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`
  if (mbps >= 1) return `${mbps.toFixed(1)} Mbps`
  return `${(mbps * 1000).toFixed(0)} Kbps`
}

export default function OPNsensePanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<OPNsenseData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const refreshSecs = config.refreshSecs || 30

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
  const gateways = data.gateways || []
  const interfaces = data.interfaces || []
  const allGatewaysUp = gateways.every(g => g.status === 'online')

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 6, marginTop: 8 }}>{text}</div>
  )

  const Header = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
      <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
        style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textDecoration: 'none',
          padding: '2px 8px', borderRadius: 6, background: 'var(--surface2)',
          border: '1px solid var(--border)' }}
        onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
        onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
        OPNsense
      </a>
      {data.version && (
        <span style={{ fontSize: 10, color: 'var(--text-dim)',
          fontFamily: 'DM Mono, monospace' }}>{data.version}</span>
      )}
      {data.updateAvail && (
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10,
          background: '#f59e0b18', border: '1px solid #f59e0b40',
          color: 'var(--amber)', fontWeight: 600 }}>↑ update</span>
      )}
      <span style={{ marginLeft: 'auto', fontSize: 11,
        color: allGatewaysUp ? 'var(--green)' : 'var(--red)' }}>
        {allGatewaysUp ? '● All gateways up' : '● Gateway down'}
      </span>
    </div>
  )

  const GatewayList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {gateways.map((g, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 8px', borderRadius: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 12 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: g.status === 'online' ? 'var(--green)' : 'var(--red)' }} />
          <span style={{ flex: 1, fontWeight: 500 }}>{g.name}</span>
          {g.address && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)',
              fontFamily: 'DM Mono, monospace' }}>{g.address}</span>
          )}
          {g.rtt && g.rtt !== '~' && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)',
              fontFamily: 'DM Mono, monospace' }}>{g.rtt}</span>
          )}
          {g.loss && g.loss !== '0.0 %' && (
            <span style={{ fontSize: 10, color: 'var(--amber)',
              fontFamily: 'DM Mono, monospace' }}>{g.loss} loss</span>
          )}
        </div>
      ))}
    </div>
  )

  const InterfaceList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {interfaces.filter(i => i.inMbps > 0 || i.outMbps > 0).map((iface, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
          padding: '3px 8px', borderRadius: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
          <span style={{ flex: 1, fontWeight: 500, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{iface.name}</span>
          <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace',
            color: 'var(--text-dim)' }}>
            ↓ <span style={{ color: 'var(--green)' }}>{fmtMbps(iface.inMbps)}</span>
            {'  '}↑ <span style={{ color: 'var(--amber)' }}>{fmtMbps(iface.outMbps)}</span>
          </span>
        </div>
      ))}
    </div>
  )

  // ── 1x — gateway status summary ───────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Header />
      <GatewayList />
    </div>
  )

  // ── 2x — header + gateways + interfaces ──────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Header />
      {sectionTitle('Gateways')}
      <GatewayList />
      {interfaces.some(i => i.inMbps > 0 || i.outMbps > 0) && (
        <>
          {sectionTitle('Traffic')}
          <InterfaceList />
        </>
      )}
    </div>
  )

  // ── 4x — full ─────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Header />
      {sectionTitle('Gateways')}
      <GatewayList />
      {sectionTitle('Interface traffic')}
      <InterfaceList />
    </div>
  )
}
