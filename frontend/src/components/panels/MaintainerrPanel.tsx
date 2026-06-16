import { useState, useEffect } from 'react'
import { integrationsApi } from '../../api'
import ScrollableCoverStrip from './CoverStrip'

interface MaintainerrCollection {
  id: number
  title: string
  type: string       // "movie", "show", "season", "episode"
  isActive: boolean
  deleteAfterDays: number
  arrAction: number  // 0=delete 1=unmonitor+delete 2=unmonitor
  mediaCount: number
  totalSizeBytes: number
  posters: string[]  // full image_path URLs from media items
}

interface MaintainerrData {
  collections: MaintainerrCollection[]
  activeCount: number
  totalMediaCount: number
  reclaimableBytes: number
  itemsHandled: number
  bytesHandled: number
}

function typeLabel(t: string) {
  switch (t) {
    case 'movie':   return 'Movies'
    case 'show':    return 'Shows'
    case 'season':  return 'Seasons'
    case 'episode': return 'Episodes'
    default:        return 'Media'
  }
}

function typeColor(t: string) {
  switch (t) {
    case 'movie':   return '#6366f1'
    case 'show':    return '#a855f7'
    case 'season':  return '#f59e0b'
    case 'episode': return '#14b8a6'
    default:        return 'var(--accent)'
  }
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

function TypeBadge({ type }: { type: string }) {
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
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 7, padding: '5px 10px', textAlign: 'center', flex: 1 }}>
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
  const color = typeColor(c.type)
  const posterItems = c.posters.map(url => ({ coverUrl: url, title: c.title }))
  return (
    <div style={{
      background: 'var(--surface2)', borderRadius: 8, padding: '9px 12px',
      borderLeft: `3px solid ${c.isActive ? color : 'var(--border)'}`,
      display: 'flex', flexDirection: 'column', gap: 6,
      opacity: c.isActive ? 1 : 0.6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <TypeBadge type={c.type} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.title}
        </span>
        <span style={{ fontSize: 15, fontWeight: 700,
          color: c.mediaCount > 0 ? color : 'var(--text-dim)', flexShrink: 0 }}>
          {c.mediaCount}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--text-muted)' }}>
        {c.deleteAfterDays > 0 && <span>delete after {c.deleteAfterDays}d</span>}
        <span>{actionLabel(c.arrAction)}</span>
        {c.totalSizeBytes > 0 && <span>{fmtBytes(c.totalSizeBytes)}</span>}
        {!c.isActive && <span style={{ color: 'var(--text-dim)' }}>· paused</span>}
      </div>
      {posterItems.length > 0 && (
        <ScrollableCoverStrip items={posterItems} height={80} />
      )}
    </div>
  )
}

export default function MaintainerrPanel({ panel, heightUnits }: { panel: any; heightUnits: number }) {
  const [data, setData] = useState<MaintainerrData | null>(null)
  const [err, setErr]   = useState('')

  useEffect(() => {
    integrationsApi.getPanelData(panel.id)
      .then((r: any) => setData(r.data))
      .catch(() => setErr('Failed to load'))
  }, [panel.id])

  if (err)   return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>{err}</div>
  if (!data) return <div style={{ padding: 16 }}><span className="spinner" /></div>

  const collections = data.collections || []

  // ── 1x ──────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', height: '100%' }}>
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '3px 10px', textAlign: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{data.activeCount}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> active</span>
        </div>
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '3px 10px', textAlign: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{data.totalMediaCount}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> queued</span>
        </div>
        {data.reclaimableBytes > 0 && (
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '3px 10px', textAlign: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{fmtBytes(data.reclaimableBytes)}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> reclaimable</span>
          </div>
        )}
        {data.itemsHandled > 0 && (
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '3px 10px', textAlign: 'center', marginLeft: 'auto' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{data.itemsHandled.toLocaleString()}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> cleaned up</span>
          </div>
        )}
      </div>
    )
  }

  // ── 2–3x ────────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
        padding: '10px 12px', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '3px 10px' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{data.activeCount}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> active</span>
          </div>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '3px 10px' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{data.totalMediaCount}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> queued</span>
          </div>
          {data.reclaimableBytes > 0 && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '3px 10px' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{fmtBytes(data.reclaimableBytes)}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> reclaimable</span>
            </div>
          )}
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
