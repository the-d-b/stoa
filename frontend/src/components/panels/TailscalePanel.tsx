import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

interface TailscaleDevice {
  id: string
  name: string
  hostname: string
  addresses: string[]
  user: string
  os: string
  clientVersion: string
  updateAvailable: boolean
  created: string
  lastSeen: string
  expires: string
  authorized: boolean
  isExternal: boolean
  tags: string[]
  keyExpiryDisabled: boolean
  blocksIncomingConnections: boolean
  connectedToControl: boolean
  advertisedRoutes: string[]
  enabledRoutes: string[]
  isOnline: boolean
  isExitNode: boolean
  isSubnetRouter: boolean
  expiringIn: number // days; -1 = never
  keyExpired: boolean
}

interface TailscaleKey {
  id: string
  description: string
  created: string
  expires: string
  reusable: boolean
  ephemeral: boolean
  expiringIn: number // days; -1 = never
  expired: boolean
}

interface TailscaleData {
  uiUrl: string
  integrationId: string
  devices: TailscaleDevice[]
  totalDevices: number
  onlineDevices: number
  offlineDevices: number
  updatesAvailable: number
  exitNodes: number
  subnetRouters: number
  unauthorizedDevices: number
  expiringDevices: number
  keys: TailscaleKey[]
  expiringKeys: number
  expiredKeys: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function osLabel(os: string): string {
  const map: Record<string, string> = {
    linux: 'Linux', darwin: 'macOS', windows: 'Windows',
    ios: 'iOS', android: 'Android', freebsd: 'FreeBSD', openbsd: 'OpenBSD',
  }
  return map[os?.toLowerCase()] || os || '?'
}

function tsIP(addresses: string[]): string {
  if (!addresses?.length) return ''
  return addresses.find(a => a.startsWith('100.')) || addresses[0] || ''
}

function fmtLastSeen(device: TailscaleDevice): string {
  if (device.isOnline) return 'Online'
  if (!device.lastSeen) return 'Unknown'
  const secs = Math.floor((Date.now() - new Date(device.lastSeen).getTime()) / 1000)
  if (secs < 0) return 'Online'
  if (secs < 60) return 'Just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function deviceDot(d: TailscaleDevice): string {
  if (!d.authorized) return '#e53e3e'
  if (d.isOnline) return '#4ade80'
  return 'var(--text-dim)'
}

function tagLabel(tag: string): string {
  return tag.startsWith('tag:') ? tag.slice(4) : tag
}

function subnetRoutes(d: TailscaleDevice): string[] {
  return (d.enabledRoutes || []).filter(r => r !== '0.0.0.0/0' && r !== '::/0')
}

function pendingRoutes(d: TailscaleDevice): string[] {
  const enabled = new Set(d.enabledRoutes || [])
  return (d.advertisedRoutes || []).filter(r => !enabled.has(r) && r !== '0.0.0.0/0' && r !== '::/0')
}

function keyLabel(k: TailscaleKey): string {
  return k.description || `…${k.id.slice(-6)}`
}

function fmtKeyExpiry(k: TailscaleKey): { text: string; color: string } {
  if (k.expired) return { text: 'Expired', color: '#e53e3e' }
  if (k.expiringIn < 0) return { text: 'No expiry', color: 'var(--text-dim)' }
  if (k.expiringIn <= 7) return { text: `${k.expiringIn}d`, color: '#e53e3e' }
  if (k.expiringIn <= 30) return { text: `${k.expiringIn}d`, color: '#f97316' }
  return { text: `${k.expiringIn}d`, color: 'var(--text-dim)' }
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

function OnlineDonut({ online, total, size = 80 }: { online: number; total: number; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size * 0.36
  const circ = 2 * Math.PI * r
  const pct = total > 0 ? online / total : 0
  const filled = circ * pct
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface2)" strokeWidth={size * 0.13} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#4ade80" strokeWidth={size * 0.13}
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - size * 0.05} textAnchor="middle" dominantBaseline="middle"
        fill="var(--text)" style={{ fontSize: size * 0.24, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
        {online}
      </text>
      <text x={cx} y={cy + size * 0.2} textAnchor="middle"
        fill="var(--text-dim)" style={{ fontSize: size * 0.12 }}>
        of {total}
      </text>
    </svg>
  )
}

function RoleBadge({ device }: { device: TailscaleDevice }) {
  if (device.isExitNode) return (
    <span style={{ fontSize: 9, fontWeight: 700, color: '#22d3ee',
      background: '#22d3ee18', borderRadius: 4, padding: '1px 5px',
      flexShrink: 0, letterSpacing: '0.04em' }}>EXIT</span>
  )
  if (device.isSubnetRouter) return (
    <span style={{ fontSize: 9, fontWeight: 700, color: '#a855f7',
      background: '#a855f718', borderRadius: 4, padding: '1px 5px',
      flexShrink: 0, letterSpacing: '0.04em' }}>SUBNET</span>
  )
  return null
}

function UpdateBadge() {
  return (
    <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b',
      background: '#f59e0b18', borderRadius: 4, padding: '1px 5px',
      flexShrink: 0, letterSpacing: '0.04em' }}>UPDATE</span>
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

function TagPill({ tag }: { tag: string }) {
  return (
    <span style={{ fontSize: 9, color: 'var(--text-dim)', background: 'var(--surface2)',
      border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px',
      whiteSpace: 'nowrap', flexShrink: 0 }}>
      {tagLabel(tag)}
    </span>
  )
}

function KeysSection({ keys }: { keys: TailscaleKey[] }) {
  if (!keys?.length) return null
  return (
    <div>
      <ColHeader>Auth Keys ({keys.length})</ColHeader>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {keys.map(k => {
          const expiry = fmtKeyExpiry(k)
          return (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, minWidth: 0 }}>
              <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: k.expired ? 'var(--text-dim)' : 'var(--text)' }}>
                {keyLabel(k)}
              </div>
              {k.reusable && (
                <span style={{ fontSize: 9, fontWeight: 700, color: '#a855f7',
                  background: '#a855f718', borderRadius: 4, padding: '1px 5px',
                  flexShrink: 0, letterSpacing: '0.04em' }}>REUSABLE</span>
              )}
              {k.ephemeral && (
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)',
                  background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4,
                  padding: '1px 5px', flexShrink: 0, letterSpacing: '0.04em' }}>EPHEMERAL</span>
              )}
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10,
                color: expiry.color, flexShrink: 0, minWidth: 55, textAlign: 'right' }}>
                {expiry.text}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function TailscalePanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<TailscaleData | null>(null)
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
    totalDevices, onlineDevices, offlineDevices,
    updatesAvailable, exitNodes, subnetRouters,
    unauthorizedDevices, expiringDevices, devices = [],
    keys = [], expiringKeys = 0, expiredKeys = 0,
  } = data

  // ── 1× compact bar ──────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: onlineDevices > 0 ? '#4ade80' : 'var(--text-dim)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
            {onlineDevices}/{totalDevices} online
          </span>
        </div>
        {updatesAvailable > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, fontFamily: 'DM Mono, monospace' }}>
            {updatesAvailable} update{updatesAvailable !== 1 ? 's' : ''}
          </span>
        </>}
        {unauthorizedDevices > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 12, color: '#e53e3e', fontWeight: 600 }}>
            {unauthorizedDevices} unauthorized
          </span>
        </>}
        {exitNodes > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 12, color: '#22d3ee', fontFamily: 'DM Mono, monospace' }}>
            {exitNodes} exit node{exitNodes !== 1 ? 's' : ''}
          </span>
        </>}
        {offlineDevices > 0 && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
            {offlineDevices} offline
          </span>
        </>}
        {(expiredKeys > 0 || expiringKeys > 0) && <>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: expiredKeys > 0 ? '#e53e3e' : '#f97316' }}>
            {expiredKeys > 0
              ? `${expiredKeys} key${expiredKeys !== 1 ? 's' : ''} expired`
              : `${expiringKeys} key${expiringKeys !== 1 ? 's' : ''} expiring`}
          </span>
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
          <OnlineDonut online={onlineDevices} total={totalDevices} size={80} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
            <StatChip label="Online" value={onlineDevices} color="#4ade80" />
            <StatChip label="Offline" value={offlineDevices} color={offlineDevices > 0 ? 'var(--text-muted)' : undefined} />
            {exitNodes > 0 && <StatChip label="Exit Nodes" value={exitNodes} color="#22d3ee" />}
            {subnetRouters > 0 && <StatChip label="Subnets" value={subnetRouters} color="#a855f7" />}
            {updatesAvailable > 0 && (
              <StatChip label="Updates" value={updatesAvailable} color="#f59e0b" bg="#f59e0b12" />
            )}
            {unauthorizedDevices > 0 && (
              <StatChip label="Unauth" value={unauthorizedDevices} color="#e53e3e" bg="#e53e3e18" />
            )}
            {expiringDevices > 0 && (
              <StatChip label="Expiring" value={expiringDevices} color="#f97316" bg="#f9731612" />
            )}
          </div>
        </div>

        {/* Device list */}
        {devices.length > 0 && (
          <div>
            <ColHeader>Devices ({totalDevices})</ColHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {devices.slice(0, heightUnits <= 2 ? 5 : 9).map(d => {
                const active = subnetRoutes(d)
                const pending = pendingRoutes(d)
                return (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, minWidth: 0 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: deviceDot(d), flexShrink: 0, alignSelf: 'flex-start', marginTop: 4 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                          color: d.isOnline ? 'var(--text)' : 'var(--text-muted)' }}>
                          {d.name || d.hostname}
                        </span>
                        <RoleBadge device={d} />
                        {d.updateAvailable && <UpdateBadge />}
                      </div>
                      {(active.length > 0 || pending.length > 0) && (
                        <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', marginTop: 1,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {active.length > 0 && (
                            <span style={{ color: 'var(--text-dim)' }}>{active.join(', ')}</span>
                          )}
                          {pending.length > 0 && (
                            <span style={{ color: '#f59e0b' }}>{active.length > 0 ? '  ' : ''}{pending.join(', ')} (pending)</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {devices.length > (heightUnits <= 2 ? 5 : 9) && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', paddingLeft: 13 }}>
                  +{devices.length - (heightUnits <= 2 ? 5 : 9)} more
                </div>
              )}
            </div>
          </div>
        )}
        <KeysSection keys={keys} />
      </div>
    )
  }

  // ── 4×+ full layout ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Donut + chips */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <OnlineDonut online={onlineDevices} total={totalDevices} size={80} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
          <StatChip label="Online" value={onlineDevices} color="#4ade80" />
          <StatChip label="Offline" value={offlineDevices} color={offlineDevices > 0 ? 'var(--text-muted)' : undefined} />
          <StatChip label="Total" value={totalDevices} />
          {exitNodes > 0 && <StatChip label="Exit Nodes" value={exitNodes} color="#22d3ee" />}
          {subnetRouters > 0 && <StatChip label="Subnets" value={subnetRouters} color="#a855f7" />}
          {updatesAvailable > 0 && (
            <StatChip label="Updates" value={updatesAvailable} color="#f59e0b" bg="#f59e0b12" />
          )}
          {unauthorizedDevices > 0 && (
            <StatChip label="Unauth" value={unauthorizedDevices} color="#e53e3e" bg="#e53e3e18" />
          )}
          {expiringDevices > 0 && (
            <StatChip label="Expiring" value={expiringDevices} color="#f97316" bg="#f9731612" />
          )}
        </div>
      </div>

      {/* Device table */}
      <div>
        <ColHeader>Devices ({totalDevices})</ColHeader>
        {devices.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No devices found</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {/* Table header */}
              <div style={{ display: 'grid',
                gridTemplateColumns: '10px 1fr 70px',
                gap: 8, alignItems: 'center', fontSize: 10,
                color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.04em', paddingBottom: 4,
                borderBottom: '1px solid var(--border)' }}>
                <div />
                <div>Name</div>
                <div style={{ textAlign: 'right' }}>Last Seen</div>
              </div>
              {devices.map(d => {
                const active = subnetRoutes(d)
                const pending = pendingRoutes(d)
                return (
                  <div key={d.id} style={{ display: 'grid',
                    gridTemplateColumns: '10px 1fr 70px',
                    gap: 8, alignItems: 'start', fontSize: 12, minWidth: 0 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%',
                      background: deviceDot(d), flexShrink: 0, marginTop: 3 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          color: d.isOnline ? 'var(--text)' : 'var(--text-muted)', flex: 1 }}>
                          {d.name || d.hostname}
                        </span>
                        <RoleBadge device={d} />
                        {d.updateAvailable && <UpdateBadge />}
                        {d.keyExpired && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#e53e3e',
                            background: '#e53e3e18', borderRadius: 4, padding: '1px 5px',
                            flexShrink: 0, letterSpacing: '0.04em' }}>EXPIRED</span>
                        )}
                        {!d.keyExpired && d.expiringIn >= 0 && d.expiringIn <= 30 && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#f97316',
                            background: '#f9731618', borderRadius: 4, padding: '1px 5px',
                            flexShrink: 0, letterSpacing: '0.04em' }}>{d.expiringIn}d</span>
                        )}
                      </div>
                      {(active.length > 0 || pending.length > 0) && (
                        <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', marginTop: 2,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {active.length > 0 && (
                            <span style={{ color: 'var(--text-dim)' }}>{active.join(', ')}</span>
                          )}
                          {pending.length > 0 && (
                            <span style={{ color: '#f59e0b' }}>{active.length > 0 ? '  ' : ''}{pending.join(', ')} (pending)</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10,
                      color: d.isOnline ? '#4ade80' : 'var(--text-dim)', textAlign: 'right', whiteSpace: 'nowrap', paddingTop: 2 }}>
                      {fmtLastSeen(d)}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        }
      </div>

      {/* Tags legend if any device has tags */}
      {devices.some(d => d.tags?.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginRight: 4 }}>Tags:</span>
          {Array.from(new Set(devices.flatMap(d => d.tags || []))).map(tag => (
            <TagPill key={tag} tag={tag} />
          ))}
        </div>
      )}

      <KeysSection keys={keys} />
    </div>
  )
}
