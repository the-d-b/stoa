import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

interface NPMProxyHost {
  id: number
  domains: string[]
  forwardScheme: string
  forwardHost: string
  forwardPort: number
  enabled: boolean
  hasSSL: boolean
  sslForced: boolean
}

interface NPMCertificate {
  id: number
  niceName: string
  domains: string[]
  expiresOn: string
  daysLeft: number
  isExpired: boolean
  provider: string
}

interface NPMRedirectHost {
  id: number
  domains: string[]
  forwardUrl: string
  enabled: boolean
  hasSSL: boolean
}

interface NPMData {
  uiUrl: string
  integrationId: string
  proxyHosts: NPMProxyHost[]
  proxyTotal: number
  proxyEnabled: number
  proxyDisabled: number
  proxySSL: number
  redirectHosts: NPMRedirectHost[]
  redirectTotal: number
  redirectEnabled: number
  streamTotal: number
  streamEnabled: number
  certificates: NPMCertificate[]
  certTotal: number
  certExpiringSoon: number
  certExpired: number
  accessListTotal: number
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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

function EnabledDonut({ enabled, total, size = 80 }: { enabled: number; total: number; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size * 0.36
  const circ = 2 * Math.PI * r
  const pct = total > 0 ? enabled / total : 0
  const filled = circ * pct
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface2)" strokeWidth={size * 0.13} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#4ade80" strokeWidth={size * 0.13}
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - size * 0.05} textAnchor="middle" dominantBaseline="middle"
        fill="var(--text)" style={{ fontSize: size * 0.24, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
        {enabled}
      </text>
      <text x={cx} y={cy + size * 0.2} textAnchor="middle"
        fill="var(--text-dim)" style={{ fontSize: size * 0.12 }}>
        of {total}
      </text>
    </svg>
  )
}

function certColor(cert: NPMCertificate): string {
  if (cert.isExpired) return '#e53e3e'
  if (cert.daysLeft < 7) return '#f97316'
  if (cert.daysLeft < 30) return '#f59e0b'
  return '#4ade80'
}

function certLabel(cert: NPMCertificate): string {
  if (cert.isExpired) return 'EXPIRED'
  if (cert.daysLeft === 0) return 'Today'
  if (cert.daysLeft === 1) return '1 day'
  return `${cert.daysLeft}d`
}

function certDomain(cert: NPMCertificate): string {
  if (cert.domains && cert.domains.length > 0) return cert.domains[0]
  return cert.niceName || `Cert #${cert.id}`
}

function CertRow({ cert }: { cert: NPMCertificate }) {
  const color = certColor(cert)
  const domain = certDomain(cert)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: 'var(--text)' }} title={domain}>
        {domain}
      </div>
      {cert.provider === 'letsencrypt' && (
        <span style={{ fontSize: 9, color: '#22d3ee', fontWeight: 700, flexShrink: 0, letterSpacing: '0.04em' }}>LE</span>
      )}
      <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color,
        fontWeight: 600, flexShrink: 0, minWidth: 48, textAlign: 'right' }}>
        {certLabel(cert)}
      </span>
    </div>
  )
}

function HostRow({ host, compact = false }: { host: NPMProxyHost; compact?: boolean }) {
  const domain = host.domains && host.domains.length > 0 ? host.domains[0] : `Host #${host.id}`
  const target = `${host.forwardScheme || 'http'}://${host.forwardHost}:${host.forwardPort}`
  const dotColor = host.enabled ? '#4ade80' : 'var(--text-dim)'
  return (
    <div style={{ display: 'flex', alignItems: compact ? 'center' : 'flex-start', gap: 6, minWidth: 0 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0, marginTop: compact ? 0 : 3 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: host.enabled ? 'var(--text)' : 'var(--text-muted)' }} title={domain}>
          {domain}
        </div>
        {!compact && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {target}
          </div>
        )}
      </div>
      {host.hasSSL && (
        <span style={{ fontSize: 11, flexShrink: 0, color: '#22d3ee' }} title="SSL secured">🔒</span>
      )}
    </div>
  )
}

function RedirectRow({ host }: { host: NPMRedirectHost }) {
  const domain = host.domains && host.domains.length > 0 ? host.domains[0] : `Redirect #${host.id}`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: host.enabled ? '#a855f7' : 'var(--text-dim)' }} />
      <div style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: host.enabled ? 'var(--text)' : 'var(--text-muted)' }} title={`${domain} → ${host.forwardUrl}`}>
        {domain}
      </div>
      {host.hasSSL && <span style={{ fontSize: 10, color: '#22d3ee', flexShrink: 0 }}>🔒</span>}
    </div>
  )
}

function ColHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5, borderBottom: '1px solid var(--border)', paddingBottom: 3 }}>
      {children}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function NPMPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<NPMData | null>(null)
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
    proxyTotal, proxyEnabled, proxyDisabled, proxySSL,
    redirectTotal, redirectEnabled, streamTotal, streamEnabled, accessListTotal,
    certTotal, certExpiringSoon, certExpired,
    proxyHosts = [], certificates = [], redirectHosts = [],
  } = data

  const urgentCerts = certExpired + certExpiringSoon

  // ── 1× compact bar ──────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
          {proxyEnabled}/{proxyTotal} hosts
        </span>
        {proxySSL > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 12, color: '#22d3ee', fontFamily: 'DM Mono, monospace' }}>{proxySSL} SSL</span>
        </>}
        {certExpired > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 12, color: '#e53e3e', fontWeight: 600 }}>{certExpired} cert{certExpired !== 1 ? 's' : ''} EXPIRED</span>
        </>}
        {certExpiringSoon > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>{certExpiringSoon} expiring soon</span>
        </>}
        {redirectTotal > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
            {redirectEnabled}/{redirectTotal} redirects
          </span>
        </>}
      </div>
    )
  }

  // ── 2–3× medium ─────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Top: donut + stat chips */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <EnabledDonut enabled={proxyEnabled} total={proxyTotal} size={80} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
            <StatChip label="Enabled" value={proxyEnabled} color="#4ade80" />
            <StatChip label="Disabled" value={proxyDisabled} color={proxyDisabled > 0 ? 'var(--text-muted)' : undefined} />
            <StatChip label="SSL" value={proxySSL} color="#22d3ee" />
            {redirectTotal > 0 && <StatChip label="Redirects" value={`${redirectEnabled}/${redirectTotal}`} />}
            {streamTotal > 0 && <StatChip label="Streams" value={`${streamEnabled}/${streamTotal}`} />}
            {certExpired > 0 && (
              <StatChip label="Expired" value={certExpired} color="#e53e3e"
                bg="#e53e3e18" />
            )}
            {certExpiringSoon > 0 && !certExpired && (
              <StatChip label="Expiring" value={certExpiringSoon} color="#f59e0b"
                bg="#f59e0b12" />
            )}
          </div>
        </div>

        {/* Certificates (urgent ones highlighted) */}
        {certificates.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
              Certificates {urgentCerts > 0 && (
                <span style={{ color: urgentCerts > 0 && certExpired > 0 ? '#e53e3e' : '#f59e0b',
                  fontSize: 10 }}>
                  ⚠ {urgentCerts} need attention
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {certificates.slice(0, 6).map(cert => (
                <CertRow key={cert.id} cert={cert} />
              ))}
              {certificates.length > 6 && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', paddingLeft: 13 }}>
                  +{certificates.length - 6} more
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Top: donut + stat chips */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <EnabledDonut enabled={proxyEnabled} total={proxyTotal} size={80} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
          <StatChip label="Enabled" value={proxyEnabled} color="#4ade80" />
          <StatChip label="Disabled" value={proxyDisabled} color={proxyDisabled > 0 ? 'var(--text-muted)' : undefined} />
          <StatChip label="SSL" value={proxySSL} color="#22d3ee" />
          {redirectTotal > 0 && <StatChip label="Redirects" value={`${redirectEnabled}/${redirectTotal}`} />}
          {streamTotal > 0 && <StatChip label="Streams" value={`${streamEnabled}/${streamTotal}`} />}
          {accessListTotal > 0 && <StatChip label="Access Lists" value={accessListTotal} />}
          {certExpired > 0 && (
            <StatChip label="Expired" value={certExpired} color="#e53e3e" bg="#e53e3e18" />
          )}
          {certExpiringSoon > 0 && (
            <StatChip label="Expiring" value={certExpiringSoon}
              color={certExpired > 0 ? '#f97316' : '#f59e0b'}
              bg={certExpired > 0 ? '#f9731612' : '#f59e0b12'} />
          )}
        </div>
      </div>

      {/* Three-column detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>

        {/* Column 1: Proxy hosts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <ColHeader>Proxy Hosts ({proxyTotal})</ColHeader>
          {proxyHosts.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>None configured</div>
            : proxyHosts.map(host => <HostRow key={host.id} host={host} />)
          }
        </div>

        {/* Column 2: Certificates */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <ColHeader>
            Certificates ({certTotal})
            {urgentCerts > 0 && (
              <span style={{ marginLeft: 5, color: certExpired > 0 ? '#e53e3e' : '#f59e0b', fontWeight: 600 }}>
                ⚠
              </span>
            )}
          </ColHeader>
          {certificates.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>None configured</div>
            : certificates.map(cert => <CertRow key={cert.id} cert={cert} />)
          }
        </div>

        {/* Column 3: Redirects + other stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <ColHeader>Redirects ({redirectTotal})</ColHeader>
          {redirectHosts.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>None configured</div>
            : redirectHosts.map(rh => <RedirectRow key={rh.id} host={rh} />)
          }

          {/* Streams + Access Lists counts */}
          {(streamTotal > 0 || accessListTotal > 0) && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <ColHeader>Other</ColHeader>
              {streamTotal > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: streamEnabled > 0 ? '#a855f7' : 'var(--text-dim)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {streamEnabled}/{streamTotal} streams
                  </span>
                </div>
              )}
              {accessListTotal > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f97316', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {accessListTotal} access list{accessListTotal !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
