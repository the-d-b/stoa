import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface OMVFilesystem { deviceFile: string; label: string; type: string; mountPoint: string; totalGb: number; usedGb: number; percent: number }
interface OMVDisk { deviceName: string; model: string; sizeGb: number; tempC: number; powerMode: string }
interface OMVNetIface { name: string; rxMbs: number; txMbs: number; linkUp: boolean }
interface OMVServices { running: number; stopped: number }
interface OMVData {
  uiUrl: string; hostname: string; version: string
  cpuModel: string; cpuCores: number
  cpuPercent: number
  ramTotalGb: number; ramUsedGb: number; ramPercent: number
  uptimeSecs: number
  filesystems: OMVFilesystem[]
  disks: OMVDisk[]
  netInterfaces: OMVNetIface[]
  services: OMVServices
  shares: string[]
}

// ── Formatters ────────────────────────────────────────────────────────────────

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

function fmtUptime(secs: number) {
  if (!secs || secs <= 0) return ''
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function tempColor(c: number) {
  return c >= 85 ? 'var(--red)' : c >= 70 ? 'var(--amber)' : 'var(--text-muted)'
}

// ── Shared sub-components (same style as TrueNAS panel) ──────────────────────

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
          <marker id="omvArrowG" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
            <path d="M0,0 L5,2.5 L0,5 Z" fill="var(--green)" />
          </marker>
          <marker id="omvArrowA" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
            <path d="M0,0 L5,2.5 L0,5 Z" fill="var(--amber)" />
          </marker>
        </defs>
        <line x1={ex1} y1={ey1} x2={ex2} y2={ey2} stroke="var(--green)" strokeWidth={2.5} strokeLinecap="round" markerEnd="url(#omvArrowG)" opacity={0.85} />
        <line x1={ix1} y1={iy1} x2={ix2} y2={iy2} stroke="var(--amber)" strokeWidth={2.5} strokeLinecap="round" markerEnd="url(#omvArrowA)" opacity={0.85} />
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

export default function OMVPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<OMVData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined

  const sseData = useSSE<OMVData>(integrationId)
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
  const filesystems = data.filesystems || []
  const disks = (data.disks || []).filter(d => d.deviceName)
  const netIfaces = data.netInterfaces || []
  const shares = data.shares || []
  const services = data.services || { running: 0, stopped: 0 }

  const totalRxMbs = netIfaces.reduce((s, i) => s + (i.rxMbs || 0), 0)
  const totalTxMbs = netIfaces.reduce((s, i) => s + (i.txMbs || 0), 0)

  const uptime = fmtUptime(data.uptimeSecs)

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
        {data.hostname || 'OMV'}
      </a>
      {data.version && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          v{data.version}
        </span>
      )}
      {data.cpuCores > 0 && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          {data.cpuCores}c
        </span>
      )}
      {uptime && (
        <span style={{ fontSize: 11, color: 'var(--text-dim)', padding: '2px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          up {uptime}
        </span>
      )}
      {services.stopped > 0 && (
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
          background: '#fbbf2418', border: '1px solid #fbbf2430', color: 'var(--amber)' }}>
          ⚠ {services.stopped} svc down
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
    </ArcRow>
  )

  // ── Filesystem rows (like TrueNAS pool rows) ──────────────────────────────
  const FilesystemRows = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {filesystems.map((fs, i) => (
        <div key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: pctColor(fs.percent) }} />
            <span style={{ fontSize: 12, fontWeight: 500, flex: 1, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fs.mountPoint}>
              {fs.label}
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace',
              flexShrink: 0, letterSpacing: 0 }}>
              {fs.type}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>
              {fmtSize(fs.usedGb)}/{fmtSize(fs.totalGb)}
            </span>
            <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', width: 32, textAlign: 'right',
              flexShrink: 0, color: pctColor(fs.percent) }}>
              {fs.percent.toFixed(0)}%
            </span>
          </div>
          <div style={{ paddingLeft: 14 }}><MiniBar pct={fs.percent} /></div>
        </div>
      ))}
    </div>
  )

  // ── Disk details table (4x+) ──────────────────────────────────────────────
  const DiskTable = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {disks.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6,
          padding: '3px 6px', borderRadius: 5, background: 'var(--surface2)',
          border: '1px solid var(--border)', fontSize: 11 }}>
          <span style={{ color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', flexShrink: 0, minWidth: 28 }}>
            {d.deviceName}
          </span>
          <span style={{ flex: 1, color: 'var(--text-muted)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>
            {d.model}
          </span>
          {d.sizeGb > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>
              {fmtSize(d.sizeGb)}
            </span>
          )}
          {d.tempC > 0 && (
            <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', flexShrink: 0,
              color: tempColor(d.tempC) }}>
              {d.tempC}°
            </span>
          )}
          {d.powerMode === 'standby' && (
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>standby</span>
          )}
        </div>
      ))}
    </div>
  )

  // ── Network iface list ────────────────────────────────────────────────────
  const NetIfaceList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {netIfaces.map((iface, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6,
          padding: '3px 6px', borderRadius: 5, background: 'var(--surface2)',
          border: '1px solid var(--border)', fontSize: 11 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: iface.linkUp ? 'var(--green)' : 'var(--text-dim)' }} />
          <span style={{ flex: 1, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>{iface.name}</span>
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

  // ── Services pill ─────────────────────────────────────────────────────────
  const ServicesPill = () => {
    if (services.running === 0 && services.stopped === 0) return null
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
          <span style={{ color: 'var(--text-dim)' }}>services</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--green)' }}>
            {services.running} up
          </span>
          {services.stopped > 0 && (
            <>
              <span style={{ color: 'var(--text-dim)' }}>/</span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--amber)' }}>
                {services.stopped} down
              </span>
            </>
          )}
        </div>
        {shares.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
            borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
            <span style={{ color: 'var(--text-dim)' }}>shares</span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--text)' }}>
              {shares.length}
            </span>
          </div>
        )}
      </div>
    )
  }

  // ── Share tags (4x+) ─────────────────────────────────────────────────────
  const ShareTags = () => {
    if (shares.length === 0) return null
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {shares.slice(0, 24).map((s, i) => (
          <span key={i} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4,
            background: 'var(--surface2)', border: '1px solid var(--border)',
            color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
            {s}
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
      <Row1Arcs />
      {(totalRxMbs > 0 || totalTxMbs > 0) && (
        <ArcRow>
          <NetWidget rxMbs={totalRxMbs} txMbs={totalTxMbs} />
        </ArcRow>
      )}
      {filesystems.length > 0 && <FilesystemRows />}
      <div style={{ marginTop: 8 }}><ServicesPill /></div>
    </div>
  )

  // ── 4x+ ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <HostPill />
      <Row1Arcs />
      {(totalRxMbs > 0 || totalTxMbs > 0) && (
        <ArcRow>
          <NetWidget rxMbs={totalRxMbs} txMbs={totalTxMbs} />
        </ArcRow>
      )}
      {filesystems.length > 0 && (
        <>{sectionTitle('Filesystems')}<FilesystemRows /></>
      )}
      {disks.length > 0 && (
        <>{sectionTitle('Disks')}<DiskTable /></>
      )}
      {netIfaces.length > 1 && (
        <>{sectionTitle('Network')}<NetIfaceList /></>
      )}
      <div style={{ marginTop: 8 }}><ServicesPill /></div>
      {shares.length > 0 && (
        <>{sectionTitle(`Shares (${shares.length})`)}<ShareTags /></>
      )}
    </div>
  )
}
