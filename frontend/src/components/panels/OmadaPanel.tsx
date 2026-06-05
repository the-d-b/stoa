import { useEffect, useState } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface OmadaDevice {
  name: string
  model: string
  type: number    // 1=AP, 2=GW, 3=Switch
  status: number  // 1=online, 0=offline
  clientCount: number
  upTime: number  // seconds
}

interface OmadaClient {
  name: string
  mac: string
  type: number    // 0=wireless, 1=wired
  band: string
  ssid: string
  signalLevel: number  // 0-4
  rxRate: number
  txRate: number
}

interface OmadaAlert {
  severity: string
  message: string
  deviceName: string
  timestamp: number
}

interface OmadaSite {
  siteId: string
  name: string
  deviceCount: number
  onlineDeviceCount: number
  apCount: number
  clientCount: number
  wiredClientCount: number
  wirelessClientCount: number
}

interface OmadaData {
  uiUrl: string
  integrationId: string
  sites: OmadaSite[]
  devices: OmadaDevice[]
  clients: OmadaClient[]
  alerts: OmadaAlert[]
  totalDevices: number
  onlineDevices: number
  totalClients: number
  wirelessClients: number
  wiredClients: number
  apCount: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deviceTypeLabel(type: number): string {
  if (type === 2) return 'GW'
  if (type === 1) return 'AP'
  if (type === 3) return 'SW'
  return '?'
}

function deviceTypeColor(type: number): string {
  if (type === 2) return 'var(--accent)'
  if (type === 1) return 'var(--green)'
  if (type === 3) return 'var(--amber)'
  return 'var(--text-dim)'
}

function fmtUptime(secs: number): string {
  if (!secs) return ''
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h`
  return `${Math.floor(secs / 60)}m`
}

function fmtRate(mbps: number): string {
  if (!mbps) return ''
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`
  return `${mbps.toFixed(0)} Mbps`
}

function alertSeverityColor(severity: string): string {
  const s = severity.toLowerCase()
  if (s === 'error' || s === 'critical') return 'var(--red, #e53e3e)'
  if (s === 'warning') return 'var(--amber)'
  return 'var(--text-dim)'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TypeSummaryBadge({ label, online, total, color }: {
  label: string; online: number; total: number; color: string
}) {
  const allOnline = online === total
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
      background: 'var(--bg-surface)', borderRadius: 6, border: '1px solid var(--border)' }}>
      <span style={{ fontSize: 9, fontWeight: 700, color, letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: 10, color: allOnline ? 'var(--green)' : 'var(--amber)',
        fontFamily: 'DM Mono, monospace' }}>
        {online}/{total}
      </span>
    </div>
  )
}

function DeviceRow({ device }: { device: OmadaDevice }) {
  const online = device.status === 1
  const typeColor = deviceTypeColor(device.type)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8,
      padding: '4px 0', borderBottom: '1px solid var(--border)',
      opacity: online ? 1 : 0.45 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: typeColor,
        width: 22, textAlign: 'center', flexShrink: 0 }}>
        {deviceTypeLabel(device.type)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {device.name || device.model || 'Unknown'}
        </div>
        {device.model && device.name && (
          <div style={{ fontSize: 9, color: 'var(--text-dim)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {device.model}
          </div>
        )}
      </div>
      {device.clientCount > 0 && (
        <span style={{ fontSize: 9, color: 'var(--text-dim)', flexShrink: 0 }}>
          {device.clientCount} cl
        </span>
      )}
      {device.upTime > 0 && online && (
        <span style={{ fontSize: 9, color: 'var(--text-dim)', flexShrink: 0,
          fontFamily: 'DM Mono, monospace' }}>
          {fmtUptime(device.upTime)}
        </span>
      )}
      <span style={{ fontSize: 9, color: online ? 'var(--green)' : 'var(--red, #e53e3e)',
        flexShrink: 0 }}>
        {online ? '●' : '○'}
      </span>
    </div>
  )
}

function SignalDots({ level }: { level: number }) {
  const color = level >= 3 ? 'var(--green)' : level >= 2 ? 'var(--amber)' : 'var(--red, #e53e3e)'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 10 }}>
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{ width: 3, height: `${i * 25}%`, borderRadius: 1,
          background: i <= level ? color : 'var(--border)' }} />
      ))}
    </div>
  )
}

function ClientRow({ client }: { client: OmadaClient }) {
  const isWireless = client.type === 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8,
      padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
      {isWireless
        ? <SignalDots level={client.signalLevel} />
        : <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 18 }}>🔌</span>
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {client.name || client.mac}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>
          {isWireless && client.ssid && <span>{client.ssid}</span>}
          {isWireless && client.band && <span> · {client.band}</span>}
          {client.txRate > 0 && <span> ↑{fmtRate(client.txRate)}</span>}
          {client.rxRate > 0 && <span> ↓{fmtRate(client.rxRate)}</span>}
        </div>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function OmadaPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<OmadaData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined

  const sseData = useSSE<OmadaData>(integrationId)
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

  const devices = data.devices ?? []
  const gateways = devices.filter(d => d.type === 2)
  const aps      = devices.filter(d => d.type === 1)
  const switches = devices.filter(d => d.type === 3)
  const onlineGWs  = gateways.filter(d => d.status === 1).length
  const onlineAPs  = aps.filter(d => d.status === 1).length
  const onlineSWs  = switches.filter(d => d.status === 1).length
  const alertCount = (data.alerts ?? []).length
  const multiSite  = (data.sites ?? []).length > 1
  const siteName   = data.sites?.[0]?.name ?? 'Omada'

  // ── 1x — compact bar ────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10,
      height: '100%', overflow: 'hidden', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13 }}>🌐</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>
        {multiSite ? 'Omada' : siteName}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
        <strong style={{ color: data.onlineDevices === data.totalDevices ? 'var(--green)' : 'var(--amber)' }}>
          {data.onlineDevices}
        </strong>/{data.totalDevices} online
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
        👥 <strong style={{ color: 'var(--text)' }}>{data.totalClients}</strong> clients
      </span>
      {data.wirelessClients > 0 && (
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
          📡 {data.wirelessClients} wifi
        </span>
      )}
      {alertCount > 0 && (
        <span style={{ fontSize: 10, color: 'var(--amber)', flexShrink: 0 }}>
          ⚠ {alertCount}
        </span>
      )}
    </div>
  )

  // ── 2x-3x — overview: device type counts + site list ─────────────────────
  if (heightUnits <= 3) return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          {multiSite ? 'Omada SDN' : siteName}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>
          👥 {data.totalClients} clients
        </span>
      </div>

      {/* Device type badges */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
        {gateways.length > 0 && (
          <TypeSummaryBadge label="GW" online={onlineGWs} total={gateways.length}
            color={deviceTypeColor(2)} />
        )}
        {aps.length > 0 && (
          <TypeSummaryBadge label="AP" online={onlineAPs} total={aps.length}
            color={deviceTypeColor(1)} />
        )}
        {switches.length > 0 && (
          <TypeSummaryBadge label="SW" online={onlineSWs} total={switches.length}
            color={deviceTypeColor(3)} />
        )}
        {alertCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
            background: 'var(--bg-surface)', borderRadius: 6,
            border: '1px solid var(--amber)' }}>
            <span style={{ fontSize: 9, color: 'var(--amber)' }}>⚠ {alertCount} alert{alertCount !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Wireless / wired split */}
      <div style={{ flexShrink: 0, display: 'flex', gap: 12, fontSize: 10, color: 'var(--text-dim)' }}>
        <span>📡 {data.wirelessClients} wireless</span>
        <span>🔌 {data.wiredClients} wired</span>
      </div>

      {/* Multi-site list */}
      {multiSite && (
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {data.sites.map(site => (
            <div key={site.siteId} style={{ display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 10 }}>
              <span style={{ color: 'var(--text)', flex: 1, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {site.name}
              </span>
              <span style={{ color: site.onlineDeviceCount === site.deviceCount
                ? 'var(--green)' : 'var(--amber)', fontFamily: 'DM Mono, monospace' }}>
                {site.onlineDeviceCount}/{site.deviceCount}
              </span>
              <span style={{ color: 'var(--text-dim)' }}>👥 {site.clientCount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ── 4x+ — full view: device list + client breakdown ───────────────────────
  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          {multiSite ? 'Omada SDN' : siteName}
        </span>
        {alertCount > 0 && (
          <span style={{ fontSize: 10, color: 'var(--amber)' }}>⚠ {alertCount}</span>
        )}
        <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>
          👥 {data.totalClients} clients
        </span>
      </div>

      {/* Device type badges */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
        {gateways.length > 0 && (
          <TypeSummaryBadge label="GW" online={onlineGWs} total={gateways.length}
            color={deviceTypeColor(2)} />
        )}
        {aps.length > 0 && (
          <TypeSummaryBadge label="AP" online={onlineAPs} total={aps.length}
            color={deviceTypeColor(1)} />
        )}
        {switches.length > 0 && (
          <TypeSummaryBadge label="SW" online={onlineSWs} total={switches.length}
            color={deviceTypeColor(3)} />
        )}
        <span style={{ fontSize: 10, color: 'var(--text-dim)', alignSelf: 'center', marginLeft: 4 }}>
          📡 {data.wirelessClients} · 🔌 {data.wiredClients}
        </span>
      </div>

      {/* Multi-site breakdown */}
      {multiSite && (
        <div style={{ flexShrink: 0 }}>
          {data.sites.map(site => (
            <div key={site.siteId} style={{ display: 'flex', alignItems: 'center', gap: 8,
              padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 10 }}>
              <span style={{ color: 'var(--text)', flex: 1, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {site.name}
              </span>
              <span style={{ color: site.onlineDeviceCount === site.deviceCount
                ? 'var(--green)' : 'var(--amber)', fontFamily: 'DM Mono, monospace' }}>
                {site.onlineDeviceCount}/{site.deviceCount}
              </span>
              <span style={{ color: 'var(--text-dim)' }}>👥 {site.clientCount}</span>
            </div>
          ))}
        </div>
      )}

      {/* Device list */}
      {devices.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>
            Devices ({data.onlineDevices}/{data.totalDevices} online)
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {devices.map((d, i) => (
              <DeviceRow key={d.name + i} device={d} />
            ))}
          </div>
        </div>
      )}

      {/* Client list */}
      {data.clients.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>
            Recent clients ({data.clients.length})
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {data.clients.map((c, i) => (
              <ClientRow key={c.mac + i} client={c} />
            ))}
          </div>
        </div>
      )}

      {/* Alerts */}
      {alertCount > 0 && (
        <div style={{ flexShrink: 0, maxHeight: 80, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 3 }}>
            Alerts
          </div>
          {data.alerts.map((a, i) => (
            <div key={i} style={{ fontSize: 10, color: alertSeverityColor(a.severity),
              padding: '2px 0', borderBottom: '1px solid var(--border)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.deviceName && <span style={{ fontWeight: 600 }}>{a.deviceName}: </span>}
              {a.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
