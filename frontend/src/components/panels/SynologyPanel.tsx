import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface SynoVolume { id: string; name: string; status: string; raidType: string; fsType: string; totalGb: number; usedGb: number; usedPct: number }
interface SynoDiskSummary { total: number; healthy: number; issues: string[] }
interface SynoAlert { level: string; message: string }
interface SynoNetIface { device: string; rxMbs: number; txMbs: number }
interface SynoData {
  uiUrl: string; hostname: string; model: string; dsmVersion: string; uptimeSecs: number
  cpuPercent: number; ramPercent: number; ramTotalGb: number; ramUsedGb: number
  diskReadMbs: number; diskWriteMbs: number; diskBusy: number
  volumes: SynoVolume[]; diskSummary: SynoDiskSummary; netIfaces: SynoNetIface[]; shares: string[]
  alerts: SynoAlert[]
}

// ── Formatters ────────────────────────────────────────────────────────────────

function pctColor(p: number) {
  return p >= 90 ? 'var(--red)' : p >= 75 ? 'var(--amber)' : 'var(--accent)'
}

function volumeStatusColor(status: string) {
  if (status === 'normal') return 'var(--green)'
  if (status === 'degraded' || status === 'rebuilding' || status === 'repairing') return 'var(--amber)'
  if (status === 'crashed' || status === 'error') return 'var(--red)'
  return 'var(--text-dim)'
}

const ALERT_COLOR: Record<string, string> = {
  error:   'var(--red)',
  warning: 'var(--amber)',
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

function fmtRaidType(r: string) {
  if (!r) return ''
  const map: Record<string, string> = { shr: 'SHR', shr2: 'SHR-2', basic: 'Basic', jbod: 'JBOD' }
  return map[r.toLowerCase()] ?? r.toUpperCase()
}

// ── Shared sub-components ─────────────────────────────────────────────────────

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
          <marker id="synoArrowG" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
            <path d="M0,0 L5,2.5 L0,5 Z" fill="var(--green)" />
          </marker>
          <marker id="synoArrowA" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
            <path d="M0,0 L5,2.5 L0,5 Z" fill="var(--amber)" />
          </marker>
        </defs>
        <line x1={ex1} y1={ey1} x2={ex2} y2={ey2} stroke="var(--green)" strokeWidth={2.5} strokeLinecap="round" markerEnd="url(#synoArrowG)" opacity={0.85} />
        <line x1={ix1} y1={iy1} x2={ix2} y2={iy2} stroke="var(--amber)" strokeWidth={2.5} strokeLinecap="round" markerEnd="url(#synoArrowA)" opacity={0.85} />
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

export default function SynologyPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<SynoData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined

  const sseData = useSSE<SynoData>(integrationId)
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
  const volumes = data.volumes || []
  const diskSummary = data.diskSummary || { total: 0, healthy: 0, issues: [] }
  const netIfaces = data.netIfaces || []
  const shares = data.shares || []
  const alerts = data.alerts || []

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
        {data.hostname || 'Synology'}
      </a>
      {data.model && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          {data.model}
        </span>
      )}
      {data.dsmVersion && (
        <span style={{ fontSize: 11, color: 'var(--text-dim)', padding: '2px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          {data.dsmVersion}
        </span>
      )}
      {uptime && (
        <span style={{ fontSize: 11, color: 'var(--text-dim)', padding: '2px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          up {uptime}
        </span>
      )}
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

  // ── Arc row ───────────────────────────────────────────────────────────────
  const Row1Arcs = ({ size = 72 }: { size?: number }) => (
    <ArcRow>
      <Arc pct={data.cpuPercent ?? 0} label={`${(data.cpuPercent ?? 0).toFixed(0)}%`} sub="cpu" size={size} />
      <Arc pct={data.ramPercent ?? 0} label={`${(data.ramPercent ?? 0).toFixed(0)}%`}
        sub={(data.ramTotalGb ?? 0) > 0 ? `${fmtSize(data.ramUsedGb)} ram` : 'ram'} size={size} />
      <Arc pct={Math.min(data.diskBusy ?? 0, 100)}
        label={`io ${(data.diskBusy ?? 0).toFixed(0)}%`}
        sub={(data.diskReadMbs ?? 0) > 0 ? `↓${fmtMbs(data.diskReadMbs ?? 0)}` : 'disk busy'} size={size} />
    </ArcRow>
  )

  // ── Volume rows (like TrueNAS pool rows) ──────────────────────────────────
  const VolumeRows = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {volumes.map((v, i) => (
        <div key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: volumeStatusColor(v.status) }} />
            <span style={{ fontSize: 12, fontWeight: 500, flex: 1, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.name}>
              {v.name}
            </span>
            {v.raidType && (
              <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>
                {fmtRaidType(v.raidType)}
              </span>
            )}
            <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>
              {fmtSize(v.usedGb)}/{fmtSize(v.totalGb)}
            </span>
            <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', width: 32, textAlign: 'right',
              flexShrink: 0, color: pctColor(v.usedPct) }}>
              {v.usedPct.toFixed(0)}%
            </span>
          </div>
          <div style={{ paddingLeft: 14 }}><MiniBar pct={v.usedPct} /></div>
        </div>
      ))}
    </div>
  )

  // ── Disk health summary — a count, not a list ─────────────────────────────
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

  // ── Shares pill + tags ────────────────────────────────────────────────────
  const SharesPill = () => {
    if (shares.length === 0) return null
    return (
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11 }}>
          <span style={{ color: 'var(--text-dim)' }}>shares</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--text)' }}>
            {shares.length}
          </span>
        </div>
      </div>
    )
  }

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

  // ── 2x–3x ─────────────────────────────────────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <HostPill />
      <Row1Arcs />
      {(totalRxMbs > 0 || totalTxMbs > 0) && (
        <ArcRow>
          <NetWidget rxMbs={totalRxMbs} txMbs={totalTxMbs} />
        </ArcRow>
      )}
      {volumes.length > 0 && <VolumeRows />}
      <div style={{ marginTop: 8 }}><SharesPill /></div>
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
      {volumes.length > 0 && (
        <>{sectionTitle('Volumes')}<VolumeRows /></>
      )}
      {diskSummary.total > 0 && (
        <>{sectionTitle('Disks')}<DiskHealthLine /></>
      )}
      {shares.length > 0 && (
        <>{sectionTitle(`Shares (${shares.length})`)}<ShareTags /></>
      )}
      {alerts.length > 0 && (
        <>{sectionTitle('Alerts')}<Alerts /></>
      )}
    </div>
  )
}
