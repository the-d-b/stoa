import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface SonarrEpisode {
  id: number; seriesTitle: string; titleSlug: string; title: string
  season: number; episode: number; airDate: string; hasFile: boolean
  posterUrl?: string
}
interface SonarrHistory {
  seriesTitle: string; titleSlug: string; title: string
  date: string; season: number; episode: number
  posterUrl?: string
}
interface SonarrSeries { id: number; title: string; titleSlug: string; year: number }
interface SonarrData {
  upcoming: SonarrEpisode[]; history: SonarrHistory[]
  zeroByte: SonarrSeries[]; zeroByteCount: number; uiUrl: string
  seriesCount: number; episodeCount: number; onDiskCount: number
}

function formatDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function epCode(season: number, episode: number) {
  return `S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}`
}

// Link to Sonarr series page if uiUrl + titleSlug available, else TVDB
function seriesHref(uiUrl: string, titleSlug: string, title: string) {
  if (uiUrl && titleSlug) return `${uiUrl}/series/${titleSlug}`
  if (titleSlug) return `https://www.thetvdb.com/series/${titleSlug}`
  return `https://www.thetvdb.com/search?query=${encodeURIComponent(title)}`
}

const linkStyle: React.CSSProperties = {
  color: 'inherit', textDecoration: 'none', fontWeight: 500,
}
const linkHover = (e: React.MouseEvent<HTMLAnchorElement>) => {
  e.currentTarget.style.textDecoration = 'underline'
}
const linkOut = (e: React.MouseEvent<HTMLAnchorElement>) => {
  e.currentTarget.style.textDecoration = 'none'
}

function SeriesLink({ uiUrl, titleSlug, title }: { uiUrl: string; titleSlug: string; title: string }) {
  return (
    <a href={seriesHref(uiUrl, titleSlug, title)} target="_blank" rel="noopener noreferrer"
      style={linkStyle} onMouseOver={linkHover} onMouseOut={linkOut}>
      {title}
    </a>
  )
}

function HistoryGroups({ groups, uiUrl }: {
  groups: { seriesTitle: string; titleSlug: string; episodes: SonarrHistory[] }[]
  uiUrl: string
}) {
  return (
    <>
      {groups.map(group => (
        <div key={group.seriesTitle} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <SeriesLink uiUrl={uiUrl} titleSlug={group.titleSlug} title={group.seriesTitle} />
            <span style={{ fontSize: 9, color: 'var(--green)' }}>✓</span>
          </div>
          {group.episodes.map((h, i) => {
            const ep = h.season > 0 ? epCode(h.season, h.episode) : ''
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6,
                padding: '1px 0 1px 8px', fontSize: 11 }}>
                <span style={{ color: 'var(--text-dim)', minWidth: 32, fontFamily: 'DM Mono, monospace', fontSize: 10 }}>
                  {ep}
                </span>
                <span style={{ flex: 1, color: 'var(--text-muted)', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {h.title}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, fontFamily: 'DM Mono, monospace' }}>
                  {formatDate(h.date)}
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}

function PosterStrip({ items, uiUrl }: { items: { posterUrl?: string; titleSlug?: string; seriesTitle?: string }[]; uiUrl: string }) {
  const posters = items.filter(i => i.posterUrl)
  if (posters.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10,
      scrollbarWidth: 'none' }}>
      {posters.map((item, i) => (
        <a key={i} href={uiUrl && item.titleSlug ? `${uiUrl}/series/${item.titleSlug}` : uiUrl}
          target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
          <img src={item.posterUrl} alt={item.seriesTitle || ''}
            style={{ height: 80, width: 54, objectFit: 'cover', borderRadius: 5,
              display: 'block', opacity: 0.85 }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </a>
      ))}
    </div>
  )
}

export default function SonarrPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<SonarrData | null>(null)
  const [zeroByteSample, setZeroByteSample] = useState<SonarrSeries[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const SAMPLE_SIZE = 8

  const resample = (zeroByte: SonarrSeries[]) => {
    const shuffled = [...zeroByte].sort(() => Math.random() - 0.5)
    setZeroByteSample(shuffled.slice(0, SAMPLE_SIZE))
  }

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const refreshSecs = config.refreshSecs || 300

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setData(res.data)
      resample(res.data.zeroByte || [])
      setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  useEffect(() => {
    load()
    const interval = setInterval(load, refreshSecs * 1000)
    return () => clearInterval(interval)
  }, [load, refreshSecs])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>
      Loading…
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}>
      <span>⚠</span><span>{error}</span>
    </div>
  )

  if (!data) return null

  const uiUrl = data.uiUrl || ''

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 4, marginTop: 10 }}>
      {text}
    </div>
  )

  const statsBar = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {[
        { label: 'Series',   value: (data.seriesCount ?? 0).toLocaleString() },
        { label: 'Episodes', value: (data.episodeCount ?? 0).toLocaleString() },
        { label: 'On disk',  value: (data.onDiskCount ?? 0).toLocaleString() },
      ].map(stat => (
        <div key={stat.label} style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 5,
          background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11,
        }}>
          <span style={{ color: 'var(--text-dim)' }}>{stat.label}</span>
          <span style={{ fontWeight: 600, fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{stat.value}</span>
        </div>
      ))}
    </div>
  )


  const groupedHistory = (() => {
    const groups: { seriesTitle: string; titleSlug: string; episodes: SonarrHistory[] }[] = []
    for (const h of (data.history || [])) {
      const existing = groups.find(g => g.seriesTitle === h.seriesTitle)
      if (existing) existing.episodes.push(h)
      else groups.push({ seriesTitle: h.seriesTitle, titleSlug: h.titleSlug, episodes: [h] })
    }
    return groups
  })()

  // ── 1x — stats bar only ─────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {statsBar}
      </div>
    )
  }

  const allPosters = [...(data.upcoming || []), ...(data.history || [])]

  // ── 2x — stats + recently downloaded ────────────────────────────────────
  if (heightUnits < 3) {
    return (
      <div style={{ height: '100%', overflow: 'auto' }}>
        <PosterStrip items={allPosters} uiUrl={uiUrl} />
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>{statsBar}</div>
        {sectionTitle('Recently downloaded')}
        {groupedHistory.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent downloads</div>
          : <HistoryGroups groups={groupedHistory} uiUrl={uiUrl} />
        }
      </div>
    )
  }

  // ── 3x — stats + recently downloaded + missing on disk ─────────────────
  if (heightUnits < 4) {
    return (
      <div style={{ height: '100%', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>{statsBar}</div>
        {sectionTitle('Recently downloaded')}
        {groupedHistory.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent downloads</div>
          : <HistoryGroups groups={groupedHistory} uiUrl={uiUrl} />
        }
        {(data.zeroByteCount || 0) > 0 && (
          <>
            {sectionTitle(`Missing on disk — ${data.zeroByteCount} total`)}
            {zeroByteSample.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8,
                padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <SeriesLink uiUrl={uiUrl} titleSlug={s.titleSlug} title={s.title} />
                  {s.year > 0 && <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 5 }}>{s.year}</span>}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    )
  }

  // ── 4x — stats + recently downloaded + missing on disk ─────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <PosterStrip items={allPosters} uiUrl={uiUrl} />
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>{statsBar}</div>

      {sectionTitle('Recently downloaded')}
      {groupedHistory.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent downloads</div>
        : <HistoryGroups groups={groupedHistory} uiUrl={uiUrl} />
      }

      {(data.zeroByteCount || 0) > 0 && (
        <>
          {sectionTitle(`Missing on disk — ${data.zeroByteCount} total`)}
          {zeroByteSample.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8,
              padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <SeriesLink uiUrl={uiUrl} titleSlug={s.titleSlug} title={s.title} />
                {s.year > 0 && <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 5 }}>{s.year}</span>}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
