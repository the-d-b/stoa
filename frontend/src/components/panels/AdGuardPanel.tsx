import { useEffect, useState } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdGuardDomain { name: string; count: number }
interface AdGuardClient { name: string; count: number }
interface AdGuardFilter { name: string; rulesCount: number; enabled: boolean }
interface AdGuardUpstream { name: string; queries: number; avgMs: number }

interface AdGuardData {
  uiUrl: string
  integrationId: string
  version: string
  protectionEnabled: boolean
  totalQueries: number
  blockedQueries: number
  safeBrowsing: number
  safeSearch: number
  parental: number
  percentBlocked: number
  avgProcessingMs: number
  overTimeTotal: number[]
  overTimeBlocked: number[]
  topBlocked: AdGuardDomain[]
  topQueried: AdGuardDomain[]
  topClients: AdGuardClient[]
  upstreams: AdGuardUpstream[]
  totalFilterRules: number
  activeFilters: number
  filters: AdGuardFilter[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (!n) return '0'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return `${n}`
}

function fmtMs(ms: number): string {
  if (!ms) return '—'
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// ── Sub-components ────────────────────────────────────────────────────────────

// 270° stroke-dasharray arc gauge — gap sits at bottom-center.
function ArcGauge({ percent, size = 80 }: { percent: number; size?: number }) {
  const r     = (size - 16) / 2
  const circ  = 2 * Math.PI * r
  const sweep = 0.75 * circ
  const filled = Math.min(1, Math.max(0, percent / 100)) * sweep
  const cx = size / 2, cy = size / 2

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
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

// Bar chart of query timeline — grey = total, accent-red = blocked.
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
              fill="var(--red, #e53e3e)" opacity={0.85} />}
          </g>
        )
      })}
    </svg>
  )
}

// Horizontal progress bar with label and right-aligned display value.
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

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props { panel: Panel; heightUnits: number }

export default function AdGuardPanel({ panel, heightUnits }: Props) {
  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined
  const [data, setData] = useState<AdGuardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!integrationId) return
    integrationsApi.getPanelData(panel.id)
      .then(res => { setData(res.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [panel.id, integrationId])

  const sseData = useSSE<AdGuardData>(integrationId)
  useEffect(() => {
    if (sseData) { setData(sseData); setLoading(false) }
  }, [sseData])

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

  const uiHref      = data.uiUrl || '#'
  const statusColor = data.protectionEnabled ? 'var(--green)' : 'var(--red, #e53e3e)'
  const statusLabel = data.protectionEnabled ? 'active' : 'paused'
  const topBlocked  = data.topBlocked  || []
  const topClients  = data.topClients  || []
  const topQueried  = data.topQueried  || []
  const filters     = data.filters     || []
  const upstreams   = data.upstreams   || []
  const overTimeTotal   = data.overTimeTotal   || []
  const overTimeBlocked = data.overTimeBlocked || []
  const totalProtected  = data.blockedQueries + data.safeBrowsing + data.safeSearch + data.parental

  // ── 1× compact bar ───────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={root}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <a href={uiHref} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', textDecoration: 'none', flexShrink: 0 }}>
            AdGuard Home
          </a>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
            {fmtNum(data.totalQueries)} queries
          </span>
          <span style={{ fontSize: 9, fontFamily: 'DM Mono, monospace', color: 'var(--accent)' }}>
            {data.percentBlocked.toFixed(1)}% blocked
          </span>
          {data.avgProcessingMs > 0 && (
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              {fmtMs(data.avgProcessingMs)} avg
            </span>
          )}
          {data.totalFilterRules > 0 && (
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              {fmtNum(data.totalFilterRules)} rules
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
            AdGuard Home
          </a>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
          <span style={{ fontSize: 9, color: statusColor }}>{statusLabel}</span>
          <div style={{ flex: 1 }} />
          {data.version && (
            <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>{data.version}</span>
          )}
        </div>

        {/* Arc gauge + stat chips */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexShrink: 0 }}>
          <ArcGauge percent={data.percentBlocked} size={70} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            <StatChip label="Queries"   value={fmtNum(data.totalQueries)} />
            <StatChip label="Blocked"   value={fmtNum(data.blockedQueries)} color="var(--red, #e53e3e)" />
            {data.safeBrowsing > 0 && (
              <StatChip label="Safe Browse" value={fmtNum(data.safeBrowsing)} color="#f97316" />
            )}
            {data.safeSearch > 0 && (
              <StatChip label="Safe Search" value={fmtNum(data.safeSearch)} color="#a855f7" />
            )}
            {data.avgProcessingMs > 0 && (
              <StatChip label="Avg Latency" value={fmtMs(data.avgProcessingMs)} />
            )}
          </div>
        </div>

        {/* 24h sparkline */}
        {overTimeTotal.length > 0 && (
          <div style={{ flex: 1, minHeight: 0 }}>
            <div style={{ fontSize: 8, color: 'var(--text-dim)', marginBottom: 3,
              textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              24h queries&nbsp;
              <span style={{ color: 'var(--red, #e53e3e)' }}>■</span>&nbsp;blocked
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
          AdGuard Home
        </a>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor }} />
        <span style={{ fontSize: 9, color: statusColor }}>{statusLabel}</span>
        <div style={{ flex: 1 }} />
        {data.version && (
          <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>{data.version}</span>
        )}
      </div>

      {/* Arc gauge + stat chips */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, flexShrink: 0 }}>
        <ArcGauge percent={data.percentBlocked} size={90} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          <StatChip label="Queries"    value={fmtNum(data.totalQueries)} />
          <StatChip label="Blocked"    value={fmtNum(data.blockedQueries)} color="var(--red, #e53e3e)" />
          {data.safeBrowsing > 0 && (
            <StatChip label="Safe Browse" value={fmtNum(data.safeBrowsing)} color="#f97316" />
          )}
          {data.safeSearch > 0 && (
            <StatChip label="Safe Search" value={fmtNum(data.safeSearch)} color="#a855f7" />
          )}
          {data.parental > 0 && (
            <StatChip label="Parental" value={fmtNum(data.parental)} color="#ec4899" />
          )}
          {data.avgProcessingMs > 0 && (
            <StatChip label="Avg Latency" value={fmtMs(data.avgProcessingMs)} />
          )}
        </div>
      </div>

      {/* 24h sparkline */}
      {overTimeTotal.length > 0 && (
        <div style={{ marginBottom: 8, flexShrink: 0 }}>
          <div style={{ fontSize: 8, color: 'var(--text-dim)', marginBottom: 3,
            textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            24h traffic&nbsp;
            <span style={{ color: 'var(--red, #e53e3e)' }}>■</span>&nbsp;blocked
          </div>
          <Sparkline total={overTimeTotal} blocked={overTimeBlocked} />
        </div>
      )}

      {/* Lower detail: three columns */}
      <div style={{ display: 'flex', gap: 14, flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* Top blocked domains */}
        {topBlocked.length > 0 && (
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 5 }}>
              Top blocked
            </div>
            {topBlocked.slice(0, 10).map((d, i) => (
              <BarRow key={i}
                label={d.name}
                barPct={(d.count / (topBlocked[0]?.count || 1)) * 100}
                display={fmtNum(d.count)}
                color="var(--red, #e53e3e)" />
            ))}
            {/* Top queried as secondary list */}
            {topQueried.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 5 }}>
                  Top queried
                </div>
                {topQueried.slice(0, 5).map((d, i) => (
                  <BarRow key={i}
                    label={d.name}
                    barPct={(d.count / (topQueried[0]?.count || 1)) * 100}
                    display={fmtNum(d.count)}
                    color="var(--accent)" />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Top clients */}
        {topClients.length > 0 && (
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 5 }}>
              Top clients
            </div>
            {topClients.slice(0, 10).map((c, i) => (
              <BarRow key={i}
                label={c.name}
                barPct={(c.count / (topClients[0]?.count || 1)) * 100}
                display={fmtNum(c.count)}
                color="var(--accent)" />
            ))}

            {/* DNS upstreams with response time */}
            {upstreams.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 5 }}>
                  Upstreams
                </div>
                {upstreams.slice(0, 5).map((u, i) => (
                  <BarRow key={i}
                    label={u.name}
                    barPct={upstreams[0]?.queries > 0 ? (u.queries / upstreams[0].queries) * 100 : 0}
                    display={u.avgMs > 0 ? fmtMs(u.avgMs) : fmtNum(u.queries)}
                    color="var(--accent)" />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Blocklists + summary */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          {filters.length > 0 && (
            <>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 5 }}>
                Blocklists ({data.activeFilters} active)
              </div>
              {filters.map((f, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', fontSize: 9, marginBottom: 2 }}>
                    <span style={{
                      color: f.enabled ? 'var(--text)' : 'var(--text-dim)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      flex: 1, marginRight: 6,
                      textDecoration: f.enabled ? 'none' : 'line-through',
                    }}>{f.name}</span>
                    <span style={{
                      color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', flexShrink: 0,
                    }}>{fmtNum(f.rulesCount)}</span>
                  </div>
                  <div style={{ height: 2, background: 'var(--border)', borderRadius: 1 }}>
                    <div style={{
                      height: '100%',
                      width: f.enabled ? `${Math.min(100, (f.rulesCount / (data.totalFilterRules || 1)) * 100)}%` : '0%',
                      background: 'var(--accent)', borderRadius: 1,
                    }} />
                  </div>
                </div>
              ))}
              {/* Total rules chip */}
              <div style={{
                marginTop: 8, padding: '4px 8px', background: 'var(--bg-surface)',
                borderRadius: 6, border: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 8, color: 'var(--text-dim)', textTransform: 'uppercase',
                  letterSpacing: '0.05em' }}>Total rules</span>
                <span style={{ fontSize: 12, fontWeight: 700,
                  fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>
                  {fmtNum(data.totalFilterRules)}
                </span>
              </div>
            </>
          )}

          {/* Extra security stats */}
          {(data.safeBrowsing > 0 || data.safeSearch > 0 || data.parental > 0) && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 5 }}>
                Protection breakdown
              </div>
              {totalProtected > 0 && (
                <>
                  {data.blockedQueries > 0 && (
                    <BarRow label="Blocklist"
                      barPct={(data.blockedQueries / totalProtected) * 100}
                      display={fmtNum(data.blockedQueries)}
                      color="var(--red, #e53e3e)" />
                  )}
                  {data.safeBrowsing > 0 && (
                    <BarRow label="Safe Browse"
                      barPct={(data.safeBrowsing / totalProtected) * 100}
                      display={fmtNum(data.safeBrowsing)}
                      color="#f97316" />
                  )}
                  {data.safeSearch > 0 && (
                    <BarRow label="Safe Search"
                      barPct={(data.safeSearch / totalProtected) * 100}
                      display={fmtNum(data.safeSearch)}
                      color="#a855f7" />
                  )}
                  {data.parental > 0 && (
                    <BarRow label="Parental"
                      barPct={(data.parental / totalProtected) * 100}
                      display={fmtNum(data.parental)}
                      color="#ec4899" />
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
