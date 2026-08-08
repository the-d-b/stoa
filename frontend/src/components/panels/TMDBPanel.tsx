import { useEffect, useState, useCallback, useRef } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

// ── Types ─────────────────────────────────────────────────────────────────────
//
// TMDB has no concept of personal watch history/stats — it's pure metadata,
// unlike Trakt. This panel is discovery-only: trending/popular/upcoming/
// top-rated + personal account lists (if connected), with the same
// Add-to-Radarr/Sonarr flow TraktPanel has.

interface TMDBCard {
  type: string // "movie" | "show"
  title: string
  year?: number
  posterUrl?: string
  tmdbId?: number
}

interface TMDBList {
  id: number
  name: string
  itemCount: number
}

interface TMDBData {
  trendingMovies: TMDBCard[]
  trendingShows: TMDBCard[]
  popularMovies: TMDBCard[]
  popularShows: TMDBCard[]
  upcomingMovies: TMDBCard[]
  upcomingShows: TMDBCard[]
  topRatedMovies: TMDBCard[]
  topRatedShows: TMDBCard[]
  accountConnected: boolean
  accountUsername?: string
  lists?: TMDBList[]
}

type AddState = 'adding' | 'added' | 'error'

const TMDB_BLUE = '#01b4e4'

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmdbLink(card: TMDBCard) {
  if (!card.tmdbId) return undefined
  const kind = card.type === 'movie' ? 'movie' : 'tv'
  return `https://www.themoviedb.org/${kind}/${card.tmdbId}`
}

function cardKey(c: TMDBCard) {
  return `${c.type}:${c.tmdbId ?? c.title}`
}

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem('stoa_token') ?? ''}` }
}

// ── Cover strip with add-button overlay ────────────────────────────────────────
// Same interaction shape as TraktPanel's TraktCoverStrip — edge-hover
// auto-scroll, per-card +/…/✓/✗ overlay button — but the movie/show gate
// only needs tmdbId (both media types carry one natively from TMDB), unlike
// Trakt shows which needed a tvdbId up front. The Sonarr TVDB lookup happens
// lazily server-side on click instead (see panel_actions.go).

function TMDBCoverStrip({ cards, height = 110, onAdd, addStates, canAddMovie, canAddShow }: {
  cards: TMDBCard[]
  height?: number
  onAdd?: (card: TMDBCard) => void
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
          const isShow = card.type === 'show'
          const showBtn = onAdd && !!card.tmdbId && (
            (isMovie && canAddMovie) || (isShow && canAddShow)
          )
          const st = addStates?.[key]
          const link = tmdbLink(card)

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
          color: active === t.key ? TMDB_BLUE : 'var(--text-dim)',
          fontWeight: active === t.key ? 700 : 400,
          borderBottom: active === t.key ? `2px solid ${TMDB_BLUE}` : '2px solid transparent',
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

// One personal list — fetches its items on demand the first time it's expanded.
function ListRow({ list, integrationId, onAdd, addStates, canAddMovie, canAddShow }: {
  list: TMDBList
  integrationId: string
  onAdd: (card: TMDBCard) => void
  addStates: Record<string, AddState>
  canAddMovie: boolean
  canAddShow: boolean
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<TMDBCard[] | null>(null)
  const [loading, setLoading] = useState(false)

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && items === null && !loading) {
      setLoading(true)
      fetch(`/api/tmdb/list/${list.id}?integrationId=${integrationId}`, { headers: authHeader() })
        .then(r => r.json())
        .then(d => setItems(d.items || []))
        .catch(() => setItems([]))
        .finally(() => setLoading(false))
    }
  }

  return (
    <div>
      <button onClick={toggle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        width: '100%', padding: '7px 12px', borderRadius: 7, background: 'var(--surface2)',
        border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{list.name}</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
          {list.itemCount} items {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        loading
          ? <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-dim)' }}>Loading…</div>
          : <TMDBCoverStrip cards={items ?? []} height={110}
              onAdd={onAdd} addStates={addStates}
              canAddMovie={canAddMovie} canAddShow={canAddShow} />
      )}
    </div>
  )
}

function ListsContent({ lists, integrationId, onAdd, addStates, canAddMovie, canAddShow }: {
  lists: TMDBList[]
  integrationId: string
  onAdd: (card: TMDBCard) => void
  addStates: Record<string, AddState>
  canAddMovie: boolean
  canAddShow: boolean
}) {
  if (!lists.length) {
    return <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-dim)' }}>No lists found</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px' }}>
      {lists.map(l => (
        <ListRow key={l.id} list={l} integrationId={integrationId}
          onAdd={onAdd} addStates={addStates} canAddMovie={canAddMovie} canAddShow={canAddShow} />
      ))}
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

const SECTION_DEFS = [
  { id: 'trending',  icon: '📈', label: 'Trending',   moviesKey: 'trendingMovies',  showsKey: 'trendingShows' },
  { id: 'popular',   icon: '⭐', label: 'Popular',    moviesKey: 'popularMovies',   showsKey: 'popularShows' },
  { id: 'upcoming',  icon: '🗓️', label: 'Upcoming',   moviesKey: 'upcomingMovies',  showsKey: 'upcomingShows' },
  { id: 'topRated',  icon: '🏆', label: 'Top Rated',  moviesKey: 'topRatedMovies',  showsKey: 'topRatedShows' },
] as const

export default function TMDBPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<TMDBData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({})
  const [addStates, setAddStates] = useState<Record<string, AddState>>({})

  const panelCfg = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const radarrIntId: string = panelCfg.radarrIntegrationId ?? ''
  const sonarrIntId: string = panelCfg.sonarrIntegrationId ?? ''
  const integrationId: string | undefined = panelCfg.integrationId

  const load = useCallback(async () => {
    try {
      const r = await integrationsApi.getPanelData(panel.id)
      setData(r.data)
      setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  const sseData = useSSE<TMDBData>(integrationId)
  useEffect(() => { if (sseData !== null) setData(sseData) }, [sseData])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!data || openSection !== null) return
    for (const s of SECTION_DEFS) {
      const movies = data[s.moviesKey] as TMDBCard[]
      const shows = data[s.showsKey] as TMDBCard[]
      if (movies?.length || shows?.length) { setOpenSection(s.id); break }
    }
  }, [data])

  const getTab = (id: string) => activeTabs[id] ?? 'movies'
  const setTab = (id: string, tab: string) => setActiveTabs(p => ({ ...p, [id]: tab }))
  const toggle = (id: string) => setOpenSection(prev => prev === id ? null : id)

  async function handleAdd(card: TMDBCard) {
    const key = cardKey(card)
    const isMovie = card.type === 'movie'
    setAddStates(p => ({ ...p, [key]: 'adding' }))
    try {
      await integrationsApi.panelAction(panel.id, {
        action: isMovie ? 'add_to_radarr' : 'add_to_sonarr',
        tmdbId: card.tmdbId,
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

  // ── 1× — compact counts ──────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    const total = SECTION_DEFS.reduce((sum, s) => {
      const movies = (data[s.moviesKey] as TMDBCard[])?.length ?? 0
      const shows = (data[s.showsKey] as TMDBCard[])?.length ?? 0
      return sum + movies + shows
    }, 0)
    return (
      <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, height: '100%' }}>
        <span style={{ fontSize: 15 }}>🎬</span>
        <span style={{ fontSize: 12, color: 'var(--text)' }}>{total.toLocaleString()} titles to discover</span>
        {data.accountConnected && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>
            @{data.accountUsername}
          </span>
        )}
      </div>
    )
  }

  // ── 2×+ ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column',
      gap: 8, padding: '8px 10px' }}>

      {SECTION_DEFS.map(s => {
        const movies = (data[s.moviesKey] as TMDBCard[]) ?? []
        const shows  = (data[s.showsKey]  as TMDBCard[]) ?? []
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
            <TMDBCoverStrip cards={items} height={110}
              onAdd={handleAdd} addStates={addStates}
              canAddMovie={canAddMovie} canAddShow={canAddShow} />
          </AccordionSection>
        )
      })}

      {/* Personal lists (only meaningful once a TMDB account is connected) */}
      {data.accountConnected ? (
        <AccordionSection icon="📋" label={`My Lists${data.accountUsername ? ` (@${data.accountUsername})` : ''}`}
          count={data.lists?.length}
          isOpen={openSection === 'lists'} onToggle={() => toggle('lists')}>
          <ListsContent lists={data.lists ?? []} integrationId={integrationId ?? ''}
            onAdd={handleAdd} addStates={addStates} canAddMovie={canAddMovie} canAddShow={canAddShow} />
        </AccordionSection>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '4px 2px' }}>
          Connect your TMDB account (Admin → Integrations) to see your personal lists here.
        </div>
      )}

    </div>
  )
}
