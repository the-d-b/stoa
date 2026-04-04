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

function HistoryRow({ h }: { h: SonarrHistory }) {
  const ep = h.season > 0
    ? `S${String(h.season).padStart(2,'0')}E${String(h.episode).padStart(2,'0')}`
    : ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', minWidth: 36, textAlign: 'right', color: 'var(--text-dim)' }}>
        {formatDate(h.date)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {h.seriesTitle}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ep}{ep && h.title ? ' · ' : ''}{h.title}
        </div>
      </div>
      <span style={{ fontSize: 9, color: 'var(--green)' }}>✓</span>
    </div>
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
      letterSpacing: '0.07em', marginBottom: 6, marginTop: 12 }}>
      {text}
    </div>
  )

  const episodeRow = (ep: SonarrEpisode) => {
    const rel = formatRelative(ep.airDate)
    const isToday = rel === 'Today'
    const isPast = new Date(ep.airDate) < new Date()
    return (
      <div key={ep.id} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
        borderBottom: '1px solid var(--border)',
        opacity: ep.hasFile ? 0.5 : 1,
      }}>
        <span style={{
          fontSize: 10, fontFamily: 'DM Mono, monospace', minWidth: 36, textAlign: 'right',
          color: isToday ? 'var(--accent2)' : isPast ? 'var(--red)' : 'var(--text-muted)',
          fontWeight: isToday ? 700 : 400,
        }}>{rel}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ep.seriesTitle}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            S{String(ep.season).padStart(2,'0')}E{String(ep.episode).padStart(2,'0')} · {ep.title}
          </div>
        </div>
        {ep.hasFile && <span style={{ fontSize: 9, color: 'var(--green)' }}>✓</span>}
        {uiUrl && (
          <a href={`${uiUrl}/series`} target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--text-dim)', fontSize: 11, textDecoration: 'none', opacity: 0.4 }}
            title="Open in Sonarr" onClick={e => e.stopPropagation()}>↗</a>
        )}
      </div>
    )
  }

  // 1x — next 5 upcoming only
  if (heightUnits <= 1) {
    const items = (data.upcoming || []).slice(0, 5)
    return (
      <div style={{ height: '100%', overflow: 'hidden' }}>
        {items.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No upcoming episodes</div>
          : items.map(ep => episodeRow(ep))
        }
      </div>
    )
  }

  // 2x — upcoming + history
  if (heightUnits < 4) {
    return (
      <div style={{ height: '100%', overflow: 'auto' }}>
        {sectionTitle('Upcoming')}
        {(data.upcoming || []).slice(0, 5).map(ep => episodeRow(ep))}
        {(data.upcoming || []).length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No upcoming episodes</div>
        )}
        {sectionTitle('Recently downloaded')}
        {(data.history || []).map((h, i) => (
          <HistoryRow key={i} h={h} />
        ))}
        {(data.history || []).length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent downloads</div>
        )}
      </div>
    )
  }

  // 4x — upcoming + history + zero-byte series
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {sectionTitle('Upcoming')}
      {(data.upcoming || []).slice(0, 5).map(ep => episodeRow(ep))}
      {(data.upcoming || []).length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No upcoming episodes</div>
      )}

      {sectionTitle('Recently downloaded')}
      {(data.history || []).map((h, i) => <HistoryRow key={i} h={h} />)}

      {(data.zeroByte || []).length > 0 && (
        <>
          {sectionTitle(`Missing on disk (${data.zeroByte.length})`)}
          {data.zeroByte.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title}
                </span>
                {s.year > 0 && <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 6 }}>{s.year}</span>}
              </div>
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
