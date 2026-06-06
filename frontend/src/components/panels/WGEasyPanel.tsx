import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

interface WGEasyClient {
  id: string
  name: string
  address: string
  enabled: boolean
  connected: boolean
  lastHandshake: string
  lastHandshakeSecs: number // -1 = never
  transferRx: number
  transferTx: number
  endpoint: string
}

interface WGEasyData {
  uiUrl: string
  integrationId: string
  serverRunning: boolean
  serverAddress: string
  serverPort: number
  clients: WGEasyClient[]
  totalClients: number
  connectedClients: number
  enabledClients: number
  disabledClients: number
  totalRx: number
  totalTx: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (n <= 0) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function fmtAgo(secs: number): string {
  if (secs < 0) return 'Never'
  if (secs < 60) return 'Just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function clientDot(c: WGEasyClient): string {
  if (!c.enabled) return '#444'
  if (c.connected) return '#4ade80'
  return 'var(--text-dim)'
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

function ConnectedDonut({ connected, total, size = 80 }: { connected: number; total: number; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size * 0.36
  const circ = 2 * Math.PI * r
  const pct = total > 0 ? connected / total : 0
  const filled = circ * pct
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface2)" strokeWidth={size * 0.13} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#4ade80" strokeWidth={size * 0.13}
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - size * 0.05} textAnchor="middle" dominantBaseline="middle"
        fill="var(--text)" style={{ fontSize: size * 0.24, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
        {connected}
      </text>
      <text x={cx} y={cy + size * 0.2} textAnchor="middle"
        fill="var(--text-dim)" style={{ fontSize: size * 0.12 }}>
        of {total}
      </text>
    </svg>
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

function ClientRow({ client, showTransfer = true }: { client: WGEasyClient; showTransfer?: boolean }) {
  const dot = clientDot(client)
  const nameColor = client.enabled ? 'var(--text)' : 'var(--text-muted)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 12 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: nameColor }}>
        {client.name || client.id}
      </div>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
        {client.address}
      </div>
      {showTransfer && (
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, flexShrink: 0, color: 'var(--text-dim)' }}>
          <span style={{ color: '#22d3ee' }}>↑</span>{fmtBytes(client.transferTx)}
          {' '}
          <span style={{ color: '#a855f7' }}>↓</span>{fmtBytes(client.transferRx)}
        </div>
      )}
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text-dim)',
        flexShrink: 0, minWidth: 55, textAlign: 'right' }}>
        {fmtAgo(client.lastHandshakeSecs)}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function WGEasyPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<WGEasyData | null>(null)
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
    serverRunning, totalClients, connectedClients, enabledClients, disabledClients,
    totalRx, totalTx, clients = [],
  } = data

  const serverColor = serverRunning ? '#4ade80' : '#e53e3e'

  // ── 1× compact bar ──────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: serverColor, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
            {connectedClients}/{totalClients} connected
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>·</span>
        <span style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--text-dim)' }}>
          <span style={{ color: '#22d3ee' }}>↑</span>{fmtBytes(totalTx)}
          {' '}
          <span style={{ color: '#a855f7' }}>↓</span>{fmtBytes(totalRx)}
        </span>
      </div>
    )
  }

  // ── 2–3× medium ─────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Stat chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginRight: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: serverColor }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {serverRunning ? 'Running' : 'Stopped'}
            </span>
          </div>
          <StatChip label="Connected" value={connectedClients} color="#4ade80" />
          <StatChip label="Total" value={totalClients} />
          {disabledClients > 0 && <StatChip label="Disabled" value={disabledClients} color="var(--text-dim)" />}
          <StatChip label="↑ TX" value={fmtBytes(totalTx)} color="#22d3ee" />
          <StatChip label="↓ RX" value={fmtBytes(totalRx)} color="#a855f7" />
        </div>

        {/* Client list */}
        {clients.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <ColHeader>Clients ({totalClients})</ColHeader>
            {clients.slice(0, heightUnits <= 2 ? 4 : 8).map(c => (
              <ClientRow key={c.id} client={c} showTransfer={false} />
            ))}
            {clients.length > (heightUnits <= 2 ? 4 : 8) && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', paddingLeft: 13 }}>
                +{clients.length - (heightUnits <= 2 ? 4 : 8)} more
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── 4×+ full layout ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Top: donut + stat chips */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <ConnectedDonut connected={connectedClients} total={totalClients} size={80} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginRight: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: serverColor }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {serverRunning ? 'Running' : 'Stopped'}
            </span>
          </div>
          <StatChip label="Connected" value={connectedClients} color="#4ade80" />
          <StatChip label="Enabled" value={enabledClients} />
          <StatChip label="Disabled" value={disabledClients} color={disabledClients > 0 ? 'var(--text-dim)' : undefined} />
          <StatChip label="↑ TX" value={fmtBytes(totalTx)} color="#22d3ee" />
          <StatChip label="↓ RX" value={fmtBytes(totalRx)} color="#a855f7" />
        </div>
      </div>

      {/* Client table */}
      <div>
        <ColHeader>Clients ({totalClients})</ColHeader>
        {clients.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No clients configured</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Table header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10,
                color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.04em', paddingBottom: 3, borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 7, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>Name</div>
                <div style={{ fontFamily: 'DM Mono, monospace', width: 100, flexShrink: 0 }}>Address</div>
                <div style={{ fontFamily: 'DM Mono, monospace', width: 120, flexShrink: 0, textAlign: 'right' }}>Transfer ↑/↓</div>
                <div style={{ fontFamily: 'DM Mono, monospace', width: 60, flexShrink: 0, textAlign: 'right' }}>Last Seen</div>
              </div>
              {clients.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, minWidth: 0 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: clientDot(c), flexShrink: 0 }} />
                  <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: c.enabled ? 'var(--text)' : 'var(--text-muted)' }}>
                    {c.name || c.id}
                  </div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text-dim)',
                    width: 100, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.address}
                  </div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, width: 120, flexShrink: 0, textAlign: 'right' }}>
                    <span style={{ color: '#22d3ee' }}>↑</span>
                    <span style={{ color: 'var(--text-dim)' }}>{fmtBytes(c.transferTx)}</span>
                    {' '}
                    <span style={{ color: '#a855f7' }}>↓</span>
                    <span style={{ color: 'var(--text-dim)' }}>{fmtBytes(c.transferRx)}</span>
                  </div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text-dim)',
                    width: 60, flexShrink: 0, textAlign: 'right' }}>
                    {fmtAgo(c.lastHandshakeSecs)}
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  )
}
