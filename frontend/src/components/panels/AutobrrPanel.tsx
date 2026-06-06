import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

interface AutobrrIRCNetwork {
  id: number
  name: string
  server: string
  nick: string
  connected: boolean
  connectedSince: string
  monitoredChannels: number
}

interface AutobrrRelease {
  id: number
  name: string
  indexer: string
  filter: string
  status: string // "grabbed", "filtered", "push_rejected", "push_error", "pending"
  action: string
  rejection: string
  timestamp: string
}

interface AutobrrData {
  uiUrl: string
  integrationId: string
  totalCount: number
  grabbedCount: number
  filteredCount: number
  rejectedCount: number
  pushErrorCount: number
  ircNetworks: AutobrrIRCNetwork[]
  totalNetworks: number
  connectedNetworks: number
  activeFilters: number
  releases: AutobrrRelease[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case 'grabbed':       return '#4ade80'
    case 'filtered':      return 'var(--text-dim)'
    case 'push_rejected': return '#f59e0b'
    case 'push_error':    return '#e53e3e'
    default:              return 'var(--text-dim)'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'grabbed':       return 'GRABBED'
    case 'filtered':      return 'FILTERED'
    case 'push_rejected': return 'REJECTED'
    case 'push_error':    return 'ERROR'
    default:              return status.toUpperCase()
  }
}

function fmtAgo(ts: string): string {
  if (!ts) return ''
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (secs < 0) return 'now'
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatChip({ label, value, color, bg }: {
  label: string; value: string | number; color?: string; bg?: string
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '5px 10px', borderRadius: 8,
      background: bg || 'var(--surface2)', border: '1px solid var(--border)', minWidth: 60,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'DM Mono, monospace', color: color || 'var(--text)' }}>
        {value}
      </div>
    </div>
  )
}

function GrabDonut({ grabbed, total, size = 80 }: { grabbed: number; total: number; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size * 0.36
  const circ = 2 * Math.PI * r
  const pct = total > 0 ? grabbed / total : 0
  const filled = circ * pct
  // Color by grab rate: high grab rate is good (green), low is neutral
  const color = pct > 0.5 ? '#4ade80' : pct > 0.1 ? '#22d3ee' : '#6b7280'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface2)" strokeWidth={size * 0.13} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={size * 0.13}
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - size * 0.05} textAnchor="middle" dominantBaseline="middle"
        fill="var(--text)" style={{ fontSize: size * 0.2, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
        {fmtCount(grabbed)}
      </text>
      <text x={cx} y={cy + size * 0.2} textAnchor="middle"
        fill="var(--text-dim)" style={{ fontSize: size * 0.11 }}>
        grabbed
      </text>
    </svg>
  )
}

function IRCNetworkRow({ net }: { net: AutobrrIRCNetwork }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <div style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: net.connected ? '#4ade80' : '#e53e3e',
      }} />
      <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {net.name}
      </span>
      {net.monitoredChannels > 0 && (
        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>
          {net.monitoredChannels}ch
        </span>
      )}
      {net.connected && net.connectedSince && (
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, whiteSpace: 'nowrap' }}>
          {fmtAgo(net.connectedSince)}
        </span>
      )}
      {!net.connected && (
        <span style={{ fontSize: 9, fontWeight: 700, color: '#e53e3e', background: '#e53e3e18',
          borderRadius: 4, padding: '1px 5px', flexShrink: 0, letterSpacing: '0.04em' }}>
          DOWN
        </span>
      )}
    </div>
  )
}

function ReleaseRow({ release }: { release: AutobrrRelease }) {
  const color = statusColor(release.status)
  const label = statusLabel(release.status)
  const isGrab = release.status === 'grabbed'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: color,
        flexShrink: 0, marginTop: 3 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: isGrab ? 500 : 400,
          color: isGrab ? 'var(--text)' : 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {release.name || '(unknown)'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
          {release.indexer && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {release.indexer}
            </span>
          )}
          {release.filter && (
            <>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>·</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {release.filter}
              </span>
            </>
          )}
          {release.action && isGrab && (
            <>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>→</span>
              <span style={{ fontSize: 10, color: '#22d3ee', whiteSpace: 'nowrap' }}>
                {release.action}
              </span>
            </>
          )}
          {release.rejection && (
            <span style={{ fontSize: 10, color: color,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}
              title={release.rejection}>
              · {release.rejection}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color, background: color + '20',
          borderRadius: 4, padding: '1px 5px', letterSpacing: '0.04em' }}>
          {label}
        </span>
        <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
          {fmtAgo(release.timestamp)}
        </span>
      </div>
    </div>
  )
}

function ColHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5,
      borderBottom: '1px solid var(--border)', paddingBottom: 3 }}>
      {children}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function AutobrrPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<AutobrrData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId: string = config.integrationId || ''

  useEffect(() => {
    if (!integrationId) { setLoading(false); return }
    integrationsApi.getPanelData(panel.id)
      .then(res => { setData(res.data); setLoading(false) })
      .catch(e => { setError(e.response?.data?.error || e.message || 'Failed to load'); setLoading(false) })
  }, [panel.id, integrationId])

  if (!integrationId) return <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No integration configured.</div>
  if (loading) return <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading...</div>
  if (error) return <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>
  if (!data) return <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No data</div>

  const {
    totalCount, grabbedCount, filteredCount, rejectedCount, pushErrorCount,
    ircNetworks = [], totalNetworks, connectedNetworks, activeFilters, releases = [],
  } = data

  const ircOk = totalNetworks === 0 || connectedNetworks === totalNetworks
  const ircColor = totalNetworks === 0 ? 'var(--text-dim)' : ircOk ? '#4ade80' : '#e53e3e'
  const recentGrabs = releases.filter(r => r.status === 'grabbed')

  // ── 1× compact bar ──────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {totalNetworks > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: ircColor }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
              {connectedNetworks}/{totalNetworks} IRC
            </span>
          </div>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
        <span style={{ fontSize: 12, color: '#4ade80', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
          {fmtCount(grabbedCount)} grabbed
        </span>
        {rejectedCount > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
            {fmtCount(rejectedCount)} rejected
          </span>
        </>}
        {pushErrorCount > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 12, color: '#e53e3e', fontWeight: 600 }}>
            {pushErrorCount} errors
          </span>
        </>}
        {activeFilters > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {activeFilters} filters
          </span>
        </>}
      </div>
    )
  }

  // ── 2–3× medium ─────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Donut + stat chips */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <GrabDonut grabbed={grabbedCount} total={totalCount} size={80} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
            <StatChip label="Grabbed" value={fmtCount(grabbedCount)} color="#4ade80" />
            <StatChip label="Total" value={fmtCount(totalCount)} />
            {rejectedCount > 0 && <StatChip label="Rejected" value={fmtCount(rejectedCount)} color="var(--text-dim)" />}
            {pushErrorCount > 0 && <StatChip label="Errors" value={pushErrorCount} color="#e53e3e" bg="#e53e3e18" />}
            {totalNetworks > 0 && (
              <StatChip
                label="IRC"
                value={`${connectedNetworks}/${totalNetworks}`}
                color={ircColor}
                bg={ircOk ? undefined : '#e53e3e18'}
              />
            )}
            {activeFilters > 0 && <StatChip label="Filters" value={activeFilters} />}
          </div>
        </div>

        {/* IRC networks */}
        {ircNetworks.length > 0 && (
          <div>
            <ColHeader>IRC Networks</ColHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {ircNetworks.map((n, i) => <IRCNetworkRow key={i} net={n} />)}
            </div>
          </div>
        )}

        {/* Recent grabs */}
        {recentGrabs.length > 0 && (
          <div>
            <ColHeader>Recent Grabs</ColHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recentGrabs.slice(0, 5).map((r, i) => <ReleaseRow key={i} release={r} />)}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── 4×+ full layout ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Donut + chips */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <GrabDonut grabbed={grabbedCount} total={totalCount} size={80} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
          <StatChip label="Grabbed" value={fmtCount(grabbedCount)} color="#4ade80" />
          <StatChip label="Total seen" value={fmtCount(totalCount)} />
          {filteredCount > 0 && <StatChip label="Filtered" value={fmtCount(filteredCount)} />}
          {rejectedCount > 0 && <StatChip label="Rejected" value={fmtCount(rejectedCount)} color="var(--text-dim)" />}
          {pushErrorCount > 0 && <StatChip label="Errors" value={pushErrorCount} color="#e53e3e" bg="#e53e3e18" />}
          {totalNetworks > 0 && (
            <StatChip
              label="IRC"
              value={`${connectedNetworks}/${totalNetworks}`}
              color={ircColor}
              bg={ircOk ? undefined : '#e53e3e18'}
            />
          )}
          {activeFilters > 0 && <StatChip label="Filters" value={activeFilters} />}
        </div>
      </div>

      {/* Three-column: IRC | recent activity | grabs only */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 1fr', gap: 12 }}>

        {/* Col 1: IRC networks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <ColHeader>IRC Networks ({totalNetworks})</ColHeader>
          {ircNetworks.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>None configured</div>
            : ircNetworks.map((n, i) => <IRCNetworkRow key={i} net={n} />)
          }
        </div>

        {/* Col 2: Full recent activity */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <ColHeader>Recent Activity</ColHeader>
          {releases.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent releases</div>
            : releases.slice(0, 15).map((r, i) => <ReleaseRow key={i} release={r} />)
          }
        </div>

        {/* Col 3: Grabs only */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <ColHeader>Grabs ({recentGrabs.length > 0 ? `${recentGrabs.length} recent` : 'none recent'})</ColHeader>
          {recentGrabs.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent grabs</div>
            : recentGrabs.slice(0, 15).map((r, i) => <ReleaseRow key={i} release={r} />)
          }
        </div>
      </div>
    </div>
  )
}
