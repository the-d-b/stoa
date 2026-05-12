import { useEffect, useState, useCallback } from 'react'
import ScrollableCoverStrip from './CoverStrip'
import { integrationsApi, Panel } from '../../api'

interface ReadarrBook {
  id: number; title: string; titleSlug: string
  authorName: string; year: number; hasFile: boolean
  date?: string; coverUrl?: string
}
interface ReadarrData {
  uiUrl: string
  history: ReadarrBook[] | null
  missing: ReadarrBook[] | null
  missingCount: number; bookCount: number
  onDiskCount: number; authorCount: number
}

function formatDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}


function BookRow({ b, uiUrl, icon, iconColor }: {
  b: ReadarrBook; uiUrl: string; icon: string; iconColor: string
}) {
  const href = uiUrl && b.titleSlug ? `${uiUrl}/book/${b.titleSlug}` : undefined
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6,
      padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ fontSize: 9, color: iconColor, flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {href
          ? <a href={href} target="_blank" rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}>
              {b.title}
            </a>
          : <span style={{ fontWeight: 500 }}>{b.title}</span>
        }
        {b.authorName && <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>
          — {b.authorName}
        </span>}
      </span>
      {b.date && <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
        fontFamily: 'DM Mono, monospace' }}>{formatDate(b.date)}</span>}
    </div>
  )
}

function StatsRow({ data }: { data: ReadarrData }) {
  return (
    <div style={{ display: 'flex', gap: 14, fontSize: 12, flexShrink: 0 }}>
      <span style={{ color: 'var(--text-dim)' }}><strong style={{ color: 'var(--text)' }}>{data.bookCount}</strong> books</span>
      <span style={{ color: 'var(--text-dim)' }}><strong style={{ color: 'var(--text)' }}>{data.authorCount}</strong> authors</span>
      <span style={{ color: 'var(--text-dim)' }}><strong style={{ color: 'var(--green)' }}>{data.onDiskCount}</strong> on disk</span>
      {data.missingCount > 0 && <span style={{ color: 'var(--amber)' }}><strong>{data.missingCount}</strong> missing</span>}
    </div>
  )
}

export default function ReadarrPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<ReadarrData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const cfg = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const uiUrl = (cfg.uiUrl || '').replace(/\/$/, '')

  const load = useCallback(async () => {
    try {
      const r = await integrationsApi.getPanelData(panel.id)
      setData(r.data); setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>Loading...</div>
  if (error)   return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>📚 {error}</div>
  if (!data)   return null

  const history = data.history ?? []
  const missing = data.missing ?? []
  const allBooks = [...history, ...missing]

  // ── 1x: stats only ────────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 12,
      height: '100%', overflow: 'hidden' }}>
      <span style={{ fontSize: 18 }}>📚</span>
      <StatsRow data={data} />
    </div>
  )

  // ── 2x-3x: stats + cover strip ────────────────────────────────────────────
  if (heightUnits <= 3) return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      <StatsRow data={data} />
      <ScrollableCoverStrip items={allBooks.map(b => ({ coverUrl: b.coverUrl, title: b.title, linkUrl: uiUrl && b.titleSlug ? `${uiUrl}/book/${b.titleSlug}` : uiUrl }))} height={80} />
    </div>
  )

  // ── 4x+: stats + covers + recent downloads + missing ─────────────────────
  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      <StatsRow data={data} />
      <ScrollableCoverStrip items={allBooks.map(b => ({ coverUrl: b.coverUrl, title: b.title, linkUrl: uiUrl && b.titleSlug ? `${uiUrl}/book/${b.titleSlug}` : uiUrl }))} height={80} />

      {/* Recent downloads — fixed, doesn't grow */}
      {history.length > 0 && (
        <div style={{ flexShrink: 0, maxHeight: '40%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4 }}>Recently downloaded</div>
          <div style={{ overflowY: 'auto' }}>
            {history.map((b, i) => <BookRow key={i} b={b} uiUrl={uiUrl} icon="✓" iconColor="var(--green)" />)}
          </div>
        </div>
      )}

      {/* Missing — takes all remaining space */}
      {missing.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>Missing ({data.missingCount})</div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {missing.map((b, i) => <BookRow key={i} b={b} uiUrl={uiUrl} icon="○" iconColor="var(--amber)" />)}
          </div>
        </div>
      )}

      {/* If no history and no missing, nothing extra to show */}
      {history.length === 0 && missing.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent activity</div>
      )}
    </div>
  )
}
