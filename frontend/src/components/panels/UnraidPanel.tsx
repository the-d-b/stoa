import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface UnraidPool { name: string; status: string; color: string; usedGb: number; totalGb: number; percent: number }
interface UnraidDiskSummary { total: number; healthy: number; issues: string[] }
interface UnraidAlert { level: string; message: string }
interface UnraidParityCheck { status: string; speed: string; duration: number; progress: number }
interface UnraidNetIface { name: string; rxMbs: number; txMbs: number }
interface UnraidShare { name: string }
interface UnraidData {
  uiUrl: string; hostname: string; version: string
  cpuModel: string; cpuCores: number; cpuThreads: number
  cpuPercent: number; cpuTempC?: number
  ramTotalGb: number; ramUsedGb: number; ramPercent: number
  readIops?: number; writeIops?: number
  arrayState: string; arrayUsedGb: number; arrayTotalGb: number; arrayPercent: number
  pools: UnraidPool[]
  diskSummary: UnraidDiskSummary
  parityCheck?: UnraidParityCheck
  dockerRunning: number; dockerStopped: number
  vmRunning: number; vmStopped: number
  netInterfaces: UnraidNetIface[]
  shares: UnraidShare[]
  alerts: UnraidAlert[]
}

// ── Color helpers ─────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  GREEN_ON:  'var(--green)',
  YELLOW_ON: 'var(--amber)',
  RED_ON:    'var(--red)',
  GREY_OFF:  'var(--text-dim)',
  BLUE_ON:   'var(--accent)',
}

const ARRAY_STATE_COLOR: Record<string, string> = {
  STARTED:      'var(--green)',
  STOPPED:      'var(--text-dim)',
  RECON_DISK:   'var(--amber)',
  DISABLE_DISK: 'var(--red)',
}

const ALERT_COLOR: Record<string, string> = {
  error:   'var(--red)',
  warning: 'var(--amber)',
}

function pctColor(p: number) {
  return p >= 90 ? 'var(--red)' : p >= 75 ? 'var(--amber)' : 'var(--accent)'
}

function fmtSize(gb: number) {
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)}T`
  if (gb >= 1)    return `${gb.toFixed(0)}G`
  return `${(gb * 1024).toFixed(0)}M`
}

function fmtMbs(mbs: number) {
  if (mbs >= 1000) return `${(mbs / 1000).toFixed(1)}G/s`
  if (mbs >= 1)    return `${mbs.toFixed(1)}M/s`
  if (mbs > 0)     return `${(mbs * 1000).toFixed(0)}K/s`
  return '—'
}

// ── Shared sub-components (mirrors TrueNAS panel style) ──────────────────────

function MiniBar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 3, background: 'var(--surface2)', borderRadius: 2, flex: 1 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: pctColor(pct), borderRadius: 2 }} />
    </div>
  )
}

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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: size }}>
      <div style={{ position: 'relative', width: size, height: size * 0.6 }}>
        <svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
          <path d={arc(startAngle, startAngle + sweep)} fill="none" stroke="var(--surface2)" strokeWidth={sw} strokeLinecap="round" />
          {filled > 0 && (
            <path d={arc(startAngle, startAngle + filled)} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          )}
        </svg>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: size < 60 ? 11 : 14, fontWeight: 700, fontFamily: 'DM Mono, monospace', color, lineHeight: 1 }}>
            {label}
          </span>
        </div>
      </div>
      {sub && (
        <div style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'DM Mono, monospace', marginTop: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// Mirrors the TrueNAS panel's Thermometer widget exactly, for visual parity.
function Thermometer({ tempC, label, size = 72 }: { tempC: number; label: string; size?: number }) {
  const maxTemp = 100
  const minTemp = 20
  const pct = Math.min(Math.max((tempC - minTemp) / (maxTemp - minTemp) * 100, 0), 100)
  const col = tempC >= 80 ? 'var(--red)' : tempC >= 65 ? 'var(--amber)' : tempC >= 50 ? 'var(--amber)' : 'var(--green)'
  const h = size * 0.42
  const w = size < 60 ? 10 : 13
  const bulbR = w * 1.05
  const tubeW = w * 0.52
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: size }}>
      <svg width={size} height={h + bulbR * 2 + 4} style={{ overflow: 'visible' }}>
        <rect x={(size - tubeW) / 2} y={4} width={tubeW} height={h} rx={tubeW / 2} fill="var(--surface2)" />
        <rect x={(size - tubeW) / 2} y={4 + h * (1 - pct / 100)} width={tubeW}
          height={h * pct / 100} rx={tubeW / 2} fill={col} style={{ transition: 'all 0.6s ease' }} />
        <circle cx={size / 2} cy={h + 4 + bulbR * 0.6} r={bulbR} fill="var(--surface2)" />
        <circle cx={size / 2} cy={h + 4 + bulbR * 0.6} r={bulbR * 0.78} fill={col} style={{ transition: 'all 0.6s ease' }} />
        <text x={size / 2} y={h + 4 + bulbR * 0.5 + 2} textAnchor="middle" dominantBaseline="middle"
          fontSize={size < 60 ? 5 : 7} fontWeight="700" fontFamily="DM Mono, monospace" fill="var(--surface)">
          {tempC.toFixed(0)}°
        </text>
      </svg>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2, fontFamily: 'DM Mono, monospace' }}>{label}</div>
    </div>
  )
}

function NetWidget({ rxMbs, txMbs, size = 72 }: { rxMbs: number; txMbs: number; size?: number }) {
  function fmt(n: number) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}G`
    if (n >= 1)    return `${n.toFixed(1)}M`
    if (n > 0)     return `${(n * 1000).toFixed(0)}K`
    return '0'
  }
  const w = size; const h = size * 0.85
  const pad = 10; const gap = 7
  const ex1f = pad; const ey1f = h - pad
  const ex2 = w - pad; const ey2 = pad
  const ex1 = ex1f + (ex2 - ex1f) * 0.20; const ey1 = ey1f + (ey2 - ey1f) * 0.20
  const ix1f = w - pad; const iy1f = pad + gap
  const ix2 = pad; const iy2 = h - pad + gap
  const ix1 = ix1f + (ix2 - ix1f) * 0.20; const iy1 = iy1f + (iy2 - iy1f) * 0.20
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: size }}>
      <svg width={w} height={h} style={{ overflow: 'visible' }}>
        <defs>
          <marker id="uArrowG" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
            <path d="M0,0 L5,2.5 L0,5 Z" fill="var(--green)" />
          </marker>
          <marker id="uArrowA" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
            <path d="M0,0 L5,2.5 L0,5 Z" fill="var(--amber)" />
          </marker>
        </defs>
        <line x1={ex1} y1={ey1} x2={ex2} y2={ey2} stroke="var(--green)" strokeWidth={2.5} strokeLinecap="round" markerEnd="url(#uArrowG)" opacity={0.85} />
        <line x1={ix1} y1={iy1} x2={ix2} y2={iy2} stroke="var(--amber)" strokeWidth={2.5} strokeLinecap="round" markerEnd="url(#uArrowA)" opacity={0.85} />
        <text x={pad-2} y={ey2+2} fontSize={size < 60 ? 9 : 10} fontFamily="DM Mono, monospace" fill="var(--green)" fontWeight="700" dominantBaseline="hanging">{fmt(txMbs)}</text>
        <text x={w-pad+2} y={iy2} fontSize={size < 60 ? 9 : 10} fontFamily="DM Mono, monospace" fill="var(--amber)" fontWeight="700" textAnchor="end">{fmt(rxMbs)}</text>
      </svg>
      <span style={{ fontSize: 8, color: 'var(--text-dim)', marginTop: 2, fontFamily: 'DM Mono, monospace' }}>net</span>
    </div>
  )
}

// Mirrors the TrueNAS panel's StatPill — a compact label+value tile for a
// metric with no meaningful percent to put on an Arc gauge.
function StatPill({ value, label, color, size = 72 }: { value: string; label: string; color?: string; size?: number }) {
  const col = color || 'var(--accent)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', width: size, height: size * 0.7,
      background: 'var(--surface2)', borderRadius: 10, border: `1px solid ${col}30` }}>
      <span style={{ fontSize: size < 60 ? 13 : 16, fontWeight: 700,
        fontFamily: 'DM Mono, monospace', color: col, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 3,
        fontFamily: 'DM Mono, monospace' }}>{label}</span>
    </div>
  )
}

function ArcRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
      {children}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function UnraidPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<UnraidData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined

  const sseData = useSSE<UnraidData>(integrationId)
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

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)   return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data)   return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const pools = data.pools || []
  const diskSummary = data.diskSummary || { total: 0, healthy: 0, issues: [] }
  const netIfaces = data.netInterfaces || []
  const shares = data.shares || []
  const alerts = data.alerts || []
  const totalRxMbs = netIfaces.reduce((s, i) => s + (i.rxMbs || 0), 0)
  const totalTxMbs = netIfaces.reduce((s, i) => s + (i.txMbs || 0), 0)

  const arrayStateColor = ARRAY_STATE_COLOR[data.arrayState] || 'var(--text-dim)'
  const arrayStateLabel = data.arrayState === 'STARTED' ? 'Array Online'
    : data.arrayState === 'STOPPED' ? 'Array Stopped'
    : data.arrayState === 'RECON_DISK' ? 'Rebuilding'
    : data.arrayState || 'Unknown'

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 6, marginTop: 8 }}>{text}</div>
  )

  // ── Host pill ─────────────────────────────────────────────────────────────
  const HostPill = () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8, justifyContent: 'center' }}>
      <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
        style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', textDecoration: 'none',
          padding: '2px 8px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}
        onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
        onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
        {data.hostname || 'Unraid'}
      </a>
      {data.version && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          {data.version}
        </span>
      )}
      {data.cpuCores > 0 && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          {data.cpuCores}c/{data.cpuThreads}t
        </span>
      )}
      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
        background: 'var(--surface2)', border: `1px solid ${arrayStateColor}40`,
        color: arrayStateColor }}>
        {arrayStateLabel}
      </span>
      {alerts.length > 0 && (
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600,
          background: alerts.some(a => a.level === 'error') ? '#f8717118' : '#fbbf2418',
          border: `1px solid ${alerts.some(a => a.level === 'error') ? '#f8717130' : '#fbbf2430'}`,
          color: alerts.some(a => a.level === 'error') ? 'var(--red)' : 'var(--amber)' }}>
          ⚠ {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )

  // ── Arc rows ──────────────────────────────────────────────────────────────
  const Row1Arcs = ({ size = 72 }: { size?: number }) => (
    <ArcRow>
      <Arc pct={data.cpuPercent ?? 0} label={`${(data.cpuPercent ?? 0).toFixed(0)}%`} sub="cpu" size={size} />
      <Arc pct={data.ramPercent ?? 0} label={`${(data.ramPercent ?? 0).toFixed(0)}%`}
        sub={(data.ramTotalGb ?? 0) > 0 ? `${fmtSize(data.ramUsedGb)} ram` : 'ram'} size={size} />
      {(data.cpuTempC ?? 0) > 0 && (
        <Thermometer tempC={data.cpuTempC!} label="cpu temp" size={size} />
      )}
    </ArcRow>
  )

  const readIops = data.readIops ?? 0
  const writeIops = data.writeIops ?? 0
  const fmtIops = (n: number) => n >= 10 ? n.toFixed(0) : n.toFixed(1)

  const Row2Arcs = ({ size = 72 }: { size?: number }) => {
    const hasNet = totalRxMbs > 0 || totalTxMbs > 0
    const hasIops = readIops > 0 || writeIops > 0
    if (!hasNet && !hasIops) return null
    return (
      <ArcRow>
        {hasNet && <NetWidget rxMbs={totalRxMbs} txMbs={totalTxMbs} size={size} />}
        {hasIops && <StatPill value={fmtIops(readIops)} label="read iops" color="var(--green)" size={size} />}
        {hasIops && <StatPill value={fmtIops(writeIops)} label="write iops" color="var(--amber)" size={size} />}
      </ArcRow>
    )
  }

  // ── Parity check progress ─────────────────────────────────────────────────
  const ParityCheckBar = () => {
    if (!data.parityCheck) return null
    const pc = data.parityCheck
    return (
      <div style={{ marginBottom: 8, padding: '6px 8px', borderRadius: 6,
        background: 'var(--surface2)', border: '1px solid var(--amber)30' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600 }}>Parity check</span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
            {pc.progress.toFixed(1)}% {pc.speed && `· ${pc.speed}`}
          </span>
        </div>
        <MiniBar pct={pc.progress} />
      </div>
    )
  }

  // ── Pools (array + cache pools, matching the TrueNAS panel's Pools section) ──
  const PoolRows = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {pools.map(p => (
        <div key={p.name}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: STATUS_COLOR[p.color] || 'var(--text-dim)' }} />
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

  // ── Disk health summary — a count, not a list; see backend doc comment on
  // why the underlying SMART signal is a hint, not a guarantee ───────────────
  const DiskHealthLine = () => {
    if (diskSummary.total === 0) return null
    const allHealthy = diskSummary.issues.length === 0
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: allHealthy ? 'var(--green)' : 'var(--amber)' }} />
          <span>{diskSummary.total} disk{diskSummary.total !== 1 ? 's' : ''}</span>
          <span style={{ color: allHealthy ? 'var(--text-dim)' : 'var(--amber)' }}>
            {allHealthy ? '· all healthy' : `· ${diskSummary.issues.length} to check`}
          </span>
        </div>
        {!allHealthy && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', paddingLeft: 14, fontFamily: 'DM Mono, monospace' }}>
            {diskSummary.issues.join(', ')}
          </div>
        )}
      </div>
    )
  }

  // ── Alerts ────────────────────────────────────────────────────────────────
  const Alerts = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {alerts.map((a, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 8px', borderRadius: 6, fontSize: 11,
          background: a.level === 'error' ? '#f8717112' : '#fbbf2410',
          border: `1px solid ${a.level === 'error' ? '#f8717130' : '#fbbf2430'}`,
          color: ALERT_COLOR[a.level] || 'var(--text-muted)' }}>
          <span style={{ flexShrink: 0, fontWeight: 600, textTransform: 'uppercase' }}>{a.level}</span>
          <span style={{ flex: 1 }}>{a.message}</span>
        </div>
      ))}
    </div>
  )

  // ── Docker / VM counts ────────────────────────────────────────────────────
  const Pill = ({ label, value, color }: { label: string; value: number; color?: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
      borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: color || 'var(--text)' }}>{value}</span>
    </div>
  )

  const DockerVMRow = () => {
    const hasDocker = (data.dockerRunning + data.dockerStopped) > 0
    const hasVM = (data.vmRunning + data.vmStopped) > 0
    if (!hasDocker && !hasVM) return null
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
        {hasDocker && <>
          <Pill label="docker" value={data.dockerRunning} color="var(--green)" />
          {data.dockerStopped > 0 && <Pill label="stopped" value={data.dockerStopped} color="var(--text-dim)" />}
        </>}
        {hasVM && <>
          <Pill label="vms" value={data.vmRunning} color="var(--green)" />
          {data.vmStopped > 0 && <Pill label="stopped" value={data.vmStopped} color="var(--text-dim)" />}
        </>}
      </div>
    )
  }

  // ── Network interfaces ────────────────────────────────────────────────────
  const NetIfaceList = () => {
    if (netIfaces.length === 0) return null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {netIfaces.map((iface, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 6px', borderRadius: 5, background: 'var(--surface2)',
            border: '1px solid var(--border)', fontSize: 11 }}>
            <span style={{ flex: 1, color: 'var(--text-dim)' }}>{iface.name}</span>
            <span style={{ fontSize: 10, color: 'var(--green)', fontFamily: 'DM Mono, monospace' }}>
              ↑{fmtMbs(iface.txMbs)}
            </span>
            <span style={{ fontSize: 10, color: 'var(--amber)', fontFamily: 'DM Mono, monospace' }}>
              ↓{fmtMbs(iface.rxMbs)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  // ── Shares ────────────────────────────────────────────────────────────────
  const ShareList = () => {
    if (shares.length === 0) return null
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {shares.slice(0, 20).map((s, i) => (
          <span key={i} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4,
            background: 'var(--surface2)', border: '1px solid var(--border)',
            color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
            {s.name}
          </span>
        ))}
      </div>
    )
  }

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
      <ParityCheckBar />
      <Row1Arcs />
      <Row2Arcs />
      {pools.length > 0 && <PoolRows />}
      <DockerVMRow />
    </div>
  )

  // ── 4x+ ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <HostPill />
      <ParityCheckBar />
      <Row1Arcs />
      <Row2Arcs />
      <DockerVMRow />
      {pools.length > 0 && (
        <>{sectionTitle('Pools')}<PoolRows /></>
      )}
      {diskSummary.total > 0 && (
        <>{sectionTitle('Disks')}<DiskHealthLine /></>
      )}
      {netIfaces.length > 1 && (
        <>{sectionTitle('Network')}<NetIfaceList /></>
      )}
      {shares.length > 0 && (
        <>{sectionTitle(`Shares (${shares.length})`)}<ShareList /></>
      )}
      {alerts.length > 0 && (
        <>{sectionTitle('Alerts')}<Alerts /></>
      )}
    </div>
  )
}
