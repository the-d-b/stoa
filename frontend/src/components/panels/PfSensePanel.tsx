import { useEffect, useState } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface PfSenseIface {
  name: string
  descr: string
  status: string
  inMbps: number
  outMbps: number
}

interface PfSenseGateway {
  name: string
  status: string
  rtt: string
  loss: string
  interface: string
}

interface PfSenseData {
  uiUrl: string
  integrationId: string
  hostname: string
  version: string
  cpuUsage: number
  memUsage: number
  uptime: string
  interfaces: PfSenseIface[]
  gateways: PfSenseGateway[]
  statesCurrent: number
  statesLimit: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMbps(mbps: number): string {
  if (!mbps || mbps < 0.001) return '0 bps'
  if (mbps < 1) return `${(mbps * 1000).toFixed(0)} Kbps`
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`
  return `${mbps.toFixed(1)} Mbps`
}

function gatewayColor(status: string): string {
  if (status === 'online') return 'var(--green)'
  if (status === 'down') return 'var(--red, #e53e3e)'
  return 'var(--amber)'
}

function usagePct(pct: number): string {
  if (pct >= 90) return 'var(--red, #e53e3e)'
  if (pct >= 70) return 'var(--amber)'
  return 'var(--accent)'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color,
        borderRadius: 2, transition: 'width 0.4s ease' }} />
    </div>
  )
}

function UsageBar({ label, pct }: { label: string; pct: number }) {
  const color = usagePct(pct)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
      <span style={{ color: 'var(--text-dim)', width: 32, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, pct)}%`,
          background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ color, fontFamily: 'DM Mono, monospace', width: 34,
        textAlign: 'right', flexShrink: 0 }}>{pct.toFixed(0)}%</span>
    </div>
  )
}

function GatewayPill({ gw }: { gw: PfSenseGateway }) {
  const color = gatewayColor(gw.status)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10,
      background: 'var(--surface2)', borderRadius: 12, padding: '2px 8px', flexShrink: 0 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color,
        display: 'inline-block', flexShrink: 0 }} />
      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{gw.name}</span>
      {gw.rtt && <span style={{ color: 'var(--text-dim)' }}>{gw.rtt}</span>}
      {gw.loss && gw.loss !== '0.0 %' && gw.loss !== '0%' && (
        <span style={{ color: 'var(--amber)' }}>{gw.loss}</span>
      )}
    </div>
  )
}

function IfaceRow({ iface, maxMbps }: { iface: PfSenseIface; maxMbps: number }) {
  const isUp = iface.status === 'up'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 6,
      padding: '4px 0', borderBottom: '1px solid var(--border)', opacity: isUp ? 1 : 0.45 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {iface.descr}
        </div>
        <div style={{ fontSize: 9, color: isUp ? 'var(--green)' : 'var(--red, #e53e3e)',
          fontFamily: 'DM Mono, monospace' }}>
          {isUp ? '● up' : '○ down'}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center' }}>
        {/* Download */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: 'var(--accent)', width: 8, flexShrink: 0 }}>↓</span>
          <MiniBar value={iface.inMbps} max={maxMbps} color="var(--accent)" />
          <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace',
            width: 64, textAlign: 'right', flexShrink: 0 }}>{fmtMbps(iface.inMbps)}</span>
        </div>
        {/* Upload */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: 'var(--amber)', width: 8, flexShrink: 0 }}>↑</span>
          <MiniBar value={iface.outMbps} max={maxMbps} color="var(--amber)" />
          <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace',
            width: 64, textAlign: 'right', flexShrink: 0 }}>{fmtMbps(iface.outMbps)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function PfSensePanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<PfSenseData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined

  const sseData = useSSE<PfSenseData>(integrationId)
  useEffect(() => { if (sseData !== null) setData(sseData) }, [sseData])

  useEffect(() => {
    integrationsApi.getPanelData(panel.id)
      .then(r => { setData(r.data); setError('') })
      .catch(e => setError(e.response?.data?.error || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [panel.id])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)   return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 16,
    color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data)   return null

  const ifaces = (data.interfaces ?? []).filter(i => i.status === 'up')
  const allRates = ifaces.flatMap(i => [i.inMbps, i.outMbps])
  const maxMbps = Math.max(1, ...allRates) * 1.25

  // ── 1x — compact status bar ──────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10,
      height: '100%', overflow: 'hidden', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13 }}>🔒</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>
        {data.hostname || 'pfSense'}
      </span>
      {data.version && (
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>{data.version}</span>
      )}
      <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
        CPU <strong style={{ color: usagePct(data.cpuUsage) }}>{data.cpuUsage.toFixed(0)}%</strong>
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
        RAM <strong style={{ color: usagePct(data.memUsage) }}>{data.memUsage.toFixed(0)}%</strong>
      </span>
      {(data.gateways ?? []).map(gw => (
        <GatewayPill key={gw.name} gw={gw} />
      ))}
      {data.statesCurrent > 0 && (
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
          States: <strong style={{ color: 'var(--text)' }}>{data.statesCurrent.toLocaleString()}</strong>
        </span>
      )}
    </div>
  )

  // ── 2x-3x — system stats + gateways + interfaces ─────────────────────────
  if (heightUnits <= 3) return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          {data.hostname || 'pfSense'}
        </span>
        {data.version && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{data.version}</span>
        )}
        {data.uptime && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>
            up {data.uptime}
          </span>
        )}
      </div>

      {/* CPU + RAM */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <UsageBar label="CPU" pct={data.cpuUsage} />
        <UsageBar label="RAM" pct={data.memUsage} />
      </div>

      {/* Gateways */}
      {(data.gateways ?? []).length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
          {data.gateways.map(gw => <GatewayPill key={gw.name} gw={gw} />)}
        </div>
      )}

      {/* Interfaces */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {ifaces.map(iface => (
          <IfaceRow key={iface.name} iface={iface} maxMbps={maxMbps} />
        ))}
        {ifaces.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No active interfaces</div>
        )}
      </div>
    </div>
  )

  // ── 4x+ — full view with PF states ───────────────────────────────────────
  const statesPct = data.statesLimit > 0
    ? (data.statesCurrent / data.statesLimit) * 100
    : 0

  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          {data.hostname || 'pfSense'}
        </span>
        {data.version && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{data.version}</span>
        )}
        {data.uptime && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>
            up {data.uptime}
          </span>
        )}
      </div>

      {/* CPU + RAM */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <UsageBar label="CPU" pct={data.cpuUsage} />
        <UsageBar label="RAM" pct={data.memUsage} />
      </div>

      {/* Gateways */}
      {(data.gateways ?? []).length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
          {data.gateways.map(gw => <GatewayPill key={gw.name} gw={gw} />)}
        </div>
      )}

      {/* Interfaces */}
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {ifaces.map(iface => (
          <IfaceRow key={iface.name} iface={iface} maxMbps={maxMbps} />
        ))}
        {ifaces.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No active interfaces</div>
        )}
      </div>

      {/* PF States */}
      {data.statesLimit > 0 && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            fontSize: 10, color: 'var(--text-dim)', marginBottom: 3 }}>
            <span>PF States</span>
            <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>
              {data.statesCurrent.toLocaleString()} / {data.statesLimit.toLocaleString()}
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, statesPct)}%`,
              background: statesPct > 80 ? 'var(--amber)' : 'var(--accent)',
              borderRadius: 2, transition: 'width 0.4s ease' }} />
          </div>
        </div>
      )}
    </div>
  )
}
