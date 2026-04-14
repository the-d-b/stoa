import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import ArcGauge from './ArcGauge'

interface OPNsenseGateway {
  name: string; status: string; rtt: string; loss: string; address: string
}
interface OPNsenseInterface {
  name: string; device: string; status: string; inMbps: number; outMbps: number; ipAddr: string
}
interface OPNsenseTalker { host: string; ip: string; inMbps: number; outMbps: number }
interface GeoData { country: string; city: string; isp: string; status: string }
interface OPNsenseData {
  uiUrl: string; version: string; updateAvail: boolean
  gateways: OPNsenseGateway[]; interfaces: OPNsenseInterface[]
  topTalkers: OPNsenseTalker[]
  dnsQueries: number; dnsCacheHits: number; dnsCacheMiss: number; pfStates: number
}

function fmtMbps(mbps: number) {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`
  if (mbps >= 1) return `${mbps.toFixed(1)} Mbps`
  if (mbps > 0) return `${(mbps * 1000).toFixed(0)} Kbps`
  return '0'
}

export default function OPNsensePanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<OPNsenseData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [geoData, setGeoData] = useState<Record<string, GeoData | null>>({})
  const [tooltip, setTooltip] = useState<{ ip: string; x: number; y: number } | null>(null)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const refreshSecs = config.refreshSecs || 30
  const maxMbps = config.maxMbps || 1000 // configurable link speed, default 1 Gbps

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
  const ifaces = (data.interfaces || []).filter(i => i.inMbps > 0 || i.outMbps > 0)
  const anyDown = gateways.some(g => g.status === 'offline')

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 6, marginTop: 8 }}>{text}</div>
  )

  // ── Header ────────────────────────────────────────────────────────────────
  const Header = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
      flexWrap: 'wrap', rowGap: 4 }}>
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
      {gateways.length > 0 && (
        <span style={{ marginLeft: 'auto', fontSize: 11,
          color: anyDown ? 'var(--red)' : 'var(--green)' }}>
          {anyDown ? '● Gateway down' : '● All gateways up'}
        </span>
      )}
    </div>
  )

  // ── Interface arc gauges ──────────────────────────────────────────────────
  const InterfaceGauges = ({ size }: { size?: number }) => (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap' }}>
      {ifaces.map((iface, i) => {
        const totalMbps = iface.inMbps + iface.outMbps
        const pct = Math.min((totalMbps / maxMbps) * 100, 100)
        const label = `↓${fmtMbps(iface.inMbps)} ↑${fmtMbps(iface.outMbps)}`
        return (
          <ArcGauge key={i} value={pct} label={label}
            title={iface.name} size={size || 72} />
        )
      })}
      {ifaces.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No active traffic</div>
      )}
    </div>
  )

  // ── Gateway list ──────────────────────────────────────────────────────────
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
          {g.rtt && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)',
              fontFamily: 'DM Mono, monospace' }}>{g.rtt}</span>
          )}
          {g.loss && (
            <span style={{ fontSize: 10, color: 'var(--amber)',
              fontFamily: 'DM Mono, monospace' }}>{g.loss} loss</span>
          )}
        </div>
      ))}
    </div>
  )

  // ── Top talkers — with async geo-IP tooltip on hover ─────────────────────

  const fetchGeo = async (ip: string) => {
    if (!ip || ip in geoData) return
    setGeoData(g => ({ ...g, [ip]: null })) // mark as fetching
    try {
      // Use XMLHttpRequest so it inherits cookies/auth automatically
      const token = localStorage.getItem('stoa_token') || ''
      const res = await fetch(`/api/geo?ip=${encodeURIComponent(ip)}`, {
        headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
      })
      if (!res.ok) {
        console.warn('[geo] fetch failed:', res.status, ip)
        setGeoData(g => ({ ...g, [ip]: { status: 'fail', country: '', city: '', isp: '' } }))
        return
      }
      const d = await res.json()
      console.log('[geo] result for', ip, d)
      setGeoData(g => ({ ...g, [ip]: d }))
    } catch (e) {
      console.warn('[geo] error for', ip, e)
      setGeoData(g => ({ ...g, [ip]: { status: 'fail', country: '', city: '', isp: '' } }))
    }
  }

  const TopTalkers = () => {
    const talkers = data.topTalkers || []
    if (talkers.length === 0) return null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, position: 'relative' }}>
        {talkers.map((t, i) => (
          <div key={i}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 8px',
              borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
              fontSize: 11, cursor: t.ip ? 'help' : 'default', position: 'relative' }}
            onMouseEnter={e => {
              if (t.ip) fetchGeo(t.ip)
              const rect = e.currentTarget.getBoundingClientRect()
              setTooltip({ ip: t.ip || '', x: rect.left, y: rect.bottom + 4 })
            }}
            onMouseLeave={() => setTooltip(null)}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
              fontFamily: 'DM Mono, monospace', width: 14, textAlign: 'right' }}>{i + 1}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{t.host}</span>
            <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace',
              color: 'var(--text-dim)', flexShrink: 0 }}>
              ↓ <span style={{ color: 'var(--green)' }}>{fmtMbps(t.inMbps)}</span>
              {' · '}
              ↑ <span style={{ color: 'var(--amber)' }}>{fmtMbps(t.outMbps)}</span>
            </span>
          </div>
        ))}
        {tooltip && (
          <div style={{
            position: 'fixed', left: tooltip.x, top: tooltip.y,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 7, padding: '6px 10px', fontSize: 11, zIndex: 9999,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            color: 'var(--text-muted)', pointerEvents: 'none',
            display: 'flex', flexDirection: 'column', gap: 2, minWidth: 160,
          }}>
            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600,
              color: 'var(--text)', fontSize: 10 }}>{tooltip.ip || 'No IP available'}</span>
            {tooltip.ip && !geoData[tooltip.ip] && (
              <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>Looking up…</span>
            )}
            {tooltip.ip && geoData[tooltip.ip]?.status === 'success' && (
              <>
                {geoData[tooltip.ip]!.city && geoData[tooltip.ip]!.country && (
                  <span>📍 {geoData[tooltip.ip]!.city}, {geoData[tooltip.ip]!.country}</span>
                )}
                {geoData[tooltip.ip]!.isp && (
                  <span style={{ color: 'var(--text-dim)' }}>🏢 {geoData[tooltip.ip]!.isp}</span>
                )}
              </>
            )}
            {tooltip.ip && geoData[tooltip.ip]?.status === 'fail' && (
              <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>No geo data</span>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── DNS summary ───────────────────────────────────────────────────────────
  const DNSSummary = () => {
    if (!data.dnsQueries) return null
    const hitPct = data.dnsQueries > 0 ? Math.round(data.dnsCacheHits / data.dnsQueries * 100) : 0
    return (
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
          fontSize: 11 }}>
          <span style={{ color: 'var(--text-dim)' }}>queries</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
            {data.dnsQueries.toLocaleString()}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
          fontSize: 11 }}>
          <span style={{ color: 'var(--text-dim)' }}>cache hit</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600,
            color: hitPct > 60 ? 'var(--green)' : 'var(--text)' }}>{hitPct}%</span>
        </div>
        {data.pfStates > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
            borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
            fontSize: 11 }}>
            <span style={{ color: 'var(--text-dim)' }}>fw states</span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
              {data.pfStates.toLocaleString()}
            </span>
          </div>
        )}
      </div>
    )
  }

  // ── 1x — interface arc gauges ─────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <InterfaceGauges size={68} />
    </div>
  )

  // ── 2x — header + gateway status ─────────────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Header />
      <InterfaceGauges />
      {sectionTitle('Gateways')}
      <GatewayList />
    </div>
  )

  // ── 4x — full ─────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Header />
      <InterfaceGauges />
      {sectionTitle('Gateways')}
      <GatewayList />
      {(data.topTalkers || []).length > 0 && (
        <>
          {sectionTitle('Top talkers (WAN)')}
          <TopTalkers />
        </>
      )}
      {data.dnsQueries > 0 && (
        <>
          {sectionTitle('DNS')}
          <DNSSummary />
        </>
      )}
    </div>
  )
}
