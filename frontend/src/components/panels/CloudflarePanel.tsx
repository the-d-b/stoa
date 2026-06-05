import { useEffect, useState } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CloudflareZone {
  id: string
  name: string
  status: string   // "active", "pending", "initializing", "moved"
  plan: string
  paused: boolean
  requests: number
  cachedRequests: number
  bandwidth: number  // bytes
  threats: number
  uniques: number
  pageViews: number
}

interface CloudflareIngress {
  hostname: string
  service: string
  path?: string
}

interface CloudflareTunnelConn {
  coloName: string
  isPendingReconnect: boolean
}

interface CloudflareTunnel {
  id: string
  name: string
  status: string   // "healthy", "degraded", "down", "inactive"
  createdAt: string
  connections: CloudflareTunnelConn[]
  ingress: CloudflareIngress[]
}

interface CloudflareData {
  uiUrl: string
  integrationId: string
  zones: CloudflareZone[]
  tunnels: CloudflareTunnel[]
  totalZones: number
  activeZones: number
  totalTunnels: number
  healthyTunnels: number
  downTunnels: number
  totalRequests: number
  totalThreats: number
  totalBandwidth: number
  totalUniques: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (!n) return '0'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return `${n}`
}

function fmtBytes(b: number): string {
  if (!b) return '0 B'
  if (b >= 1e12) return `${(b / 1e12).toFixed(1)} TB`
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`
  return `${(b / 1e3).toFixed(0)} KB`
}

function tunnelStatusColor(status: string): string {
  switch (status) {
    case 'healthy':  return 'var(--green)'
    case 'degraded': return 'var(--amber)'
    case 'down':     return 'var(--red, #e53e3e)'
    default:         return 'var(--text-dim)' // inactive
  }
}

function zoneStatusColor(status: string, paused: boolean): string {
  if (paused) return 'var(--amber)'
  if (status === 'active') return 'var(--green)'
  return 'var(--text-dim)'
}

function planBadgeColor(plan: string): string {
  const p = plan?.toLowerCase() || ''
  if (p.includes('enterprise')) return '#f97316'
  if (p.includes('business'))   return 'var(--accent)'
  if (p.includes('pro'))        return '#a855f7'
  return 'var(--text-dim)' // free
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatChip({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
      padding: '5px 10px', background: 'var(--bg-surface)',
      borderRadius: 6, border: '1px solid var(--border)' }}>
      <span style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.05em', marginBottom: 2 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'DM Mono, monospace',
        color: color || 'var(--text)' }}>{value}</span>
      {sub && <span style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 1 }}>{sub}</span>}
    </div>
  )
}

function TunnelRow({ tunnel, showIngress = false }: {
  tunnel: CloudflareTunnel; showIngress?: boolean
}) {
  const color = tunnelStatusColor(tunnel.status)
  const colos = (tunnel.connections || [])
    .filter(c => !c.isPendingReconnect)
    .map(c => c.coloName)
    .filter((v, i, a) => a.indexOf(v) === i) // dedupe
    .slice(0, 4)

  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%',
          background: color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
            {tunnel.name}
          </span>
        </div>
        {colos.length > 0 && (
          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            {colos.map(c => (
              <span key={c} style={{ fontSize: 8, color: 'var(--text-dim)',
                background: 'var(--bg-surface)', borderRadius: 3, padding: '1px 4px',
                border: '1px solid var(--border)' }}>
                {c}
              </span>
            ))}
          </div>
        )}
        <span style={{ fontSize: 9, color, flexShrink: 0, fontWeight: 600 }}>
          {tunnel.status}
        </span>
      </div>

      {/* Ingress rules */}
      {showIngress && (tunnel.ingress || []).length > 0 && (
        <div style={{ paddingLeft: 15, paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {tunnel.ingress.map((rule, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9 }}>
              <span style={{ color: 'var(--accent)', fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                maxWidth: '55%' }}>
                {rule.hostname}{rule.path || ''}
              </span>
              <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>→</span>
              <span style={{ color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {rule.service}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ZoneRow({ zone, compact = false }: { zone: CloudflareZone; compact?: boolean }) {
  const dot = zoneStatusColor(zone.status, zone.paused)
  return (
    <div style={{ padding: compact ? '3px 0' : '5px 0',
      borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%',
          background: dot, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: compact ? 10 : 11, fontWeight: 500, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {zone.name}
            {zone.paused && (
              <span style={{ marginLeft: 5, fontSize: 8, color: 'var(--amber)' }}>paused</span>
            )}
          </div>
          {!compact && zone.plan && (
            <span style={{ fontSize: 8, color: planBadgeColor(zone.plan) }}>{zone.plan}</span>
          )}
        </div>
        {zone.requests > 0 && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace',
                color: 'var(--text)', fontWeight: 600 }}>
                {fmtNum(zone.requests)}
              </div>
              <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>req</div>
            </div>
            {zone.threats > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace',
                  color: 'var(--red, #e53e3e)', fontWeight: 600 }}>
                  {fmtNum(zone.threats)}
                </div>
                <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>threats</div>
              </div>
            )}
            {!compact && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace',
                  color: 'var(--text-dim)' }}>
                  {fmtBytes(zone.bandwidth)}
                </div>
                <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>bw</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  panel: Panel
  heightUnits: number
}

export default function CloudflarePanel({ panel, heightUnits }: Props) {
  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined
  const [data, setData] = useState<CloudflareData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!integrationId) return
    integrationsApi.getPanelData(panel.id).then(res => {
      setData(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [panel.id, integrationId])

  const sseData = useSSE<CloudflareData>(integrationId)
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

  const uiHref = data.uiUrl || 'https://dash.cloudflare.com'
  const tunnels = data.tunnels || []
  const zones = data.zones || []
  const activeTunnels = tunnels.filter(t => t.status !== 'inactive')
  const downTunnels = tunnels.filter(t => t.status === 'down' || t.status === 'degraded')

  // ── 1× compact bar ───────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={root}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <a href={uiHref} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)',
              textDecoration: 'none', flexShrink: 0 }}>
            Cloudflare
          </a>
          <div style={{ flex: 1 }} />
          {data.totalRequests > 0 && (
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              {fmtNum(data.totalRequests)} req/24h
            </span>
          )}
          {data.totalThreats > 0 && (
            <span style={{ fontSize: 9, color: 'var(--red, #e53e3e)' }}>
              {fmtNum(data.totalThreats)} threats
            </span>
          )}
          {tunnels.length > 0 && (
            <span style={{ fontSize: 9,
              color: downTunnels.length > 0 ? 'var(--red, #e53e3e)' : 'var(--green)' }}>
              {activeTunnels.length - downTunnels.length}/{activeTunnels.length} tunnels
            </span>
          )}
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
            {data.activeZones}/{data.totalZones} zones
          </span>
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
            Cloudflare
          </a>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
            {data.activeZones} zone{data.activeZones !== 1 ? 's' : ''}
          </span>
          {tunnels.length > 0 && (
            <span style={{ fontSize: 9,
              color: downTunnels.length > 0 ? 'var(--red, #e53e3e)' : 'var(--green)' }}>
              {data.healthyTunnels}/{activeTunnels.length} tunnels healthy
            </span>
          )}
        </div>

        {/* Aggregate stats */}
        {data.totalRequests > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            <StatChip label="Requests" value={fmtNum(data.totalRequests)} sub="24h" />
            {data.totalThreats > 0 && (
              <StatChip label="Threats" value={fmtNum(data.totalThreats)} sub="blocked"
                color="var(--red, #e53e3e)" />
            )}
            <StatChip label="Bandwidth" value={fmtBytes(data.totalBandwidth)} sub="served" />
            {data.totalUniques > 0 && (
              <StatChip label="Uniques" value={fmtNum(data.totalUniques)} sub="visitors" />
            )}
          </div>
        )}

        {/* Tunnels */}
        {activeTunnels.length > 0 && (
          <div style={{ marginBottom: 8, flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 3,
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Tunnels
            </div>
            {activeTunnels.slice(0, 5).map((t, i) => (
              <TunnelRow key={t.id || i} tunnel={t} showIngress={false} />
            ))}
          </div>
        )}

        {/* Zones */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 3,
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Zones
          </div>
          {zones.slice(0, 10).map((z, i) => (
            <ZoneRow key={z.id || i} zone={z} compact />
          ))}
        </div>
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
          Cloudflare
        </a>
        <div style={{ flex: 1 }} />
        {tunnels.length > 0 && (
          <span style={{ fontSize: 9,
            color: downTunnels.length > 0 ? 'var(--red, #e53e3e)' : 'var(--green)' }}>
            {data.healthyTunnels}/{activeTunnels.length} tunnels healthy
          </span>
        )}
      </div>

      {/* Aggregate stat chips */}
      {data.totalRequests > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <StatChip label="Requests" value={fmtNum(data.totalRequests)} sub="24h" />
          {data.totalThreats > 0 && (
            <StatChip label="Threats" value={fmtNum(data.totalThreats)} sub="blocked"
              color="var(--red, #e53e3e)" />
          )}
          <StatChip label="Bandwidth" value={fmtBytes(data.totalBandwidth)} sub="served" />
          {data.totalUniques > 0 && (
            <StatChip label="Unique visitors" value={fmtNum(data.totalUniques)} sub="24h" />
          )}
        </div>
      )}

      {/* Two-column: tunnels + zones */}
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
        {/* Tunnels column */}
        {tunnels.length > 0 && (
          <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4,
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Tunnels ({activeTunnels.length} active)
            </div>
            {tunnels.map((t, i) => (
              <TunnelRow key={t.id || i} tunnel={t} showIngress={true} />
            ))}
          </div>
        )}

        {/* Zones column */}
        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4,
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Zones ({data.activeZones} active)
          </div>
          {zones.map((z, i) => (
            <ZoneRow key={z.id || i} zone={z} compact={false} />
          ))}
        </div>
      </div>
    </div>
  )
}
