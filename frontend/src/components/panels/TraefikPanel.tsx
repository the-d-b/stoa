import { useEffect, useState } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TraefikSection {
  total: number
  warnings: number
  errors: number
}

interface TraefikServer {
  url: string
  status: string // "UP", "DOWN"
}

interface TraefikService {
  name: string
  provider: string
  type: string
  status: string
  serversUp: number
  serversDown: number
  serversTotal: number
  servers?: TraefikServer[]
}

interface TraefikRouter {
  name: string
  provider: string
  status: string // "enabled", "warning", "disabled"
  rule: string
  entryPoints: string[]
  service: string
  tls: boolean
  middlewares?: string[]
}

interface TraefikFeatures {
  tracing: string
  metrics: string
  accessLog: boolean
}

interface TraefikData {
  uiUrl: string
  integrationId: string
  version: string
  providers: string[]
  features: TraefikFeatures
  routers: TraefikRouter[]
  services: TraefikService[]
  httpRouters: TraefikSection
  httpServices: TraefikSection
  tcpRouters: TraefikSection
  totalChecked: number
  servicesUp: number
  servicesDown: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  if (status === 'enabled') return 'var(--green)'
  if (status === 'warning') return 'var(--amber)'
  return 'var(--red, #e53e3e)'
}

function statusDot(status: string) {
  return (
    <div style={{
      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
      background: statusColor(status),
    }} />
  )
}

// Extract display hostname from Traefik rule, e.g. Host(`foo.bar.com`) → foo.bar.com
function ruleHost(rule: string): string {
  const m = rule.match(/Host\(`([^`]+)`\)/)
  if (m) return m[1]
  // PathPrefix, etc — return truncated rule
  if (rule.length > 40) return rule.slice(0, 38) + '…'
  return rule
}

function stripProvider(name: string): string {
  const at = name.lastIndexOf('@')
  return at >= 0 ? name.slice(0, at) : name
}

function providerColor(provider: string): string {
  if (provider === 'docker') return '#0db7ed'
  if (provider === 'kubernetes') return '#326ce5'
  if (provider === 'file') return 'var(--amber)'
  return 'var(--text-dim)'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionChip({ label, section }: { label: string; section: TraefikSection }) {
  const ok = section.warnings === 0 && section.errors === 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
      background: 'var(--bg-surface)', borderRadius: 6, border: '1px solid var(--border)' }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)',
        letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 10, color: ok ? 'var(--green)' : 'var(--amber)',
        fontFamily: 'DM Mono, monospace' }}>{section.total}</span>
      {section.errors > 0 && (
        <span style={{ fontSize: 9, color: 'var(--red, #e53e3e)' }}>
          {section.errors}✕
        </span>
      )}
      {section.warnings > 0 && (
        <span style={{ fontSize: 9, color: 'var(--amber)' }}>
          {section.warnings}⚠
        </span>
      )}
    </div>
  )
}

function ServiceRow({ svc, compact = false }: { svc: TraefikService; compact?: boolean }) {
  const hasHealth = svc.serversTotal > 0
  const allUp = hasHealth && svc.serversDown === 0
  const anyDown = svc.serversDown > 0

  return (
    <div style={{ padding: compact ? '3px 0' : '5px 0',
      borderBottom: '1px solid var(--border)', opacity: svc.status === 'disabled' ? 0.45 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {statusDot(svc.status)}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: compact ? 10 : 11, color: 'var(--text)', fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stripProvider(svc.name)}
          </div>
          {!compact && (
            <div style={{ fontSize: 9, color: providerColor(svc.provider) }}>
              {svc.provider}
            </div>
          )}
        </div>
        {hasHealth && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
            {anyDown && (
              <span style={{ fontSize: 9, color: 'var(--red, #e53e3e)',
                fontFamily: 'DM Mono, monospace' }}>
                {svc.serversDown} down
              </span>
            )}
            <span style={{ fontSize: 9, color: allUp ? 'var(--green)' : 'var(--text-dim)',
              fontFamily: 'DM Mono, monospace' }}>
              {svc.serversUp}/{svc.serversTotal}
            </span>
          </div>
        )}
        {!hasHealth && (
          <span style={{ fontSize: 9, color: 'var(--text-dim)', flexShrink: 0 }}>
            {svc.type}
          </span>
        )}
      </div>

      {/* Server list for tall heights */}
      {!compact && hasHealth && svc.servers && svc.servers.length > 0 && (
        <div style={{ paddingLeft: 13, paddingTop: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {svc.servers.map((srv, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                background: srv.status === 'UP' ? 'var(--green)' : 'var(--red, #e53e3e)' }} />
              <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {srv.url}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RouterRow({ router }: { router: TraefikRouter }) {
  const host = ruleHost(router.rule)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7,
      padding: '4px 0', borderBottom: '1px solid var(--border)',
      opacity: router.status === 'disabled' ? 0.4 : 1 }}>
      {statusDot(router.status)}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 10, color: 'var(--text)', fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {host}
          </span>
          {router.tls && (
            <span style={{ fontSize: 8, color: 'var(--green)', fontWeight: 700,
              background: 'color-mix(in srgb, var(--green) 15%, transparent)',
              borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>
              TLS
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 1 }}>
          {(router.entryPoints || []).map(ep => (
            <span key={ep} style={{ fontSize: 8, color: 'var(--text-dim)',
              background: 'var(--bg-surface)', borderRadius: 3, padding: '1px 4px' }}>
              {ep}
            </span>
          ))}
          <span style={{ fontSize: 8, color: providerColor(router.provider) }}>
            {router.provider}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  panel: Panel
  heightUnits: number
}

export default function TraefikPanel({ panel, heightUnits }: Props) {
  const integrationId = panel.config?.integrationId as string | undefined
  const [data, setData] = useState<TraefikData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!integrationId) return
    integrationsApi.getPanelData(panel.id).then(d => {
      setData(d as TraefikData)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [panel.id, integrationId])

  useSSE<TraefikData>(integrationId, d => setData(d))

  const root: React.CSSProperties = {
    height: '100%',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    padding: '10px 12px',
    boxSizing: 'border-box',
    fontFamily: 'var(--font-ui, system-ui)',
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

  const uiHref = data.uiUrl || undefined
  const routers = data.routers || []
  const services = data.services || []
  const unhealthyRouters = routers.filter(r => r.status !== 'enabled')
  const downServices = services.filter(s => s.serversDown > 0)

  // ── 1× compact bar ───────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={root}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <a href={uiHref} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', textDecoration: 'none', flexShrink: 0 }}>
            Traefik
            {data.version && (
              <span style={{ fontWeight: 400, color: 'var(--text-dim)', marginLeft: 5 }}>
                v{data.version}
              </span>
            )}
          </a>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
            {data.httpRouters.total} routes
            {unhealthyRouters.length > 0 && (
              <span style={{ color: 'var(--amber)', marginLeft: 3 }}>
                ({unhealthyRouters.length} warn)
              </span>
            )}
          </span>
          {data.totalChecked > 0 && (
            <span style={{ fontSize: 9,
              color: downServices.length > 0 ? 'var(--red, #e53e3e)' : 'var(--green)' }}>
              {data.totalChecked - downServices.length}/{data.totalChecked} up
            </span>
          )}
          {(data.providers || []).map(p => (
            <span key={p} style={{ fontSize: 9, color: providerColor(p) }}>{p}</span>
          ))}
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
            Traefik
          </a>
          {data.version && (
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>v{data.version}</span>
          )}
          <div style={{ flex: 1 }} />
          {(data.providers || []).map(p => (
            <span key={p} style={{ fontSize: 9, color: providerColor(p), fontWeight: 600 }}>{p}</span>
          ))}
        </div>

        {/* Section chips */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          {data.httpRouters.total > 0 && (
            <SectionChip label="HTTP" section={data.httpRouters} />
          )}
          {data.tcpRouters.total > 0 && (
            <SectionChip label="TCP" section={data.tcpRouters} />
          )}
          {data.totalChecked > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
              background: 'var(--bg-surface)', borderRadius: 6, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)',
                letterSpacing: '0.04em', textTransform: 'uppercase' }}>Backends</span>
              <span style={{ fontSize: 10,
                color: downServices.length > 0 ? 'var(--red, #e53e3e)' : 'var(--green)',
                fontFamily: 'DM Mono, monospace' }}>
                {data.totalChecked - downServices.length}/{data.totalChecked}
              </span>
            </div>
          )}
        </div>

        {/* Down/warning services highlighted */}
        {downServices.length > 0 && (
          <div style={{ marginBottom: 8, flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: 'var(--red, #e53e3e)', marginBottom: 3,
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Backends down
            </div>
            {downServices.slice(0, 4).map((svc, i) => (
              <ServiceRow key={svc.name || i} svc={svc} compact />
            ))}
          </div>
        )}

        {/* Services list */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 3,
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Services
          </div>
          {services.filter(s => s.serversDown === 0).slice(0, 20).map((svc, i) => (
            <ServiceRow key={svc.name || i} svc={svc} compact />
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
          Traefik
        </a>
        {data.version && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>v{data.version}</span>
        )}
        <div style={{ flex: 1 }} />
        {(data.providers || []).map(p => (
          <span key={p} style={{ fontSize: 9, color: providerColor(p), fontWeight: 600 }}>{p}</span>
        ))}
      </div>

      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        {data.httpRouters.total > 0 && (
          <SectionChip label="HTTP routes" section={data.httpRouters} />
        )}
        {data.tcpRouters.total > 0 && (
          <SectionChip label="TCP routes" section={data.tcpRouters} />
        )}
        {data.totalChecked > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
            background: 'var(--bg-surface)', borderRadius: 6, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)',
              letterSpacing: '0.04em', textTransform: 'uppercase' }}>Backends</span>
            <span style={{ fontSize: 10,
              color: downServices.length > 0 ? 'var(--red, #e53e3e)' : 'var(--green)',
              fontFamily: 'DM Mono, monospace' }}>
              {data.totalChecked - downServices.length}/{data.totalChecked} healthy
            </span>
          </div>
        )}
        {data.features?.metrics && (
          <span style={{ fontSize: 9, color: 'var(--text-dim)', alignSelf: 'center' }}>
            metrics: {data.features.metrics}
          </span>
        )}
      </div>

      {/* Two-column content */}
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
        {/* Services column */}
        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4,
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Services ({services.length})
          </div>
          {services.map((svc, i) => (
            <ServiceRow key={svc.name || i} svc={svc} compact={false} />
          ))}
        </div>

        {/* Routers column */}
        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4,
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Routes ({routers.length})
          </div>
          {routers.map((r, i) => (
            <RouterRow key={r.name || i} router={r} />
          ))}
        </div>
      </div>
    </div>
  )
}
