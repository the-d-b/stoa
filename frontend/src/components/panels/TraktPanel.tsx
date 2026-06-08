import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface TraktWatching {
  type: string
  title: string
  year?: number
  showTitle?: string
  season?: number
  episode?: number
  epTitle?: string
  expiresAt?: string
  tmdbId?: number
  imdbId?: string
}

interface TraktHistoryItem {
  type: string
  title: string
  year?: number
  watchedAt: string
  showTitle?: string
  season?: number
  episode?: number
  epTitle?: string
}

interface TraktStats {
  moviesWatched: number
  episodesWatched: number
  ratingsTotal: number
  ratingsDist?: Record<string, number>
}

interface TraktData {
  username: string
  watching?: TraktWatching
  history: TraktHistoryItem[]
  stats: TraktStats
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TRAKT_RED = '#E71C23'

function fmtRelDate(iso: string) {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(diff / 3600000)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(diff / 86400000)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function fmtEpisode(item: { season?: number; episode?: number }) {
  if (!item.season && !item.episode) return ''
  return `S${String(item.season ?? 0).padStart(2, '0')}E${String(item.episode ?? 0).padStart(2, '0')}`
}

function itemLabel(item: TraktHistoryItem | TraktWatching) {
  if (item.type === 'movie') {
    return item.title + (item.year ? ` (${item.year})` : '')
  }
  const show = item.showTitle || item.title
  const ep = fmtEpisode(item)
  const epTitle = item.epTitle ? ` — ${item.epTitle}` : ''
  return `${show} ${ep}${epTitle}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WatchingBadge({ w }: { w: TraktWatching }) {
  const label = itemLabel(w)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
      borderRadius: 8, background: TRAKT_RED + '12', border: `1px solid ${TRAKT_RED}30` }}>
      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
        background: TRAKT_RED, flexShrink: 0, boxShadow: `0 0 6px ${TRAKT_RED}` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: TRAKT_RED, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 1 }}>
          Watching now
        </div>
        <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      </div>
      <span style={{ fontSize: 11, flexShrink: 0 }}>
        {w.type === 'movie' ? '🎬' : '📺'}
      </span>
    </div>
  )
}

function HistoryRow({ item }: { item: TraktHistoryItem }) {
  const isMovie = item.type === 'movie'
  const mainLabel = isMovie ? item.title : (item.showTitle || item.title)
  const sub = isMovie
    ? (item.year ? String(item.year) : '')
    : `${fmtEpisode(item)}${item.epTitle ? ` ${item.epTitle}` : ''}`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0',
      borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{isMovie ? '🎬' : '📺'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: 'var(--text)' }}>{mainLabel}</div>
        {sub && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
        )}
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
        {fmtRelDate(item.watchedAt)}
      </span>
    </div>
  )
}

function RatingChart({ dist }: { dist: Record<string, number> }) {
  const maxCount = Math.max(...Object.values(dist), 1)
  const ratings = ['1','2','3','4','5','6','7','8','9','10']
  const ratingColor = (r: string) => {
    const n = parseInt(r)
    if (n <= 3) return '#f85149'
    if (n <= 5) return '#d29922'
    if (n <= 7) return '#58a6ff'
    return '#3fb950'
  }
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: 6 }}>
        Rating distribution
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 52 }}>
        {ratings.map(r => {
          const count = dist[r] ?? 0
          const h = count > 0 ? Math.max(3, (count / maxCount) * 44) : 0
          return (
            <div key={r} style={{ flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 2 }}>
              <div style={{ width: '100%', height: 44, display: 'flex',
                flexDirection: 'column', justifyContent: 'flex-end' }}>
                {count > 0 ? (
                  <div style={{ width: '100%', height: h, background: ratingColor(r),
                    borderRadius: '2px 2px 1px 1px', minHeight: 3 }}
                    title={`${r}★: ${count}`} />
                ) : (
                  <div style={{ width: '100%', height: 3, background: 'var(--border)', borderRadius: 2 }} />
                )}
              </div>
              <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>{r}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatRow({ movies, episodes }: { movies: number; episodes: number }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ flex: 1, padding: '6px 10px', borderRadius: 8,
        background: 'var(--surface2)', border: '1px solid var(--border)', textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)',
          fontFamily: 'DM Mono, monospace' }}>{movies.toLocaleString()}</div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase',
          letterSpacing: '0.06em' }}>🎬 movies</div>
      </div>
      <div style={{ flex: 1, padding: '6px 10px', borderRadius: 8,
        background: 'var(--surface2)', border: '1px solid var(--border)', textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)',
          fontFamily: 'DM Mono, monospace' }}>{episodes.toLocaleString()}</div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase',
          letterSpacing: '0.06em' }}>📺 episodes</div>
      </div>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function TraktPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<TraktData | null>(null)
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
  if (error)   return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>🎬 {error}</div>
  if (!data)   return null

  const last = data.history?.[0] ?? null

  // ── 1× ─────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    const display = data.watching ?? last
    const isWatching = !!data.watching
    return (
      <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8,
        height: '100%', overflow: 'hidden' }}>
        {isWatching && (
          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
            background: TRAKT_RED, flexShrink: 0, boxShadow: `0 0 5px ${TRAKT_RED}` }} />
        )}
        {display ? (
          <>
            <span style={{ fontSize: 16, flexShrink: 0 }}>
              {display.type === 'movie' ? '🎬' : '📺'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {display.showTitle || display.title}
              </div>
              {display.type === 'episode' && (
                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                  {fmtEpisode(display)}
                  {display.epTitle ? ` ${display.epTitle}` : ''}
                </div>
              )}
            </div>
            {!isWatching && last && (
              <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
                {fmtRelDate(last.watchedAt)}
              </span>
            )}
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            @{data.username} — no recent history
          </span>
        )}
      </div>
    )
  }

  // ── 2–3× ───────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.watching && (
          <div style={{ flexShrink: 0 }}>
            <WatchingBadge w={data.watching} />
          </div>
        )}
        <div style={{ flexShrink: 0 }}>
          <StatRow movies={data.stats.moviesWatched} episodes={data.stats.episodesWatched} />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {(data.history ?? []).slice(0, 12).map((item, i) => (
            <HistoryRow key={i} item={item} />
          ))}
        </div>
      </div>
    )
  }

  // ── 4×+ ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.watching && (
        <div style={{ flexShrink: 0 }}>
          <WatchingBadge w={data.watching} />
        </div>
      )}
      <div style={{ flexShrink: 0 }}>
        <StatRow movies={data.stats.moviesWatched} episodes={data.stats.episodesWatched} />
      </div>
      {data.stats.ratingsDist && Object.keys(data.stats.ratingsDist).length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <RatingChart dist={data.stats.ratingsDist} />
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 4 }}>
          Watch history
        </div>
        {(data.history ?? []).map((item, i) => (
          <HistoryRow key={i} item={item} />
        ))}
      </div>
    </div>
  )
}
