import { useEffect, useState, useCallback } from 'react'
import AuthCoverStrip from './AuthCoverStrip'
import { integrationsApi, Panel } from '../../api'

interface KomgaSeries {
  id: string
  name: string
  libraryId: string
  libraryName: string
  booksCount: number
  created: string
}

interface KomgaLibrary {
  id: string
  name: string
}

interface KomgaLibraryStrip {
  libraryId: string
  libraryName: string
  series: KomgaSeries[]
}

interface KomgaData {
  uiUrl: string
  integrationId: string
  seriesCount: number
  bookCount: number
  libraries: KomgaLibrary[]
  recentlyAdded: KomgaSeries[]
  libraryStrips?: KomgaLibraryStrip[]
}

function formatDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function StatsRow({ data }: { data: KomgaData }) {
  return (
    <div style={{ display: 'flex', gap: 14, fontSize: 12, flexShrink: 0 }}>
      <span style={{ color: 'var(--text-dim)' }}>
        <span style={{ fontSize: 11 }}>📚</span>{' '}
        <strong style={{ color: 'var(--accent)' }}>{data.seriesCount.toLocaleString()}</strong> series
      </span>
      <span style={{ color: 'var(--text-dim)' }}>
        <span style={{ fontSize: 11 }}>📖</span>{' '}
        <strong style={{ color: 'var(--accent)' }}>{data.bookCount.toLocaleString()}</strong> books
      </span>
      {data.libraries.length > 0 && (
        <span style={{ color: 'var(--text-dim)' }}>
          <span style={{ fontSize: 11 }}>🗂️</span>{' '}
          <strong style={{ color: 'var(--accent)' }}>{data.libraries.length}</strong>{' '}
          {data.libraries.length === 1 ? 'library' : 'libraries'}
        </span>
      )}
    </div>
  )
}

function SeriesRow({ series, uiUrl }: { series: KomgaSeries; uiUrl: string }) {
  const href = uiUrl ? `${uiUrl}/series/${series.id}` : undefined
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6,
      padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ fontSize: 9, color: 'var(--green)', flexShrink: 0 }}>✓</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {href
          ? <a href={href} target="_blank" rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}>
              {series.name}
            </a>
          : <span style={{ fontWeight: 500 }}>{series.name}</span>
        }
        {series.libraryName && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>
            — {series.libraryName}
          </span>
        )}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
        fontFamily: 'DM Mono, monospace', display: 'flex', gap: 8 }}>
        {series.booksCount > 0 && (
          <span>{series.booksCount}v</span>
        )}
        {series.created && <span>{formatDate(series.created)}</span>}
      </span>
    </div>
  )
}

export default function KomgaPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<KomgaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  const integId = data.integrationId
  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const recent = data.recentlyAdded ?? []
  const libraryStrips = data.libraryStrips ?? []

  const coverItems = recent.map(s => ({
    coverUrl: `/api/komga/${integId}/cover/${s.id}`,
    title: s.name,
    linkUrl: uiUrl ? `${uiUrl}/series/${s.id}` : undefined,
  }))

  // ── 1x: icon + stats ──────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      height: '100%', overflow: 'hidden' }}>
      <span style={{ fontSize: 18 }}>📖</span>
      <StatsRow data={data} />
    </div>
  )

  // ── 2x-3x: stats + cover strip ────────────────────────────────────────────
  if (heightUnits <= 3) return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      <StatsRow data={data} />
      <AuthCoverStrip items={coverItems} height={80} />
    </div>
  )

  // ── 4x+: per-library filmstrips + grouped recently added ─────────────────
  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      <StatsRow data={data} />
      {libraryStrips.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          {libraryStrips.map(strip => {
            const items = strip.series.map(s => ({
              coverUrl: `/api/komga/${integId}/cover/${s.id}`,
              title: s.name,
              linkUrl: uiUrl ? `${uiUrl}/series/${s.id}` : undefined,
            }))
            return (
              <div key={strip.libraryId}>
                <div style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 3 }}>
                  {strip.libraryName}
                </div>
                <AuthCoverStrip items={items} height={72} />
              </div>
            )
          })}
        </div>
      ) : (
        <AuthCoverStrip items={coverItems} height={80} />
      )}
      {libraryStrips.length > 0 ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 10 }}>
          {libraryStrips.map(strip => (
            <div key={strip.libraryId}>
              <div style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 3, position: 'sticky', top: 0,
                background: 'var(--surface)', paddingBottom: 2 }}>
                {strip.libraryName}
              </div>
              {strip.series.slice(0, 5).map((s, i) => (
                <SeriesRow key={i} series={s} uiUrl={uiUrl} />
              ))}
            </div>
          ))}
        </div>
      ) : recent.length > 0 ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>
            Recently added
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {recent.map((s, i) => <SeriesRow key={i} series={s} uiUrl={uiUrl} />)}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No series found</div>
      )}
    </div>
  )
}
