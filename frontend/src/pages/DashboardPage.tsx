import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { panelsApi, porticosApi, bookmarksApi, myBookmarksApi, tagsApi, myTagsApi, preferencesApi, Panel, Wall, Tag, BookmarkNode } from '../api'
import { useUserMode } from '../context/UserModeContext'
import BookmarkTree from '../components/BookmarkTree'
import CalendarPanel from '../components/panels/CalendarPanel'
import SonarrPanel from '../components/panels/SonarrPanel'
import SearchModal from '../components/SearchModal'

export default function DashboardPage() {
  const { isAdmin } = useAuth()
  const [panels, setPanels] = useState<Panel[]>([])
  const [walls, setWalls] = useState<Wall[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [subtrees, setSubtrees] = useState<Record<string, BookmarkNode>>({})
  const [activeWallId, setActiveWallId] = useState<string>('home')
  const [activeTags, setActiveTags] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [savingWall, setSavingWall] = useState(false)
  const [newWallName, setNewWallName] = useState('')
  const [showSaveWall, setShowSaveWall] = useState(false)
  const [showTagFilter, setShowTagFilter] = useState(false) // mobile toggle
  const [density, setDensity] = useState('normal')
  const [activePortico, setActivePortico] = useState<Wall | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        console.log('[Dashboard] loading panels, walls, tags...')
        const [p, w, t, myT] = await Promise.all([
          panelsApi.list(),
          porticosApi.list(),
          tagsApi.list(),
          myTagsApi.list(),
        ])
        console.log(`[Dashboard] panels=${p.data?.length} walls=${w.data?.length} tags=${(t.data?.length||0)+(myT.data?.length||0)}`)
        // Load user density preference
        try {
          const prefs = await preferencesApi.get()
          setDensity(prefs.data.density || 'normal')
        } catch {}
        if (p.data) {
          p.data.forEach((panel: Panel) => {
            console.log(`[Dashboard] panel=${panel.id} title="${panel.title}" position=${panel.position} scope=${panel.scope}`)
          })
        }
        console.log('[Dashboard] panel order from API:')
        ;(p.data || []).forEach((panel: any) => console.log(`  panel: ${panel.id} "${panel.title}" pos=${panel.position} scope=${panel.scope}`))

        const panelData: Panel[] = p.data || []
        const wallData: Wall[] = w.data || []
        const tagData: Tag[] = [...(t.data || []), ...(myT.data || [])]

        setPanels(panelData)
        setWalls(wallData)
        setAllTags(tagData)
        setActiveTags(tagData.map((tag: Tag) => tag.id))
        sessionStorage.setItem('active_portico', 'home')
        window.dispatchEvent(new CustomEvent('portico-change', { detail: 'home' }))

        // Load subtrees for bookmark panels
        const map: Record<string, BookmarkNode> = {}
        for (const panel of panelData) {
          if (panel.type === 'bookmarks') {
            try {
              const config = JSON.parse(panel.config || '{}')
              // Personal panels are owned by a user (createdBy != 'SYSTEM' and != '')
              const isPersonal = !!panel.createdBy && panel.createdBy !== 'SYSTEM'

              if (isPersonal) {
                // Load from personal bookmark tree
                const res = await myBookmarksApi.tree()
                map[panel.id] = {
                  id: 'personal-root', name: 'My Bookmarks', path: '/', type: 'section',
                  sortOrder: 0, scope: 'personal', createdAt: '',
                  children: res.data || [],
                }
              } else if (config.rootNodeId) {
                const res = await bookmarksApi.subtree(config.rootNodeId)
                map[panel.id] = res.data
              } else {
                const res = await bookmarksApi.tree()
                map[panel.id] = {
                  id: 'root', name: 'root', path: '/shared', type: 'section',
                  sortOrder: 0, scope: 'shared', createdAt: '',
                  children: res.data || [],
                }
              }
            } catch (e) {
              console.warn(`[Dashboard] failed to load subtree for panel ${panel.id}:`, e)
            }
          }
        }
        setSubtrees(map)
      } catch (e: any) {
        const msg = e.response?.data?.error || e.message || 'Unknown error'
        console.error('[Dashboard] load failed:', e)
        setLoadError(msg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Backend returns panels pre-sorted by saved position
  // We only filter here, do NOT re-sort (would override saved order)
  const visiblePanels = activeTags === null ? panels : panels.filter(panel => {
    // Personal panels: check wall assignment
    if (panel.scope === 'personal') {
      if (activeWallId === 'home' || activeWallId === '') return true
      // Check if user has assigned this personal panel to this wall
      // We use panel config to store wall assignments for simplicity
      const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
      const assignedWalls: string[] = config.assignedWalls || []
      return assignedWalls.includes(activeWallId)
    }
    if (!panel.tags || panel.tags.length === 0) return true
    return panel.tags.some(t => activeTags.includes(t.id))
  })

  const toggleTag = (tagId: string) => {
    setActiveTags(prev => {
      const current = prev ?? allTags.map(t => t.id)
      return current.includes(tagId) ? current.filter(id => id !== tagId) : [...current, tagId]
    })
    setActiveWallId('')
  }

  const selectWall = async (wall: Wall | 'home') => {
    if (wall === 'home') {
      setActiveWallId('home')
      setActivePortico(null)
      sessionStorage.setItem('active_portico', 'home')
      window.dispatchEvent(new CustomEvent('portico-change', { detail: 'home' }))
      setActiveTags(allTags.map(t => t.id))
      // Reload panels with Home ordering (no wall_id)
      try {
        const sysRes = await panelsApi.list()
        console.log('[Dashboard] reloaded panels for Home, count=', sysRes.data?.length)
        setPanels(sysRes.data || [])
      } catch (e) { console.error('[Dashboard] reload failed:', e) }
    } else {
      setActiveWallId(wall.id)
      setActivePortico(wall)
      sessionStorage.setItem('active_portico', wall.id)
      window.dispatchEvent(new CustomEvent('portico-change', { detail: wall.id }))
      setActiveTags((wall.tags || []).filter(t => t.active).map(t => t.tagId))
      // Reload panels with this wall's ordering
      try {
        const sysRes = await panelsApi.list(wall.id)
        console.log('[Dashboard] reloaded panels for wall=' + wall.id + ' count=', sysRes.data?.length)
        setPanels(sysRes.data || [])
      } catch (e) { console.error('[Dashboard] reload failed:', e) }
    }
  }

  const saveWall = async () => {
    if (!newWallName.trim()) return
    setSavingWall(true)
    try {
      // Create the portico
      const res = await porticosApi.create(newWallName.trim(), false)
      const wall = res.data

      // Save current active tags to this portico
      const currentActive = activeTags ?? allTags.map(t => t.id)
      for (const tag of allTags) {
        await porticosApi.setTagActive(wall.id, tag.id, currentActive.includes(tag.id))
      }

      // Reload portico list then switch to the new one
      const updated = await porticosApi.list()
      setWalls(updated.data)

      // Apply the new portico's filter (same as current active tags)
      setActiveWallId(wall.id)
      setActiveTags(currentActive)
      setShowSaveWall(false)
      setNewWallName('')

      // Reload panels with new portico ordering context
      const sysPanels = await panelsApi.list(wall.id)
      setPanels(sysPanels.data || [])
    } catch (e) {
      console.error('[Dashboard] failed to save portico:', e)
      alert('Failed to save portico. Check console for details.')
    } finally {
      setSavingWall(false)
    }
  }

  const isUnsaved = activeWallId === '' || (!['home'].includes(activeWallId) && !walls.find(w => w.id === activeWallId))

  // Flatten all visible panel bookmark nodes for search
  const searchNodes: BookmarkNode[] = []
  for (const panel of visiblePanels) {
    const sub = subtrees[panel.id]
    if (sub) {
      const nodes = ['root', 'personal-root', 'shared-root'].includes(sub.id)
        ? (sub.children || []) : [sub]
      searchNodes.push(...nodes)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{
        margin: '40px auto', maxWidth: 500, padding: 24, borderRadius: 10,
        background: '#f8717110', border: '1px solid #f8717140', color: 'var(--red)',
      }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Failed to load dashboard</div>
        <div style={{ fontSize: 13, fontFamily: 'DM Mono, monospace' }}>{loadError}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Check browser console and backend logs for details.
        </div>
      </div>
    )
  }

  if (panels.length === 0) return <EmptyState isAdmin={isAdmin} />

  return (
    <div style={{ display: 'flex', gap: 20, position: 'relative' }}>
      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Mobile filter toggle - only on Home or unsaved */}
        {(activeWallId === 'home' || activeWallId === '') && (
        <div className="mobile-only" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={() => setShowTagFilter(s => !s)}
          >
            {showTagFilter ? '✕ Hide filters' : '◇ Filter'}
          </button>
        </div>

        )}
        {/* Mobile tag filter (collapsible) */}
        {showTagFilter && allTags.length > 0 && (
          <div className="mobile-only" style={{
            marginBottom: 12, padding: 12, background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 10,
          }}>
            <TagFilter
              allTags={allTags}
              activeTags={activeTags}
              onToggle={toggleTag}
              onAll={() => { setActiveTags(allTags.map(t => t.id)); setActiveWallId('home') }}
              onNone={() => { setActiveTags([]); setActiveWallId('') }}
            />
          </div>
        )}

        {/* Wall tabs */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2, marginBottom: 20,
          borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
        }}>
          <WallTab label="Home" active={activeWallId === 'home'} onClick={() => selectWall('home')} />
          {walls.map(wall => (
            <WallTab key={wall.id} label={wall.name} active={activeWallId === wall.id}
              onClick={() => selectWall(wall)}
              onDelete={async () => {
                await porticosApi.delete(wall.id)
                const updated = await porticosApi.list()
                setWalls(updated.data)
                selectWall('home')
              }}
            />
          ))}
          <div style={{ flex: 1 }} />
          {isUnsaved && (
            showSaveWall ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 4 }}>
                <input className="input" value={newWallName} onChange={e => setNewWallName(e.target.value)}
                  placeholder="Portico name" style={{ padding: '3px 8px', fontSize: 12, width: 140 }}
                  autoFocus onKeyDown={e => e.key === 'Enter' && saveWall()} />
                <button className="btn btn-primary" style={{ fontSize: 11, padding: '3px 10px' }}
                  onClick={saveWall} disabled={savingWall}>
                  {savingWall ? <span className="spinner" /> : 'Save'}
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={() => setShowSaveWall(false)}>Cancel</button>
              </div>
            ) : (
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', marginBottom: 4 }}
                onClick={() => setShowSaveWall(true)}>+ Save as portico</button>
            )
          )}
        </div>

        {/* Panels — layout engine */}
        <PanelGrid
          panels={visiblePanels}
          subtrees={subtrees}
          portico={activePortico}
          density={density}
        />

        {visiblePanels.length === 0 && activeTags !== null && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 14 }}>
            No panels visible with current tag filters.
            {allTags.length > 0 && (
              <button className="btn btn-ghost" style={{ marginLeft: 12, fontSize: 13 }}
                onClick={() => { setActiveTags(allTags.map(t => t.id)); setActiveWallId('home') }}>
                Show all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tag sidebar — desktop only, hidden on named walls */}
      {allTags.length > 0 && (activeWallId === 'home' || activeWallId === '') && (
        <div className="desktop-only" style={{
          width: 180, flexShrink: 0, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 10,
          padding: 14, height: 'fit-content', position: 'sticky', top: 72,
        }}>
          <div className="section-title" style={{ marginBottom: 12 }}>Filter</div>
          <TagFilter
            allTags={allTags}
            activeTags={activeTags}
            onToggle={toggleTag}
            onAll={() => { setActiveTags(allTags.map(t => t.id)); setActiveWallId('home') }}
            onNone={() => { setActiveTags([]); setActiveWallId('') }}
          />
        </div>
      )}
    <SearchModal allNodes={searchNodes} />
    </div>
  )
}

function TagFilter({ allTags, activeTags, onToggle, onAll, onNone }: {
  allTags: Tag[]
  activeTags: string[] | null
  onToggle: (id: string) => void
  onAll: () => void
  onNone: () => void
}) {
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {allTags.map(tag => {
          const on = activeTags === null || activeTags.includes(tag.id)
          return (
            <button key={tag.id} onClick={() => onToggle(tag.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
              background: on ? tag.color + '20' : 'var(--surface2)',
              border: `1px solid ${on ? tag.color + '50' : 'var(--border)'}`,
              color: on ? tag.color : 'var(--text-muted)',
              fontSize: 12, fontWeight: on ? 500 : 400, transition: 'all 0.15s',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: 2, flexShrink: 0,
                background: on ? tag.color : 'var(--text-dim)', transition: 'background 0.15s',
              }} />
              {tag.name}
            </button>
          )
        })}
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', flex: 1 }} onClick={onAll}>All</button>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', flex: 1 }} onClick={onNone}>None</button>
      </div>
    </>
  )
}

function WallTab({ label, active, onClick, onDelete }: {
  label: string; active: boolean; onClick: () => void; onDelete?: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: -1 }}>
      <button onClick={onClick} style={{
        background: active ? 'var(--accent-bg)' : 'transparent',
        color: active ? 'var(--accent2)' : 'var(--text-muted)',
        border: 'none', borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        padding: '7px 12px', fontSize: 13, fontWeight: active ? 500 : 400,
        cursor: 'pointer', borderRadius: '6px 6px 0 0', transition: 'all 0.15s',
      }}>{label}</button>
      {onDelete && (
        <button onClick={onDelete} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-dim)', fontSize: 10, padding: '0 2px', opacity: 0.4,
        }}
          onMouseOver={e => e.currentTarget.style.opacity = '1'}
          onMouseOut={e => e.currentTarget.style.opacity = '0.4'}
          title="Delete portico">✕</button>
      )}
    </div>
  )
}

// ── Flow slot ────────────────────────────────────────────────────────────────
// Wrapper that owns the grid-row span; inner card sizes itself freely
// This lets the card collapse to pill height without fighting the grid slot

function FlowSlot({ heightUnits, children }: { heightUnits: number; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false)
  // When collapsed: use gridRowEnd auto + fixed small height to escape gridAutoRows constraint
  // When expanded: span the full height units
  const PILL_HEIGHT = 42 // collapsed card header height in px
  return (
    <div style={
      collapsed
        ? {
            // Escape gridAutoRows by overriding with explicit pixel height
            // grid-row: span 1 would still be 136px; instead use auto placement
            gridRow: 'auto',
            height: `${PILL_HEIGHT}px`,
            alignSelf: 'start',
          }
        : {
            gridRow: `span ${heightUnits}`,
            alignSelf: 'start',
          }
    }>
      {React.cloneElement(children as React.ReactElement, {
        onCollapseChange: setCollapsed,
      })}
    </div>
  )
}

// ── Layout engine ────────────────────────────────────────────────────────────

const DENSITY_MIN_WIDTH: Record<string, number> = {
  compact:     180,
  normal:      240,
  comfortable: 320,
}

const ROW_UNIT = 120 // px per 1x unit
const GRID_GAP = 16  // gap between panels

function PanelGrid({ panels, subtrees, portico, density }: {
  panels: Panel[]
  subtrees: Record<string, BookmarkNode>
  portico: Wall | null
  density: string
}) {
  const layout      = portico?.layout      ?? 'columns'
  const colCount    = portico?.columnCount  ?? 2
  const colHeight   = portico?.columnHeight ?? 8
  const minColWidth = DENSITY_MIN_WIDTH[density] ?? 240

  if (panels.length === 0) return null

  if (layout === 'flow') {
    // Flow: auto-fill columns by min width, panels wrap naturally
    // Each card uses grid-row: span N so rows don't overlap
    // gridAutoRows includes the gap so that span N * (ROW_UNIT+GAP) - GAP
    // gives perfect alignment between e.g. two 4x === one 8x
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${minColWidth}px, 1fr))`,
        gridAutoRows: `${ROW_UNIT + GRID_GAP}px`,
        gap: `${GRID_GAP}px`,
      }}>
        {panels.map(panel => {
          const h = getPanelHeight(panel)
          return (
            <FlowSlot key={panel.id} heightUnits={h}>
              <PanelCard panel={panel} subtree={subtrees[panel.id]} />
            </FlowSlot>
          )
        })}
      </div>
    )
  }

  // Column-first: fixed column count, panels distributed top-to-bottom
  // Assign panels to columns by filling each column up to colHeight units
  const columns: Panel[][] = Array.from({ length: colCount }, () => [])
  const colFill = new Array(colCount).fill(0)

  for (const panel of panels) {
    const height = getPanelHeight(panel)
    // Find column with most room that can fit this panel
    let best = 0
    let bestFill = Infinity
    for (let c = 0; c < colCount; c++) {
      if (colFill[c] + height <= colHeight && colFill[c] < bestFill) {
        best = c
        bestFill = colFill[c]
      }
    }
    // If no column fits, start overflow by picking least-full column
    if (bestFill === Infinity) {
      best = colFill.indexOf(Math.min(...colFill))
    }
    columns[best].push(panel)
    colFill[best] += height
  }

  // In column mode, density influences effective min width check for readability
  // but column count is explicitly set on the portico
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${colCount}, minmax(${minColWidth}px, 1fr))`,
      gap: 16,
      alignItems: 'start',
    }}>
      {columns.map((col, ci) => (
        <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {col.map(panel => (
            <PanelCard key={panel.id} panel={panel} subtree={subtrees[panel.id]} />
          ))}
        </div>
      ))}
    </div>
  )
}

function getPanelHeight(panel: Panel): number {
  try {
    const config = JSON.parse(panel.config || '{}')
    return config.height ?? 2
  } catch { return 2 }
}

// ── Panel card ────────────────────────────────────────────────────────────────

function PanelCard({ panel, subtree, onCollapseChange }: {
  panel: Panel; subtree?: BookmarkNode
  onCollapseChange?: (collapsed: boolean) => void
}) {
  const [treeExpanded, setTreeExpanded] = useState<boolean | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const heightUnits = getPanelHeight(panel)
  const cardHeight = heightUnits * (ROW_UNIT + GRID_GAP) - GRID_GAP

  // Strip root section — if rootNodeId points to a section, show its children directly
  const displayNodes = (() => {
    if (!subtree) return []
    if (['root', 'personal-root', 'shared-root'].includes(subtree.id)) return subtree.children || []
    if (subtree.type === 'section') return subtree.children || []
    return [subtree]
  })()

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.15s',
      display: 'flex', flexDirection: 'column',
      height: collapsed ? 'auto' : `${cardHeight}px`,
    }}
      onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
      onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      {/* Header */}
      <div style={{
        padding: '8px 14px',
        borderBottom: collapsed ? 'none' : '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      }}>
        <button onClick={() => {
            const next = !collapsed
            setCollapsed(next)
            onCollapseChange?.(next)
          }} title={collapsed ? 'Expand' : 'Collapse'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
            color: 'var(--text-dim)', fontSize: 9, opacity: 0.5, lineHeight: 1,
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
          onMouseOver={e => e.currentTarget.style.opacity = '1'}
          onMouseOut={e => e.currentTarget.style.opacity = '0.5'}
        >▼</button>

        <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{panel.title}</span>

        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {(panel.tags || []).map(t => (
              <span key={t.id} style={{ width: 6, height: 6, borderRadius: '50%', background: t.color }} title={t.name} />
            ))}
            {panel.type === 'bookmarks' && <>
              <button onClick={() => setTreeExpanded(s => s === true ? null : true)} title="Expand all"
                style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid var(--border)',
                  background: 'var(--surface2)', color: 'var(--text-muted)', cursor: 'pointer',
                  fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1, padding: 0 }}>+</button>
              <button onClick={() => setTreeExpanded(s => s === false ? null : false)} title="Collapse all"
                style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid var(--border)',
                  background: 'var(--surface2)', color: 'var(--text-muted)', cursor: 'pointer',
                  fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1, padding: 0 }}>−</button>
            </>}
          </div>
        )}
      </div>

      {/* Content */}
      {!collapsed && (
        <div style={{ padding: '10px 14px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {panel.type === 'bookmarks' && !subtree && (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Loading...</div>
          )}
          {panel.type === 'bookmarks' && subtree && displayNodes.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No bookmarks in this panel.</div>
          )}
          {panel.type === 'bookmarks' && subtree && displayNodes.length > 0 && (
            <BookmarkTree nodes={displayNodes} externalExpanded={treeExpanded} />
          )}
          {panel.type === 'calendar' && (
            <CalendarPanel panel={panel} heightUnits={heightUnits} />
          )}
          {panel.type === 'sonarr' && (
            <SonarrPanel panel={panel} heightUnits={heightUnits} />
          )}
          {panel.type === 'iframe' && (() => {
            const cfg = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
            return cfg.url
              ? <iframe src={cfg.url} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 4 }}
                  title={panel.title} sandbox="allow-scripts allow-same-origin allow-forms" />
              : <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: 8 }}>No URL configured — edit this panel in My Panels to set one.</div>
          })()}
          {panel.type === 'custom' && (() => {
            const cfg = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
            return cfg.html
              ? <div dangerouslySetInnerHTML={{ __html: cfg.html }} style={{ fontSize: 13 }} />
              : <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: 8 }}>No content configured — edit this panel in My Panels to add HTML.</div>
          })()}
        </div>
      )}
    </div>
  )
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  const userMode = useUserMode()
  const singleUser = userMode === 'single'
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '55vh', textAlign: 'center',
    }}>
      <div style={{ marginBottom: 20, opacity: 0.1 }}>
        <svg width="72" height="72" viewBox="0 0 32 32" fill="none">
          <rect x="2" y="24" width="28" height="3" rx="1.5" fill="var(--text)" />
          <rect x="4" y="8" width="3" height="16" rx="1.5" fill="var(--text)" />
          <rect x="10" y="8" width="3" height="16" rx="1.5" fill="var(--text)" />
          <rect x="19" y="8" width="3" height="16" rx="1.5" fill="var(--text)" />
          <rect x="25" y="8" width="3" height="16" rx="1.5" fill="var(--text)" />
          <rect x="2" y="5" width="28" height="3" rx="1.5" fill="var(--text)" />
        </svg>
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px', letterSpacing: '-0.02em' }}>No panels yet</h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 340, lineHeight: 1.7, margin: 0 }}>
        {isAdmin
          ? singleUser
            ? <>Go to <a href="/profile?tab=bookmarks" style={{ color: 'var(--accent2)', textDecoration: 'none' }}>My Bookmarks</a> to add content,
               then create <a href="/profile?tab=mypanels" style={{ color: 'var(--accent2)', textDecoration: 'none' }}>My Panels</a> to display it.</>
            : <>Go to <a href="/admin/bookmarks" style={{ color: 'var(--accent2)', textDecoration: 'none' }}>Bookmarks</a> to add content,
               then create <a href="/admin/panels" style={{ color: 'var(--accent2)', textDecoration: 'none' }}>Panels</a> to display it.</>
          : "The admin hasn't added any panels yet."}
      </p>
    </div>
  )
}
