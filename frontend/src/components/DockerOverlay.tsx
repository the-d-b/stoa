import { useState, useEffect, useCallback } from 'react'
import { dockerApi, DockerHostData, DockerContainer } from '../api'

interface Props {
  open: boolean
  onClose: () => void
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const STATE_COLORS: Record<string, string> = {
  running: 'var(--green)',
  exited:  'var(--red)',
  dead:    'var(--red)',
  restarting: 'var(--amber)',
  paused:  'var(--text-dim)',
  created: 'var(--text-dim)',
}

function StateBadge({ state }: { state: string }) {
  const color = STATE_COLORS[state] || 'var(--text-dim)'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11,
      padding: '2px 7px', borderRadius: 10, background: color + '18',
      color, fontWeight: 500, textTransform: 'capitalize',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {state}
    </span>
  )
}

function ContainerRow({ c, hostId, onAction }: {
  c: DockerContainer
  hostId: string
  onAction: (hostId: string, cId: string, action: 'start' | 'stop' | 'restart') => Promise<void>
}) {
  const [acting, setActing] = useState<string | null>(null)

  const doAction = async (action: 'start' | 'stop' | 'restart') => {
    setActing(action)
    try { await onAction(hostId, c.id, action) }
    finally { setActing(null) }
  }

  const isRunning = c.state === 'running'

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 90px 110px 110px 110px',
      alignItems: 'center', gap: 10,
      padding: '9px 14px', borderBottom: '1px solid var(--border)',
      fontSize: 13,
    }}>
      {/* Name + image */}
      <div style={{ overflow: 'hidden' }}>
        <div style={{ fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{c.image}</div>
      </div>

      {/* Status */}
      <div style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.status}</div>

      {/* State badge */}
      <div><StateBadge state={c.state} /></div>

      {/* CPU */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
        {isRunning ? `${c.cpu.toFixed(1)}%` : '—'}
      </div>

      {/* Memory */}
      <div>
        {isRunning && c.memLimit > 0 ? (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3,
              fontFamily: 'DM Mono, monospace' }}>
              {formatBytes(c.memUsed)} / {formatBytes(c.memLimit)}
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden', width: 90 }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${Math.min(c.memPct, 100)}%`,
                background: c.memPct > 80 ? 'var(--red)' : c.memPct > 60 ? 'var(--amber)' : 'var(--accent)',
              }} />
            </div>
          </div>
        ) : <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</span>}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
        {!isRunning && (
          <button className="btn btn-sm" onClick={() => doAction('start')}
            disabled={acting !== null} style={{ fontSize: 11, padding: '3px 8px' }}>
            {acting === 'start' ? '…' : '▶'}
          </button>
        )}
        {isRunning && (
          <button className="btn btn-sm" onClick={() => doAction('stop')}
            disabled={acting !== null} style={{ fontSize: 11, padding: '3px 8px' }}>
            {acting === 'stop' ? '…' : '■'}
          </button>
        )}
        <button className="btn btn-sm" onClick={() => doAction('restart')}
          disabled={acting !== null} style={{ fontSize: 11, padding: '3px 8px' }}>
          {acting === 'restart' ? '…' : '↺'}
        </button>
      </div>
    </div>
  )
}

export default function DockerOverlay({ open, onClose }: Props) {
  const [hosts, setHosts] = useState<DockerHostData[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await dockerApi.getContainers()
      setHosts(res.data)
      setActiveTab(t => Math.min(t, Math.max(res.data.length - 1, 0)))
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleAction = async (hostId: string, containerId: string, action: 'start' | 'stop' | 'restart') => {
    await dockerApi.containerAction(hostId, containerId, action)
    // Refresh after action with a short delay
    setTimeout(load, 800)
  }

  if (!open) return null

  const activeHost = hosts[activeTab]
  const runningCount = activeHost?.containers?.filter(c => c.state === 'running').length ?? 0
  const totalCount = activeHost?.containers?.length ?? 0

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        zIndex: 200, backdropFilter: 'blur(3px)',
      }} />
      <div style={{
        position: 'fixed', inset: '3%', zIndex: 201,
        background: 'var(--surface)', borderRadius: 14,
        border: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent2)' }}>
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
              <line x1="12" y1="12" x2="12" y2="16"/>
              <line x1="10" y1="14" x2="14" y2="14"/>
            </svg>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Docker</span>
            {!loading && activeHost && (
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {runningCount}/{totalCount} running
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={load} disabled={loading} title="Refresh" style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 7,
              color: 'var(--text-muted)', cursor: loading ? 'default' : 'pointer',
              padding: '4px 10px', fontSize: 13,
            }}>
              {loading ? '…' : '↻ Refresh'}
            </button>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: 'var(--text-dim)',
              cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '2px 6px',
            }}>×</button>
          </div>
        </div>

        {/* Tabs */}
        {hosts.length > 1 && (
          <div style={{
            display: 'flex', gap: 0, borderBottom: '1px solid var(--border)',
            background: 'var(--surface2)', flexShrink: 0,
          }}>
            {hosts.map((h, i) => (
              <button key={h.id} onClick={() => setActiveTab(i)} style={{
                padding: '9px 18px', fontSize: 13, background: 'none', border: 'none',
                borderBottom: i === activeTab ? '2px solid var(--accent2)' : '2px solid transparent',
                color: i === activeTab ? 'var(--accent2)' : 'var(--text-muted)',
                fontWeight: i === activeTab ? 600 : 400, cursor: 'pointer', transition: 'all 0.12s',
              }}>
                {h.name}
                {h.error && <span style={{ marginLeft: 6, color: 'var(--red)', fontSize: 11 }}>⚠</span>}
              </button>
            ))}
          </div>
        )}

        {/* Column headers */}
        {activeHost && !activeHost.error && activeHost.containers.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 90px 110px 110px 110px',
            gap: 10, padding: '8px 14px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface2)', flexShrink: 0,
          }}>
            {['Container', 'Status', 'State', 'CPU', 'Memory', ''].map((h, i) => (
              <div key={i} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)',
                textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
            ))}
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Loading containers…
            </div>
          )}
          {!loading && hosts.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              No Docker hosts configured. Add one in Admin → Docker.
            </div>
          )}
          {!loading && activeHost && activeHost.error && (
            <div style={{ padding: 20, margin: 16, borderRadius: 8,
              background: '#f8717112', border: '1px solid #f8717130',
              color: 'var(--red)', fontSize: 13 }}>
              Could not connect to <strong>{activeHost.name}</strong>: {activeHost.error}
            </div>
          )}
          {!loading && activeHost && !activeHost.error && activeHost.containers.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              No containers found on {activeHost.name}.
            </div>
          )}
          {!loading && activeHost && !activeHost.error && activeHost.containers
            .sort((a, b) => {
              if (a.state === 'running' && b.state !== 'running') return -1
              if (a.state !== 'running' && b.state === 'running') return 1
              return a.name.localeCompare(b.name)
            })
            .map(c => (
              <ContainerRow key={c.id} c={c} hostId={activeHost.id} onAction={handleAction} />
            ))
          }
        </div>

      </div>
    </>
  )
}
