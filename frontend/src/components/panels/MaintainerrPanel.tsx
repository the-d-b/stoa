import { useState, useEffect } from 'react'
import { integrationsApi } from '../../api'

interface MaintainerrCollection {
  id: number
  title: string
  type: number       // 1=movie 2=show 3=season 4=episode
  isActive: boolean
  deleteAfterDays: number
  arrAction: number  // 0=delete 1=unmonitor+delete 2=unmonitor
  mediaCount: number
}

interface MaintainerrData {
  collections: MaintainerrCollection[]
  activeCount: number
  totalMediaCount: number
  reclaimableBytes: number
  itemsHandled: number
  bytesHandled: number
}

function typeLabel(t: number) {
  return ['', 'Movies', 'Shows', 'Seasons', 'Episodes'][t] ?? 'Media'
}

function typeColor(t: number) {
  return ['', '#6366f1', '#a855f7', '#f59e0b', '#14b8a6'][t] ?? 'var(--accent)'
}

function actionLabel(a: number) {
  return ['Delete', 'Unmonitor + Delete', 'Unmonitor'][a] ?? 'Delete'
}

function fmtBytes(b: number) {
  if (!b) return '0 B'
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  if (b < 1024 ** 4) return `${(b / 1024 ** 3).toFixed(1)} GB`
  return `${(b / 1024 ** 4).toFixed(1)} TB`
}

function TypeBadge({ type }: { type: number }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
      background: typeColor(type) + '22', color: typeColor(type),
      textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
    }}>
      {typeLabel(type)}
    </span>
  )
}

function StatChip({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 7, padding: '5px 10px',
      textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>{sub}</div>}
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{label}</div>
    </div>
  )
}

function CollectionRow({ c }: { c: MaintainerrCollection }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
      borderBottom: '1px solid var(--border)' }}>
      <TypeBadge type={c.type} />
      <span style={{ flex: 1, fontSize: 12, color: c.isActive ? 'var(--text)' : 'var(--text-dim)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {c.title}
      </span>
      {!c.isActive && (
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>paused</span>
      )}
      <span style={{ fontSize: 12, fontWeight: 600, color: c.mediaCount > 0 ? 'var(--text)' : 'var(--text-dim)',
        flexShrink: 0, minWidth: 20, textAlign: 'right' }}>
        {c.mediaCount}
      </span>
    </div>
  )
}

function CollectionCard({ c }: { c: MaintainerrCollection }) {
  return (
    <div style={{
      background: 'var(--surface2)', borderRadius: 8, padding: '9px 12px',
      borderLeft: `3px solid ${c.isActive ? typeColor(c.type) : 'var(--border)'}`,
      display: 'flex', flexDirection: 'column', gap: 5,
      opacity: c.isActive ? 1 : 0.6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <TypeBadge type={c.type} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.title}
        </span>
        <span style={{
          fontSize: 15, fontWeight: 700,
          color: c.mediaCount > 0 ? typeColor(c.type) : 'var(--text-dim)',
          flexShrink: 0,
        }}>
          {c.mediaCount}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--text-muted)' }}>
        {c.deleteAfterDays > 0 && (
          <span>delete after {c.deleteAfterDays}d</span>
        )}
        <span>{actionLabel(c.arrAction)}</span>
        {!c.isActive && <span style={{ color: 'var(--text-dim)' }}>· paused</span>}
      </div>
    </div>
  )
}

export default function MaintainerrPanel({ panel, heightUnits }: { panel: any; heightUnits: number }) {
  const [data, setData] = useState<MaintainerrData | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    integrationsApi.getPanelData(panel.id)
      .then((r: any) => setData(r.data))
      .catch(() => setErr('Failed to load'))
  }, [panel.id])

  if (err) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>{err}</div>
  if (!data) return <div style={{ padding: 16 }}><span className="spinner" /></div>

  const collections = data.collections || []

  // ── 1x ──────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', height: '100%' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', flexShrink: 0 }}>Maintainerr</span>
        <span style={{ fontSize: 12, color: 'var(--text)' }}>
          <b>{data.activeCount}</b>
          <span style={{ color: 'var(--text-muted)' }}> active rules</span>
        </span>
        <span style={{ fontSize: 12, color: 'var(--text)' }}>
          <b>{data.totalMediaCount}</b>
          <span style={{ color: 'var(--text-muted)' }}> queued</span>
        </span>
        {data.reclaimableBytes > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {fmtBytes(data.reclaimableBytes)} reclaimable
          </span>
        )}
        {data.itemsHandled > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {data.itemsHandled.toLocaleString()} cleaned up
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Maintainerr</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {data.activeCount} active · {data.totalMediaCount} queued
            {data.reclaimableBytes > 0 ? ` · ${fmtBytes(data.reclaimableBytes)}` : ''}
          </span>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {collections.map(c => <CollectionRow key={c.id} c={c} />)}
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
        <StatChip label="Rules" value={collections.length.toString()}
          sub={data.activeCount < collections.length ? `${data.activeCount} active` : undefined} />
        <StatChip label="Queued" value={data.totalMediaCount.toLocaleString()} />
        {data.reclaimableBytes > 0
          ? <StatChip label="Reclaimable" value={fmtBytes(data.reclaimableBytes)} />
          : <StatChip label="Freed" value={fmtBytes(data.bytesHandled)} />
        }
        {data.itemsHandled > 0 && (
          <StatChip label="Cleaned up" value={data.itemsHandled.toLocaleString()}
            sub={data.bytesHandled > 0 ? fmtBytes(data.bytesHandled) : undefined} />
        )}
      </div>

      {/* Collection cards */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {collections.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '12px 0' }}>
            No collections configured
          </div>
        )}
        {collections.map(c => <CollectionCard key={c.id} c={c} />)}
      </div>
    </div>
  )
}
