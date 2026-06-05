import { useEffect, useState } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface OpenWrtIface {
  name: string
  up: boolean
  inMbps: number
  outMbps: number
}

interface OpenWrtClient {
  mac: string
  signal: number  // dBm, negative
  device: string
  txRate: number  // Kbps
  rxRate: number  // Kbps
}

interface OpenWrtData {
  uiUrl: string
  integrationId: string
  hostname: string
  uptime: number       // seconds
  load1: number        // 1-min load average
  memTotal: number     // bytes
  memFree: number      // bytes
  memBuffered: number  // bytes
  interfaces: OpenWrtIface[]
  clients: OpenWrtClient[]
  clientCount: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUptime(secs: number): string {
  if (!secs) return ''
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtMbps(mbps: number): string {
  if (!mbps || mbps < 0.001) return '0 bps'
  if (mbps < 1) return `${(mbps * 1000).toFixed(0)} Kbps`
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`
  return `${mbps.toFixed(1)} Mbps`
}

function fmtRate(kbps: number): string {
  if (!kbps) return '—'
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(0)} Mbps`
  return `${kbps} Kbps`
}

function signalColor(dBm: number): string {
  if (dBm >= -60) return 'var(--green)'
  if (dBm >= -75) return 'var(--amber)'
  return 'var(--red, #e53e3e)'
}

function signalBars(dBm: number): number {
  if (dBm >= -55) return 4
  if (dBm >= -65) return 3
  if (dBm >= -75) return 2
  return 1
}

function loadColor(load: number): string {
  if (load >= 2) return 'var(--red, #e53e3e)'
  if (load >= 1) return 'var(--amber)'
  return 'var(--green)'
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

function SignalBars({ dBm }: { dBm: number }) {
  const filled = signalBars(dBm)
  const color = signalColor(dBm)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 12 }}>
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{
          width: 4,
          height: `${i * 25}%`,
          borderRadius: 1,
          background: i <= filled ? color : 'var(--border)',
        }} />
      ))}
    </div>
  )
}

function IfaceRow({ iface, maxMbps }: { iface: OpenWrtIface; maxMbps: number }) {
  if (!iface.up && iface.inMbps === 0 && iface.outMbps === 0) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 6,
      padding: '4px 0', borderBottom: '1px solid var(--border)', opacity: iface.up ? 1 : 0.4 }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {iface.name}
        </div>
        <div style={{ fontSize: 9, color: iface.up ? 'var(--green)' : 'var(--text-dim)',
          fontFamily: 'DM Mono, monospace' }}>
          {iface.up ? '● up' : '○ down'}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 9, color: 'var(--accent)', width: 8, flexShrink: 0 }}>↓</span>
          <MiniBar value={iface.inMbps} max={maxMbps} color="var(--accent)" />
          <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace',
            width: 60, textAlign: 'right', flexShrink: 0 }}>{fmtMbps(iface.inMbps)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 9, color: 'var(--amber)', width: 8, flexShrink: 0 }}>↑</span>
          <MiniBar value={iface.outMbps} max={maxMbps} color="var(--amber)" />
          <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace',
            width: 60, textAlign: 'right', flexShrink: 0 }}>{fmtMbps(iface.outMbps)}</span>
        </div>
      </div>
    </div>
  )
}

function ClientRow({ client }: { client: OpenWrtClient }) {
  const color = signalColor(client.signal)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8,
      padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
      <SignalBars dBm={client.signal} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--text)', fontFamily: 'DM Mono, monospace',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {client.mac}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>
          {client.device}
          {client.txRate > 0 && <span> · ↑{fmtRate(client.txRate)}</span>}
          {client.rxRate > 0 && <span> ↓{fmtRate(client.rxRate)}</span>}
        </div>
      </div>
      <span style={{ fontSize: 10, color, fontFamily: 'DM Mono, monospace',
        flexShrink: 0 }}>{client.signal} dBm</span>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function OpenWrtPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<OpenWrtData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined

  const sseData = useSSE<OpenWrtData>(integrationId)
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

  const ifaces = (data.interfaces ?? [])
  const allRates = ifaces.flatMap(i => [i.inMbps, i.outMbps])
  const maxMbps = Math.max(1, ...allRates) * 1.25
  const memUsedPct = data.memTotal > 0
    ? ((data.memTotal - data.memFree - data.memBuffered) / data.memTotal) * 100
    : 0

  // ── 1x — compact bar ────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10,
      height: '100%', overflow: 'hidden', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13 }}>🌐</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>
        {data.hostname || 'OpenWrt'}
      </span>
      {data.uptime > 0 && (
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
          up {fmtUptime(data.uptime)}
        </span>
      )}
      <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
        Load <strong style={{ color: loadColor(data.load1) }}>{data.load1.toFixed(2)}</strong>
      </span>
      {data.memTotal > 0 && (
        <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
          Mem <strong style={{ color: 'var(--text)' }}>{memUsedPct.toFixed(0)}%</strong>
        </span>
      )}
      {data.clientCount > 0 && (
        <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
          📶 <strong style={{ color: 'var(--text)' }}>{data.clientCount}</strong>
        </span>
      )}
    </div>
  )

  // ── 2x-3x — system + interfaces + client count ───────────────────────────
  if (heightUnits <= 3) return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          {data.hostname || 'OpenWrt'}
        </span>
        {data.uptime > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>
            up {fmtUptime(data.uptime)}
          </span>
        )}
      </div>

      {/* Load + Memory */}
      <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            fontSize: 10, color: 'var(--text-dim)', marginBottom: 3 }}>
            <span>Load</span>
            <span style={{ color: loadColor(data.load1), fontFamily: 'DM Mono, monospace' }}>
              {data.load1.toFixed(2)}
            </span>
          </div>
          <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, data.load1 * 50)}%`,
              background: loadColor(data.load1), borderRadius: 3, transition: 'width 0.4s ease' }} />
          </div>
        </div>
        {data.memTotal > 0 && (
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              fontSize: 10, color: 'var(--text-dim)', marginBottom: 3 }}>
              <span>Memory</span>
              <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>
                {memUsedPct.toFixed(0)}%
              </span>
            </div>
            <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, memUsedPct)}%`,
                background: memUsedPct > 85 ? 'var(--amber)' : 'var(--accent)',
                borderRadius: 3, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )}
      </div>

      {/* WiFi client badge */}
      {data.clientCount > 0 && (
        <div style={{ flexShrink: 0, fontSize: 11, color: 'var(--text-dim)' }}>
          📶 <strong style={{ color: 'var(--text)' }}>{data.clientCount}</strong> wireless client{data.clientCount !== 1 ? 's' : ''}
        </div>
      )}

      {/* Interfaces */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {ifaces.map(iface => (
          <IfaceRow key={iface.name} iface={iface} maxMbps={maxMbps} />
        ))}
      </div>
    </div>
  )

  // ── 4x+ — full view with WiFi client list ───────────────────────────────
  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          {data.hostname || 'OpenWrt'}
        </span>
        {data.uptime > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>
            up {fmtUptime(data.uptime)}
          </span>
        )}
      </div>

      {/* Load + Memory */}
      <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            fontSize: 10, color: 'var(--text-dim)', marginBottom: 3 }}>
            <span>Load</span>
            <span style={{ color: loadColor(data.load1), fontFamily: 'DM Mono, monospace' }}>
              {data.load1.toFixed(2)}
            </span>
          </div>
          <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, data.load1 * 50)}%`,
              background: loadColor(data.load1), borderRadius: 3, transition: 'width 0.4s ease' }} />
          </div>
        </div>
        {data.memTotal > 0 && (
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              fontSize: 10, color: 'var(--text-dim)', marginBottom: 3 }}>
              <span>Memory</span>
              <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>
                {memUsedPct.toFixed(0)}%
              </span>
            </div>
            <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, memUsedPct)}%`,
                background: memUsedPct > 85 ? 'var(--amber)' : 'var(--accent)',
                borderRadius: 3, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )}
      </div>

      {/* Interfaces */}
      <div style={{ flexShrink: 0 }}>
        {ifaces.slice(0, 4).map(iface => (
          <IfaceRow key={iface.name} iface={iface} maxMbps={maxMbps} />
        ))}
      </div>

      {/* WiFi clients */}
      {data.clients.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>
            📶 Wireless clients ({data.clientCount})
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {data.clients.map(c => (
              <ClientRow key={c.mac + c.device} client={c} />
            ))}
          </div>
        </div>
      )}

      {data.clients.length === 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center',
          fontSize: 11, color: 'var(--text-dim)' }}>
          No wireless clients — device may not have wireless or iwinfo is not installed
        </div>
      )}
    </div>
  )
}
