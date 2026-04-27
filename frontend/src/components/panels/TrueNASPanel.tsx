import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface TrueNASPool { name: string; status: string; usedGb: number; totalGb: number; percent: number }
interface TrueNASAlert { level: string; message: string }
interface TrueNASDisk { name: string; tempC: number }
interface TrueNASVM { name: string; status: string }
interface TrueNASApp { name: string; status: string; updateAvailable: boolean }
interface TrueNASIface { name: string; rxMbs: number; txMbs: number; linkUp: boolean }
interface TrueNASData {
  uiUrl: string; hostname: string; version: string
  totalRam: string; cpuModel: string; cpuCores: number
  cpuPercent: number; cpuTempC: number
  ramUsedGb: number; ramTotalGb: number; ramPercent: number
  arcUsedGb: number
  diskReadMbs: number; diskWriteMbs: number; diskBusy: number
  netInterfaces: TrueNASIface[]
  pools: TrueNASPool[]; alerts: TrueNASAlert[]
  disks: TrueNASDisk[]; vms: TrueNASVM[]; apps: TrueNASApp[]
}

const STATUS_COLOR: Record<string, string> = {
  ONLINE: 'var(--green)', DEGRADED: 'var(--amber)', FAULTED: 'var(--red)'
}
const ALERT_COLOR: Record<string, string> = {
  CRITICAL: 'var(--red)', WARNING: 'var(--amber)', INFO: 'var(--text-muted)'
}

function fmtSize(gb: number) {
  return gb >= 1024 ? `${(gb / 1024).toFixed(1)}T` : `${gb.toFixed(0)}G`
}
function fmtMbs(mbs: number) {
  if (mbs >= 1000) return `${(mbs/1000).toFixed(1)}G/s`
  if (mbs >= 1) return `${mbs.toFixed(1)}M/s`
  if (mbs > 0) return `${(mbs*1000).toFixed(0)}K/s`
  return '—'
}
function tempColor(c: number) {
  return c >= 85 ? 'var(--red)' : c >= 70 ? 'var(--amber)' : 'var(--text-muted)'
}
function pctColor(p: number) {
  return p >= 90 ? 'var(--red)' : p >= 75 ? 'var(--amber)' : 'var(--accent)'
}

function MiniBar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 3, background: 'var(--surface2)', borderRadius: 2, flex: 1 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: pctColor(pct), borderRadius: 2 }} />
    </div>
  )
}

// ── Arc gauge ─────────────────────────────────────────────────────────────────
function Arc({ pct, label, sub, size = 72 }: { pct: number; label: string; sub?: string; size?: number }) {
  const r = (size - 10) / 2
  const cx = size / 2; const cy = size / 2
  const startAngle = 270; const sweep = 180
  const filled = Math.min(Math.max(pct, 0), 100) / 100 * sweep
  const sw = size < 60 ? 5 : 7
  const color = pctColor(pct)

  function pt(deg: number) {
    const rad = (deg - 90) * Math.PI / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  }
  function arc(s: number, e: number) {
    const a = pt(s); const b = pt(e)
    const large = e - s > 180 ? 1 : 0
    return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, width: size }}>
      <div style={{ position: 'relative', width: size, height: size * 0.6 }}>
        <svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
          <path d={arc(startAngle, startAngle + sweep)} fill="none"
            stroke="var(--surface2)" strokeWidth={sw} strokeLinecap="round" />
          {filled > 0 && (
            <path d={arc(startAngle, startAngle + filled)} fill="none"
              stroke={color} strokeWidth={sw} strokeLinecap="round" />
          )}
        </svg>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: size < 60 ? 11 : 14, fontWeight: 700,
            fontFamily: 'DM Mono, monospace', color, lineHeight: 1 }}>
            {label}
          </span>
        </div>
      </div>
      {sub && (
        <div style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center',
          fontFamily: 'DM Mono, monospace', marginTop: 1, width: '100%',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ── Thermometer — for temperatures ──────────────────────────────────────────
function Thermometer({ tempC, label, size = 72 }: { tempC: number; label: string; size?: number }) {
  const maxTemp = 100
  const minTemp = 20
  const pct = Math.min(Math.max((tempC - minTemp) / (maxTemp - minTemp) * 100, 0), 100)
  const col = tempC >= 80 ? 'var(--red)' : tempC >= 65 ? 'var(--amber)' : tempC >= 50 ? '#f59e0b' : 'var(--green)'
  const h = size * 0.42  // tube height (shortened 25%)
  const w = size < 60 ? 10 : 13
  const bulbR = w * 1.05
  const tubeW = w * 0.52

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: size }}>
      <svg width={size} height={h + bulbR * 2 + 4} style={{ overflow: 'visible' }}>
        {/* Tube background */}
        <rect x={(size - tubeW) / 2} y={4} width={tubeW} height={h}
          rx={tubeW / 2} fill="var(--surface2)" />
        {/* Tube fill */}
        <rect x={(size - tubeW) / 2} y={4 + h * (1 - pct / 100)} width={tubeW}
          height={h * pct / 100} rx={tubeW / 2} fill={col} style={{ transition: 'all 0.6s ease' }} />
        {/* Bulb background */}
        <circle cx={size / 2} cy={h + 4 + bulbR * 0.6} r={bulbR} fill="var(--surface2)" />
        {/* Bulb fill */}
        <circle cx={size / 2} cy={h + 4 + bulbR * 0.6} r={bulbR * 0.78} fill={col}
          style={{ transition: 'all 0.6s ease' }} />
        {/* Temp label */}
        <text x={size / 2} y={h + 4 + bulbR * 0.5 + 2}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={size < 60 ? 5 : 7} fontWeight="700" fontFamily="DM Mono, monospace"
          fill="var(--surface)">{tempC.toFixed(0)}°</text>
      </svg>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2,
        fontFamily: 'DM Mono, monospace' }}>{label}</div>
    </div>
  )
}

// ── StatPill — compact label+value for metrics with no meaningful % ───────────
function StatPill({ value, label, color, size = 72 }: {
  value: string; label: string; color?: string; size?: number
}) {
  const col = color || 'var(--accent)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', width: size, height: size * 0.7,
      background: 'var(--surface2)', borderRadius: 10,
      border: `1px solid ${col}30` }}>
      <span style={{ fontSize: size < 60 ? 13 : 16, fontWeight: 700,
        fontFamily: 'DM Mono, monospace', color: col, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 3,
        fontFamily: 'DM Mono, monospace' }}>{label}</span>
    </div>
  )
}

// ── CrossNetWidget — percent-sign style network display ──────────────────────
// Top-left: egress (green), diagonal arrow ↗. Bottom-right: ingress (orange), diagonal arrow ↙
function NetWidget({ rxMbs, txMbs, size = 72 }: { rxMbs: number; txMbs: number; size?: number }) {
  function fmt(n: number) {
    if (n >= 1000) return `${(n/1000).toFixed(1)}G`
    if (n >= 1) return `${n.toFixed(1)}M`
    if (n > 0) return `${(n*1000).toFixed(0)}K`
    return '0'
  }
  const w = size; const h = size * 0.85
  const pad = 10  // more padding = shorter lines
  const gap = 7   // gap between the two diagonal lines
  // Egress: full line BL→TR, then trim 20% from start (move start 20% toward end)
  const ex1_full = pad; const ey1_full = h - pad
  const ex2 = w - pad; const ey2 = pad
  const ex1 = ex1_full + (ex2 - ex1_full) * 0.20
  const ey1 = ey1_full + (ey2 - ey1_full) * 0.20
  // Ingress: full line TR→BL, trim 20% from start (move start 20% toward end)
  const ix1_full = w - pad; const iy1_full = pad + gap
  const ix2 = pad; const iy2 = h - pad + gap
  const ix1 = ix1_full + (ix2 - ix1_full) * 0.20
  const iy1 = iy1_full + (iy2 - iy1_full) * 0.20
  return (
    <div style={{ position: 'relative', width: size, display: 'flex',
      flexDirection: 'column', alignItems: 'center' }}>
      <svg width={w} height={h} style={{ overflow: 'visible' }}>
        <defs>
          <marker id="arrowG" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
            <path d="M0,0 L5,2.5 L0,5 Z" fill="var(--green)" />
          </marker>
          <marker id="arrowA" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
            <path d="M0,0 L5,2.5 L0,5 Z" fill="var(--amber)" />
          </marker>
        </defs>
        {/* Egress line BL → TR (green) */}
        <line x1={ex1} y1={ey1} x2={ex2} y2={ey2}
          stroke="var(--green)" strokeWidth={2.5} strokeLinecap="round"
          markerEnd="url(#arrowG)" opacity={0.85} />
        {/* Ingress line TR → BL (amber) — offset below */}
        <line x1={ix1} y1={iy1} x2={ix2} y2={iy2}
          stroke="var(--amber)" strokeWidth={2.5} strokeLinecap="round"
          markerEnd="url(#arrowA)" opacity={0.85} />
        {/* Egress value — top left */}
        <text x={pad-2} y={ey2+2} fontSize={size < 60 ? 9 : 10}
          fontFamily="DM Mono, monospace" fill="var(--green)" fontWeight="700"
          dominantBaseline="hanging">{fmt(txMbs)}</text>
        {/* Ingress value — bottom right */}
        <text x={w-pad+2} y={iy2} fontSize={size < 60 ? 9 : 10}
          fontFamily="DM Mono, monospace" fill="var(--amber)" fontWeight="700"
          textAnchor="end" dominantBaseline="auto">{fmt(rxMbs)}</text>
      </svg>
      <span style={{ fontSize: 8, color: 'var(--text-dim)', marginTop: 2,
        fontFamily: 'DM Mono, monospace' }}>net</span>
    </div>
  )
}

// ── Arc row wrapper ───────────────────────────────────────────────────────────
function ArcRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap',
      marginBottom: 8 }}>
      {children}
    </div>
  )
}

export default function TrueNASPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<TrueNASData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined

  const sseData = useSSE<TrueNASData>(integrationId)
  useEffect(() => {
    if (sseData) { setData(sseData); setLoading(false); setError('') }
  }, [sseData])

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
  const pools = data.pools || []
  const alerts = (data.alerts || []).filter(a => a.level !== 'INFO')
  const disks = (data.disks || []).filter(d => d.tempC > 0)
  const vms = data.vms || []
  const apps = data.apps || []
  const netIfaces = data.netInterfaces || []

  // Aggregate network throughput across all interfaces
  const totalRxMbs = netIfaces.reduce((s, i) => s + (i.rxMbs || 0), 0)
  const totalTxMbs = netIfaces.reduce((s, i) => s + (i.txMbs || 0), 0)

  // Avg disk temp
  const avgDiskTemp = disks.length > 0
    ? disks.reduce((s, d) => s + d.tempC, 0) / disks.length : 0

  const vmRunning = vms.filter(v => ['RUNNING','running'].includes(v.status)).length
  const vmStopped = vms.length - vmRunning
  const appRunning = apps.filter(a => ['RUNNING','running','active','ACTIVE'].includes(a.status)).length
  const appStopped = apps.filter(a => !['RUNNING','running','active','ACTIVE'].includes(a.status)).length
  const appUpdates = apps.filter(a => a.updateAvailable).length

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 6, marginTop: 8 }}>{text}</div>
  )

  // ── Hostname pill ─────────────────────────────────────────────────────────
  const HostPill = () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8, justifyContent: 'center' }}>
      <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
        style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', textDecoration: 'none',
          padding: '2px 8px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}
        onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
        onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
        {data.hostname || 'TrueNAS'}
      </a>
      {data.cpuCores > 0 && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          {data.cpuCores}c
        </span>
      )}
      {data.totalRam && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          {data.totalRam}
        </span>
      )}
      {alerts.length > 0 && (
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600,
          background: alerts.some(a => a.level === 'CRITICAL') ? '#f8717118' : '#fbbf2418',
          border: `1px solid ${alerts.some(a => a.level === 'CRITICAL') ? '#f8717130' : '#fbbf2430'}`,
          color: alerts.some(a => a.level === 'CRITICAL') ? 'var(--red)' : 'var(--amber)' }}>
          ⚠ {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )

  // ── Row 1 arcs: CPU, Disk I/O, Temp ──────────────────────────────────────
  // Row 1: CPU, RAM, IOPS — core metrics first like Proxmox
  const Row1Arcs = ({ size = 72 }: { size?: number }) => (
    <ArcRow>
      <Arc pct={data.cpuPercent} label={`${(data.cpuPercent ?? 0).toFixed(0)}%`} sub="cpu" size={size} />
      <Arc pct={data.ramPercent} label={`${(data.ramPercent ?? 0).toFixed(0)}%`}
        sub={(data.ramTotalGb ?? 0) > 0 ? `${fmtSize(data.ramUsedGb)} ram` : 'ram'} size={size} />
      <Arc pct={Math.min(data.diskBusy ?? 0, 100)}
        label={`io ${(data.diskBusy ?? 0).toFixed(0)}%`}
        sub={(data.diskReadMbs ?? 0) > 0 ? `↓${fmtMbs((data.diskReadMbs ?? 0))}` : 'disk busy'} size={size} />
    </ArcRow>
  )

  // Row 2: Temp, Network, ARC
  const Row2Arcs = ({ size = 72 }: { size?: number }) => (
    <ArcRow>
      {avgDiskTemp > 0
        ? <Thermometer tempC={avgDiskTemp} label="disk temp" size={size} />
        : (data.cpuTempC ?? 0) > 0
          ? <Thermometer tempC={data.cpuTempC} label="cpu temp" size={size} />
          : null}
      {(totalRxMbs > 0 || totalTxMbs > 0) && (
        <NetWidget rxMbs={totalRxMbs} txMbs={totalTxMbs} size={size} />
      )}
      {(data.arcUsedGb ?? 0) > 0 && (
        <StatPill value={fmtSize(data.arcUsedGb)} label="arc" color="var(--accent)" size={size} />
      )}
    </ArcRow>
  )

  // ── Pool rows ─────────────────────────────────────────────────────────────
  const PoolRows = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {pools.map(p => (
        <div key={p.name}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: STATUS_COLOR[p.status] || 'var(--text-dim)' }} />
            <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{p.name}</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
              {fmtSize(p.usedGb)}/{fmtSize(p.totalGb)}
            </span>
            <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', width: 32, textAlign: 'right',
              color: pctColor(p.percent) }}>
              {p.percent.toFixed(0)}%
            </span>
          </div>
          <div style={{ paddingLeft: 14 }}><MiniBar pct={p.percent} /></div>
        </div>
      ))}
    </div>
  )

  // ── Alerts ────────────────────────────────────────────────────────────────
  const Alerts = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {alerts.map((a, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 8px', borderRadius: 6, fontSize: 11,
          background: a.level === 'CRITICAL' ? '#f8717112' : '#fbbf2410',
          border: `1px solid ${a.level === 'CRITICAL' ? '#f8717130' : '#fbbf2430'}`,
          color: ALERT_COLOR[a.level] || 'var(--text-muted)' }}>
          <span style={{ flexShrink: 0, fontWeight: 600 }}>{a.level}</span>
          <span style={{ flex: 1 }}>{a.message}</span>
        </div>
      ))}
    </div>
  )

  // ── Disk temps ────────────────────────────────────────────────────────────
  const Disks = () => {
    const rows: TrueNASDisk[][] = []
    for (let i = 0; i < disks.length; i += 4) rows.push(disks.slice(i, i + 4))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 5 }}>
            {row.map((d, di) => (
              <div key={di} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4,
                padding: '2px 6px', borderRadius: 5, background: 'var(--surface2)',
                border: '1px solid var(--border)', fontSize: 10, fontFamily: 'DM Mono, monospace' }}>
                <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>{d.name}</span>
                <span style={{ fontWeight: 600, color: tempColor(d.tempC) }}>{d.tempC.toFixed(0)}°</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  // ── VM / App pills ────────────────────────────────────────────────────────
  const Pill = ({ label, value, color }: { label: string; value: number; color?: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
      borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: color || 'var(--text)' }}>{value}</span>
    </div>
  )
  const VMSummary = () => vms.length === 0 ? null : (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
      <Pill label="running" value={vmRunning} color="var(--green)" />
      {vmStopped > 0 && <Pill label="stopped" value={vmStopped} color="var(--text-dim)" />}
    </div>
  )
  const AppSummary = () => apps.length === 0 ? null : (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
      <Pill label="running" value={appRunning} color="var(--green)" />
      {appStopped > 0 && <Pill label="stopped" value={appStopped} color="var(--text-dim)" />}
      {appUpdates > 0 && <Pill label="updates" value={appUpdates} color="var(--amber)" />}
    </div>
  )

  // ── 1x ────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <Row1Arcs size={64} />
    </div>
  )

  // ── 2x ────────────────────────────────────────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <HostPill />
      <Row1Arcs />
      <Row2Arcs />
      {pools.length > 0 && <PoolRows />}
    </div>
  )

  // ── 4x ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <HostPill />
      <Row1Arcs />
      <Row2Arcs />
      {pools.length > 0 && (
        <>{sectionTitle('Pools')}<PoolRows /></>
      )}
      {vms.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {sectionTitle('VMs')}<VMSummary />
        </div>
      )}
      {apps.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {sectionTitle('Apps')}<AppSummary />
        </div>
      )}
      {disks.length > 0 && (
        <>{sectionTitle('Disk temps')}<Disks /></>
      )}
      {alerts.length > 0 && (
        <>{sectionTitle('Alerts')}<Alerts /></>
      )}
    </div>
  )
}
