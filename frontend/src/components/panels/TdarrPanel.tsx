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
  transcodeQueue: number
  healthCheckQueue: number
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

// Small bordered inline tile — used in 1x and as the status row in 2x/4x
function StatusTile({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '3px 10px', flexShrink: 0 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: color || 'var(--text)' }}>{value}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> {label}</span>
    </div>
  )
}

// Larger chip for lifetime stats — used in 2x and 4x
function StatChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 7, padding: '6px 10px', textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{label}</div>
    </div>
  )
}

function WorkerCard({ w }: { w: TdarrWorker }) {
  const color = wtColor(w.workerType)
  const pct = Math.max(0, Math.min(100, w.percentage || 0))
  return (
    <div style={{
      background: 'var(--surface2)', borderRadius: 7, padding: '8px 10px',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span style={{
          background: color + '22', color, border: `1px solid ${color}44`,
          borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 600,
          flexShrink: 0, letterSpacing: '0.02em',
        }}>{wtLabel(w.workerType)}</span>
        <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', color: 'var(--text)' }}>
          {w.fileName || w.status || 'working...'}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color, flexShrink: 0 }}>
          {pct.toFixed(0)}%
        </span>
        {w.eta && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{w.eta}</span>
        )}
      </div>
      <div style={{ marginTop: 5, background: 'var(--surface)', borderRadius: 3, height: 4 }}>
        <div style={{ width: `${pct}%`, background: color, borderRadius: 3, height: '100%',
          transition: 'width 0.3s ease' }} />
      </div>
      {w.nodeName && (
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3 }}>{w.nodeName}</div>
      )}
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

  // Status tiles row — the constant element present at every height
  const statusRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
      <StatusTile value={data.activeCount}      label="active" />
      <StatusTile value={data.idleCount}        label="idle" />
      <StatusTile value={data.transcodeQueue}   label="T-queue"  color="#6366f1" />
      <StatusTile value={data.healthCheckQueue} label="HC-queue" color="#22c55e" />
      {data.version && (
        <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 'auto' }}>v{data.version}</span>
      )}
    </div>
  )

  // Lifetime stat chips row — added at 2x and above
  const statsRow = (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
      <StatChip label="Total Files"    value={data.totalFiles    ? data.totalFiles.toLocaleString()    : '—'} />
      <StatChip label="Transcoded"     value={data.transcoded    ? data.transcoded.toLocaleString()    : '—'} color="#6366f1" />
      <StatChip label="Health Checked" value={data.healthChecked ? data.healthChecked.toLocaleString() : '—'} color="#22c55e" />
      <StatChip label="Space Saved"    value={data.spaceSavedGB > 0 ? fmtGB(data.spaceSavedGB)         : '—'} color="#f59e0b" />
    </div>
  )

  // ── 1x: status tiles only ───────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', height: '100%' }}>
        {statusRow}
      </div>
    )
  }

  // ── 2–3x: status tiles + lifetime stat chips ─────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px',
        height: '100%', overflow: 'hidden' }}>
        {statusRow}
        {statsRow}
      </div>
    )
  }

  // ── 4x+: status tiles + lifetime stat chips + active worker cards ────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px',
      height: '100%', overflow: 'hidden' }}>
      {statusRow}
      {statsRow}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {activeWorkers.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No active workers</span>
        )}
        {activeWorkers.map((w, i) => <WorkerCard key={i} w={w} />)}
      </div>
    </div>
  )
}
