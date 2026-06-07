import { useState, useEffect } from 'react'
import { integrationsApi } from '../../api'

interface DocspellItem {
  id: string
  name: string
  date: string
  correspondent: string
  folder: string
  tags: string[]
}

interface DocspellData {
  totalItems: number
  storageBytes: number
  tagCount: number
  recentItems: DocspellItem[]
}

function fmtBytes(b: number) {
  if (!b) return '0 B'
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function Tag({ name }: { name: string }) {
  return (
    <span style={{
      background: 'var(--accent)18', color: 'var(--accent)',
      border: '1px solid var(--accent)30',
      borderRadius: 4, padding: '1px 5px', fontSize: 10, flexShrink: 0,
    }}>{name}</span>
  )
}

function ItemRow({ item, uiUrl, compact }: { item: DocspellItem; uiUrl?: string; compact?: boolean }) {
  const href = uiUrl ? `${uiUrl.replace(/\/$/, '')}/app/items/${item.id}` : undefined
  const nameEl = (
    <span style={{
      flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      fontSize: compact ? 12 : 13, color: 'var(--text)', fontWeight: 500,
    }}>{item.name}</span>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, padding: '4px 0' }}>
      {href ? <a href={href} target="_blank" rel="noreferrer" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, textDecoration: 'none' }}>{nameEl}</a> : nameEl}
      {item.correspondent && !compact && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, maxWidth: 100,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.correspondent}
        </span>
      )}
      {item.date && (
        <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{item.date}</span>
      )}
    </div>
  )
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 7, padding: '6px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{label}</div>
    </div>
  )
}

export default function DocspellPanel({ panel, heightUnits }: { panel: any; heightUnits: number }) {
  const [data, setData] = useState<DocspellData | null>(null)
  const [err, setErr] = useState('')
  const uiUrl = panel.config ? (() => { try { return JSON.parse(panel.config).uiUrl } catch { return '' } })() : ''

  useEffect(() => {
    integrationsApi.getPanelData(panel.id)
      .then((r: any) => setData(r.data))
      .catch(() => setErr('Failed to load'))
  }, [panel.id])

  if (err) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>{err}</div>
  if (!data) return <div style={{ padding: 16 }}><span className="spinner" /></div>

  const items = data.recentItems || []

  // ── 1x ──────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', height: '100%' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', flexShrink: 0 }}>Docspell</span>
        <span style={{ fontSize: 12, color: 'var(--text)' }}>
          <b>{data.totalItems.toLocaleString()}</b> docs
        </span>
        {data.storageBytes > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtBytes(data.storageBytes)}</span>
        )}
        {data.tagCount > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{data.tagCount} tags</span>
        )}
        {items.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            — {items[0].name}
          </span>
        )}
      </div>
    )
  }

  // ── 2-3x ────────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 14px', height: '100%', overflow: 'hidden', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Docspell</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {data.totalItems.toLocaleString()} docs
          </span>
          {data.storageBytes > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtBytes(data.storageBytes)}</span>
          )}
          {data.tagCount > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{data.tagCount} tags</span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
          {items.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No documents</span>
          )}
          {items.map(it => (
            <ItemRow key={it.id} item={it} uiUrl={uiUrl} compact />
          ))}
        </div>
      </div>
    )
  }

  // ── 4x+ ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 16px', height: '100%', overflow: 'hidden', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Docspell</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <StatChip label="Documents" value={data.totalItems.toLocaleString()} />
        <StatChip label="Storage" value={fmtBytes(data.storageBytes)} />
        <StatChip label="Tags" value={data.tagCount ? data.tagCount.toString() : '—'} />
      </div>

      <label className="label" style={{ margin: 0 }}>Recent documents</label>
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', flex: 1, gap: 2 }}>
        {items.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No documents</span>
        )}
        {items.map(it => (
          <div key={it.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
            <ItemRow item={it} uiUrl={uiUrl} />
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingLeft: 2, marginTop: 2 }}>
              {it.correspondent && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{it.correspondent}</span>
              )}
              {it.folder && (
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>📁 {it.folder}</span>
              )}
              {(it.tags || []).slice(0, 4).map(t => <Tag key={t} name={t} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
