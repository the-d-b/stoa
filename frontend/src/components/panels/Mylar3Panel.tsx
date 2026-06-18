import { useEffect, useState, useCallback, useRef } from 'react'
import PanelError from './PanelError'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface Mylar3Series {
  comicId: string
  name: string
  imageUrl: string
  status: string
  publisher: string
  year: string
  totalIssues: number
}

interface Mylar3Issue {
  comicId: string
  comicName: string
  issueNumber: string
  issueName: string
  date?: string
}

interface Mylar3Data {
  uiUrl: string
  integrationId: string
  seriesCount: number
  wantedCount: number
  upcomingCount: number
  series: Mylar3Series[]
  wanted: Mylar3Issue[]
  upcoming: Mylar3Issue[]
}

// ── Cover strip (public CDN images — no auth fetch needed) ───────────────────

function CoverStrip({ series, uiUrl, height }: { series: Mylar3Series[]; uiUrl: string; height: number }) {
  const width = Math.round(height * 0.67)
  const ref = useRef<HTMLDivElement>(null)
  const animRef = useRef<number | null>(null)
  const [hoverZone, setHoverZone] = useState<'left' | 'right' | null>(null)

  const scroll = useCallback((dir: 'left' | 'right') => {
    const el = ref.current
    if (!el) return
    el.scrollLeft += dir === 'right' ? 3 : -3
  }, [])

  useEffect(() => {
    if (!hoverZone) {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      animRef.current = null
      return
    }
    const loop = () => { scroll(hoverZone); animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [hoverZone, scroll])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const w = rect.width
    if (x < w * 0.15) setHoverZone('left')
    else if (x > w * 0.85) setHoverZone('right')
    else setHoverZone(null)
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverZone(null)}>
      {hoverZone === 'left' && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '15%',
          background: 'linear-gradient(to right, var(--surface) 0%, transparent 100%)',
          zIndex: 2, display: 'flex', alignItems: 'center', paddingLeft: 4, pointerEvents: 'none' }}>
          <span style={{ fontSize: 16, color: 'var(--text-muted)', opacity: 0.7 }}>‹</span>
        </div>
      )}
      {hoverZone === 'right' && (
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '15%',
          background: 'linear-gradient(to left, var(--surface) 0%, transparent 100%)',
          zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          paddingRight: 4, pointerEvents: 'none' }}>
          <span style={{ fontSize: 16, color: 'var(--text-muted)', opacity: 0.7 }}>›</span>
        </div>
      )}
      <div ref={ref} style={{ display: 'flex', gap: 6, overflowX: 'auto',
        scrollbarWidth: 'none', maxWidth: '100%', minWidth: 0 }}>
        {series.slice(0, 25).map(s => {
          const href = uiUrl ? `${uiUrl}/series/${s.comicId}` : undefined
          const cover = s.imageUrl ? (
            <img src={s.imageUrl} alt={s.name} title={`${s.name}${s.year ? ` (${s.year})` : ''}`}
              style={{ width, height, objectFit: 'cover', borderRadius: 5, display: 'block', flexShrink: 0 }}
              loading="lazy" />
          ) : (
            <div style={{ width, height, borderRadius: 5, flexShrink: 0, background: 'var(--surface2)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 4px 6px' }}>
              <span style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center',
                lineHeight: 1.3, wordBreak: 'break-word' }}>{s.name}</span>
            </div>
          )
          return href ? (
            <a key={s.comicId} href={href} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>{cover}</a>
          ) : (
            <div key={s.comicId} style={{ flexShrink: 0 }}>{cover}</div>
          )
        })}
      </div>
    </div>
  )
}

// ── Stats row ─────────────────────────────────────────────────────────────────

function StatsRow({ data }: { data: Mylar3Data }) {
  return (
    <div style={{ display: 'flex', gap: 14, fontSize: 12, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ color: 'var(--text-dim)' }}>
        <span style={{ fontSize: 11 }}>📚</span>{' '}
        <strong style={{ color: 'var(--accent)' }}>{data.seriesCount}</strong> series
      </span>
      {data.wantedCount > 0 && (
        <span style={{ color: 'var(--text-dim)' }}>
          <span style={{ fontSize: 11 }}>⭐</span>{' '}
          <strong style={{ color: 'var(--amber)' }}>{data.wantedCount}</strong> wanted
        </span>
      )}
      {data.upcomingCount > 0 && (
        <span style={{ color: 'var(--text-dim)' }}>
          <span style={{ fontSize: 11 }}>📅</span>{' '}
          <strong style={{ color: 'var(--accent)' }}>{data.upcomingCount}</strong> upcoming
        </span>
      )}
      {data.wantedCount === 0 && data.upcomingCount === 0 && (
        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>all up to date</span>
      )}
    </div>
  )
}

// ── Issue list ────────────────────────────────────────────────────────────────

function IssueList({ issues, uiUrl, label, accent }: {
  issues: Mylar3Issue[]
  uiUrl: string
  label: string
  accent: string
}) {
  if (issues.length === 0) return null
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
        color: accent, marginBottom: 4, flexShrink: 0,
      }}>
        {label} ({issues.length})
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {issues.map((issue, i) => {
          const href = uiUrl && issue.comicId ? `${uiUrl}/series/${issue.comicId}` : undefined
          return (
            <div key={i} style={{
              padding: '4px 0',
              borderBottom: '1px solid var(--border)',
              fontSize: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                    {issue.comicName}
                  </a>
                ) : (
                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                    {issue.comicName}
                  </span>
                )}
                {issue.issueNumber && (
                  <span style={{ fontSize: 10, color: accent, fontWeight: 700, flexShrink: 0 }}>
                    #{issue.issueNumber}
                  </span>
                )}
                {issue.date && (
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>
                    {issue.date.slice(0, 10)}
                  </span>
                )}
              </div>
              {issue.issueName && (
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {issue.issueName}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Mylar3Panel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<Mylar3Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined

  const load = useCallback(async () => {
    try {
      const r = await integrationsApi.getPanelData(panel.id)
      setData(r.data)
      setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  const sseData = useSSE<Mylar3Data>(integrationId)
  useEffect(() => { if (sseData !== null) setData(sseData) }, [sseData])
  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>Loading...</div>
  if (error)   return <PanelError icon="📚" error={error} onRetry={load} />
  if (!data)   return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const series   = data.series   ?? []
  const wanted   = data.wanted   ?? []
  const upcoming = data.upcoming ?? []

  const wantedComicIds = new Set(wanted.map(i => i.comicId))
  const wantedSeries = series.filter(s => wantedComicIds.has(s.comicId))

  // ── 1x ───────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      height: '100%', overflow: 'hidden' }}>
      <span style={{ fontSize: 18 }}>🗞️</span>
      <StatsRow data={data} />
    </div>
  )

  // ── 2x–3x: stats + cover strip ────────────────────────────────────────────
  if (heightUnits < 4) return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      <StatsRow data={data} />
      {series.length > 0 && <CoverStrip series={series} uiUrl={uiUrl} height={80} />}
    </div>
  )

  // ── 4x+ ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      <StatsRow data={data} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 3 }}>Library</div>
          <CoverStrip series={series} uiUrl={uiUrl} height={72} />
        </div>
        {wantedSeries.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 3 }}>Wanted</div>
            <CoverStrip series={wantedSeries} uiUrl={uiUrl} height={72} />
          </div>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 14, overflow: 'hidden' }}>
        {wanted.length > 0 && (
          <IssueList issues={wanted} uiUrl={uiUrl} label="Wanted" accent="var(--amber)" />
        )}
        {upcoming.length > 0 && (
          <IssueList issues={upcoming} uiUrl={uiUrl} label="Upcoming" accent="var(--amber)" />
        )}
        {wanted.length === 0 && upcoming.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>All issues up to date</div>
        )}
      </div>
    </div>
  )
}
