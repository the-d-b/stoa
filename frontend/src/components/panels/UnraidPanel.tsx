import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface UnraidDisk { name: string; sizeGb: number; tempC: number; status: string; color: string; numErrors: number }
interface UnraidParityCheck { status: string; speed: string; duration: number; progress: number }
interface UnraidNetIface { name: string; rxMbs: number; txMbs: number }
interface UnraidShare { name: string }
interface UnraidData {
  uiUrl: string; hostname: string; version: string
  cpuModel: string; cpuCores: number; cpuThreads: number
  cpuPercent: number
  ramTotalGb: number; ramUsedGb: number; ramPercent: number
  arrayState: string; arrayUsedGb: number; arrayTotalGb: number; arrayPercent: number
  disks: UnraidDisk[]
  parityCheck?: UnraidParityCheck
  dockerRunning: number; dockerStopped: number
  vmRunning: number; vmStopped: number
  netInterfaces: UnraidNetIface[]
  shares: UnraidShare[]
}

// ── Color helpers ─────────────────────────────────────────────────────────────

const DISK_COLOR: Record<string, string> = {
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

function diskColor(d: UnraidDisk) {
  return DISK_COLOR[d.color] || 'var(--text-dim)'
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
  const disks = (data.disks || []).filter(d => d.name && d.color !== 'GREY_OFF')
  const allDisks = data.disks || []
  const netIfaces = data.netInterfaces || []
  const shares = data.shares || []
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
    </div>
  )

  // ── Arc rows ──────────────────────────────────────────────────────────────
  const Row1Arcs = ({ size = 72 }: { size?: number }) => (
    <ArcRow>
      <Arc pct={data.cpuPercent ?? 0} label={`${(data.cpuPercent ?? 0).toFixed(0)}%`} sub="cpu" size={size} />
      <Arc pct={data.ramPercent ?? 0} label={`${(data.ramPercent ?? 0).toFixed(0)}%`}
        sub={(data.ramTotalGb ?? 0) > 0 ? `${fmtSize(data.ramUsedGb)} ram` : 'ram'} size={size} />
      {(data.arrayTotalGb ?? 0) > 0 && (
        <Arc pct={data.arrayPercent ?? 0} label={`${(data.arrayPercent ?? 0).toFixed(0)}%`}
          sub={`${fmtSize(data.arrayUsedGb)}/${fmtSize(data.arrayTotalGb)}`} size={size} />
      )}
    </ArcRow>
  )

  const Row2Arcs = ({ size = 72 }: { size?: number }) => {
    if (totalRxMbs === 0 && totalTxMbs === 0) return null
    return (
      <ArcRow>
        <NetWidget rxMbs={totalRxMbs} txMbs={totalTxMbs} size={size} />
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

  // ── Array capacity bar ────────────────────────────────────────────────────
  const ArrayBar = () => {
    if ((data.arrayTotalGb ?? 0) === 0) return null
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: arrayStateColor }} />
          <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>Array</span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
            {fmtSize(data.arrayUsedGb)}/{fmtSize(data.arrayTotalGb)}
          </span>
          <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', width: 32, textAlign: 'right',
            color: pctColor(data.arrayPercent ?? 0) }}>
            {(data.arrayPercent ?? 0).toFixed(0)}%
          </span>
        </div>
        <div style={{ paddingLeft: 14 }}><MiniBar pct={data.arrayPercent ?? 0} /></div>
      </div>
    )
  }

  // ── Disk table ────────────────────────────────────────────────────────────
  const DiskTable = () => {
    const rows = disks.length > 0 ? disks : allDisks.slice(0, 12)
    if (rows.length === 0) return null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {rows.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 6px', borderRadius: 5, background: 'var(--surface2)',
            border: '1px solid var(--border)', fontSize: 11 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: diskColor(d) }} />
            <span style={{ flex: 1, color: 'var(--text)', minWidth: 0, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
            {d.sizeGb > 0 && (
              <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>
                {fmtSize(d.sizeGb)}
              </span>
            )}
            {d.tempC > 0 && (
              <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', flexShrink: 0,
                color: d.tempC >= 85 ? 'var(--red)' : d.tempC >= 70 ? 'var(--amber)' : 'var(--text-muted)' }}>
                {d.tempC}°
              </span>
            )}
            {d.numErrors > 0 && (
              <span style={{ fontSize: 10, color: 'var(--red)', fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>
                {d.numErrors}err
              </span>
            )}
          </div>
        ))}
      </div>
    )
  }

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
      <ArrayBar />
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
      <ArrayBar />
      <DockerVMRow />
      {disks.length > 0 && (
        <>{sectionTitle('Disks')}<DiskTable /></>
      )}
      {netIfaces.length > 1 && (
        <>{sectionTitle('Network')}<NetIfaceList /></>
      )}
      {shares.length > 0 && (
        <>{sectionTitle(`Shares (${shares.length})`)}<ShareList /></>
      )}
    </div>
  )
}
