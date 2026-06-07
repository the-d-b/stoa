import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FrigateZone {
  name: string
  objects: string[]
}

interface FrigateCamera {
  name: string
  cameraFps: number
  detectionFps: number
  processFps: number
  skippedFps: number
  detectionEnabled: boolean
  zones: FrigateZone[]
}

interface FrigateDetector {
  name: string
  inferenceSpeed: number
}

interface FrigateEvent {
  id: string
  camera: string
  label: string
  zones: string[]
  startTime: string
  topScore: number
  hasClip: boolean
}

interface FrigateData {
  uiUrl: string
  integrationId: string
  version: string
  uptimeSecs: number
  totalCameras: number
  totalZones: number
  cameras: FrigateCamera[]
  detectors: FrigateDetector[]
  recentEvents: FrigateEvent[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function labelColor(label: string): string {
  switch (label?.toLowerCase()) {
    case 'person':     return '#38bdf8'
    case 'car':        return '#f59e0b'
    case 'dog':        return '#4ade80'
    case 'cat':        return '#f472b6'
    case 'truck':      return '#fb923c'
    case 'bicycle':    return '#a78bfa'
    case 'motorcycle': return '#e879f9'
    case 'bird':       return '#34d399'
    default:           return '#6b7280'
  }
}

function cameraHealthColor(cam: FrigateCamera): string {
  if (!cam.detectionEnabled) return '#6b7280'
  if (cam.cameraFps > 0 && cam.skippedFps / cam.cameraFps > 0.25) return '#f59e0b'
  return '#4ade80'
}

function detectorDisplayName(name: string): string {
  switch (name?.toLowerCase()) {
    case 'cpu':      return 'CPU'
    case 'coral':    return 'Coral TPU'
    case 'cuda':     return 'NVIDIA GPU'
    case 'rocm':     return 'AMD GPU'
    case 'hailo':    return 'Hailo'
    case 'openvino': return 'Intel OpenVINO'
    default:         return name ? name.charAt(0).toUpperCase() + name.slice(1) : name
  }
}

function scoreColor(score: number): string {
  if (score >= 0.85) return '#4ade80'
  if (score >= 0.70) return '#f59e0b'
  return '#6b7280'
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function fmtFps(n: number): string {
  return n > 0 ? n.toFixed(1) : '0'
}

function fmtUptime(secs: number): string {
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`
  return `${Math.floor(secs / 86400)}d`
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

function CameraDonut({ active, total, size = 80 }: { active: number; total: number; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size * 0.36
  const circ = 2 * Math.PI * r
  const pct = total > 0 ? active / total : 1
  const filled = circ * pct
  const color = pct === 1 ? '#4ade80' : pct >= 0.5 ? '#f59e0b' : '#e53e3e'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface2)" strokeWidth={size * 0.13} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={size * 0.13}
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - size * 0.05} textAnchor="middle" dominantBaseline="middle"
        fill="var(--text)" style={{ fontSize: size * 0.24, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
        {active}
      </text>
      <text x={cx} y={cy + size * 0.2} textAnchor="middle"
        fill="var(--text-dim)" style={{ fontSize: size * 0.12 }}>
        of {total}
      </text>
    </svg>
  )
}

function CameraRow({ cam, showFps }: { cam: FrigateCamera; showFps?: boolean }) {
  const dotColor = cameraHealthColor(cam)
  const skippedHigh = cam.cameraFps > 0 && cam.skippedFps / cam.cameraFps > 0.25
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      <span style={{
        fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: cam.detectionEnabled ? 'var(--text)' : 'var(--text-dim)',
        fontStyle: cam.detectionEnabled ? 'normal' : 'italic',
      }}>
        {cam.name}
      </span>
      {cam.zones.length > 0 && (
        <span style={{
          fontSize: 9, fontWeight: 600, color: '#38bdf8', background: '#38bdf822',
          borderRadius: 3, padding: '1px 4px', flexShrink: 0,
        }}>
          {cam.zones.length}Z
        </span>
      )}
      {showFps && (
        <span style={{
          fontSize: 10, fontFamily: 'DM Mono, monospace', flexShrink: 0,
          color: skippedHigh ? '#f59e0b' : 'var(--text-dim)',
        }}>
          {fmtFps(cam.detectionFps)} fps
        </span>
      )}
    </div>
  )
}

function EventRow({ event }: { event: FrigateEvent }) {
  const color = labelColor(event.label)
  const zone = event.zones?.[0]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>
        {timeAgo(event.startTime)}
      </span>
      <span style={{
        fontSize: 9, fontWeight: 700, color, background: color + '22',
        borderRadius: 3, padding: '1px 5px', flexShrink: 0, textTransform: 'capitalize',
      }}>
        {event.label}
      </span>
      <span style={{
        fontSize: 11, color: 'var(--text)', flex: 1,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {zone ? <><span style={{ color: 'var(--text-dim)' }}>{event.camera}</span> · {zone}</> : event.camera}
      </span>
      <span style={{
        fontSize: 10, fontFamily: 'DM Mono, monospace', color: scoreColor(event.topScore), flexShrink: 0,
      }}>
        {Math.round(event.topScore * 100)}%
      </span>
    </div>
  )
}

function ZoneBlock({ cam }: { cam: FrigateCamera }) {
  if (!cam.zones?.length) return null
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 3 }}>{cam.name}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {cam.zones.map(zone => (
          <div key={zone.name} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#38bdf8', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {zone.name.replace(/_/g, ' ')}
            </span>
            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
              {(zone.objects || []).map(obj => {
                const c = labelColor(obj)
                return (
                  <span key={obj} style={{
                    fontSize: 9, fontWeight: 600, color: c, background: c + '22',
                    borderRadius: 3, padding: '1px 4px', textTransform: 'capitalize',
                  }}>
                    {obj}
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DetectorRow({ det }: { det: FrigateDetector }) {
  const speedColor = det.inferenceSpeed < 10 ? '#4ade80' : det.inferenceSpeed < 30 ? '#f59e0b' : '#e53e3e'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: speedColor, flexShrink: 0 }} />
      <span style={{ fontSize: 12, flex: 1, color: 'var(--text)' }}>
        {detectorDisplayName(det.name)}
      </span>
      <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: speedColor, flexShrink: 0 }}>
        {det.inferenceSpeed.toFixed(1)}ms
      </span>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function FrigatePanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<FrigateData | null>(null)
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
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column', padding: '10px 14px',
      boxSizing: 'border-box', overflow: 'hidden',
    }}>
      {children}
    </div>
  )

  if (!integrationId) return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No integration configured.</div>)
  if (loading) return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>)
  if (error) return wrap(<div style={{ color: '#e53e3e', fontSize: 13 }}>{error}</div>)
  if (!data) return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No data.</div>)

  const activeCameras = data.cameras.filter(c => c.detectionEnabled).length
  const primaryDetector = data.detectors?.[0]
  const events = data.recentEvents || []
  const cameras = data.cameras || []

  // ── 1× — summary chips only ───────────────────────────────────────────────
  if (heightUnits <= 1) {
    return wrap(
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <StatChip label="Cameras" value={`${activeCameras}/${data.totalCameras}`} color="#4ade80" />
        <StatChip label="Zones" value={data.totalZones} color="#38bdf8" />
        {primaryDetector && (
          <StatChip label="Inference" value={`${primaryDetector.inferenceSpeed.toFixed(1)}ms`} color="#a78bfa" />
        )}
        <StatChip label="Events" value={events.length} />
        {data.version && (
          <StatChip label="Version" value={data.version} />
        )}
      </div>
    )
  }

  // ── 2–3× — cameras + events side by side ──────────────────────────────────
  if (heightUnits <= 3) {
    return wrap(
      <>
        {/* Summary row */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <StatChip label="Cameras" value={`${activeCameras}/${data.totalCameras}`} color="#4ade80" />
          <StatChip label="Zones" value={data.totalZones} color="#38bdf8" />
          {primaryDetector && (
            <StatChip label="Inference" value={`${primaryDetector.inferenceSpeed.toFixed(1)}ms`} color="#a78bfa" />
          )}
          {data.uptimeSecs > 0 && (
            <StatChip label="Uptime" value={fmtUptime(data.uptimeSecs)} />
          )}
        </div>

        {/* Two columns */}
        <div style={{ flex: 1, display: 'flex', gap: 14, overflow: 'hidden', minHeight: 0 }}>
          {/* Cameras */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <ColHeader>Cameras</ColHeader>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {cameras.map(cam => (
                <CameraRow key={cam.name} cam={cam} showFps />
              ))}
            </div>
          </div>

          {/* Events */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <ColHeader>Recent Events</ColHeader>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {events.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent events</div>
              ) : events.map(ev => (
                <EventRow key={ev.id} event={ev} />
              ))}
            </div>
          </div>
        </div>
      </>
    )
  }

  // ── 4×+ — three columns: cameras | zones | events + detectors ─────────────
  return wrap(
    <>
      {/* Summary */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <StatChip label="Cameras" value={`${activeCameras}/${data.totalCameras}`} color="#4ade80" />
        <StatChip label="Zones" value={data.totalZones} color="#38bdf8" />
        {primaryDetector && (
          <StatChip label="Inference" value={`${primaryDetector.inferenceSpeed.toFixed(1)}ms`} color="#a78bfa" />
        )}
        {data.uptimeSecs > 0 && (
          <StatChip label="Uptime" value={fmtUptime(data.uptimeSecs)} />
        )}
        {data.version && (
          <StatChip label="Version" value={data.version} />
        )}
      </div>

      {/* Three columns */}
      <div style={{ flex: 1, display: 'flex', gap: 16, overflow: 'hidden', minHeight: 0 }}>

        {/* Col 1 — Cameras */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ColHeader>Cameras</ColHeader>
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cameras.map(cam => (
              <div key={cam.name}>
                <CameraRow cam={cam} showFps />
                {cam.cameraFps > 0 && (
                  <div style={{ marginLeft: 13, marginTop: 2, display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-dim)' }}>
                      cam {fmtFps(cam.cameraFps)} fps
                    </span>
                    {cam.skippedFps > 0 && (
                      <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: '#f59e0b' }}>
                        skip {fmtFps(cam.skippedFps)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Detectors */}
          {data.detectors.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <ColHeader>Detectors</ColHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {data.detectors.map(det => (
                  <DetectorRow key={det.name} det={det} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Col 2 — Zones */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ColHeader>Zones</ColHeader>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {cameras.filter(c => c.zones?.length > 0).length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No zones configured</div>
            ) : cameras.filter(c => c.zones?.length > 0).map(cam => (
              <ZoneBlock key={cam.name} cam={cam} />
            ))}
          </div>
        </div>

        {/* Col 3 — Events */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ColHeader>Recent Events</ColHeader>
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {events.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent events</div>
            ) : events.map(ev => (
              <EventRow key={ev.id} event={ev} />
            ))}
          </div>
        </div>

      </div>
    </>
  )
}
