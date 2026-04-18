import { useEffect, useState, useCallback, useRef } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'
import ArcGauge from './ArcGauge'

interface OPNsenseGateway {
  name: string; status: string; rtt: string; loss: string; address: string
}
interface OPNsenseInterface {
  name: string; device: string; status: string; inMbps: number; outMbps: number; ipAddr: string
}
interface OPNsenseTalker { host: string; ip: string; inMbps: number; outMbps: number }
interface GeoData { country: string; city: string; isp: string; status: string }
interface OPNsenseFWEvent { action: string; label: string; count: number }
interface OPNsenseData {
  uiUrl: string; version: string; updateAvail: boolean
  gateways: OPNsenseGateway[]; interfaces: OPNsenseInterface[]
  topTalkers: OPNsenseTalker[]; fwEvents: OPNsenseFWEvent[]
  dnsQueries: number; dnsCacheHits: number; dnsCacheMiss: number; pfStates: number
}

// Up to 60 data points (2 min @ 2s) per interface for sparkline
type TrafficHistory = Record<string, { in: number[]; out: number[] }>

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
  const integrationId = config.integrationId as string | undefined
  const maxMbps = config.maxMbps || 1000

  // Traffic history for sparklines — 60 points max
  const historyRef = useRef<TrafficHistory>({})
  const [history, setHistory] = useState<TrafficHistory>({})

  // SSE — primary data source, ~2s updates from worker
  const sseData = useSSE<OPNsenseData>(integrationId)

  useEffect(() => {
    if (!sseData) return
    setData(sseData)
    setLoading(false)
    setError('')
    // Update traffic history
    const h = { ...historyRef.current }
    for (const iface of sseData.interfaces || []) {
      if (!h[iface.device]) h[iface.device] = { in: [], out: [] }
      h[iface.device].in  = [...h[iface.device].in,  iface.inMbps ].slice(-60)
      h[iface.device].out = [...h[iface.device].out, iface.outMbps].slice(-60)
    }
    historyRef.current = h
    setHistory(h)
  }, [sseData])

  // HTTP fallback — initial load + slow safety net
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
    const interval = setInterval(load, 300 * 1000)
    return () => clearInterval(interval)
  }, [load])

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

  // ── Traffic sparkline ────────────────────────────────────────────────────
  const Sparkline = ({ points, color, width = 80, height = 24 }: {
    points: number[]; color: string; width?: number; height?: number
  }) => {
    if (points.length < 2) return null
    const max = Math.max(...points, 0.01)
    const pts = points.map((v, i) => {
      const x = (i / (points.length - 1)) * width
      const y = height - (v / max) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
    return (
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />
      </svg>
    )
  }

  // ── Interface arc gauges ──────────────────────────────────────────────────
  const InterfaceGauges = ({ size, showSparklines }: { size?: number; showSparklines?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
      {ifaces.map((iface, i) => {
        const totalMbps = iface.inMbps + iface.outMbps
        const pct = Math.min((totalMbps / maxMbps) * 100, 100)
        const label = `↓${fmtMbps(iface.inMbps)} ↑${fmtMbps(iface.outMbps)}`
        const ifHistory = history[iface.device]
        const gaugeSize = size || 72
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ArcGauge value={pct} label={label} title={iface.name} size={gaugeSize} />
            {showSparklines && ifHistory && ifHistory.in.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Sparkline points={ifHistory.in}  color="var(--green)"  width={60} height={18} />
                <Sparkline points={ifHistory.out} color="var(--amber)" width={60} height={18} />
              </div>
            )}
          </div>
        )
      })}
      {ifaces.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No active traffic</div>
      )}
    </div>
  )

  // ── Firewall event donut ─────────────────────────────────────────────────
  // Each unique rule label gets its own color slice in the donut
  const fwEvents = (data.fwEvents || []).filter(e => e.count > 0)
    .sort((a, b) => b.count - a.count)

  // Palette — enough colors for typical rule sets
  const FW_COLORS = [
    '#7c6fff','#4ade80','#f87171','#fbbf24','#38bdf8',
    '#a78bfa','#2dd4bf','#fb923c','#ec4899','#64748b',
  ]

  const FWDonut = () => {
    if (fwEvents.length === 0) return null
    const total = fwEvents.reduce((s, e) => s + e.count, 0)
    const r = 32; const cx = 40; const cy = 40; const strokeW = 11

    function arc(startDeg: number, angleDeg: number, color: string) {
      if (angleDeg <= 0) return null
      if (angleDeg >= 360) angleDeg = 359.9
      const toRad = (d: number) => (d - 90) * Math.PI / 180
      const sx = cx + r * Math.cos(toRad(startDeg))
      const sy = cy + r * Math.sin(toRad(startDeg))
      const ex = cx + r * Math.cos(toRad(startDeg + angleDeg))
      const ey = cy + r * Math.sin(toRad(startDeg + angleDeg))
      const large = angleDeg > 180 ? 1 : 0
      return <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`}
        fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="butt" />
    }

    let cursor = 0
    const slices = fwEvents.map((e, i) => {
      const angle = (e.count / total) * 360
      const slice = { start: cursor, angle, color: FW_COLORS[i % FW_COLORS.length] }
      cursor += angle
      return slice
    })

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <svg width={80} height={80}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface2)" strokeWidth={strokeW} />
            {slices.map((s, i) => (
              <g key={i}>{arc(s.start, s.angle, s.color)}</g>
            ))}
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize={9} fill="var(--text-dim)">events</text>
            <text x={cx} y={cy + 8} textAnchor="middle" fontSize={11} fontWeight="700" fill="var(--text)">{total}</text>
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {fwEvents.slice(0, 6).map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                  background: FW_COLORS[i % FW_COLORS.length] }} />
                <span style={{ color: 'var(--text-muted)', maxWidth: 140,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.label || (e.action === 'block' ? 'block' : 'pass')}
                </span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10,
                  color: e.action === 'block' ? 'var(--red)' : 'var(--green)',
                  marginLeft: 'auto', paddingLeft: 4 }}>
                  {e.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

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
        setGeoData(g => ({ ...g, [ip]: { status: 'fail', country: '', city: '', isp: '' } }))
        return
      }
      const d = await res.json()
      setGeoData(g => ({ ...g, [ip]: d }))
    } catch (e) {
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
    if (!(data.dnsQueries ?? 0)) return null
    const hitPct = (data.dnsQueries ?? 0) > 0 ? Math.round(data.dnsCacheHits / data.dnsQueries * 100) : 0
    return (
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
          fontSize: 11 }}>
          <span style={{ color: 'var(--text-dim)' }}>queries</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
            {(data.dnsQueries ?? 0).toLocaleString()}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
          fontSize: 11 }}>
          <span style={{ color: 'var(--text-dim)' }}>cache hit</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600,
            color: hitPct > 60 ? 'var(--green)' : 'var(--text)' }}>{hitPct}%</span>
        </div>
        {(data.pfStates ?? 0) > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
            borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
            fontSize: 11 }}>
            <span style={{ color: 'var(--text-dim)' }}>fw states</span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
              {(data.pfStates ?? 0).toLocaleString()}
            </span>
          </div>
        )}
      </div>
    )
  }

  // ── 1x — interface arc gauges with sparklines side by side ─────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <InterfaceGauges size={64} showSparklines />
    </div>
  )

  // ── 2x — interfaces + centered donut ────────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <InterfaceGauges showSparklines />
      {fwEvents.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <FWDonut />
        </div>
      )}
    </div>
  )

  // ── 4x — full ─────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Header />
      <InterfaceGauges showSparklines />
      {fwEvents.length > 0 && (
        <div style={{ marginTop: 10, marginBottom: 6 }}>
          <FWDonut />
        </div>
      )}
      {(data.topTalkers || []).length > 0 && (
        <>
          {sectionTitle('Top talkers (WAN)')}
          <TopTalkers />
        </>
      )}
      {(data.dnsQueries ?? 0) > 0 && (
        <>
          {sectionTitle('DNS')}
          <DNSSummary />
        </>
      )}
    </div>
  )
}
