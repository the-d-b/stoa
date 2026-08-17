import { useCallback, useEffect, useRef, useState } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PiHoleDomain { name: string; count: number }
interface PiHoleClient { name: string; count: number }
interface PiHoleUpstream { name: string; percent: number }
interface PiHoleList { name: string; enabled: boolean; type: string; count: number }

interface PiHoleData {
  uiUrl: string
  integrationId: string
  version: string
  totalQueries: number
  blockedQueries: number
  percentBlocked: number
  uniqueClients: number
  uniqueDomains: number
  gravityDomains: number
  gravityUpdated: number
  blockingEnabled: boolean
  overTimeTotal: number[]
  overTimeBlocked: number[]
  topPermitted: PiHoleDomain[]
  topBlocked: PiHoleDomain[]
  topClients: PiHoleClient[]
  upstreams: PiHoleUpstream[]
  lists: PiHoleList[]
}

const TIME_RANGES = [
  { label: '1d', value: 1 },
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (!n) return '0'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return `${n}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

// Stroke-dasharray arc gauge — 270° sweep starting at lower-left.
function ArcGauge({ percent, size = 80 }: { percent: number; size?: number }) {
  const r   = (size - 16) / 2
  const circ  = 2 * Math.PI * r
  const sweep = 0.75 * circ                                          // 270° = ¾ circle
  const filled = Math.min(1, Math.max(0, percent / 100)) * sweep
  const cx = size / 2, cy = size / 2

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        {/* rotate so the gap sits at the bottom-center */}
        <g transform={`rotate(135, ${cx}, ${cy})`}>
          <circle cx={cx} cy={cy} r={r} fill="none"
            stroke="var(--border)" strokeWidth={7}
            strokeDasharray={`${sweep.toFixed(2)} ${circ.toFixed(2)}`}
            strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={r} fill="none"
            stroke="var(--accent)" strokeWidth={7}
            strokeDasharray={`${filled.toFixed(2)} ${circ.toFixed(2)}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.5s ease' }} />
        </g>
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        paddingTop: size > 72 ? 6 : 4,
      }}>
        <span style={{
          fontSize: size > 72 ? 16 : 13, fontWeight: 700,
          fontFamily: 'DM Mono, monospace', color: 'var(--accent)', lineHeight: 1,
        }}>
          {percent.toFixed(1)}%
        </span>
        <span style={{ fontSize: 8, color: 'var(--text-dim)', marginTop: 2 }}>blocked</span>
      </div>
    </div>
  )
}

function StatChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      padding: '4px 8px', background: 'var(--bg-surface)',
      borderRadius: 6, border: '1px solid var(--border)',
    }}>
      <span style={{
        fontSize: 8, color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.05em', marginBottom: 1,
      }}>{label}</span>
      <span style={{
        fontSize: 13, fontWeight: 700,
        fontFamily: 'DM Mono, monospace', color: color || 'var(--text)',
      }}>{value}</span>
    </div>
  )
}

// 24-hour query sparkline — grey bars = total, red overlay = blocked.
function Sparkline({ total, blocked }: { total: number[]; blocked: number[] }) {
  const n = total.length
  if (!n) return null
  const maxVal = Math.max(...total, 1)
  const H = 30

  return (
    <svg width="100%" viewBox={`0 0 ${n} ${H}`} preserveAspectRatio="none"
      style={{ height: H, display: 'block' }}>
      {total.map((t, i) => {
        const tH = (t / maxVal) * H
        const bH = Math.min((blocked[i] || 0) / maxVal, t / maxVal) * H
        return (
          <g key={i}>
            {tH > 0 && <rect x={i + 0.1} y={H - tH} width={0.8} height={tH} fill="var(--border)" />}
            {bH > 0 && <rect x={i + 0.1} y={H - bH} width={0.8} height={bH}
              fill="var(--red, var(--red))" opacity={0.85} />}
          </g>
        )
      })}
    </svg>
  )
}

// Horizontal progress bar row with label and right-aligned value.
// barPct  — 0-100, determines bar fill width
// display — string shown on the right (e.g. "1.2K" or "78.5%")
function BarRow({ label, barPct, display, color }: {
  label: string; barPct: number; display: string; color: string
}) {
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 2 }}>
        <span style={{
          color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', flex: 1, marginRight: 6,
        }}>{label}</span>
        <span style={{
          color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', flexShrink: 0,
        }}>{display}</span>
      </div>
      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
        <div style={{
          height: '100%', width: `${Math.min(100, Math.max(0, barPct))}%`,
          background: color, borderRadius: 2,
        }} />
      </div>
    </div>
  )
}

// Collapsible list section — click the header to toggle. Starts expanded;
// collapsing is purely local UI state (not persisted), just a way to
// reclaim vertical space at shorter panel heights without losing the data.
function CollapsibleSection({ title, collapsed, onToggle, children }: {
  title: string; collapsed: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none',
        fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: collapsed ? 0 : 5,
      }}>
        <span style={{
          display: 'inline-block', fontSize: 8, lineHeight: 1,
          transition: 'transform 0.15s', transform: collapsed ? 'rotate(-90deg)' : 'none',
        }}>▾</span>
        {title}
      </div>
      {!collapsed && children}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props { panel: Panel; heightUnits: number }

export default function PiHolePanel({ panel, heightUnits }: Props) {
  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined
  const [days, setDays] = useState<number>(1)
  const [data, setData] = useState<PiHoleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const toggleSection = (key: string) => setCollapsedSections(s => ({ ...s, [key]: !s[key] }))

  // Mirrors AdGuardPanel's pattern: a background SSE broadcast reflects the
  // integration's default (1d) fetch, not necessarily whatever range this
  // panel has selected — so on any SSE signal, re-fetch live with the
  // current `days` instead of applying the broadcast payload directly.
  const load = useCallback(async () => {
    if (!integrationId) return
    try {
      const res = await integrationsApi.getPanelData(panel.id, { days })
      setData(res.data)
      setLoading(false)
    } catch {
      setLoading(false)
    }
  }, [panel.id, integrationId, days])

  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => { load() }, [load])

  const sseSignal = useSSE<PiHoleData>(integrationId)
  useEffect(() => { if (sseSignal) loadRef.current() }, [sseSignal])

  const root: React.CSSProperties = {
    height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column',
    padding: '10px 12px', boxSizing: 'border-box', fontFamily: 'var(--font-ui, system-ui)',
  }

  if (!integrationId) {
    return <div style={root}><span style={{ fontSize: 11, color: 'var(--text-dim)' }}>No integration configured.</span></div>
  }
  if (loading) {
    return <div style={root}><span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Loading…</span></div>
  }
  if (!data) {
    return <div style={root}><span style={{ fontSize: 11, color: 'var(--text-dim)' }}>No data.</span></div>
  }

  const uiHref        = data.uiUrl || '#'
  const statusColor   = data.blockingEnabled ? 'var(--green)' : 'var(--red, var(--red))'
  const statusLabel   = data.blockingEnabled ? 'blocking' : 'disabled'
  const topBlocked    = data.topBlocked  || []
  const topPermitted  = data.topPermitted || []
  const topClients    = data.topClients  || []
  const upstreams     = data.upstreams   || []
  const lists         = data.lists       || []
  const overTimeTotal = data.overTimeTotal   || []
  const overTimeBlocked = data.overTimeBlocked || []

  // ── 1× compact bar ───────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={root}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <a href={uiHref} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', textDecoration: 'none', flexShrink: 0 }}>
            Pi-hole
          </a>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
            {fmtNum(data.totalQueries)} queries
          </span>
          <span style={{ fontSize: 9, fontFamily: 'DM Mono, monospace', color: 'var(--accent)' }}>
            {data.percentBlocked.toFixed(1)}% blocked
          </span>
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
            {data.uniqueClients} client{data.uniqueClients !== 1 ? 's' : ''}
          </span>
          {data.gravityDomains > 0 && (
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              {fmtNum(data.gravityDomains)} gravity
            </span>
          )}
        </div>
      </div>
    )
  }

  // ── 2–3× medium layout ───────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={root}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexShrink: 0 }}>
          <a href={uiHref} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>
            Pi-hole
          </a>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
          <span style={{ fontSize: 9, color: statusColor }}>{statusLabel}</span>
          <div style={{ flex: 1 }} />
          {data.version && (
            <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>{data.version}</span>
          )}
        </div>

        {/* Gauge + stat chips */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 8, flexShrink: 0 }}>
          <ArcGauge percent={data.percentBlocked} size={70} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
            <StatChip label="Queries"  value={fmtNum(data.totalQueries)} />
            <StatChip label="Blocked"  value={fmtNum(data.blockedQueries)} color="var(--red, var(--red))" />
            <StatChip label="Clients"  value={`${data.uniqueClients}`} />
            <StatChip label="Gravity"  value={fmtNum(data.gravityDomains)} />
          </div>
        </div>

        {/* 24h sparkline */}
        {overTimeTotal.length > 0 && (
          <div style={{ flex: 1, minHeight: 0 }}>
            <div style={{ fontSize: 8, color: 'var(--text-dim)', marginBottom: 3,
              textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              24h queries&nbsp;
              <span style={{ color: 'var(--red, var(--red))' }}>■</span>&nbsp;blocked
            </div>
            <Sparkline total={overTimeTotal} blocked={overTimeBlocked} />
          </div>
        )}
      </div>
    )
  }

  // ── 4×+ full layout ──────────────────────────────────────────────────────
  return (
    <div style={root}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexShrink: 0 }}>
        <a href={uiHref} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>
          Pi-hole
        </a>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor }} />
        <span style={{ fontSize: 9, color: statusColor }}>{statusLabel}</span>
        <div style={{ flex: 1 }} />
        {data.version && (
          <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>{data.version}</span>
        )}
      </div>

      {/* Time range pills */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexShrink: 0 }}>
        {TIME_RANGES.map(tr => (
          <button key={tr.value} onClick={() => setDays(tr.value)}
            style={{
              padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600,
              cursor: 'pointer', border: 'none', transition: 'all 0.12s',
              background: days === tr.value ? 'var(--accent)' : 'var(--border)',
              color: days === tr.value ? 'white' : 'var(--text-dim)',
            }}>
            {tr.label}
          </button>
        ))}
      </div>

      {/* Arc gauge + stat chips */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 8, flexShrink: 0 }}>
        <ArcGauge percent={data.percentBlocked} size={90} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
          <StatChip label="Queries"  value={fmtNum(data.totalQueries)} />
          <StatChip label="Blocked"  value={fmtNum(data.blockedQueries)} color="var(--red, var(--red))" />
          <StatChip label="Clients"  value={`${data.uniqueClients}`} />
          <StatChip label="Domains"  value={fmtNum(data.uniqueDomains)} />
          <StatChip label="Gravity"  value={fmtNum(data.gravityDomains)} />
        </div>
      </div>

      {/* Sparkline — period-aware */}
      {overTimeTotal.length > 0 && (
        <div style={{ marginBottom: 8, flexShrink: 0 }}>
          <div style={{ fontSize: 8, color: 'var(--text-dim)', marginBottom: 3,
            textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {days === 1 ? '24h' : `${days}d`} traffic&nbsp;
            <span style={{ color: 'var(--red, var(--red))' }}>■</span>&nbsp;blocked
          </div>
          <Sparkline total={overTimeTotal} blocked={overTimeBlocked} />
        </div>
      )}

      {/* Lower detail: stacked sections, top 4 each */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0, overflowY: 'auto' }}>

        {/* Top blocked domains */}
        {topBlocked.length > 0 && (
          <CollapsibleSection title="Top blocked"
            collapsed={!!collapsedSections.topBlocked}
            onToggle={() => toggleSection('topBlocked')}>
            {topBlocked.slice(0, 4).map((d, i) => (
              <BarRow key={i}
                label={d.name}
                barPct={(d.count / (topBlocked[0]?.count || 1)) * 100}
                display={fmtNum(d.count)}
                color="var(--red, var(--red))" />
            ))}
          </CollapsibleSection>
        )}

        {/* Top permitted domains */}
        {topPermitted.length > 0 && (
          <CollapsibleSection title="Top permitted"
            collapsed={!!collapsedSections.topPermitted}
            onToggle={() => toggleSection('topPermitted')}>
            {topPermitted.slice(0, 4).map((d, i) => (
              <BarRow key={i}
                label={d.name}
                barPct={(d.count / (topPermitted[0]?.count || 1)) * 100}
                display={fmtNum(d.count)}
                color="var(--accent)" />
            ))}
          </CollapsibleSection>
        )}

        {/* Top clients */}
        {topClients.length > 0 && (
          <CollapsibleSection title="Top clients"
            collapsed={!!collapsedSections.topClients}
            onToggle={() => toggleSection('topClients')}>
            {topClients.slice(0, 4).map((c, i) => (
              <BarRow key={i}
                label={c.name}
                barPct={(c.count / (topClients[0]?.count || 1)) * 100}
                display={fmtNum(c.count)}
                color="var(--accent)" />
            ))}
          </CollapsibleSection>
        )}

        {/* Upstreams */}
        {upstreams.length > 0 && (
          <CollapsibleSection title="Upstreams"
            collapsed={!!collapsedSections.upstreams}
            onToggle={() => toggleSection('upstreams')}>
            {upstreams.slice(0, 4).map((u, i) => (
              <BarRow key={i}
                label={u.name}
                barPct={u.percent}
                display={`${u.percent.toFixed(1)}%`}
                color="var(--accent)" />
            ))}
          </CollapsibleSection>
        )}

        {/* Blocklists */}
        {lists.length > 0 && (
          <CollapsibleSection title="Blocklists"
            collapsed={!!collapsedSections.lists}
            onToggle={() => toggleSection('lists')}>
            {lists.slice(0, 4).map((l, i) => (
              <div key={i} style={{ marginBottom: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 2 }}>
                  <span style={{
                    color: l.enabled ? 'var(--text)' : 'var(--text-dim)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    flex: 1, marginRight: 6,
                    textDecoration: l.enabled ? 'none' : 'line-through',
                  }}>
                    {l.name}{l.type !== 'block' && <span style={{ color: 'var(--text-dim)' }}> · allow</span>}
                  </span>
                  <span style={{ color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>
                    {fmtNum(l.count)}
                  </span>
                </div>
                <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
                  <div style={{
                    height: '100%',
                    width: l.enabled ? `${Math.min(100, (l.count / (lists[0]?.count || 1)) * 100)}%` : '0%',
                    background: l.type === 'block' ? 'var(--red, var(--red))' : 'var(--accent)',
                    borderRadius: 2,
                  }} />
                </div>
              </div>
            ))}
          </CollapsibleSection>
        )}
      </div>
    </div>
  )
}
