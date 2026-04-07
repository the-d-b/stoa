import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface SonarrEpisode {
  id: number; seriesTitle: string; titleSlug: string; title: string
  season: number; episode: number; airDate: string; hasFile: boolean
}
interface SonarrHistory {
  seriesTitle: string; titleSlug: string; title: string
  date: string; season: number; episode: number
}
interface SonarrSeries { id: number; title: string; titleSlug: string; year: number }
interface SonarrData {
  upcoming: SonarrEpisode[]; history: SonarrHistory[]
  zeroByte: SonarrSeries[]; uiUrl: string
  seriesCount: number; episodeCount: number; onDiskCount: number
}

function formatDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatRelative(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.round((d.getTime() - now.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 8) return `In ${diff}d`
  if (diff < 0 && diff > -8) return `${Math.abs(diff)}d ago`
  return formatDate(iso)
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

function UpcomingGroups({ groups, uiUrl }: {
  groups: { label: string; isToday: boolean; episodes: SonarrEpisode[] }[]
  uiUrl: string
}) {
  return (
    <>
      {groups.map(group => (
        <div key={group.label} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700,
            color: group.isToday ? 'var(--accent2)' : 'var(--text-muted)', marginBottom: 2 }}>
            {group.label}
          </div>
          {group.episodes.map(ep => (
            <div key={ep.id} style={{ display: 'flex', alignItems: 'center', gap: 6,
              padding: '2px 0 2px 8px', opacity: ep.hasFile ? 0.5 : 1 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <SeriesLink uiUrl={uiUrl} titleSlug={ep.titleSlug} title={ep.seriesTitle} />
                <span style={{ color: 'var(--text-dim)' }}>
                  {' — '}{epCode(ep.season, ep.episode)} · {ep.title}
                </span>
              </div>
              {ep.hasFile && <span style={{ fontSize: 9, color: 'var(--green)', flexShrink: 0 }}>✓</span>}
            </div>
          ))}
        </div>
      ))}
    </>
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

export default function SonarrPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<SonarrData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const refreshSecs = config.refreshSecs || 300

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setData(res.data)
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
        { label: 'Series',   value: data.seriesCount },
        { label: 'Episodes', value: data.episodeCount.toLocaleString() },
        { label: 'On disk',  value: data.onDiskCount.toLocaleString() },
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

  const maxBuckets = heightUnits >= 4 ? 8 : 4
  const groupedUpcoming = (() => {
    const groups: { label: string; isToday: boolean; episodes: SonarrEpisode[] }[] = []
    for (const ep of (data.upcoming || [])) {
      if (groups.length >= maxBuckets) break
      const rel = formatRelative(ep.airDate)
      const existing = groups.find(g => g.label === rel)
      if (existing) existing.episodes.push(ep)
      else if (groups.length < maxBuckets) groups.push({ label: rel, isToday: rel === 'Today', episodes: [ep] })
    }
    return groups
  })()

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
      <div style={{ height: '100%', display: 'flex', alignItems: 'center' }}>
        {statsBar}
      </div>
    )
  }

  // ── 2x — stats + recent activity (upcoming + recently downloaded) ────────
  if (heightUnits < 3) {
    return (
      <div style={{ height: '100%', overflow: 'auto' }}>
        {statsBar}
        {sectionTitle('Upcoming')}
        {groupedUpcoming.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No upcoming episodes</div>
          : <UpcomingGroups groups={groupedUpcoming} uiUrl={uiUrl} />
        }
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
        {statsBar}
        {sectionTitle('Recently downloaded')}
        {groupedHistory.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent downloads</div>
          : <HistoryGroups groups={groupedHistory} uiUrl={uiUrl} />
        }
        {(data.zeroByte || []).length > 0 && (
          <>
            {sectionTitle(`Missing on disk (${data.zeroByte.length})`)}
            {data.zeroByte.map(s => (
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

  // ── 4x — stats + upcoming + recently downloaded + missing on disk ─────────
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {statsBar}

      {sectionTitle('Upcoming')}
      {groupedUpcoming.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No upcoming episodes</div>
        : <UpcomingGroups groups={groupedUpcoming} uiUrl={uiUrl} />
      }

      {sectionTitle('Recently downloaded')}
      {groupedHistory.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent downloads</div>
        : <HistoryGroups groups={groupedHistory} uiUrl={uiUrl} />
      }

      {(data.zeroByte || []).length > 0 && (
        <>
          {sectionTitle(`Missing on disk (${data.zeroByte.length})`)}
          {data.zeroByte.map(s => (
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
