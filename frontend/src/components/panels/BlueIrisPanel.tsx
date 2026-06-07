import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BlueIrisCamera {
  shortName: string
  name: string
  fps: number
  width: number
  height: number
  isOnline: boolean
  isEnabled: boolean
  isRecording: boolean
  isMotion: boolean
  isAlerting: boolean
  isTriggered: boolean
  isPaused: boolean
  isNoSignal: boolean
  isGroup: boolean
  hasPtz: boolean
  hasAudio: boolean
  nClips: number
  nTriggers: number
  nAlerts: number
  nNoSignal: number
}

interface BlueIrisAlert {
  camera: string
  time: string
  path: string
  memo: string
  level: number
}

interface BlueIrisData {
  uiUrl: string
  integrationId: string
  systemName: string
  version: string
  signal: number       // 0=red, 1=green, 2=yellow
  activeProfile: number
  profiles: string[]
  isAdmin: boolean
  totalCameras: number
  onlineCameras: number
  recordingCameras: number
  alertingCameras: number
  cameras: BlueIrisCamera[]
  recentAlerts: BlueIrisAlert[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function signalColor(signal: number): string {
  switch (signal) {
    case 0: return '#e53e3e'  // red — problem
    case 2: return '#f59e0b'  // yellow — warning
    default: return '#4ade80' // green — ok
  }
}

function signalLabel(signal: number): string {
  switch (signal) {
    case 0: return 'Alert'
    case 2: return 'Warning'
    default: return 'OK'
  }
}

function cameraStatusColor(cam: BlueIrisCamera): string {
  if (cam.isAlerting || cam.isNoSignal) return '#e53e3e'
  if (!cam.isOnline || !cam.isEnabled) return '#6b7280'
  if (cam.isTriggered || cam.isMotion) return '#f59e0b'
  return '#4ade80'
}

function timeAgo(iso: string): string {
  if (!iso || iso.startsWith('1970')) return '—'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function fmtFps(fps: number): string {
  return fps > 0 ? `${fps.toFixed(0)} fps` : ''
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

function SignalLight({ signal, size = 14 }: { signal: number; size?: number }) {
  const color = signalColor(signal)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%', background: color,
        boxShadow: `0 0 ${size / 2}px ${color}88`, flexShrink: 0,
      }} />
      <span style={{ fontSize: 11, fontWeight: 600, color }}>{signalLabel(signal)}</span>
    </div>
  )
}

function CameraRow({ cam, showDetail }: { cam: BlueIrisCamera; showDetail?: boolean }) {
  const dotColor = cameraStatusColor(cam)
  const issueLabel = cam.isAlerting ? 'ALERT' : cam.isNoSignal ? 'NO SIGNAL' : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      <span style={{
        fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: cam.isEnabled && cam.isOnline ? 'var(--text)' : 'var(--text-dim)',
        fontStyle: cam.isEnabled ? 'normal' : 'italic',
      }}>
        {cam.name || cam.shortName}
      </span>

      {/* Status badges */}
      {issueLabel && (
        <span style={{
          fontSize: 9, fontWeight: 700, color: '#e53e3e', background: '#e53e3e22',
          borderRadius: 3, padding: '1px 4px', flexShrink: 0,
        }}>
          {issueLabel}
        </span>
      )}
      {cam.isRecording && !issueLabel && (
        <span style={{
          fontSize: 9, fontWeight: 700, color: '#e53e3e', background: '#e53e3e22',
          borderRadius: 3, padding: '1px 4px', flexShrink: 0,
        }}>
          REC
        </span>
      )}
      {cam.isPaused && (
        <span style={{
          fontSize: 9, fontWeight: 700, color: '#6b7280', background: 'rgba(255,255,255,0.06)',
          borderRadius: 3, padding: '1px 4px', flexShrink: 0,
        }}>
          PAUSED
        </span>
      )}

      {showDetail && cam.fps > 0 && (
        <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-dim)', flexShrink: 0 }}>
          {fmtFps(cam.fps)}
        </span>
      )}
    </div>
  )
}

function CameraDetailRow({ cam }: { cam: BlueIrisCamera }) {
  const dotColor = cameraStatusColor(cam)
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
        <span style={{
          fontSize: 12, fontWeight: 500, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: cam.isOnline && cam.isEnabled ? 'var(--text)' : 'var(--text-dim)',
        }}>
          {cam.name || cam.shortName}
        </span>
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          {cam.isAlerting && <Badge label="ALERT" color="#e53e3e" />}
          {cam.isNoSignal && <Badge label="NO SIG" color="#e53e3e" />}
          {cam.isRecording && !cam.isAlerting && <Badge label="REC" color="#e53e3e" />}
          {cam.isTriggered && !cam.isAlerting && <Badge label="TRIG" color="#f59e0b" />}
          {cam.isMotion && !cam.isTriggered && !cam.isAlerting && <Badge label="MOT" color="#f59e0b" />}
          {cam.isPaused && <Badge label="PAUSE" color="#6b7280" />}
          {cam.isGroup && <Badge label="GROUP" color="#38bdf8" />}
          {cam.hasPtz && <Badge label="PTZ" color="#a78bfa" />}
        </div>
      </div>
      <div style={{ marginLeft: 13, marginTop: 2, display: 'flex', gap: 10 }}>
        {cam.fps > 0 && (
          <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-dim)' }}>
            {fmtFps(cam.fps)}
          </span>
        )}
        {cam.width > 0 && (
          <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-dim)' }}>
            {cam.width}×{cam.height}
          </span>
        )}
        {cam.nTriggers > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            {cam.nTriggers} triggers
          </span>
        )}
        {cam.nClips > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            {cam.nClips} clips
          </span>
        )}
      </div>
    </div>
  )
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color, background: color + '22',
      borderRadius: 3, padding: '1px 4px',
    }}>
      {label}
    </span>
  )
}

function AlertRow({ alert }: { alert: BlueIrisAlert }) {
  const levelColor = alert.level >= 2 ? '#e53e3e' : alert.level === 1 ? '#f59e0b' : '#38bdf8'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>
        {timeAgo(alert.time)}
      </span>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: levelColor, flexShrink: 0 }} />
      <span style={{
        fontSize: 11, fontWeight: 500, color: 'var(--text)', flexShrink: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90,
      }}>
        {alert.camera}
      </span>
      {alert.memo && (
        <span style={{
          fontSize: 11, color: 'var(--text-dim)', flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {alert.memo}
        </span>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function BlueIrisPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<BlueIrisData | null>(null)
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

  const cameras = data.cameras || []
  const alerts = data.recentAlerts || []
  const profiles = data.profiles || []
  const activeName = data.activeProfile >= 0 && profiles[data.activeProfile]
    ? profiles[data.activeProfile]
    : data.activeProfile >= 0 ? `Profile ${data.activeProfile}` : null

  // ── 1× — signal + summary chips ───────────────────────────────────────────
  if (heightUnits <= 1) {
    return wrap(
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
          background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <SignalLight signal={data.signal} />
        </div>
        <StatChip label="Cameras" value={`${data.onlineCameras}/${data.totalCameras}`} color="#4ade80" />
        <StatChip label="Recording" value={data.recordingCameras} color="#e53e3e" />
        {data.alertingCameras > 0 && (
          <StatChip label="Alerting" value={data.alertingCameras} color="#e53e3e" />
        )}
        {activeName && <StatChip label="Profile" value={activeName} />}
        {data.version && <StatChip label="Version" value={data.version} />}
      </div>
    )
  }

  // ── 2–3× — signal + cameras + alerts ──────────────────────────────────────
  if (heightUnits <= 3) {
    return wrap(
      <>
        {/* Header */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
            background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <SignalLight signal={data.signal} />
            {activeName && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{activeName}</span>}
          </div>
          <StatChip label="Cameras" value={`${data.onlineCameras}/${data.totalCameras}`} color="#4ade80" />
          <StatChip label="Recording" value={data.recordingCameras} color="#e53e3e" />
          {data.version && <StatChip label="Version" value={data.version} />}
        </div>

        <div style={{ flex: 1, display: 'flex', gap: 14, overflow: 'hidden', minHeight: 0 }}>
          {/* Cameras */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <ColHeader>Cameras</ColHeader>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {cameras.map(cam => (
                <CameraRow key={cam.shortName} cam={cam} showDetail />
              ))}
            </div>
          </div>

          {/* Alerts */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <ColHeader>Recent Alerts</ColHeader>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {alerts.length === 0
                ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent alerts</div>
                : alerts.map((a, i) => <AlertRow key={i} alert={a} />)
              }
            </div>
          </div>
        </div>
      </>
    )
  }

  // ── 4×+ — three columns: system | cameras | alerts ────────────────────────
  return wrap(
    <>
      {/* Header */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px',
          background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <SignalLight signal={data.signal} size={16} />
          {activeName && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{activeName}</span>}
        </div>
        <StatChip label="Online" value={`${data.onlineCameras}/${data.totalCameras}`} color="#4ade80" />
        <StatChip label="Recording" value={data.recordingCameras} color="#e53e3e" />
        {data.alertingCameras > 0 && (
          <StatChip label="Alerting" value={data.alertingCameras} color="#e53e3e" />
        )}
        {data.version && <StatChip label="Version" value={data.version} />}
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 16, overflow: 'hidden', minHeight: 0 }}>

        {/* Col 1 — System info + Profiles */}
        <div style={{ width: 180, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ColHeader>System</ColHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {data.systemName && (
              <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{data.systemName}</div>
            )}
            {data.version && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>v{data.version}</div>
            )}
            {data.isAdmin && (
              <span style={{ fontSize: 10, fontWeight: 600, color: '#a78bfa', background: '#a78bfa22',
                borderRadius: 3, padding: '1px 6px', alignSelf: 'flex-start' }}>
                Admin
              </span>
            )}
          </div>

          {profiles.length > 0 && (
            <>
              <ColHeader>Profiles</ColHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflow: 'auto' }}>
                {profiles.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: i === data.activeProfile ? '#4ade80' : 'var(--text-dim)',
                    }} />
                    <span style={{
                      fontSize: 11, color: i === data.activeProfile ? 'var(--text)' : 'var(--text-dim)',
                      fontWeight: i === data.activeProfile ? 600 : 400,
                    }}>
                      {p}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Col 2 — Cameras */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ColHeader>Cameras</ColHeader>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {cameras.map(cam => (
              <CameraDetailRow key={cam.shortName} cam={cam} />
            ))}
          </div>
        </div>

        {/* Col 3 — Alerts */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ColHeader>Recent Alerts</ColHeader>
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {alerts.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent alerts</div>
              : alerts.map((a, i) => <AlertRow key={i} alert={a} />)
            }
          </div>
        </div>

      </div>
    </>
  )
}
