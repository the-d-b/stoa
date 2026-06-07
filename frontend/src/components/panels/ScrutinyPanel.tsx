import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

interface ScrutinyDevice {
  deviceName: string
  modelName: string
  deviceProtocol: string
  capacity: number
  rotationalSpeed: number
  status: 'passed' | 'warning' | 'failed' | 'unknown'
  temperature: number
  powerOnHours: number
  reallocSectors: number
  pendingSectors: number
  lastSeen: string
}

interface ScrutinyData {
  uiUrl: string
  integrationId: string
  totalDevices: number
  passedDevices: number
  warningDevices: number
  failedDevices: number
  avgTemp: number
  maxTemp: number
  devices: ScrutinyDevice[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCapacity(bytes: number): string {
  if (bytes <= 0) return '—'
  const tb = bytes / 1e12
  if (tb >= 1) return `${tb.toFixed(1)} TB`
  return `${(bytes / 1e9).toFixed(0)} GB`
}

function fmtHours(h: number): string {
  if (h <= 0) return '—'
  if (h < 24) return `${h}h`
  if (h < 720) return `${Math.floor(h / 24)}d`
  const years = Math.floor(h / 8760)
  const months = Math.floor((h % 8760) / 730)
  if (years > 0) return months > 0 ? `${years}y ${months}mo` : `${years}y`
  return `${Math.floor(h / 730)}mo`
}

function statusColor(status: string): string {
  switch (status) {
    case 'passed':  return '#4ade80'
    case 'warning': return '#f59e0b'
    case 'failed':  return '#e53e3e'
    default:        return '#6b7280'
  }
}

function tempColor(c: number): string {
  if (c >= 50) return '#e53e3e'
  if (c >= 40) return '#f59e0b'
  return '#4ade80'
}

function driveTypeLabel(dev: ScrutinyDevice): string {
  if (dev.deviceProtocol === 'NVME' || dev.deviceProtocol === 'NVMe') return 'NVMe'
  if (dev.rotationalSpeed === 0) return 'SSD'
  return 'HDD'
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
      background: 'var(--surface2)', border: '1px solid var(--border)', minWidth: 60,
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

// Multi-segment fleet health donut
function FleetDonut({ total, passed, warning, failed, size = 90 }: {
  total: number; passed: number; warning: number; failed: number; size?: number
}) {
  const cx = size / 2, cy = size / 2
  const r = size * 0.35
  const sw = size * 0.14
  const circ = 2 * Math.PI * r

  // Each segment: arc length + cumulative offset
  const segments: { arc: number; offset: number; color: string }[] = []
  const pushSeg = (count: number, color: string) => {
    const arc = total > 0 ? (count / total) * circ : 0
    const offset = segments.reduce((s, g) => s + g.arc, 0)
    if (arc > 0) segments.push({ arc, offset, color })
  }
  pushSeg(passed,  '#4ade80')
  pushSeg(warning, '#f59e0b')
  pushSeg(failed,  '#e53e3e')

  // If no data, show grey track
  const anyData = total > 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface2)" strokeWidth={sw} />
      {anyData && segments.map((s, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={sw}
          strokeDasharray={`${s.arc} ${circ}`}
          strokeDashoffset={circ - s.offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          strokeLinecap="butt" />
      ))}
      <text x={cx} y={cy - size * 0.06} textAnchor="middle" dominantBaseline="middle"
        fill="var(--text)" style={{ fontSize: size * 0.28, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
        {total}
      </text>
      <text x={cx} y={cy + size * 0.2} textAnchor="middle"
        fill="var(--text-dim)" style={{ fontSize: size * 0.13 }}>
        drives
      </text>
    </svg>
  )
}

function TempBar({ temp, maxDisplay = 60 }: { temp: number; maxDisplay?: number }) {
  if (temp <= 0) return <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>—</span>
  const pct = Math.min(temp / maxDisplay, 1)
  const color = tempColor(temp)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
      <div style={{ width: 40, height: 5, background: 'var(--surface2)', borderRadius: 3, flexShrink: 0 }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color, flexShrink: 0 }}>
        {temp}°C
      </span>
    </div>
  )
}

function DriveRow({ dev }: { dev: ScrutinyDevice }) {
  const dot = statusColor(dev.status)
  const type = driveTypeLabel(dev)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, padding: '3px 0',
      borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0,
        boxShadow: dev.status === 'passed' ? `0 0 4px ${dot}88` : 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 11, color: 'var(--text)', fontFamily: 'DM Mono, monospace' }}>
            {dev.deviceName || '—'}
          </span>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', background: 'var(--surface2)',
            borderRadius: 3, padding: '1px 4px' }}>
            {type}
          </span>
        </div>
        {dev.modelName && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {dev.modelName}
          </div>
        )}
      </div>
      <TempBar temp={dev.temperature} />
    </div>
  )
}

function DriveDetailRow({ dev }: { dev: ScrutinyDevice }) {
  const dot = statusColor(dev.status)
  const type = driveTypeLabel(dev)
  const hasWarning = dev.reallocSectors > 0 || dev.pendingSectors > 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, padding: '5px 0',
      borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: dot, flexShrink: 0,
        boxShadow: dev.status !== 'unknown' ? `0 0 5px ${dot}88` : 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
            {dev.deviceName || '—'}
          </span>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', background: 'var(--surface2)',
            borderRadius: 3, padding: '1px 4px' }}>
            {type}
          </span>
          {dev.capacity > 0 && (
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{fmtCapacity(dev.capacity)}</span>
          )}
          {hasWarning && (
            <span style={{ fontSize: 9, fontWeight: 600, color: '#f59e0b', background: '#f59e0b22',
              borderRadius: 3, padding: '1px 5px' }}>
              {dev.reallocSectors > 0 ? `${dev.reallocSectors} reallocated` : `${dev.pendingSectors} pending`}
            </span>
          )}
        </div>
        {dev.modelName && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>{dev.modelName}</div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
          <TempBar temp={dev.temperature} />
          {dev.powerOnHours > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
              {fmtHours(dev.powerOnHours)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ScrutinyPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<ScrutinyData | null>(null)
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

  const worstStatus = data.failedDevices > 0 ? 'failed' : data.warningDevices > 0 ? 'warning' : 'passed'

  // ── 1× ───────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return wrap(
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <StatChip label="Drives" value={data.totalDevices} />
        <StatChip label="Healthy" value={data.passedDevices} color="#4ade80" />
        {data.warningDevices > 0 && <StatChip label="Warning" value={data.warningDevices} color="#f59e0b" />}
        {data.failedDevices > 0 && <StatChip label="Failed" value={data.failedDevices} color="#e53e3e" />}
        {data.avgTemp > 0 && <StatChip label="Avg Temp" value={`${data.avgTemp}°C`} color={tempColor(data.avgTemp)} />}
        {data.maxTemp > 0 && <StatChip label="Max Temp" value={`${data.maxTemp}°C`} color={tempColor(data.maxTemp)} />}
      </div>
    )
  }

  // ── 2–3× ─────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return wrap(
      <>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <StatChip label="Healthy" value={data.passedDevices} color="#4ade80" />
          {data.warningDevices > 0 && <StatChip label="Warning" value={data.warningDevices} color="#f59e0b" />}
          {data.failedDevices > 0 && <StatChip label="Failed" value={data.failedDevices} color="#e53e3e" />}
          {data.avgTemp > 0 && <StatChip label="Avg" value={`${data.avgTemp}°C`} color={tempColor(data.avgTemp)} />}
          {data.maxTemp > 0 && <StatChip label="Max" value={`${data.maxTemp}°C`} color={tempColor(data.maxTemp)} />}
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {data.devices.map(d => <DriveRow key={d.deviceName} dev={d} />)}
        </div>
      </>
    )
  }

  // ── 4×+ — donut summary + full drive detail ───────────────────────────────
  return wrap(
    <>
      <div style={{ flex: 1, display: 'flex', gap: 16, overflow: 'hidden', minHeight: 0 }}>

        {/* Col 1 — Fleet summary */}
        <div style={{ width: 160, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden' }}>
          <FleetDonut
            total={data.totalDevices}
            passed={data.passedDevices}
            warning={data.warningDevices}
            failed={data.failedDevices}
            size={100}
          />
          <div style={{ marginTop: 10, width: '100%', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#4ade80' }}>Passed</span>
              <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{data.passedDevices}</span>
            </div>
            {data.warningDevices > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#f59e0b' }}>Warning</span>
                <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{data.warningDevices}</span>
              </div>
            )}
            {data.failedDevices > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#e53e3e' }}>Failed</span>
                <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{data.failedDevices}</span>
              </div>
            )}
            {data.avgTemp > 0 && (
              <>
                <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Avg temp</span>
                  <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: tempColor(data.avgTemp) }}>{data.avgTemp}°C</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Max temp</span>
                  <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: tempColor(data.maxTemp) }}>{data.maxTemp}°C</span>
                </div>
              </>
            )}
            {data.failedDevices === 0 && data.warningDevices === 0 && (
              <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: '#4ade80', textAlign: 'center' }}>
                All drives healthy
              </div>
            )}
            {(data.failedDevices > 0 || data.warningDevices > 0) && (
              <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600,
                color: statusColor(worstStatus), textAlign: 'center' }}>
                {data.failedDevices > 0 ? 'Action required' : 'Review recommended'}
              </div>
            )}
          </div>
        </div>

        {/* Col 2 — Drive detail list */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ColHeader>Drives ({data.totalDevices})</ColHeader>
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {data.devices.map(d => <DriveDetailRow key={d.deviceName} dev={d} />)}
          </div>
        </div>

      </div>
    </>
  )
}
