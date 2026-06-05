import { useEffect, useState } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

// ── Types ─────────────────────────────────────────────────────────────────────

interface UniFiRadio {
  band: string      // "2.4G", "5G", "6G"
  channel: number
  cu: number        // channel utilization %
  clients: number
  txBytes: number
  rxBytes: number
}

interface UniFiPort {
  idx: number
  name: string
  speed: number     // Mbps
  up: boolean
  poe: boolean
  poePower: number  // watts
  txBytes: number
  rxBytes: number
}

interface UniFiSpeedtest {
  dl: number    // Mbps
  ul: number    // Mbps
  at: number    // unix timestamp
}

interface UniFiWAN {
  name: string
  ip: string
  up: boolean
  type: string
  txMBs: number
  rxMBs: number
  latencyMs: number
  speedtest?: UniFiSpeedtest
}

interface UniFiDevice {
  mac: string
  name: string
  model: string
  type: string    // "ap", "sw", "gw"
  ip: string
  state: number   // 1=connected
  uptime: number
  version: string
  cpu: number
  mem: number
  clients: number
  txBytes: number
  rxBytes: number
  radios?: UniFiRadio[]
  ports?: UniFiPort[]
  wan?: UniFiWAN
  portsUp: number
  portsTotal: number
  totalPoE: number
}

interface UniFiClient {
  mac: string
  hostname: string
  ip: string
  wired: boolean
  guest: boolean
  band: string    // "2.4G", "5G", "6G" or "" for wired
  rssi: number
  satisfaction: number  // 0-100
  txRate: number  // Mbps
  rxRate: number  // Mbps
  uptime: number
  ssid: string
  apIp: string
}

interface UniFiEvent {
  key: string
  subsystem: string
  msg: string
  time: number
}

interface UniFiData {
  uiUrl: string
  integrationId: string
  siteName: string
  devices: UniFiDevice[]
  clients: UniFiClient[]
  events: UniFiEvent[]
  totalDevices: number
  onlineDevices: number
  apCount: number
  switchCount: number
  gwCount: number
  totalClients: number
  wiredClients: number
  wirelessClients: number
  guestClients: number
  wanUp: boolean
  wanIp: string
  wanLatencyMs: number
  speedtestDl: number
  speedtestUl: number
  speedtestAt: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUptime(secs: number): string {
  if (!secs) return ''
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h`
  return `${Math.floor(secs / 60)}m`
}

function fmtBytes(b: number): string {
  if (!b) return '0 B'
  if (b >= 1e12) return `${(b / 1e12).toFixed(1)} TB`
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`
  return `${(b / 1e3).toFixed(0)} KB`
}

function fmtMbps(mbps: number): string {
  if (!mbps) return ''
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`
  return `${mbps.toFixed(0)} Mbps`
}

function fmtSpeedDate(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function deviceTypeColor(type: string): string {
  if (type === 'gw') return 'var(--accent)'
  if (type === 'ap') return 'var(--green)'
  if (type === 'sw') return 'var(--amber)'
  return 'var(--text-dim)'
}

function deviceTypeLabel(type: string): string {
  if (type === 'gw') return 'GW'
  if (type === 'ap') return 'AP'
  if (type === 'sw') return 'SW'
  return '?'
}

function satisfactionColor(pct: number): string {
  if (pct >= 80) return 'var(--green)'
  if (pct >= 50) return 'var(--amber)'
  return 'var(--red, #e53e3e)'
}

function rssiColor(rssi: number): string {
  const abs = Math.abs(rssi)
  if (abs <= 67) return 'var(--green)'
  if (abs <= 80) return 'var(--amber)'
  return 'var(--red, #e53e3e)'
}

function eventSubsystemColor(sub: string): string {
  if (sub === 'wlan') return 'var(--accent)'
  if (sub === 'lan') return 'var(--green)'
  if (sub === 'wan') return 'var(--amber)'
  if (sub === 'nas') return 'var(--text-dim)'
  return 'var(--text-dim)'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TypeBadge({ label, online, total, color }: {
  label: string; online: number; total: number; color: string
}) {
  const allOnline = online >= total && total > 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
      background: 'var(--bg-surface)', borderRadius: 6, border: '1px solid var(--border)' }}>
      <span style={{ fontSize: 9, fontWeight: 700, color, letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: 10, color: total === 0 ? 'var(--text-dim)' : allOnline ? 'var(--green)' : 'var(--amber)',
        fontFamily: 'DM Mono, monospace' }}>
        {online}/{total}
      </span>
    </div>
  )
}

function UtilBar({ pct, color = 'var(--accent)' }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 3, background: 'var(--bg-surface)', borderRadius: 2, overflow: 'hidden', width: '100%' }}>
      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 2 }} />
    </div>
  )
}

function APRadioRow({ radio }: { radio: UniFiRadio }) {
  const cuColor = radio.cu > 80 ? 'var(--red, #e53e3e)' : radio.cu > 50 ? 'var(--amber)' : 'var(--green)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: 'var(--text-dim)' }}>
      <span style={{ color: 'var(--accent)', width: 26, flexShrink: 0, fontWeight: 600 }}>{radio.band}</span>
      <span style={{ flexShrink: 0 }}>ch {radio.channel}</span>
      <div style={{ flex: 1 }}>
        <UtilBar pct={radio.cu} color={cuColor} />
      </div>
      <span style={{ color: cuColor, width: 28, textAlign: 'right', flexShrink: 0 }}>{radio.cu}%</span>
      <span style={{ width: 22, textAlign: 'right', flexShrink: 0, color: 'var(--text)' }}>
        {radio.clients > 0 ? `${radio.clients}cl` : ''}
      </span>
    </div>
  )
}

function DeviceRow({ device }: { device: UniFiDevice }) {
  const online = device.state === 1
  const typeColor = deviceTypeColor(device.type)
  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', opacity: online ? 1 : 0.4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: typeColor,
          width: 22, textAlign: 'center', flexShrink: 0 }}>
          {deviceTypeLabel(device.type)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {device.name || device.model || device.mac}
          </div>
          {device.model && device.name && (
            <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{device.model}</div>
          )}
        </div>
        {device.type === 'ap' && device.clients > 0 && (
          <span style={{ fontSize: 9, color: 'var(--text-dim)', flexShrink: 0 }}>
            {device.clients} cl
          </span>
        )}
        {device.type === 'sw' && device.portsTotal > 0 && (
          <span style={{ fontSize: 9, color: 'var(--text-dim)', flexShrink: 0 }}>
            {device.portsUp}/{device.portsTotal}
          </span>
        )}
        {device.cpu > 0 && (
          <span style={{ fontSize: 9, color: 'var(--text-dim)', flexShrink: 0 }}>
            CPU {Math.round(device.cpu)}%
          </span>
        )}
        <span style={{ fontSize: 9, color: online ? 'var(--green)' : 'var(--text-dim)', flexShrink: 0 }}>
          {online ? fmtUptime(device.uptime) : 'down'}
        </span>
      </div>

      {/* AP: radio breakdown */}
      {device.type === 'ap' && device.radios && device.radios.length > 0 && (
        <div style={{ paddingLeft: 30, paddingTop: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {device.radios.map((r, i) => <APRadioRow key={i} radio={r} />)}
        </div>
      )}

      {/* Switch: PoE summary */}
      {device.type === 'sw' && device.totalPoE > 0 && (
        <div style={{ paddingLeft: 30, paddingTop: 2, fontSize: 9, color: 'var(--text-dim)' }}>
          PoE: {device.totalPoE.toFixed(1)} W
        </div>
      )}

      {/* Gateway: WAN info */}
      {device.type === 'gw' && device.wan && (
        <div style={{ paddingLeft: 30, paddingTop: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 9 }}>
            <span style={{ color: device.wan.up ? 'var(--green)' : 'var(--red, #e53e3e)' }}>
              {device.wan.up ? '▲' : '▼'} WAN
            </span>
            <span style={{ color: 'var(--text-dim)' }}>{device.wan.ip}</span>
            {device.wan.latencyMs > 0 && (
              <span style={{ color: 'var(--text-dim)' }}>{device.wan.latencyMs.toFixed(0)} ms</span>
            )}
          </div>
          {device.wan.speedtest && (
            <div style={{ display: 'flex', gap: 10, fontSize: 9, color: 'var(--text-dim)' }}>
              <span>↓ {fmtMbps(device.wan.speedtest.dl)}</span>
              <span>↑ {fmtMbps(device.wan.speedtest.ul)}</span>
              <span>{fmtSpeedDate(device.wan.speedtest.at)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ClientRow({ client }: { client: UniFiClient }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8,
      padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {client.hostname}
          {client.guest && (
            <span style={{ marginLeft: 4, fontSize: 8, color: 'var(--text-dim)',
              background: 'var(--bg-surface)', borderRadius: 3, padding: '0 3px' }}>
              guest
            </span>
          )}
        </div>
        {client.ip && (
          <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
            {client.ip}
          </div>
        )}
      </div>
      {client.wired ? (
        <span style={{ fontSize: 9, color: 'var(--text-dim)', flexShrink: 0 }}>wired</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, gap: 1 }}>
          <span style={{ fontSize: 9, color: 'var(--accent)' }}>{client.band}</span>
          {client.rssi !== 0 && (
            <span style={{ fontSize: 9, color: rssiColor(client.rssi) }}>{client.rssi} dBm</span>
          )}
        </div>
      )}
      {client.satisfaction > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: satisfactionColor(client.satisfaction),
            fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
            {client.satisfaction}%
          </span>
        </div>
      )}
    </div>
  )
}

function EventRow({ event }: { event: UniFiEvent }) {
  const d = new Date(event.time * 1000)
  const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const subColor = eventSubsystemColor(event.subsystem)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6,
      padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 8, color: subColor, fontWeight: 700,
        width: 26, flexShrink: 0, paddingTop: 1, textTransform: 'uppercase' }}>
        {event.subsystem || '?'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.msg}
        </div>
      </div>
      <span style={{ fontSize: 8, color: 'var(--text-dim)', flexShrink: 0, paddingTop: 1 }}>
        {timeStr}
      </span>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  panel: Panel
  heightUnits: number
}

export default function UniFiPanel({ panel, heightUnits }: Props) {
  const integrationId = panel.config?.integrationId as string | undefined
  const [data, setData] = useState<UniFiData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!integrationId) return
    integrationsApi.getPanelData(panel.id).then(d => {
      setData(d as UniFiData)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [panel.id, integrationId])

  useSSE<UniFiData>(integrationId, (d) => setData(d))

  const root: React.CSSProperties = {
    height: '100%',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
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
  const siteName = data.siteName || 'UniFi'

  // ── 1× compact summary bar ────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={root}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Title */}
          <a href={uiHref} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)',
              textDecoration: 'none', flexShrink: 0 }}>
            {siteName}
          </a>
          {/* WAN */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%',
              background: data.wanUp ? 'var(--green)' : 'var(--red, #e53e3e)' }} />
            {data.wanIp && (
              <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
                {data.wanIp}
              </span>
            )}
          </div>
          <div style={{ flex: 1 }} />
          {/* Device counts */}
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
            {data.onlineDevices}/{data.totalDevices} devices
          </span>
          {/* Client counts */}
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
            {data.totalClients} clients
          </span>
          {data.wanLatencyMs > 0 && (
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              {data.wanLatencyMs.toFixed(0)} ms
            </span>
          )}
        </div>
      </div>
    )
  }

  // ── 2–3× medium layout ────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    const onlineAPs = (data.devices || []).filter(d => d.type === 'ap' && d.state === 1).length
    const onlineSWs = (data.devices || []).filter(d => d.type === 'sw' && d.state === 1).length
    const onlineGWs = (data.devices || []).filter(d => d.type === 'gw' && d.state === 1).length
    const recentEvents = (data.events || []).slice(0, 6)

    return (
      <div style={root}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexShrink: 0 }}>
          <a href={uiHref} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>
            {siteName}
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%',
              background: data.wanUp ? 'var(--green)' : 'var(--red, #e53e3e)' }} />
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              {data.wanUp ? 'WAN up' : 'WAN down'}
            </span>
            {data.wanIp && (
              <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
                — {data.wanIp}
              </span>
            )}
          </div>
          <div style={{ flex: 1 }} />
          {data.wanLatencyMs > 0 && (
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              {data.wanLatencyMs.toFixed(0)} ms
            </span>
          )}
        </div>

        {/* Device type badges + client summary */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          {data.gwCount > 0 && <TypeBadge label="GW" online={onlineGWs} total={data.gwCount} color="var(--accent)" />}
          {data.apCount > 0 && <TypeBadge label="AP" online={onlineAPs} total={data.apCount} color="var(--green)" />}
          {data.switchCount > 0 && <TypeBadge label="SW" online={onlineSWs} total={data.switchCount} color="var(--amber)" />}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              ⊹ {data.wirelessClients} wireless
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              ⊷ {data.wiredClients} wired
            </span>
            {data.guestClients > 0 && (
              <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                {data.guestClients} guest
              </span>
            )}
          </div>
        </div>

        {/* Speedtest row if available */}
        {data.speedtestDl > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>↓</span>
              <span style={{ fontSize: 11, color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
                {data.speedtestDl.toFixed(0)}
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Mbps</span>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>↑</span>
              <span style={{ fontSize: 11, color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
                {data.speedtestUl.toFixed(0)}
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Mbps</span>
            </div>
            {data.speedtestAt > 0 && (
              <span style={{ fontSize: 9, color: 'var(--text-dim)', alignSelf: 'center' }}>
                {fmtSpeedDate(data.speedtestAt)}
              </span>
            )}
          </div>
        )}

        {/* Recent events */}
        {recentEvents.length > 0 && (
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4,
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Events
            </div>
            {recentEvents.map((ev, i) => <EventRow key={i} event={ev} />)}
          </div>
        )}
      </div>
    )
  }

  // ── 4×+ full layout ───────────────────────────────────────────────────────
  const onlineAPs = (data.devices || []).filter(d => d.type === 'ap' && d.state === 1).length
  const onlineSWs = (data.devices || []).filter(d => d.type === 'sw' && d.state === 1).length
  const onlineGWs = (data.devices || []).filter(d => d.type === 'gw' && d.state === 1).length

  // Visible clients cap for space
  const maxClients = heightUnits >= 8 ? 30 : 12

  return (
    <div style={root}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexShrink: 0 }}>
        <a href={uiHref} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>
          {siteName}
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%',
            background: data.wanUp ? 'var(--green)' : 'var(--red, #e53e3e)' }} />
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
            {data.wanUp ? 'WAN up' : 'WAN down'}
          </span>
          {data.wanIp && (
            <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
              — {data.wanIp}
            </span>
          )}
        </div>
        <div style={{ flex: 1 }} />
        {data.wanLatencyMs > 0 && (
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
            {data.wanLatencyMs.toFixed(0)} ms
          </span>
        )}
      </div>

      {/* Summary row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexShrink: 0 }}>
        {data.gwCount > 0 && <TypeBadge label="GW" online={onlineGWs} total={data.gwCount} color="var(--accent)" />}
        {data.apCount > 0 && <TypeBadge label="AP" online={onlineAPs} total={data.apCount} color="var(--green)" />}
        {data.switchCount > 0 && <TypeBadge label="SW" online={onlineSWs} total={data.switchCount} color="var(--amber)" />}
        <div style={{ flex: 1 }} />
        {data.speedtestDl > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              ↓ {data.speedtestDl.toFixed(0)} Mbps
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              ↑ {data.speedtestUl.toFixed(0)} Mbps
            </span>
          </div>
        )}
      </div>

      {/* Content split: devices left, clients+events right */}
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
        {/* Devices column */}
        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4,
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Devices ({data.onlineDevices}/{data.totalDevices})
          </div>
          {(data.devices || []).map((dev, i) => <DeviceRow key={dev.mac || i} device={dev} />)}
        </div>

        {/* Clients + Events column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, gap: 12 }}>
          {/* Clients */}
          <div style={{ flex: 2, overflowY: 'auto', minHeight: 0 }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4,
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Clients ({data.wirelessClients}⊹ {data.wiredClients}⊷
              {data.guestClients > 0 ? ` ${data.guestClients} guest` : ''})
            </div>
            {(data.clients || []).slice(0, maxClients).map((cl, i) => (
              <ClientRow key={cl.mac || i} client={cl} />
            ))}
            {data.totalClients > maxClients && (
              <div style={{ fontSize: 9, color: 'var(--text-dim)', padding: '4px 0' }}>
                +{data.totalClients - maxClients} more
              </div>
            )}
          </div>

          {/* Events */}
          {(data.events || []).length > 0 && (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4,
                textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Events
              </div>
              {(data.events || []).slice(0, 10).map((ev, i) => (
                <EventRow key={i} event={ev} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
