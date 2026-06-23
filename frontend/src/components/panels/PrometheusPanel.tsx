import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

interface PrometheusTarget {
  job: string
  instance: string
  health: string // "up", "down", "unknown"
  lastScrape: string
  lastError: string
}

interface PrometheusJobSummary {
  job: string
  up: number
  total: number
}

interface PrometheusAlert {
  name: string
  state: string // "firing", "pending"
  labels: Record<string, string>
  summary: string
  description: string
  activeAt: string
  severity: string
}

interface PrometheusMetric {
  label: string
  query: string
  value: string
  unit: string
  sparkline: number[]
  error?: string
}

interface PrometheusData {
  uiUrl: string
  integrationId: string
  version: string
  targets: PrometheusTarget[]
  totalTargets: number
  upTargets: number
  downTargets: number
  jobs: PrometheusJobSummary[]
  alerts: PrometheusAlert[]
  firingAlerts: number
  pendingAlerts: number
  metrics: PrometheusMetric[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function severityColor(sev: string): string {
  switch (sev?.toLowerCase()) {
    case 'critical': return '#e53e3e'
    case 'warning':  return '#f59e0b'
    case 'info':     return '#22d3ee'
    default:         return '#e53e3e'
  }
}

function healthDot(health: string): string {
  if (health === 'up')   return '#4ade80'
  if (health === 'down') return '#e53e3e'
  return 'var(--text-dim)'
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

function HealthDonut({ up, total, size = 80 }: { up: number; total: number; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size * 0.36
  const circ = 2 * Math.PI * r
  const pct = total > 0 ? up / total : 0
  const filled = circ * pct
  const color = pct === 1 ? '#4ade80' : pct >= 0.8 ? '#f59e0b' : '#e53e3e'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface2)" strokeWidth={size * 0.13} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={size * 0.13}
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - size * 0.05} textAnchor="middle" dominantBaseline="middle"
        fill="var(--text)" style={{ fontSize: size * 0.24, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
        {up}
      </text>
      <text x={cx} y={cy + size * 0.2} textAnchor="middle"
        fill="var(--text-dim)" style={{ fontSize: size * 0.12 }}>
        of {total}
      </text>
    </svg>
  )
}

function Sparkline({ values, width = 64, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (!values || values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pad = 2
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2)
    const y = pad + (height - pad * 2) - ((v - min) / range) * (height - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none" style={{ display: 'block', overflow: 'hidden' }}>
      <polyline points={pts} fill="none" stroke="#22d3ee" strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MetricCard({ metric }: { metric: PrometheusMetric }) {
  const hasSparkline = metric.sparkline?.length >= 2
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 8px', borderRadius: 6,
      background: 'var(--surface2)', border: '1px solid var(--border)', minWidth: 0,
    }}>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {metric.label || metric.query}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, flexShrink: 0,
          color: metric.error ? 'var(--text-dim)' : '#22d3ee' }}>
          {metric.error
            ? <span style={{ fontSize: 10, color: '#e53e3e' }}>error</span>
            : <>
                <span style={{ fontSize: 14 }}>{metric.value || '—'}</span>
                {metric.unit && <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 2 }}>{metric.unit}</span>}
              </>
          }
        </div>
        {!metric.error && hasSparkline && (
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <Sparkline values={metric.sparkline} width={54} height={20} />
          </div>
        )}
      </div>
    </div>
  )
}

function AlertRow({ alert }: { alert: PrometheusAlert }) {
  const color = alert.state === 'firing' ? severityColor(alert.severity) : '#f59e0b'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 3 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {alert.name}
          </span>
          {alert.severity && (
            <span style={{ fontSize: 9, fontWeight: 700, color, background: color + '20',
              borderRadius: 4, padding: '1px 5px', flexShrink: 0, letterSpacing: '0.04em',
              textTransform: 'uppercase' }}>
              {alert.severity}
            </span>
          )}
          {alert.state === 'pending' && (
            <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', background: '#f59e0b18',
              borderRadius: 4, padding: '1px 5px', flexShrink: 0, letterSpacing: '0.04em' }}>PENDING</span>
          )}
        </div>
        {alert.summary && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {alert.summary}
          </div>
        )}
      </div>
      <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-dim)',
        flexShrink: 0, whiteSpace: 'nowrap' }}>
        {fmtAgo(alert.activeAt)}
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

export default function PrometheusPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<PrometheusData | null>(null)
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
    totalTargets, upTargets, downTargets, firingAlerts, pendingAlerts, version,
  } = data
  const targets = data.targets ?? []
  const jobs = data.jobs ?? []
  const alerts = data.alerts ?? []
  const metrics = data.metrics ?? []

  const healthPct = totalTargets > 0 ? Math.round(upTargets / totalTargets * 100) : 100
  const statusColor = downTargets === 0 ? '#4ade80' : downTargets < totalTargets ? '#f59e0b' : '#e53e3e'

  // ── 1× compact bar ──────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
            {upTargets}/{totalTargets} targets up
          </span>
        </div>
        {firingAlerts > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 12, color: '#e53e3e', fontWeight: 600 }}>
            {firingAlerts} firing
          </span>
        </>}
        {pendingAlerts > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 12, color: '#f59e0b' }}>
            {pendingAlerts} pending
          </span>
        </>}
        {metrics.map((m, i) => (
          !m.error && m.value ? (
            <span key={i} style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--text-dim)' }}>· </span>
              <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>{m.label} </span>
              <span style={{ color: '#22d3ee' }}>{m.value}</span>
              {m.unit && <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>{m.unit}</span>}
            </span>
          ) : null
        ))}
      </div>
    )
  }

  // ── 2–3× medium ─────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        <HealthDonut up={upTargets} total={totalTargets} size={80} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          <StatChip label="Up" value={upTargets} color="#4ade80" />
          {downTargets > 0 && <StatChip label="Down" value={downTargets} color="#e53e3e" bg="#e53e3e18" />}
          <StatChip label="Total" value={totalTargets} />
          {firingAlerts > 0 && <StatChip label="Firing" value={firingAlerts} color="#e53e3e" bg="#e53e3e18" />}
          {pendingAlerts > 0 && <StatChip label="Pending" value={pendingAlerts} color="#f59e0b" bg="#f59e0b12" />}
          {version && <StatChip label="Version" value={`v${version}`} />}
        </div>
      </div>
    )
  }

  // ── 4×+ full layout ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'auto' }}>
      {/* Donut */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <HealthDonut up={upTargets} total={totalTargets} size={80} />
      </div>

      {/* Data tiles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
        <StatChip label="Up" value={upTargets} color="#4ade80" />
        {downTargets > 0 && <StatChip label="Down" value={downTargets} color="#e53e3e" bg="#e53e3e18" />}
        <StatChip label="Total" value={totalTargets} />
        <StatChip label="Health" value={`${healthPct}%`} color={statusColor} />
        {firingAlerts > 0 && <StatChip label="Firing" value={firingAlerts} color="#e53e3e" bg="#e53e3e18" />}
        {pendingAlerts > 0 && <StatChip label="Pending" value={pendingAlerts} color="#f59e0b" bg="#f59e0b12" />}
        {version && <StatChip label="Version" value={`v${version}`} />}
      </div>

      {/* Custom metrics */}
      {metrics.length > 0 && (
        <div>
          <ColHeader>Custom Metrics</ColHeader>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {metrics.map((m, i) => <MetricCard key={i} metric={m} />)}
          </div>
        </div>
      )}

      {/* Jobs */}
      <div>
        <ColHeader>Jobs ({jobs.length})</ColHeader>
        {jobs.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No scrape jobs</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {jobs.map((j, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, minWidth: 0 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                    background: j.up === j.total ? '#4ade80' : j.up > 0 ? '#f59e0b' : '#e53e3e' }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: 'var(--text)' }}>
                    {j.job}
                  </span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
                    {j.up}/{j.total}
                  </span>
                </div>
              ))}
            </div>
        }
      </div>

      {/* Alerts */}
      <div>
        <ColHeader>
          Alerts {(firingAlerts + pendingAlerts) > 0
            ? `(${firingAlerts} firing${pendingAlerts > 0 ? `, ${pendingAlerts} pending` : ''})`
            : '(none)'}
        </ColHeader>
        {alerts.length === 0
          ? <div style={{ fontSize: 12, color: '#4ade80' }}>All clear</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {alerts.map((a, i) => <AlertRow key={i} alert={a} />)}
            </div>
        }
      </div>

      {/* All targets */}
      <div>
        <ColHeader>
          {downTargets > 0 ? `Down Targets (${downTargets})` : `All Targets (${totalTargets})`}
        </ColHeader>
        {downTargets === 0 && targets.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No targets</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(downTargets > 0 ? targets.filter(t => t.health !== 'up') : targets).map((t, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: healthDot(t.health), flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {t.instance}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
                      {t.job}
                    </span>
                  </div>
                  {t.lastError && (
                    <div style={{ fontSize: 10, color: '#e53e3e', paddingLeft: 13,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={t.lastError}>
                      {t.lastError}
                    </div>
                  )}
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  )
}
