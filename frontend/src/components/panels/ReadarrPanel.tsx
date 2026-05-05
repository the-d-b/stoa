import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface ReadarrBook {
  id: number; title: string; titleSlug: string
  authorName: string; authorSlug: string
  year: number; hasFile: boolean; date?: string
  coverUrl?: string; isbn?: string
}
interface ReadarrData {
  uiUrl: string
  history: ReadarrBook[]; missing: ReadarrBook[]
  missingCount: number; bookCount: number
  onDiskCount: number; authorCount: number
}

function formatDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const linkStyle: React.CSSProperties = { color: 'inherit', textDecoration: 'none', fontWeight: 500 }
const linkHover = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.textDecoration = 'underline' }
const linkOut  = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.textDecoration = 'none' }

function BookLink({ uiUrl, titleSlug, title, author }: {
  uiUrl: string; titleSlug: string; title: string; author?: string
}) {
  const href = uiUrl && titleSlug
    ? `${uiUrl}/book/${titleSlug}`
    : `https://www.goodreads.com/search?q=${encodeURIComponent(title)}`
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={linkStyle} onMouseOver={linkHover} onMouseOut={linkOut}>
      {title}
      {author && <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 5, fontWeight: 400 }}>
        by {author}
      </span>}
    </a>
  )
}

function CoverStrip({ items, uiUrl }: { items: ReadarrBook[]; uiUrl: string }) {
  const withCovers = items.filter(b => b.coverUrl)
  if (withCovers.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10,
      scrollbarWidth: 'none', maxWidth: '100%', minWidth: 0 }}>
      {withCovers.map((b, i) => (
        <a key={i} href={uiUrl && b.titleSlug ? `${uiUrl}/book/${b.titleSlug}` : uiUrl}
          target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
          <img src={b.coverUrl} alt={b.title}
            style={{ height: 80, width: 54, objectFit: 'cover', borderRadius: 5,
              display: 'block', opacity: 0.85 }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </a>
      ))}
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
      setData(r.data)
      setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>Loading...</div>
  if (error)   return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>📚 {error}</div>
  if (!data)   return null

  // ── 1x compact ────────────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 12,
      height: '100%', overflow: 'hidden' }}>
      <span style={{ fontSize: 18 }}>📚</span>
      <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
        <span><strong>{data.bookCount}</strong> books</span>
        <span><strong>{data.authorCount}</strong> authors</span>
        <span><strong>{data.onDiskCount}</strong> on disk</span>
        {data.missingCount > 0 && <span style={{ color: 'var(--amber)' }}>
          <strong>{data.missingCount}</strong> missing
        </span>}
      </div>
    </div>
  )

  // ── 2x ─────────────────────────────────────────────────────────────────────
  if (heightUnits <= 2) return (
    <div style={{ padding: '10px 14px', overflow: 'hidden', height: '100%' }}>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 8, fontSize: 12 }}>
        <span style={{ color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>{data.bookCount}</strong> books
        </span>
        <span style={{ color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>{data.authorCount}</strong> authors
        </span>
        <span style={{ color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>{data.onDiskCount}</strong> on disk
        </span>
        {data.missingCount > 0 && (
          <span style={{ color: 'var(--amber)' }}>
            <strong>{data.missingCount}</strong> missing
          </span>
        )}
      </div>
      {/* Cover strip */}
      <CoverStrip items={[...data.history, ...data.missing]} uiUrl={uiUrl} />
      {/* Recent downloads */}
      {data.history.slice(0, 2).map((b, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
          padding: '2px 0', fontSize: 12 }}>
          <span style={{ fontSize: 9, color: 'var(--green)' }}>✓</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <BookLink uiUrl={uiUrl} titleSlug={b.titleSlug} title={b.title} author={b.authorName} />
          </span>
          {b.date && <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
            {formatDate(b.date)}
          </span>}
        </div>
      ))}
    </div>
  )

  // ── 3x–4x ──────────────────────────────────────────────────────────────────
  if (heightUnits <= 4) return (
    <div style={{ padding: '10px 14px', overflow: 'hidden', height: '100%',
      display: 'flex', flexDirection: 'column' }}>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 8, fontSize: 12, flexShrink: 0 }}>
        <span style={{ color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>{data.bookCount}</strong> books
        </span>
        <span style={{ color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>{data.authorCount}</strong> authors
        </span>
        <span style={{ color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>{data.onDiskCount}</strong> on disk
        </span>
        {data.missingCount > 0 && (
          <span style={{ color: 'var(--amber)' }}>
            <strong>{data.missingCount}</strong> missing
          </span>
        )}
      </div>
      <CoverStrip items={data.history} uiUrl={uiUrl} />
      {/* Recently downloaded */}
      {data.history.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>Recently downloaded</div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {data.history.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
                padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <BookLink uiUrl={uiUrl} titleSlug={b.titleSlug} title={b.title} author={b.authorName} />
                </span>
                {b.date && <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
                  fontFamily: 'DM Mono, monospace' }}>{formatDate(b.date)}</span>}
                <span style={{ fontSize: 9, color: 'var(--green)', flexShrink: 0 }}>✓</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )

  // ── 5x+ full view ──────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '10px 14px', overflow: 'hidden', height: '100%',
      display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {[
          { label: 'Books', value: data.bookCount, color: 'var(--text)' },
          { label: 'Authors', value: data.authorCount, color: 'var(--text)' },
          { label: 'On Disk', value: data.onDiskCount, color: 'var(--green)' },
          { label: 'Missing', value: data.missingCount, color: data.missingCount > 0 ? 'var(--amber)' : 'var(--text-dim)' },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: 'var(--surface2)', borderRadius: 8,
            padding: '6px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Cover strip */}
      {data.history.length > 0 && <CoverStrip items={data.history} uiUrl={uiUrl} />}

      {/* Two-column layout: recent + missing */}
      <div style={{ display: 'flex', gap: 12, flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* Recently downloaded */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>Recently downloaded</div>
          {data.history.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent downloads</div>
            : <div style={{ overflowY: 'auto', flex: 1 }}>
                {data.history.map((b, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6,
                    padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <BookLink uiUrl={uiUrl} titleSlug={b.titleSlug} title={b.title} />
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>{b.authorName}</span>
                    <span style={{ fontSize: 9, color: 'var(--green)', flexShrink: 0 }}>✓</span>
                  </div>
                ))}
              </div>
          }
        </div>

        {/* Missing */}
        {data.missingCount > 0 && (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>
              Missing ({data.missingCount})
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {data.missing.map((b, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6,
                  padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <BookLink uiUrl={uiUrl} titleSlug={b.titleSlug} title={b.title} />
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>{b.authorName}</span>
                  <span style={{ fontSize: 9, color: 'var(--amber)', flexShrink: 0 }}>○</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
