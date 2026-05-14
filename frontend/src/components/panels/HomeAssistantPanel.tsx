import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface HAEntity {
  entityId: string
  friendlyName: string
  domain: string
  deviceClass: string
  state: string
  unit: string
  lastChanged: string
}
interface HAData {
  uiUrl: string
  locationName: string
  version: string
  totalEntities: number
  entities: HAEntity[]
}

// ── Icon maps ─────────────────────────────────────────────────────────────────

const DEVICE_CLASS_ICON: Record<string, string> = {
  temperature: '🌡', humidity: '💧', battery: '🔋',
  power: '⚡', energy: '⚡', voltage: '⚡', current: '⚡',
  illuminance: '☀', motion: '👁', door: '🚪', window: '🪟',
  lock: '🔒', smoke: '🔥', gas: '⚠', moisture: '💧',
  pressure: '📊', co2: '💨', pm25: '🌫', connectivity: '🔗',
  plug: '🔌', carbon_monoxide: '⚠', cold: '🌡', heat: '🌡',
  problem: '⚠', safety: '🛡', tamper: '⚠', vibration: '📳',
  occupancy: '👁', presence: '👁', running: '⚡', opening: '🚪',
  garage_door: '🏠', moving: '↔',
}

const DOMAIN_ICON: Record<string, string> = {
  light: '💡', switch: '🔌', sensor: '📊', binary_sensor: '◉',
  climate: '🌡', lock: '🔒', cover: '🏠', media_player: '📺',
  camera: '📷', person: '👤', device_tracker: '📍',
  automation: '⚙', script: '▶', scene: '🎨',
  alarm_control_panel: '🔔', vacuum: '🤖', fan: '🌀',
  input_boolean: '◉', input_select: '☰', input_number: '🔢',
  weather: '🌤', sun: '☀', zone: '📍', group: '◈',
  update: '↑', button: '⏺',
}

function entityIcon(domain: string, deviceClass: string): string {
  if (deviceClass && DEVICE_CLASS_ICON[deviceClass]) return DEVICE_CLASS_ICON[deviceClass]
  return DOMAIN_ICON[domain] || '◉'
}

// ── State colour ──────────────────────────────────────────────────────────────

const ALERT_CLASSES = new Set(['smoke','gas','moisture','safety','tamper','vibration',
  'cold','heat','problem','carbon_monoxide'])
const PRESENCE_CLASSES = new Set(['motion','occupancy','presence','running'])
const OPENING_CLASSES = new Set(['door','window','garage_door','opening'])

function stateColor(domain: string, state: string, deviceClass: string): string {
  if (state === 'unavailable') return 'var(--red)'
  if (state === 'unknown')     return 'var(--text-dim)'

  switch (domain) {
    case 'light':
    case 'switch':
    case 'fan':
    case 'input_boolean':
      return state === 'on' ? 'var(--green)' : 'var(--text-dim)'

    case 'lock':
      if (state === 'locked')   return 'var(--green)'
      if (state === 'jammed')   return 'var(--red)'
      return 'var(--amber)' // unlocked

    case 'binary_sensor':
      if (ALERT_CLASSES.has(deviceClass))   return state === 'on' ? 'var(--red)'   : 'var(--text-dim)'
      if (PRESENCE_CLASSES.has(deviceClass)) return state === 'on' ? 'var(--amber)' : 'var(--text-dim)'
      if (OPENING_CLASSES.has(deviceClass))  return state === 'on' ? 'var(--amber)' : 'var(--text-dim)'
      return state === 'on' ? 'var(--amber)' : 'var(--text-dim)'

    case 'alarm_control_panel':
      if (state === 'disarmed') return 'var(--green)'
      if (state === 'triggered' || state === 'pending') return 'var(--red)'
      return 'var(--amber)' // armed_*

    case 'media_player':
      if (state === 'playing') return 'var(--green)'
      if (state === 'paused')  return 'var(--amber)'
      return 'var(--text-dim)'

    case 'vacuum':
      return state === 'cleaning' ? 'var(--green)' : 'var(--text-dim)'

    case 'cover':
      if (state === 'opening' || state === 'closing') return 'var(--accent)'
      return 'var(--text-muted)'

    case 'update':
      return state === 'on' ? 'var(--amber)' : 'var(--text-dim)'

    default:
      return 'var(--text-muted)'
  }
}

// ── State label ───────────────────────────────────────────────────────────────

function stateLabel(domain: string, state: string, deviceClass: string, unit: string): string {
  if (!state) return '—'
  if (unit)   return `${state} ${unit}`

  // Descriptive binary state overrides
  if (state === 'on' && domain === 'binary_sensor') {
    if (OPENING_CLASSES.has(deviceClass)) return 'Open'
    if (deviceClass === 'lock')           return 'Unlocked'
    if (PRESENCE_CLASSES.has(deviceClass)) return 'Active'
    if (deviceClass === 'smoke')          return 'Smoke'
    if (deviceClass === 'gas')            return 'Gas'
    if (deviceClass === 'moisture')       return 'Wet'
    if (deviceClass === 'carbon_monoxide') return 'CO'
    if (ALERT_CLASSES.has(deviceClass))   return 'Alert'
    return 'On'
  }
  if (state === 'off' && domain === 'binary_sensor') {
    if (OPENING_CLASSES.has(deviceClass)) return 'Closed'
    if (deviceClass === 'lock')           return 'Locked'
    if (PRESENCE_CLASSES.has(deviceClass)) return 'Clear'
    if (ALERT_CLASSES.has(deviceClass))   return 'OK'
    return 'Off'
  }

  // Capitalize and clean generic states
  switch (state) {
    case 'on':           return 'On'
    case 'off':          return 'Off'
    case 'locked':       return 'Locked'
    case 'unlocked':     return 'Unlocked'
    case 'jammed':       return 'Jammed'
    case 'open':         return 'Open'
    case 'closed':       return 'Closed'
    case 'opening':      return 'Opening'
    case 'closing':      return 'Closing'
    case 'unavailable':  return 'Unavailable'
    case 'unknown':      return 'Unknown'
    case 'playing':      return 'Playing'
    case 'paused':       return 'Paused'
    case 'idle':         return 'Idle'
    case 'standby':      return 'Standby'
    case 'cleaning':     return 'Cleaning'
    case 'docked':       return 'Docked'
    case 'disarmed':     return 'Disarmed'
    case 'armed_away':   return 'Armed Away'
    case 'armed_home':   return 'Armed Home'
    case 'armed_night':  return 'Armed Night'
    case 'triggered':    return 'Triggered'
    case 'home':         return 'Home'
    case 'not_home':     return 'Away'
    default:
      // Replace underscores, capitalize first letter
      return state.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
  }
}

// ── Entity row ────────────────────────────────────────────────────────────────

function EntityRow({ e, compact }: { e: HAEntity; compact?: boolean }) {
  const name = e.friendlyName || e.entityId.replace(/_/g, ' ')
  const icon = entityIcon(e.domain, e.deviceClass)
  const color = stateColor(e.domain, e.state, e.deviceClass)
  const label = stateLabel(e.domain, e.state, e.deviceClass, e.unit)
  const isUnavail = e.state === 'unavailable' || e.state === 'unknown'

  if (compact) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '3px 0',
        borderBottom: '1px solid var(--border)',
        minWidth: 0,
      }}>
        <span style={{ fontSize: 11, flexShrink: 0, width: 16, textAlign: 'center' }}>{icon}</span>
        <span style={{
          flex: 1, fontSize: 12, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: isUnavail ? 'var(--text-dim)' : 'var(--text)',
        }}>{name}</span>
        <span style={{
          fontSize: 11, fontFamily: 'DM Mono, monospace', fontWeight: 600,
          color, flexShrink: 0,
        }}>{label}</span>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 8px', borderRadius: 7,
      background: 'var(--surface2)', border: '1px solid var(--border)',
      margin: '3px 0', minWidth: 0,
    }}>
      <span style={{ fontSize: 14, flexShrink: 0, width: 20, textAlign: 'center' }}>{icon}</span>
      <span style={{
        flex: 1, fontSize: 12, fontWeight: 500,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: isUnavail ? 'var(--text-dim)' : 'var(--text)',
      }}>{name}</span>
      <span style={{
        fontSize: 12, fontFamily: 'DM Mono, monospace', fontWeight: 600,
        color, flexShrink: 0,
      }}>{label}</span>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function HomeAssistantPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData]       = useState<HAData | null>(null)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setData(res.data); setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  const sseData = useSSE<HAData>(integrationId)
  useEffect(() => {
    if (sseData !== null) setData(sseData)
  }, [sseData])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  )
  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12,
      color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  )
  if (!data) return null

  const uiUrl   = (data.uiUrl || '').replace(/\/$/, '')
  const entities = data.entities || []
  const hasFilter = !!(config.entityIds || config.domains)

  // Server header
  const ServerHeader = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexShrink: 0 }}>
      <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none',
          padding: '3px 8px', borderRadius: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11,
          color: 'inherit' }}
        onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
        onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
        <span style={{ color: 'var(--green)', fontSize: 9 }}>●</span>
        <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
          {data.locationName || 'Home Assistant'}
        </span>
        {data.version && (
          <span style={{ color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', fontSize: 10 }}>
            {data.version}
          </span>
        )}
      </a>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>
        {hasFilter
          ? `${entities.length} of ${data.totalEntities} entities`
          : `${data.totalEntities} entities`}
      </span>
    </div>
  )

  const noEntitiesMsg = hasFilter
    ? 'No entities match your filter — check entity IDs and domains in panel settings.'
    : 'No entities returned from Home Assistant.'

  // ── 1x: compact rows, no header ──────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ padding: '4px 12px', height: '100%', overflow: 'auto' }}>
      {entities.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-dim)', paddingTop: 4 }}>{noEntitiesMsg}</div>
        : entities.map(e => <EntityRow key={e.entityId} e={e} compact />)
      }
    </div>
  )

  // ── 2x+: server header + scrollable entity list ───────────────────────────
  return (
    <div style={{ padding: '10px 12px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column' }}>
      <ServerHeader />
      {entities.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', flex: 1,
          display: 'flex', alignItems: 'center' }}>{noEntitiesMsg}</div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {entities.map(e => <EntityRow key={e.entityId} e={e} compact={heightUnits <= 2} />)}
        </div>
      )}
    </div>
  )
}
