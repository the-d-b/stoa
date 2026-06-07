import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

interface PaperlessTag {
  id: number
  name: string
  color: string
  isInboxTag: boolean
  documentCount: number
}

interface PaperlessCorrespondent {
  id: number
  name: string
  documentCount: number
}

interface PaperlessDocType {
  id: number
  name: string
  documentCount: number
}

interface PaperlessDocument {
  id: number
  title: string
  created: string
  correspondent: string
  documentType: string
}

interface PaperlessPanelData {
  uiUrl: string
  integrationId: string
  totalDocuments: number
  inboxCount: number
  recentDocuments: PaperlessDocument[]
  tags: PaperlessTag[]
  correspondents: PaperlessCorrespondent[]
  documentTypes: PaperlessDocType[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function tagColor(hex: string): string {
  if (!hex || hex === '#000000' || hex === '#000') return '#6366f1'
  return hex
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatChip({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div style={{ background: '#1a1a1a', borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80 }}>
      <span style={{ fontSize: 20, fontWeight: 700, color: accent ? '#f59e0b' : '#e0e0e0' }}>{value}</span>
      <span style={{ fontSize: 10, color: '#888', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
    </div>
  )
}

function PropBar({ value, max, color }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 4
  return (
    <div style={{ flex: 1, height: 6, background: '#2a2a2a', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color || '#6366f1', borderRadius: 3 }} />
    </div>
  )
}

function TagRow({ tag, max }: { tag: PaperlessTag; max: number }) {
  const color = tagColor(tag.color)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: '#ccc', width: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{tag.name}</span>
      <PropBar value={tag.documentCount} max={max} color={color} />
      <span style={{ fontSize: 11, color: '#666', width: 28, textAlign: 'right', flexShrink: 0 }}>{tag.documentCount}</span>
    </div>
  )
}

function CorrespRow({ c, max }: { c: PaperlessCorrespondent; max: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
      <span style={{ fontSize: 12, color: '#ccc', width: 108, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{c.name}</span>
      <PropBar value={c.documentCount} max={max} />
      <span style={{ fontSize: 11, color: '#666', width: 28, textAlign: 'right', flexShrink: 0 }}>{c.documentCount}</span>
    </div>
  )
}

function DocRow({ doc, uiUrl }: { doc: PaperlessDocument; uiUrl: string }) {
  const href = uiUrl ? `${uiUrl.replace(/\/$/, '')}/documents/${doc.id}` : undefined
  const inner = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: '1px solid #1a1a1a' }}>
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#e0e0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</div>
        <div style={{ fontSize: 11, color: '#666', marginTop: 2, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <span>{fmtDate(doc.created)}</span>
          {doc.correspondent && <><span style={{ color: '#444' }}>·</span><span style={{ color: '#888' }}>{doc.correspondent}</span></>}
          {doc.documentType && <><span style={{ color: '#444' }}>·</span><span>{doc.documentType}</span></>}
        </div>
      </div>
    </div>
  )

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
        {inner}
      </a>
    )
  }
  return <div>{inner}</div>
}

function TypeDonut({ types }: { types: PaperlessDocType[] }) {
  if (types.length === 0) return null
  const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#f97316', '#14b8a6']
  const total = types.reduce((s, t) => s + t.documentCount, 0)
  if (total === 0) return null
  const cx = 36, cy = 36, r = 28, circ = 2 * Math.PI * r
  let offset = 0
  const segs = types.slice(0, 8).map((t, i) => {
    const arc = (t.documentCount / total) * circ
    const seg = { arc, offset, color: COLORS[i % COLORS.length], name: t.name, count: t.documentCount }
    offset += arc
    return seg
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <svg width={72} height={72} style={{ flexShrink: 0 }}>
        {segs.map((s, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color}
            strokeWidth={10}
            strokeDasharray={`${s.arc} ${circ}`}
            strokeDashoffset={circ - s.offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="butt" />
        ))}
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize={11} fill="#888">{types.length}</text>
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        {segs.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#bbb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s.name}</span>
            <span style={{ fontSize: 11, color: '#666', flexShrink: 0 }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export default function PaperlessPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<PaperlessPanelData | null>(null)
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

  if (!integrationId) return <div style={{ padding: 16, color: '#666', fontSize: 13 }}>No integration configured.</div>
  if (loading) return <div style={{ padding: 16, color: '#888', fontSize: 13 }}>Loading...</div>
  if (error) return <div style={{ padding: 16, color: '#ef4444', fontSize: 13 }}>{error}</div>
  if (!data) return null

  const visibleTags = (data.tags || []).filter(t => !t.isInboxTag)
  const maxTagCount = visibleTags.length > 0 ? visibleTags[0].documentCount : 1
  const maxCorrCount = (data.correspondents || []).length > 0 ? data.correspondents[0].documentCount : 1
  const topTags = visibleTags.slice(0, 8)
  const topCorrespondents = (data.correspondents || []).slice(0, 6)

  // ── 1x ────────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, height: '100%', overflow: 'hidden' }}>
        <StatChip label="Documents" value={data.totalDocuments} />
        {data.inboxCount > 0 && <StatChip label="Inbox" value={data.inboxCount} accent />}
        {(data.correspondents || []).length > 0 && <StatChip label="Correspondents" value={data.correspondents.length} />}
        {visibleTags.length > 0 && <StatChip label="Tags" value={visibleTags.length} />}
        {(data.documentTypes || []).length > 0 && <StatChip label="Doc Types" value={data.documentTypes.length} />}
      </div>
    )
  }

  // ── 2-3x ──────────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <StatChip label="Documents" value={data.totalDocuments} />
          {data.inboxCount > 0 && <StatChip label="Inbox" value={data.inboxCount} accent />}
          {(data.correspondents || []).length > 0 && <StatChip label="Correspondents" value={data.correspondents.length} />}
          {visibleTags.length > 0 && <StatChip label="Tags" value={visibleTags.length} />}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Recent Documents</div>
          {(data.recentDocuments || []).map(doc => <DocRow key={doc.id} doc={doc} uiUrl={data.uiUrl} />)}
        </div>
      </div>
    )
  }

  // ── 4x+ ───────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left col — stats, doc types, tags, correspondents */}
      <div style={{ width: 230, flexShrink: 0, borderRight: '1px solid #1e1e1e', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <StatChip label="Documents" value={data.totalDocuments} />
          {data.inboxCount > 0 && <StatChip label="Inbox" value={data.inboxCount} accent />}
        </div>

        {(data.documentTypes || []).length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Document Types</div>
            <TypeDonut types={data.documentTypes} />
          </div>
        )}

        {topTags.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Tags</div>
            {topTags.map(tag => <TagRow key={tag.id} tag={tag} max={maxTagCount} />)}
          </div>
        )}

        {topCorrespondents.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Correspondents</div>
            {topCorrespondents.map(c => <CorrespRow key={c.id} c={c} max={maxCorrCount} />)}
          </div>
        )}
      </div>

      {/* Right col — recent documents */}
      <div style={{ flex: 1, padding: '12px 14px', overflowY: 'auto', minWidth: 0 }}>
        <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Recent Documents</div>
        {(data.recentDocuments || []).map(doc => <DocRow key={doc.id} doc={doc} uiUrl={data.uiUrl} />)}
      </div>
    </div>
  )
}
