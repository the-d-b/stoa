import { useEffect, useState, useCallback, useRef } from 'react'
import { integrationsApi, Panel } from '../../api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TraktCard {
  type: string
  title: string
  year?: number
  posterUrl?: string
  tmdbId?: number
  tvdbId?: number
  slug?: string
  watchers?: number
  watchedAt?: string
  showTitle?: string
  season?: number
  episode?: number
  epTitle?: string
}

interface TraktUserList {
  id: number
  slug: string
  name: string
  itemCount: number
}

interface TraktWatching {
  type: string
  title: string
  year?: number
  showTitle?: string
  season?: number
  episode?: number
  epTitle?: string
  expiresAt?: string
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
  stats: TraktStats
  trendingMovies: TraktCard[]
  trendingShows: TraktCard[]
  popularMovies: TraktCard[]
  popularShows: TraktCard[]
  anticipatedMovies: TraktCard[]
  anticipatedShows: TraktCard[]
  watchlistMovies: TraktCard[]
  watchlistShows: TraktCard[]
  userLists: TraktUserList[]
  listsError?: string
  history: TraktCard[]
}

type AddState = 'adding' | 'added' | 'error'

// ── Constants ─────────────────────────────────────────────────────────────────

const TRAKT_RED = '#E71C23'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRelDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
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

function fmtEp(card: TraktCard) {
  if (!card.season && !card.episode) return ''
  return `S${String(card.season ?? 0).padStart(2, '0')}E${String(card.episode ?? 0).padStart(2, '0')}`
}

function traktLink(card: TraktCard) {
  if (!card.slug) return undefined
  const type = card.type === 'movie' ? 'movies' : 'shows'
  return `https://trakt.tv/${type}/${card.slug}`
}

function cardKey(c: TraktCard) {
  return `${c.type}:${c.tmdbId ?? c.slug ?? c.title}`
}

// ── TraktCoverStrip ───────────────────────────────────────────────────────────
// Custom filmstrip with per-card +/✓/✗ action button overlay.

function TraktCoverStrip({ cards, height = 110, onAdd, addStates, canAddMovie, canAddShow }: {
  cards: TraktCard[]
  height?: number
  onAdd?: (card: TraktCard) => void
  addStates?: Record<string, AddState>
  canAddMovie: boolean
  canAddShow: boolean
}) {
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
    const loop = () => {
      scroll(hoverZone)
      animRef.current = requestAnimationFrame(loop)
    }
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

  const visible = cards.filter(c => c.posterUrl)
  if (!visible.length) {
    return <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-dim)' }}>No artwork available</div>
  }

  const width = Math.round(height * 0.67)

  return (
    <div style={{ padding: '6px 0', position: 'relative' }}
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
        scrollbarWidth: 'none', maxWidth: '100%', minWidth: 0, padding: '0 10px' }}>
        {visible.map(card => {
          const key = cardKey(card)
          const isMovie = card.type === 'movie'
          const isShow = card.type === 'show' || card.type === 'episode'
          const showBtn = onAdd && (
            (isMovie && canAddMovie && !!card.tmdbId) ||
            (isShow && canAddShow && !!card.tvdbId)
          )
          const st = addStates?.[key]
          const link = traktLink(card)

          return (
            <div key={key} style={{ position: 'relative', flexShrink: 0 }}>
              {link
                ? <a href={link} target="_blank" rel="noopener noreferrer">
                    <img src={card.posterUrl} alt={card.title} width={width} height={height}
                      style={{ objectFit: 'cover', borderRadius: 5, display: 'block' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  </a>
                : <img src={card.posterUrl} alt={card.title} width={width} height={height}
                    style={{ objectFit: 'cover', borderRadius: 5, display: 'block' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              }
              {showBtn && (
                <button
                  onClick={e => { e.preventDefault(); e.stopPropagation(); if (st !== 'added') onAdd!(card) }}
                  disabled={st === 'adding' || st === 'added'}
                  title={
                    st === 'added' ? 'Added!' :
                    st === 'error' ? 'Failed — click to retry' :
                    st === 'adding' ? 'Adding…' :
                    isMovie ? 'Add to Radarr' : 'Add to Sonarr'
                  }
                  style={{
                    position: 'absolute', bottom: 4, right: 4,
                    width: 22, height: 22, borderRadius: '50%', border: 'none',
                    cursor: st === 'added' ? 'default' : 'pointer',
                    background: st === 'added' ? '#22c55e' : st === 'error' ? '#ef4444' : 'rgba(0,0,0,0.72)',
                    color: 'white', fontSize: 13, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1, zIndex: 3, boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                  }}>
                  {st === 'adding' ? '…' : st === 'added' ? '✓' : st === 'error' ? '✗' : '+'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WatchingBadge({ w }: { w: TraktWatching }) {
  const label = w.type === 'movie'
    ? w.title + (w.year ? ` (${w.year})` : '')
    : `${w.showTitle || w.title} ${fmtEp(w as TraktCard)}${w.epTitle ? ` — ${w.epTitle}` : ''}`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
      borderRadius: 8, background: TRAKT_RED + '12', border: `1px solid ${TRAKT_RED}30`,
      flexShrink: 0 }}>
      <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
        background: TRAKT_RED, flexShrink: 0, boxShadow: `0 0 6px ${TRAKT_RED}` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, color: TRAKT_RED, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em' }}>Watching now</div>
        <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      </div>
      <span style={{ fontSize: 12, flexShrink: 0 }}>{w.type === 'movie' ? '🎬' : '📺'}</span>
    </div>
  )
}

function StatsBar({ stats }: { stats: TraktStats }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
      {[
        { val: stats.moviesWatched, label: '🎬 movies' },
        { val: stats.episodesWatched, label: '📺 episodes' },
        ...(stats.ratingsTotal > 0 ? [{ val: stats.ratingsTotal, label: '★ ratings' }] : []),
      ].map(({ val, label }) => (
        <div key={label} style={{ flex: 1, padding: '5px 8px', borderRadius: 7, textAlign: 'center',
          background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)',
            fontFamily: 'DM Mono, monospace' }}>{val.toLocaleString()}</div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.05em', marginTop: 1 }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

function TabBar({ tabs, active, onChange }: {
  tabs: { key: string; label: string }[]
  active: string
  onChange: (k: string) => void
}) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          padding: '5px 14px', fontSize: 11, border: 'none', cursor: 'pointer',
          background: 'transparent',
          color: active === t.key ? TRAKT_RED : 'var(--text-dim)',
          fontWeight: active === t.key ? 700 : 400,
          borderBottom: active === t.key ? `2px solid ${TRAKT_RED}` : '2px solid transparent',
          marginBottom: -1,
        }}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

function AccordionSection({ icon, label, count, isOpen, onToggle, children }: {
  icon: string; label: string; count?: number
  isOpen: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0 }}>
      <button onClick={onToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', background: isOpen ? 'var(--surface2)' : 'transparent',
        border: 'none', cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
      }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{label}</span>
        {count !== undefined && count > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)',
            background: 'var(--surface2)', borderRadius: 10, padding: '1px 7px',
            border: '1px solid var(--border)' }}>{count}</span>
        )}
        <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && <div style={{ borderTop: '1px solid var(--border)' }}>{children}</div>}
    </div>
  )
}

function ListsContent({ lists, username }: { lists: TraktUserList[]; username: string }) {
  if (!lists.length) {
    return (
      <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-dim)' }}>
        No custom lists found
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px' }}>
      {lists.map(l => (
        <a key={l.id}
          href={`https://trakt.tv/users/${username}/lists/${l.slug}`}
          target="_blank" rel="noreferrer"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '7px 12px', borderRadius: 7, background: 'var(--surface2)',
            border: '1px solid var(--border)', textDecoration: 'none' }}>
          <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{l.name}</span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
            {l.itemCount} items ↗
          </span>
        </a>
      ))}
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

const SECTION_DEFS = [
  { id: 'trending',    icon: '📈', label: 'Trending',     moviesKey: 'trendingMovies',    showsKey: 'trendingShows' },
  { id: 'popular',     icon: '⭐', label: 'Popular',      moviesKey: 'popularMovies',     showsKey: 'popularShows' },
  { id: 'anticipated', icon: '🎯', label: 'Anticipated',  moviesKey: 'anticipatedMovies', showsKey: 'anticipatedShows' },
  { id: 'watchlist',   icon: '📌', label: 'My Watchlist', moviesKey: 'watchlistMovies',   showsKey: 'watchlistShows' },
] as const

export default function TraktPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<TraktData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({})
  const [addStates, setAddStates] = useState<Record<string, AddState>>({})

  // Parse ARR config from panel config
  const panelCfg = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const radarrIntId: string = panelCfg.radarrIntegrationId ?? ''
  const sonarrIntId: string = panelCfg.sonarrIntegrationId ?? ''

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

  useEffect(() => {
    if (!data || openSection !== null) return
    for (const s of SECTION_DEFS) {
      const movies = data[s.moviesKey] as TraktCard[]
      const shows = data[s.showsKey] as TraktCard[]
      if (movies?.length || shows?.length) { setOpenSection(s.id); break }
    }
    if (data.history?.length) setOpenSection(prev => prev ?? 'history')
    if (data.userLists?.length) setOpenSection(prev => prev ?? 'lists')
  }, [data])

  const getTab = (id: string) => activeTabs[id] ?? 'movies'
  const setTab = (id: string, tab: string) => setActiveTabs(p => ({ ...p, [id]: tab }))
  const toggle = (id: string) => setOpenSection(prev => prev === id ? null : id)

  async function handleAdd(card: TraktCard) {
    const key = cardKey(card)
    const isMovie = card.type === 'movie'
    setAddStates(p => ({ ...p, [key]: 'adding' }))
    try {
      await integrationsApi.panelAction(panel.id, {
        action: isMovie ? 'add_to_radarr' : 'add_to_sonarr',
        tmdbId: card.tmdbId,
        tvdbId: card.tvdbId,
        title: card.title,
      })
      setAddStates(p => ({ ...p, [key]: 'added' }))
    } catch {
      setAddStates(p => ({ ...p, [key]: 'error' }))
    }
  }

  if (loading) return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>Loading…</div>
  if (error)   return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>🎬 {error}</div>
  if (!data)   return null

  const canAddMovie = radarrIntId !== ''
  const canAddShow = sonarrIntId !== ''

  // ── 1× ─────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    const display = data.watching ?? data.history?.[0]
    const isLive = !!data.watching
    return (
      <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8,
        height: '100%', overflow: 'hidden' }}>
        {isLive && (
          <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: TRAKT_RED, boxShadow: `0 0 5px ${TRAKT_RED}`, display: 'inline-block' }} />
        )}
        {display ? (
          <>
            <span style={{ fontSize: 15, flexShrink: 0 }}>{display.type === 'movie' ? '🎬' : '📺'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(display as TraktWatching).showTitle || display.title}
              </div>
              {display.type === 'episode' && (
                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                  {fmtEp(display as TraktCard)}{(display as TraktCard).epTitle ? ` ${(display as TraktCard).epTitle}` : ''}
                </div>
              )}
            </div>
            {!isLive && (display as TraktCard).watchedAt && (
              <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
                {fmtRelDate((display as TraktCard).watchedAt!)}
              </span>
            )}
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>@{data.username} — no history yet</span>
        )}
      </div>
    )
  }

  // ── 2×+ ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column',
      gap: 8, padding: '8px 10px' }}>

      {data.watching && <WatchingBadge w={data.watching} />}

      <StatsBar stats={data.stats} />

      {/* Tabbed carousel sections */}
      {SECTION_DEFS.map(s => {
        const movies = (data[s.moviesKey] as TraktCard[]) ?? []
        const shows  = (data[s.showsKey]  as TraktCard[]) ?? []
        const total  = movies.length + shows.length
        const tab    = getTab(s.id)
        const items  = tab === 'movies' ? movies : shows
        return (
          <AccordionSection key={s.id} icon={s.icon} label={s.label} count={total}
            isOpen={openSection === s.id} onToggle={() => toggle(s.id)}>
            <TabBar
              tabs={[
                { key: 'movies', label: `Movies${movies.length ? ` (${movies.length})` : ''}` },
                { key: 'shows',  label: `Shows${shows.length ? ` (${shows.length})` : ''}` },
              ]}
              active={tab}
              onChange={k => setTab(s.id, k)}
            />
            <TraktCoverStrip cards={items} height={110}
              onAdd={handleAdd} addStates={addStates}
              canAddMovie={canAddMovie} canAddShow={canAddShow} />
          </AccordionSection>
        )
      })}

      {/* Watch History */}
      <AccordionSection icon="🕐" label="Watch History" count={data.history?.length}
        isOpen={openSection === 'history'} onToggle={() => toggle('history')}>
        <TraktCoverStrip cards={data.history ?? []} height={110}
          onAdd={handleAdd} addStates={addStates}
          canAddMovie={canAddMovie} canAddShow={canAddShow} />
      </AccordionSection>

      {/* My Lists */}
      <AccordionSection icon="📋" label="My Lists" count={data.userLists?.length}
        isOpen={openSection === 'lists'} onToggle={() => toggle('lists')}>
        {data.listsError
          ? <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-dim)',
              fontFamily: 'DM Mono, monospace', wordBreak: 'break-all' }}>
              ⚠️ {data.listsError}
            </div>
          : <ListsContent lists={data.userLists ?? []} username={data.username} />
        }
      </AccordionSection>

    </div>
  )
}
