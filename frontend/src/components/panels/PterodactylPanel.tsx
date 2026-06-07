import { useState, useEffect } from 'react'
import { integrationsApi } from '../../api'

interface PterodactylServer {
  identifier: string
  name: string
  description: string
  state: string
  cpuPercent: number
  memoryMB: number
  memoryLimitMB: number
  diskMB: number
  diskLimitMB: number
  uptimeSecs: number
}

interface PterodactylData {
  servers: PterodactylServer[]
  totalCount: number
  runningCount: number
}

function stateColor(state: string) {
  switch (state) {
    case 'running': return '#22c55e'
    case 'starting': return '#f59e0b'
    case 'stopping': return '#f59e0b'
    case 'offline': return 'var(--text-dim)'
    default: return 'var(--text-dim)'
  }
}

function StateDot({ state }: { state: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: stateColor(state), flexShrink: 0,
      boxShadow: state === 'running' ? `0 0 5px ${stateColor(state)}` : 'none',
    }} />
  )
}

function UsageBar({ used, limit, color }: { used: number; limit: number; color: string }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  return (
    <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--surface2)', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
    </div>
  )
}

function fmtUptime(secs: number) {
  if (secs <= 0) return ''
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtMB(mb: number) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb} MB`
}

function ServerCard({ sv, compact }: { sv: PterodactylServer; compact?: boolean }) {
  const isRunning = sv.state === 'running'
  return (
    <div style={{
      background: 'var(--surface2)', borderRadius: 8, padding: compact ? '7px 10px' : '10px 12px',
      borderLeft: `3px solid ${stateColor(sv.state)}`,
      display: 'flex', flexDirection: 'column', gap: compact ? 5 : 7,
    }}>
      {/* Name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StateDot state={sv.state} />
        <span style={{ flex: 1, fontSize: compact ? 12 : 13, fontWeight: 600, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sv.name}</span>
        <span style={{ fontSize: 10, color: stateColor(sv.state), fontWeight: 600,
          textTransform: 'uppercase', flexShrink: 0 }}>{sv.state}</span>
      </div>

      {isRunning && (
        <>
          {/* CPU */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 28, flexShrink: 0 }}>CPU</span>
            <UsageBar used={sv.cpuPercent} limit={100} color="#6366f1" />
            <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 36, textAlign: 'right', flexShrink: 0 }}>
              {sv.cpuPercent.toFixed(1)}%
            </span>
          </div>
          {/* RAM */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 28, flexShrink: 0 }}>RAM</span>
            <UsageBar used={sv.memoryMB} limit={sv.memoryLimitMB} color="#22c55e" />
            <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 36, textAlign: 'right', flexShrink: 0 }}>
              {sv.memoryLimitMB > 0 ? `${fmtMB(sv.memoryMB)}/${fmtMB(sv.memoryLimitMB)}` : fmtMB(sv.memoryMB)}
            </span>
          </div>
          {/* Uptime */}
          {sv.uptimeSecs > 0 && !compact && (
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              Up {fmtUptime(sv.uptimeSecs)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ServerRow({ sv }: { sv: PterodactylServer }) {
  const isRunning = sv.state === 'running'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
      borderBottom: '1px solid var(--border)' }}>
      <StateDot state={sv.state} />
      <span style={{ flex: 1, fontSize: 12, color: 'var(--text)', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sv.name}</span>
      {isRunning && (
        <>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, width: 44, textAlign: 'right' }}>
            {sv.cpuPercent.toFixed(1)}%
          </span>
          <div style={{ width: 60, height: 4, borderRadius: 2, background: 'var(--surface2)', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ width: `${sv.memoryLimitMB > 0 ? Math.min(100, (sv.memoryMB / sv.memoryLimitMB) * 100) : 0}%`,
              height: '100%', background: '#22c55e', borderRadius: 2 }} />
          </div>
        </>
      )}
      {!isRunning && (
        <span style={{ fontSize: 10, color: stateColor(sv.state), textTransform: 'uppercase', flexShrink: 0 }}>
          {sv.state}
        </span>
      )}
    </div>
  )
}

export default function PterodactylPanel({ panel, heightUnits }: { panel: any; heightUnits: number }) {
  const [data, setData] = useState<PterodactylData | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    integrationsApi.getPanelData(panel.id)
      .then((r: any) => setData(r.data))
      .catch(() => setErr('Failed to load'))
  }, [panel.id])

  if (err) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>{err}</div>
  if (!data) return <div style={{ padding: 16 }}><span className="spinner" /></div>

  const servers = data.servers || []
  const running = servers.filter(s => s.state === 'running')

  // ── 1x ──────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', height: '100%' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', flexShrink: 0 }}>Pterodactyl</span>
        <span style={{ fontSize: 12, color: 'var(--text)' }}>
          <b style={{ color: '#22c55e' }}>{data.runningCount}</b>
          <span style={{ color: 'var(--text-muted)' }}>/{data.totalCount} running</span>
        </span>
        {/* Inline status dots */}
        <div style={{ display: 'flex', gap: 4, flex: 1, overflow: 'hidden' }}>
          {servers.slice(0, 12).map(s => (
            <span key={s.identifier} title={`${s.name} — ${s.state}`}>
              <StateDot state={s.state} />
            </span>
          ))}
        </div>
        {running.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
            {running[0].name} {running[0].cpuPercent.toFixed(1)}%
          </span>
        )}
      </div>
    )
  }

  // ── 2-3x ────────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
        padding: '10px 12px', gap: 8 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Pterodactyl</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            <span style={{ color: '#22c55e', fontWeight: 600 }}>{data.runningCount}</span>
            /{data.totalCount} servers running
          </span>
        </div>
        {/* Server list */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {servers.map(s => <ServerRow key={s.identifier} sv={s} />)}
        </div>
      </div>
    )
  }

  // ── 4x+ ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
      padding: '12px 14px', gap: 10 }}>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {[
          { label: 'Servers', value: data.totalCount.toString() },
          { label: 'Running', value: data.runningCount.toString(), accent: '#22c55e' },
          { label: 'Offline', value: (data.totalCount - data.runningCount).toString() },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 7,
            padding: '5px 12px', textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: s.accent || 'var(--text)' }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Server cards */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {servers.map(s => <ServerCard key={s.identifier} sv={s} compact={heightUnits <= 5} />)}
      </div>
    </div>
  )
}
