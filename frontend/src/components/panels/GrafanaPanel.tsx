import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

interface GrafanaDatasource {
  id: number
  name: string
  type: string
  url: string
  health: string // "ok", "error", "unknown"
  message: string
  readOnly: boolean
}

interface GrafanaAlert {
  name: string
  severity: string
  labels: Record<string, string>
  summary: string
  activeAt: string
}

interface GrafanaData {
  uiUrl: string
  integrationId: string
  version: string
  database: string
  orgName: string
  datasources: GrafanaDatasource[]
  totalDs: number
  healthyDs: number
  unhealthyDs: number
  alerts: GrafanaAlert[]
  firingAlerts: number
  dashboardCount: number
  userCount: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dsTypeColor(type: string): string {
  switch (type?.toLowerCase()) {
    case 'prometheus':      return '#e6522c'
    case 'loki':            return '#f0a742'
    case 'influxdb':        return '#22adf6'
    case 'elasticsearch':   return '#00bfb3'
    case 'postgres':        return '#336791'
    case 'mysql':           return '#4479a1'
    case 'graphite':        return '#a0a0a0'
    case 'cloudwatch':      return '#ff9900'
    case 'azuremonitor':    return '#0078d4'
    case 'googlecloud':     return '#4285f4'
    case 'tempo':           return '#e36ddf'
    case 'jaeger':          return '#66d3fa'
    case 'zipkin':          return '#ff6b6b'
    default:                return '#6b7280'
  }
}

function dsTypeName(type: string): string {
  const map: Record<string, string> = {
    prometheus: 'Prometheus', loki: 'Loki', influxdb: 'InfluxDB',
    elasticsearch: 'Elasticsearch', postgres: 'PostgreSQL', mysql: 'MySQL',
    graphite: 'Graphite', cloudwatch: 'CloudWatch', azuremonitor: 'Azure Monitor',
    tempo: 'Tempo', jaeger: 'Jaeger', zipkin: 'Zipkin',
  }
  return map[type?.toLowerCase()] ?? type ?? 'Unknown'
}

function healthDot(health: string): string {
  if (health === 'ok')    return '#4ade80'
  if (health === 'error') return '#e53e3e'
  return 'var(--text-dim)'
}

function severityColor(sev: string): string {
  switch (sev?.toLowerCase()) {
    case 'critical': return '#e53e3e'
    case 'error':    return '#e53e3e'
    case 'warning':  return '#f59e0b'
    case 'info':     return '#22d3ee'
    default:         return '#e53e3e'
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

function DSDonut({ healthy, total, size = 80 }: { healthy: number; total: number; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size * 0.36
  const circ = 2 * Math.PI * r
  const pct = total > 0 ? healthy / total : 1
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
        {healthy}
      </text>
      <text x={cx} y={cy + size * 0.2} textAnchor="middle"
        fill="var(--text-dim)" style={{ fontSize: size * 0.12 }}>
        of {total}
      </text>
    </svg>
  )
}

function DSRow({ ds }: { ds: GrafanaDatasource }) {
  const typeColor = dsTypeColor(ds.type)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: healthDot(ds.health), flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {ds.name}
      </span>
      <span style={{
        fontSize: 9, fontWeight: 600, color: typeColor, background: typeColor + '22',
        borderRadius: 4, padding: '1px 5px', flexShrink: 0, letterSpacing: '0.03em',
        textTransform: 'uppercase',
      }}>
        {dsTypeName(ds.type)}
      </span>
      {ds.health === 'error' && ds.message && (
        <span style={{ fontSize: 10, color: '#e53e3e', flexShrink: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}
          title={ds.message}>
          {ds.message.split(':')[0]}
        </span>
      )}
    </div>
  )
}

function AlertRow({ alert }: { alert: GrafanaAlert }) {
  const color = severityColor(alert.severity)
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
              borderRadius: 4, padding: '1px 5px', flexShrink: 0,
              letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {alert.severity}
            </span>
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

export default function GrafanaPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<GrafanaData | null>(null)
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
    totalDs, healthyDs, unhealthyDs, firingAlerts,
    datasources = [], alerts = [], version, orgName, database,
    dashboardCount, userCount,
  } = data

  // Treat "unknown" health DSes as the unknown category (not unhealthy if no health API)
  const unknownDs = totalDs - healthyDs - unhealthyDs
  const dbOk = database === 'ok'
  const dsStatusColor = unhealthyDs === 0 ? '#4ade80' : unhealthyDs < totalDs ? '#f59e0b' : '#e53e3e'

  // ── 1× compact bar ──────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: dsStatusColor }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
            {totalDs > 0
              ? `${healthyDs}/${totalDs} datasources`
              : 'No datasources'}
          </span>
        </div>
        {firingAlerts > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 12, color: '#e53e3e', fontWeight: 600 }}>
            {firingAlerts} alert{firingAlerts !== 1 ? 's' : ''} firing
          </span>
        </>}
        {version && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
            v{version}
          </span>
        </>}
        {orgName && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{orgName}</span>
        </>}
      </div>
    )
  }

  // ── 2–3× medium ─────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Donut + chips */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {totalDs > 0
            ? <DSDonut healthy={healthyDs} total={totalDs} size={80} />
            : <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80' }} />
          }
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
            {totalDs > 0 && <StatChip label="Healthy" value={healthyDs} color="#4ade80" />}
            {unhealthyDs > 0 && <StatChip label="Down" value={unhealthyDs} color="#e53e3e" bg="#e53e3e18" />}
            {totalDs > 0 && <StatChip label="Total DS" value={totalDs} />}
            {firingAlerts > 0 && <StatChip label="Firing" value={firingAlerts} color="#e53e3e" bg="#e53e3e18" />}
            {dashboardCount > 0 && <StatChip label="Dashboards" value={dashboardCount} />}
            {version && <StatChip label="Version" value={`v${version}`} />}
          </div>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div>
            <ColHeader>Alerts ({firingAlerts} firing)</ColHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {alerts.slice(0, 4).map((a, i) => <AlertRow key={i} alert={a} />)}
              {alerts.length > 4 && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', paddingLeft: 13 }}>
                  +{alerts.length - 4} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Datasource list */}
        {datasources.length > 0 && (
          <div>
            <ColHeader>
              Datasources ({unhealthyDs > 0 ? `${unhealthyDs} down` : `${healthyDs} healthy`}{unknownDs > 0 ? `, ${unknownDs} unknown` : ''})
            </ColHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {datasources.slice(0, 5).map((ds, i) => <DSRow key={i} ds={ds} />)}
              {datasources.length > 5 && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', paddingLeft: 13 }}>
                  +{datasources.length - 5} more
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── 4×+ full layout ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Donut + chips header */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {totalDs > 0
          ? <DSDonut healthy={healthyDs} total={totalDs} size={80} />
          : null
        }
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
          {totalDs > 0 && <StatChip label="Healthy DS" value={healthyDs} color="#4ade80" />}
          {unhealthyDs > 0 && <StatChip label="Down DS" value={unhealthyDs} color="#e53e3e" bg="#e53e3e18" />}
          {totalDs > 0 && <StatChip label="Total DS" value={totalDs} />}
          {firingAlerts > 0 && <StatChip label="Firing" value={firingAlerts} color="#e53e3e" bg="#e53e3e18" />}
          {dashboardCount > 0 && <StatChip label="Dashboards" value={dashboardCount} />}
          {userCount > 0 && <StatChip label="Users" value={userCount} />}
          {version && <StatChip label="Version" value={`v${version}`} />}
          {orgName && <StatChip label="Org" value={orgName} />}
        </div>
      </div>

      {/* Three-column: datasources | alerts | details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>

        {/* Col 1: Datasources */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <ColHeader>Datasources ({totalDs})</ColHeader>
          {datasources.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No datasources</div>
            : datasources.map((ds, i) => <DSRow key={i} ds={ds} />)
          }
        </div>

        {/* Col 2: Alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <ColHeader>Alerts {firingAlerts > 0 ? `(${firingAlerts} firing)` : '(none)'}</ColHeader>
          {alerts.length === 0
            ? <div style={{ fontSize: 12, color: '#4ade80' }}>All clear</div>
            : alerts.map((a, i) => <AlertRow key={i} alert={a} />)
          }
        </div>

        {/* Col 3: Instance details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <ColHeader>Instance</ColHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {database && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%',
                  background: dbOk ? '#4ade80' : '#e53e3e', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Database {dbOk ? 'ok' : database}
                </span>
              </div>
            )}
            {version && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
                Version: v{version}
              </div>
            )}
            {orgName && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Org: {orgName}
              </div>
            )}
            {dashboardCount > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Dashboards: {dashboardCount}
              </div>
            )}
            {userCount > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Users: {userCount}
              </div>
            )}
            {/* Datasource type breakdown */}
            {datasources.length > 0 && (() => {
              const typeCounts: Record<string, number> = {}
              datasources.forEach(ds => {
                const t = dsTypeName(ds.type)
                typeCounts[t] = (typeCounts[t] || 0) + 1
              })
              const types = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])
              return types.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
                    letterSpacing: '0.04em', marginBottom: 2 }}>
                    DS Types
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {types.map(([t, n]) => (
                      <span key={t} style={{
                        fontSize: 9, fontWeight: 600, color: dsTypeColor(t.toLowerCase()),
                        background: dsTypeColor(t.toLowerCase()) + '22',
                        borderRadius: 4, padding: '2px 5px', letterSpacing: '0.03em',
                      }}>
                        {t} {n > 1 ? `×${n}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
