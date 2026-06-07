import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

interface NetbirdPeer {
  id: string
  name: string
  ip: string
  os: string
  version: string
  connected: boolean
  lastSeen: string
  sshEnabled: boolean
  groups: string[]
  loginExpired: boolean
}

interface NetbirdGroup {
  id: string
  name: string
  peersCount: number
}

interface NetbirdPolicy {
  id: string
  name: string
  enabled: boolean
}

interface NetbirdData {
  uiUrl: string
  integrationId: string
  totalPeers: number
  onlinePeers: number
  offlinePeers: number
  expiredPeers: number
  totalGroups: number
  totalPolicies: number
  activePolicies: number
  peers: NetbirdPeer[]
  groups: NetbirdGroup[]
  policies: NetbirdPolicy[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return `${Math.round(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function osIcon(os: string): string {
  const l = os.toLowerCase()
  if (l.includes('linux')) return 'Linux'
  if (l.includes('windows')) return 'Win'
  if (l.includes('darwin') || l.includes('mac')) return 'Mac'
  if (l.includes('android')) return 'Android'
  if (l.includes('ios')) return 'iOS'
  return os || '—'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ColHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.05em',
      marginBottom: 5, borderBottom: '1px solid var(--border)', paddingBottom: 3,
    }}>
      {children}
    </div>
  )
}

function StatChip({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '5px 12px', borderRadius: 8,
      background: 'var(--surface2)', border: '1px solid var(--border)', minWidth: 64,
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

function PeerDot({ connected, expired }: { connected: boolean; expired: boolean }) {
  const color = expired ? '#f59e0b' : connected ? '#4ade80' : '#6b7280'
  return (
    <div style={{
      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
      background: color,
      boxShadow: connected && !expired ? `0 0 5px ${color}88` : 'none',
    }} />
  )
}

function PeerRow({ peer }: { peer: NetbirdPeer }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, padding: '3px 0' }}>
      <PeerDot connected={peer.connected} expired={peer.loginExpired} />
      <div style={{ flex: 1, fontSize: 11, color: 'var(--text)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {peer.name}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>
        {peer.ip}
      </div>
    </div>
  )
}

function PeerDetailRow({ peer }: { peer: NetbirdPeer }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, padding: '3px 0',
      borderBottom: '1px solid var(--border)' }}>
      <PeerDot connected={peer.connected} expired={peer.loginExpired} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {peer.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', display: 'flex', gap: 8 }}>
          <span style={{ fontFamily: 'DM Mono, monospace' }}>{peer.ip}</span>
          <span>{osIcon(peer.os)}</span>
          {!peer.connected && <span>{timeAgo(peer.lastSeen)}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {peer.loginExpired && (
          <span style={{ fontSize: 9, fontWeight: 600, color: '#f59e0b', background: '#f59e0b22',
            borderRadius: 3, padding: '1px 5px' }}>EXPIRED</span>
        )}
        {peer.sshEnabled && (
          <span style={{ fontSize: 9, fontWeight: 600, color: '#38bdf8', background: '#38bdf822',
            borderRadius: 3, padding: '1px 5px' }}>SSH</span>
        )}
      </div>
    </div>
  )
}

function GroupRow({ group }: { group: NetbirdGroup }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {group.name}
      </span>
      <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-dim)', flexShrink: 0 }}>
        {group.peersCount}
      </span>
    </div>
  )
}

function PolicyRow({ policy }: { policy: NetbirdPolicy }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: policy.enabled ? '#4ade80' : '#6b7280' }} />
      <span style={{ fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {policy.name}
      </span>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function NetbirdPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<NetbirdData | null>(null)
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

  const wrap = (children: React.ReactNode) => (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '10px 14px', boxSizing: 'border-box', overflow: 'hidden' }}>
      {children}
    </div>
  )

  if (!integrationId) return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No integration configured.</div>)
  if (loading) return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>)
  if (error) return wrap(<div style={{ color: '#e53e3e', fontSize: 13 }}>{error}</div>)
  if (!data) return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No data.</div>)

  // ── 1× ───────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return wrap(
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <StatChip label="Online" value={data.onlinePeers} color="#4ade80" />
        <StatChip label="Offline" value={data.offlinePeers} color="#6b7280" />
        <StatChip label="Total" value={data.totalPeers} />
        {data.expiredPeers > 0 && <StatChip label="Expired" value={data.expiredPeers} color="#f59e0b" />}
        <StatChip label="Groups" value={data.totalGroups} />
        <StatChip label="Policies" value={`${data.activePolicies}/${data.totalPolicies}`} />
      </div>
    )
  }

  // ── 2–3× ─────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return wrap(
      <>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <StatChip label="Online" value={data.onlinePeers} color="#4ade80" />
          <StatChip label="Offline" value={data.offlinePeers} color="#6b7280" />
          {data.expiredPeers > 0 && <StatChip label="Expired" value={data.expiredPeers} color="#f59e0b" />}
          <StatChip label="Groups" value={data.totalGroups} />
          <StatChip label="Policies" value={`${data.activePolicies}/${data.totalPolicies}`} />
        </div>
        <div style={{ flex: 1, display: 'flex', gap: 14, overflow: 'hidden', minHeight: 0 }}>
          <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
            <ColHeader>Peers</ColHeader>
            <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 1 }}>
              {data.peers.map(p => <PeerRow key={p.id} peer={p} />)}
            </div>
          </div>
          {data.groups.length > 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden' }}>
              <ColHeader>Groups</ColHeader>
              {data.groups.map(g => <GroupRow key={g.id} group={g} />)}
            </div>
          )}
        </div>
      </>
    )
  }

  // ── 4×+ — three columns ───────────────────────────────────────────────────
  return wrap(
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <StatChip label="Online" value={data.onlinePeers} color="#4ade80" />
        <StatChip label="Offline" value={data.offlinePeers} color="#6b7280" />
        {data.expiredPeers > 0 && <StatChip label="Expired" value={data.expiredPeers} color="#f59e0b" />}
        <StatChip label="Groups" value={data.totalGroups} />
        <StatChip label="Policies" value={`${data.activePolicies}/${data.totalPolicies}`} />
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 16, overflow: 'hidden', minHeight: 0 }}>

        {/* Col 1 — Peer list */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ColHeader>Peers ({data.totalPeers})</ColHeader>
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {data.peers.map(p => <PeerDetailRow key={p.id} peer={p} />)}
          </div>
        </div>

        {/* Col 2 — Groups */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ColHeader>Groups</ColHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
            {data.groups.map(g => <GroupRow key={g.id} group={g} />)}
          </div>

          {data.policies.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <ColHeader>Policies</ColHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden' }}>
                {data.policies.map(p => <PolicyRow key={p.id} policy={p} />)}
              </div>
            </div>
          )}
        </div>

      </div>
    </>
  )
}
