import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface SonarrEpisode {
  id: number; seriesTitle: string; title: string
  season: number; episode: number; airDate: string; hasFile: boolean
}
interface SonarrHistory {
  seriesTitle: string; title: string; date: string; season: number; episode: number
}
interface SonarrSeries { id: number; title: string; year: number }
interface SonarrData {
  upcoming: SonarrEpisode[]; history: SonarrHistory[]
  zeroByte: SonarrSeries[]; uiUrl: string
}

function formatDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function UpcomingGroups({ groups, uiUrl, epCode }: {
  groups: { label: string; isToday: boolean; episodes: SonarrEpisode[] }[]
  uiUrl: string
  epCode: (s: number, e: number) => string
}) {
  return (
    <>
      {groups.map(group => (
        <div key={group.label} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700,
            color: group.isToday ? 'var(--accent2)' : 'var(--text-muted)',
            marginBottom: 2 }}>
            {group.label}
          </div>
          {group.episodes.map(ep => (
            <div key={ep.id} style={{ display: 'flex', alignItems: 'center', gap: 6,
              padding: '2px 0 2px 8px', opacity: ep.hasFile ? 0.5 : 1 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ fontWeight: 500 }}>{ep.seriesTitle}</span>
                <span style={{ color: 'var(--text-dim)' }}>
                  {': '}{epCode(ep.season, ep.episode)} · {ep.title}
                </span>
              </div>
              {ep.hasFile && <span style={{ fontSize: 9, color: 'var(--green)', flexShrink: 0 }}>✓</span>}
              {uiUrl && (
                <a href={`${uiUrl}/series`} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--text-dim)', fontSize: 10, textDecoration: 'none', opacity: 0.4, flexShrink: 0 }}>↗</a>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

function HistoryGroups({ groups }: {
  groups: { seriesTitle: string; episodes: SonarrHistory[] }[]
}) {
  return (
    <>
      {groups.map(group => (
        <div key={group.seriesTitle} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            {group.seriesTitle}
            <span style={{ fontSize: 9, color: 'var(--green)' }}>✓</span>
          </div>
          {group.episodes.map((h, i) => {
            const ep = h.season > 0
              ? `S${String(h.season).padStart(2,'0')}E${String(h.episode).padStart(2,'0')}`
              : ''
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
                <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
                  fontFamily: 'DM Mono, monospace' }}>
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
      console.error(`[SonarrPanel:${panel.id}]`, e.message)
    } finally { setLoading(false) }
  }, [panel.id])

  useEffect(() => {
    load()
    const interval = setInterval(load, refreshSecs * 1000)
    return () => clearInterval(interval)
  }, [load, refreshSecs])

  const uiUrl = data?.uiUrl || ''

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

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 4, marginTop: 10 }}>
      {text}
    </div>
  )

  // Group upcoming by date bucket (Today / Tomorrow / this week / by date)
  const groupedUpcoming = (() => {
    const groups: { label: string; isToday: boolean; episodes: SonarrEpisode[] }[] = []
    for (const ep of (data.upcoming || [])) {
      const rel = formatRelative(ep.airDate)
      const existing = groups.find(g => g.label === rel)
      if (existing) existing.episodes.push(ep)
      else groups.push({ label: rel, isToday: rel === 'Today', episodes: [ep] })
    }
    return groups
  })()

  // Group history by series title
  const groupedHistory = (() => {
    const groups: { seriesTitle: string; episodes: SonarrHistory[] }[] = []
    for (const h of (data.history || [])) {
      const existing = groups.find(g => g.seriesTitle === h.seriesTitle)
      if (existing) existing.episodes.push(h)
      else groups.push({ seriesTitle: h.seriesTitle, episodes: [h] })
    }
    return groups
  })()

  const epCode = (season: number, episode: number) =>
    `S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}`

  // 1x — compact grouped upcoming
  if (heightUnits <= 1) {
    return (
      <div style={{ height: '100%', overflow: 'hidden' }}>
        {groupedUpcoming.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No upcoming episodes</div>
          : groupedUpcoming.map(group => (
            <div key={group.label}>
              <span style={{
                fontSize: 10, fontWeight: 700,
                color: group.isToday ? 'var(--accent2)' : 'var(--text-dim)',
                marginRight: 6,
              }}>{group.label}</span>
              {group.episodes.map(ep => (
                <span key={ep.id} style={{ fontSize: 11, color: 'var(--text)', marginRight: 10 }}>
                  {ep.seriesTitle}: {epCode(ep.season, ep.episode)}
                </span>
              ))}
            </div>
          ))
        }
      </div>
    )
  }

  // 2x — grouped upcoming + grouped history
  if (heightUnits < 4) {
    return (
      <div style={{ height: '100%', overflow: 'auto' }}>
        {sectionTitle('Upcoming')}
        {groupedUpcoming.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No upcoming episodes</div>
          : <UpcomingGroups groups={groupedUpcoming} uiUrl={uiUrl} epCode={epCode} />
        }
        {sectionTitle('Recently downloaded')}
        {groupedHistory.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent downloads</div>
          : <HistoryGroups groups={groupedHistory} />
        }
      </div>
    )
  }

  // 4x — grouped upcoming + grouped history + missing on disk
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {sectionTitle('Upcoming')}
      {groupedUpcoming.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No upcoming episodes</div>
        : <UpcomingGroups groups={groupedUpcoming} uiUrl={uiUrl} epCode={epCode} />
      }

      {sectionTitle('Recently downloaded')}
      {groupedHistory.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent downloads</div>
        : <HistoryGroups groups={groupedHistory} />
      }

      {(data.zeroByte || []).length > 0 && (
        <>
          {sectionTitle(`Missing on disk (${data.zeroByte.length})`)}
          {data.zeroByte.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.title}{s.year > 0 && <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 5 }}>{s.year}</span>}
              </span>
              {uiUrl && (
                <a href={`${uiUrl}/series`} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--text-dim)', fontSize: 11, textDecoration: 'none', opacity: 0.4 }}>↗</a>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
