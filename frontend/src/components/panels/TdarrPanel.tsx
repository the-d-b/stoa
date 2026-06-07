import { useState, useEffect } from 'react'
import { integrationsApi } from '../../api'

interface TdarrWorker {
  nodeName: string
  workerType: string
  status: string
  percentage: number
  eta: string
  idle: boolean
  fileName: string
}

interface TdarrData {
  version: string
  workers: TdarrWorker[]
  totalFiles: number
  transcoded: number
  healthChecked: number
  spaceSavedGB: number
  activeCount: number
  idleCount: number
}

function wtLabel(wt: string) {
  const t = (wt || '').toLowerCase()
  if (t === 'transcodecpu') return 'T-CPU'
  if (t === 'transcodegpu') return 'T-GPU'
  if (t === 'healthcheckcpu') return 'HC-CPU'
  if (t === 'healthcheckgpu') return 'HC-GPU'
  return wt || '?'
}

function wtColor(wt: string) {
  const t = (wt || '').toLowerCase()
  if (t.startsWith('transcode')) return '#6366f1'
  if (t.startsWith('healthcheck')) return '#22c55e'
  return '#64748b'
}

function fmtGB(gb: number) {
  if (!gb) return '0 GB'
  if (gb < 1) return `${(gb * 1024).toFixed(0)} MB`
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`
  return `${gb.toFixed(1)} GB`
}

function WorkerRow({ w, compact }: { w: TdarrWorker; compact?: boolean }) {
  const color = wtColor(w.workerType)
  const pct = Math.max(0, Math.min(100, w.percentage || 0))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: compact ? 11 : 12, minWidth: 0 }}>
      <span style={{
        background: color + '22', color, border: `1px solid ${color}44`,
        borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 600,
        flexShrink: 0, letterSpacing: '0.02em',
      }}>{wtLabel(w.workerType)}</span>

      {w.idle ? (
        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>idle</span>
      ) : (
        <>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: 'var(--text-muted)' }}>
            {w.fileName || w.status || 'working...'}
          </span>
          <div style={{ width: compact ? 60 : 80, background: 'var(--surface2)', borderRadius: 3, height: 5, flexShrink: 0 }}>
            <div style={{ width: `${pct}%`, background: color, borderRadius: 3, height: '100%' }} />
          </div>
          <span style={{ color: 'var(--text-muted)', flexShrink: 0, minWidth: 32, textAlign: 'right' }}>
            {pct.toFixed(0)}%
          </span>
          {w.eta && !compact && (
            <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 10 }}>{w.eta}</span>
          )}
        </>
      )}
    </div>
  )
}

function StatChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 7, padding: '6px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{label}</div>
    </div>
  )
}

export default function TdarrPanel({ panel, heightUnits }: { panel: any; heightUnits: number }) {
  const [data, setData] = useState<TdarrData | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    integrationsApi.getPanelData(panel.id)
      .then((r: any) => setData(r.data))
      .catch(() => setErr('Failed to load'))
  }, [panel.id])

  if (err) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>{err}</div>
  if (!data) return <div style={{ padding: 16 }}><span className="spinner" /></div>

  const activeWorkers = (data.workers || []).filter(w => !w.idle)
  const allWorkers = data.workers || []

  // ── 1x compact ──────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', height: '100%' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', flexShrink: 0 }}>
          TDARR{data.version ? ` v${data.version}` : ''}
        </span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
          <span style={{ fontSize: 12, color: 'var(--text)' }}>
            <b>{data.activeCount}</b> active
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {data.idleCount} idle
          </span>
          {data.spaceSavedGB > 0 && (
            <span style={{ fontSize: 12, color: '#22c55e' }}>
              {fmtGB(data.spaceSavedGB)} saved
            </span>
          )}
        </div>
        {activeWorkers.length > 0 && (
          <div style={{ flex: 2, minWidth: 0 }}>
            <WorkerRow w={activeWorkers[0]} compact />
          </div>
        )}
      </div>
    )
  }

  // ── 2-3x ────────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '10px 14px', height: '100%', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
            TDARR{data.version ? ` v${data.version}` : ''}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {data.activeCount} active · {data.idleCount} idle
          </span>
          {data.spaceSavedGB > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#22c55e', fontWeight: 600 }}>
              {fmtGB(data.spaceSavedGB)} saved
            </span>
          )}
        </div>

        {/* Workers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden' }}>
          {allWorkers.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No workers connected</span>
          )}
          {allWorkers.map((w, i) => <WorkerRow key={i} w={w} />)}
        </div>
      </div>
    )
  }

  // ── 4x+ full ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '12px 16px', height: '100%', overflow: 'hidden' }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>TDARR</span>
        {data.version && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>v{data.version}</span>
        )}
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        <StatChip label="Total Files" value={data.totalFiles ? data.totalFiles.toLocaleString() : '—'} />
        <StatChip label="Transcoded" value={data.transcoded ? data.transcoded.toLocaleString() : '—'} color="#6366f1" />
        <StatChip label="Health Checked" value={data.healthChecked ? data.healthChecked.toLocaleString() : '—'} color="#22c55e" />
        <StatChip label="Space Saved" value={data.spaceSavedGB > 0 ? fmtGB(data.spaceSavedGB) : '—'} color="#f59e0b" />
      </div>

      {/* Workers */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <label className="label" style={{ margin: 0 }}>Workers</label>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {data.activeCount} active · {data.idleCount} idle
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto', flex: 1 }}>
        {allWorkers.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No workers connected</span>
        )}
        {allWorkers.map((w, i) => (
          <div key={i} style={{
            background: 'var(--surface2)', borderRadius: 7, padding: '7px 10px',
            borderLeft: `3px solid ${wtColor(w.workerType)}`,
          }}>
            <WorkerRow w={w} />
            {!w.idle && w.nodeName && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, paddingLeft: 2 }}>
                {w.nodeName}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
