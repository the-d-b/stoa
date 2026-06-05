import { useState, useEffect } from 'react'
import { integrationsApi } from '../../api'
import { Panel } from '../../api'

interface NextDNSDomain { name: string; queries: number; blocked: number }
interface NextDNSClient { name: string; queries: number; blocked: number }
interface NextDNSReason { name: string; queries: number }

interface NextDNSData {
  uiUrl: string
  integrationId: string
  profileName: string
  totalQueries: number
  blockedQueries: number
  allowedQueries: number
  percentBlocked: number
  encryptedPct: number
  ipv6Pct: number
  overTimeTotal: number[]
  overTimeBlocked: number[]
  topDomains: NextDNSDomain[]
  topBlocked: NextDNSDomain[]
  topClients: NextDNSClient[]
  reasons: NextDNSReason[]
}

function ArcGauge({ pct, color = '#e53e3e', label, size = 100 }: {
  pct: number; color?: string; label: string; size?: number
}) {
  const cx = size / 2, cy = size / 2, r = size * 0.38
  const circumference = 2 * Math.PI * r
  const arc = circumference * 0.75
  const filled = arc * Math.min(pct / 100, 1)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface2)" strokeWidth={size * 0.11}
        strokeDasharray={`${arc} ${circumference}`} strokeLinecap="round"
        transform={`rotate(135, ${cx}, ${cy})`} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={size * 0.11}
        strokeDasharray={`${filled} ${circumference}`} strokeLinecap="round"
        transform={`rotate(135, ${cx}, ${cy})`} />
      <text x={cx} y={cy - size * 0.05} textAnchor="middle" dominantBaseline="middle"
        fill="var(--text)" style={{ fontSize: size * 0.18, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
        {pct.toFixed(1)}%
      </text>
      <text x={cx} y={cy + size * 0.17} textAnchor="middle"
        fill="var(--text-muted)" style={{ fontSize: size * 0.1 }}>
        {label}
      </text>
    </svg>
  )
}

function StatChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '5px 10px', borderRadius: 8, background: 'var(--surface2)',
      border: '1px solid var(--border)', minWidth: 64,
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

function Sparkline({ total, blocked, height = 44 }: { total: number[]; blocked: number[]; height?: number }) {
  const n = total.length
  if (n === 0) return null
  const maxVal = Math.max(...total, 1)
  const H = height
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${n} ${H}`} preserveAspectRatio="none"
      style={{ display: 'block', borderRadius: 4 }}>
      {total.map((t, i) => {
        const th = (t / maxVal) * H
        const bh = ((blocked[i] || 0) / maxVal) * H
        return (
          <g key={i}>
            <rect x={i} y={H - th} width={0.9} height={th} fill="var(--border)" />
            <rect x={i} y={H - bh} width={0.9} height={bh} fill="#e53e3e" opacity={0.85} />
          </g>
        )
      })}
    </svg>
  )
}

function BarRow({ label, value, max, displayVal, color = 'var(--accent)' }: {
  label: string; value: number; max: number; displayVal: string; color?: string
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: 'var(--text)', fontSize: 12 }} title={label}>
        {label}
      </div>
      <div style={{ width: 64, height: 4, background: 'var(--surface2)', borderRadius: 2, flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace',
        minWidth: 32, textAlign: 'right', flexShrink: 0 }}>
        {displayVal}
      </div>
    </div>
  )
}

function ColHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
      {children}
    </div>
  )
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

export default function NextDNSPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<NextDNSData | null>(null)
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
    totalQueries, blockedQueries, allowedQueries, percentBlocked, encryptedPct, ipv6Pct,
    overTimeTotal = [], overTimeBlocked = [], topBlocked = [], topClients = [], reasons = [],
    profileName,
  } = data

  // ── 1× compact bar ──────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
          {fmtNum(totalQueries)} queries
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
        <span style={{ fontSize: 12, color: '#e53e3e', fontFamily: 'DM Mono, monospace' }}>
          {fmtNum(blockedQueries)} blocked ({percentBlocked.toFixed(1)}%)
        </span>
        {encryptedPct > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 12, color: '#22d3ee', fontFamily: 'DM Mono, monospace' }}>
            {encryptedPct.toFixed(0)}% encrypted
          </span>
        </>}
        {ipv6Pct > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 12, color: '#a855f7', fontFamily: 'DM Mono, monospace' }}>
            {ipv6Pct.toFixed(0)}% IPv6
          </span>
        </>}
      </div>
    )
  }

  // ── 2–3× medium ─────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {profileName && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>
            Profile: {profileName}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <ArcGauge pct={percentBlocked} color="#e53e3e" label="blocked" size={90} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
            <StatChip label="Total" value={fmtNum(totalQueries)} />
            <StatChip label="Blocked" value={fmtNum(blockedQueries)} color="#e53e3e" />
            <StatChip label="Allowed" value={fmtNum(allowedQueries)} color="var(--green)" />
            {encryptedPct > 0 && <StatChip label="Encrypted" value={`${encryptedPct.toFixed(0)}%`} color="#22d3ee" />}
            {ipv6Pct > 0 && <StatChip label="IPv6" value={`${ipv6Pct.toFixed(0)}%`} color="#a855f7" />}
          </div>
        </div>
        {overTimeTotal.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 3 }}>
              24h query timeline — grey total, red blocked
            </div>
            <Sparkline total={overTimeTotal} blocked={overTimeBlocked} />
          </div>
        )}
      </div>
    )
  }

  // ── 4×+ full layout ──────────────────────────────────────────────────────────
  const maxBlocked = topBlocked.length > 0 ? topBlocked[0].blocked : 1
  const maxClient  = topClients.length > 0 ? topClients[0].queries : 1
  const maxReason  = reasons.length > 0 ? reasons[0].queries : 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {profileName && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>
          Profile: {profileName}
        </div>
      )}

      {/* Top row — gauge + chips */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <ArcGauge pct={percentBlocked} color="#e53e3e" label="blocked" size={96} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
          <StatChip label="Total" value={fmtNum(totalQueries)} />
          <StatChip label="Blocked" value={fmtNum(blockedQueries)} color="#e53e3e" />
          <StatChip label="Allowed" value={fmtNum(allowedQueries)} color="var(--green)" />
          {encryptedPct > 0 && <StatChip label="Encrypted" value={`${encryptedPct.toFixed(0)}%`} color="#22d3ee" />}
          {ipv6Pct > 0 && <StatChip label="IPv6" value={`${ipv6Pct.toFixed(0)}%`} color="#a855f7" />}
        </div>
      </div>

      {/* Sparkline */}
      {overTimeTotal.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 3 }}>
            24h query timeline — grey total, red blocked
          </div>
          <Sparkline total={overTimeTotal} blocked={overTimeBlocked} />
        </div>
      )}

      {/* Three-column detail */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 2 }}>
        {/* Column 1: Top blocked domains */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <ColHeader>Top Blocked</ColHeader>
          {topBlocked.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No data</div>
            : topBlocked.slice(0, 9).map(d => (
                <BarRow key={d.name} label={d.name} value={d.blocked} max={maxBlocked}
                  displayVal={fmtNum(d.blocked)} color="#e53e3e" />
              ))}
        </div>

        {/* Column 2: Top clients */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <ColHeader>Top Clients</ColHeader>
          {topClients.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No data</div>
            : topClients.slice(0, 9).map(c => (
                <BarRow key={c.name} label={c.name} value={c.queries} max={maxClient}
                  displayVal={fmtNum(c.queries)} color="var(--accent)" />
              ))}
        </div>

        {/* Column 3: Block reasons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <ColHeader>Block Reasons</ColHeader>
          {reasons.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No data</div>
            : reasons.slice(0, 9).map(r => (
                <BarRow key={r.name} label={r.name} value={r.queries} max={maxReason}
                  displayVal={fmtNum(r.queries)} color="#f97316" />
              ))}
        </div>
      </div>
    </div>
  )
}
