import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { panelsApi, porticosApi, bookmarksApi, myBookmarksApi, tagsApi, preferencesApi, customColumnsApi, integrationsApi, Panel, Portico, Tag, BookmarkNode } from '../api'
import { useSSEConnected } from '../hooks/useSSE'
import { useUserMode } from '../context/UserModeContext'
import BookmarkTree from '../components/BookmarkTree'
import CalendarPanel from '../components/panels/CalendarPanel'
import SonarrPanel from '../components/panels/SonarrPanel'
import RadarrPanel from '../components/panels/RadarrPanel'
import LidarrPanel from '../components/panels/LidarrPanel'
import PlexPanel from '../components/panels/PlexPanel'
import TautulliPanel from '../components/panels/TautulliPanel'
import TrueNASPanel from '../components/panels/TrueNASPanel'
import ProxmoxPanel from '../components/panels/ProxmoxPanel'
import KumaPanel from '../components/panels/KumaPanel'
import GluetunPanel from '../components/panels/GluetunPanel'
import OPNsensePanel from '../components/panels/OPNsensePanel'
import TransmissionPanel from '../components/panels/TransmissionPanel'
import PhotoPrismPanel from '../components/panels/PhotoPrismPanel'
import AuthentikPanel from '../components/panels/AuthentikPanel'
import ChecklistPanel from '../components/panels/ChecklistPanel'
import NotesPanel from '../components/panels/NotesPanel'
import CustomAPIPanel from '../components/panels/CustomAPIPanel'
import RSSPanel from '../components/panels/RSSPanel'
import WeatherPanel from '../components/panels/WeatherPanel'
import SteamPanel from '../components/panels/SteamPanel'
import ReadarrPanel from '../components/panels/ReadarrPanel'
import SearchModal from '../components/SearchModal'

export default function DashboardPage() {
  // Open SSE connection unconditionally so cache workers start even without
  // OPNsense/TrueNAS panels. This keeps Plex, Sonarr, etc. cache warm.
  useSSEConnected()
  const { isAdmin } = useAuth()
  const [panels, setPanels] = useState<Panel[]>([])
  const [porticos, setPorticos] = useState<Portico[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [subtrees, setSubtrees] = useState<Record<string, BookmarkNode>>({})
  const [activePorticoId, setActivePorticoId] = useState<string>('home')
  const [allExpanded, setAllExpanded] = useState<boolean | null>(null) // null = default
  const [customColumns, setCustomColumns] = useState<Record<string,number>>({})

  // Listen for expand/collapse events from ThemeSwitcher buttons
  useEffect(() => {
    const handler = (e: Event) => {
      setAllExpanded((e as CustomEvent).detail.expand)
    }
    window.addEventListener('stoa:expandAll', handler)
    return () => window.removeEventListener('stoa:expandAll', handler)
  }, [])

  // Reset expand/collapse state when switching porticos so each starts fresh
  useEffect(() => {
    setAllExpanded(null)
    setCustomColumns({})
  }, [activePorticoId])


  const [activeTags, setActiveTags] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [savingPortico, setSavingPortico] = useState(false)
  const [newPorticoName, setNewPorticoName] = useState('')
  const [showSavePortico, setShowSavePortico] = useState(false)
  const [showTagFilter, setShowTagFilter] = useState(false) // mobile toggle
  const [density, setDensity] = useState('normal')
  const [activePortico, setActivePortico] = useState<Portico | null>(null)

  // Load custom column assignments when portico or layout changes
  useEffect(() => {
    if (activePortico?.layout === 'custom' && activePorticoId !== 'home') {
      customColumnsApi.get(activePorticoId).then(r => setCustomColumns(r.data || {}))
    } else {
      setCustomColumns({})
    }
  }, [activePorticoId, activePortico?.layout])

  useEffect(() => {
    const load = async () => {
      try {
        const [p, w, t] = await Promise.all([
          panelsApi.list(),
          porticosApi.list(),
          tagsApi.list(),
        ])
        // Load user density preference
        try {
          const prefs = await preferencesApi.get()
          setDensity(prefs.data.density || 'normal')
        } catch {}
        const panelData: Panel[] = p.data || []
        const wallData: Portico[] = w.data || []
        const tagData: Tag[] = t.data || []

        setPanels(panelData)
        setPorticos(wallData)
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
      if (activePorticoId === 'home' || activePorticoId === '') return true
      // Check if user has assigned this personal panel to this wall
      // We use panel config to store wall assignments for simplicity
      const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
      const assignedWalls: string[] = config.assignedWalls || []
      return assignedWalls.includes(activePorticoId)
    }
    if (!panel.tags || panel.tags.length === 0) return true
    return panel.tags.some(t => activeTags.includes(t.id))
  })

  const toggleTag = (tagId: string) => {
    setActiveTags(prev => {
      const current = prev ?? allTags.map(t => t.id)
      return current.includes(tagId) ? current.filter(id => id !== tagId) : [...current, tagId]
    })
    setActivePorticoId('')
  }

  // Sync panel order for a portico — saves positions for all currently relevant panels.
  // Runs on every portico visit so tag changes are reflected without manual reordering.
  // New panels are appended after existing ordered panels preserving user's custom order.
  const autoSaveOrder = (porticoId: string, filtered: Panel[]) => {
    if (filtered.length === 0) return
    // Panels with saved positions keep their order; new panels append at the end
    const withPos = filtered.filter(p => (p.position || 0) > 0)
      .sort((a, b) => (a.position || 0) - (b.position || 0))
    const withoutPos = filtered.filter(p => (p.position || 0) === 0)
    const ordered = [...withPos, ...withoutPos]
    // Only save if something changed (new panels or count mismatch)
    const hasNew = withoutPos.length > 0
    const hasMissing = withPos.length < filtered.length
    if (hasNew || hasMissing || withPos.length === 0) {
      const order = ordered.map((p, i) => ({ panelId: p.id, position: i + 1 }))
      panelsApi.updateOrder(porticoId, order).catch(() => {})
    }
  }

  const selectWall = async (wall: Portico | 'home') => {
    if (wall === 'home') {
      setActivePorticoId('home')
      setActivePortico(null)
      sessionStorage.setItem('active_portico', 'home')
      window.dispatchEvent(new CustomEvent('portico-change', { detail: 'home' }))
      setActiveTags(allTags.map(t => t.id))
      // Reload panels with Home ordering (no wall_id)
      try {
        const sysRes = await panelsApi.list()
        setPanels(sysRes.data || [])
      } catch (e) { console.error('[Dashboard] reload failed:', e) }
    } else {
      setActivePorticoId(wall.id)
      setActivePortico(wall)
      sessionStorage.setItem('active_portico', wall.id)
      window.dispatchEvent(new CustomEvent('portico-change', { detail: wall.id }))
      setActiveTags((wall.tags || []).filter(t => t.active).map(t => t.tagId))
      // Reload panels with this wall's ordering
      try {
        const sysRes = await panelsApi.list(wall.id)
        const loaded = sysRes.data || []
        setPanels(loaded)
        // Auto-save only panels that match this portico's active tags
        // (same filter as visiblePanels in the render)
        const wallActiveTags = (wall.tags || []).filter((t: any) => t.active).map((t: any) => t.tagId)
        const filtered = wallActiveTags.length === 0 ? loaded : loaded.filter((p: Panel) => {
          if (p.scope === 'personal') {
            const cfg = (() => { try { return JSON.parse(p.config || '{}') } catch { return {} } })()
            return (cfg.assignedWalls || []).includes(wall.id)
          }
          if (!p.tags || p.tags.length === 0) return true
          return p.tags.some((t: any) => wallActiveTags.includes(t.id) || wallActiveTags.includes(t.tagId))
        })
        autoSaveOrder(wall.id, filtered)
      } catch (e) { console.error('[Dashboard] reload failed:', e) }
    }
  }

  const savePortico = async () => {
    if (!newPorticoName.trim()) return
    setSavingPortico(true)
    try {
      // Create the portico
      const res = await porticosApi.create(newPorticoName.trim(), false)
      const wall = res.data

      // Save current active tags to this portico
      const currentActive = activeTags ?? allTags.map(t => t.id)
      for (const tag of allTags) {
        await porticosApi.setTagActive(wall.id, tag.id, currentActive.includes(tag.id))
      }

      // Reload portico list then switch to the new one
      const updated = await porticosApi.list()
      setPorticos(updated.data)

      // Apply the new portico's filter (same as current active tags)
      setActivePorticoId(wall.id)
      setActiveTags(currentActive)
      setShowSavePortico(false)
      setNewPorticoName('')

      // Reload panels with new portico ordering context
      const sysPanels = await panelsApi.list(wall.id)
      const savedPanels = sysPanels.data || []
      setPanels(savedPanels)
      autoSaveOrder(wall.id, savedPanels)
    } catch (e) {
      console.error('[Dashboard] failed to save portico:', e)
      alert('Failed to save portico. Check console for details.')
    } finally {
      setSavingPortico(false)
    }
  }

  const isUnsaved = activePorticoId === '' || (!['home'].includes(activePorticoId) && !porticos.find(w => w.id === activePorticoId))

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

  const colCount = activePortico?.columnCount ?? 3
  const containerMax = colCount >= 5 ? '98vw' : colCount >= 4 ? '1400px' : '1100px'
  const containerPadding = colCount >= 5 ? '0 8px' : colCount >= 4 ? '0 16px' : '0 24px'

  return (
    <div style={{ maxWidth: containerMax, margin: '0 auto', padding: containerPadding,
      boxSizing: 'border-box', width: '100%' }}>
    <div style={{ display: 'flex', gap: 20, position: 'relative' }}>
      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Mobile filter toggle - only on Home or unsaved */}
        {(activePorticoId === 'home' || activePorticoId === '') && (
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
              onAll={() => { setActiveTags(allTags.map(t => t.id)); setActivePorticoId('home') }}
              onNone={() => { setActiveTags([]); setActivePorticoId('') }}
            />
          </div>
        )}

        {/* Portico tabs */}
        <div className="portico-nav" style={{
          display: 'flex', alignItems: 'center', gap: 2, marginBottom: 20,
          borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
        }}>
          <PorticoTab label="Home" active={activePorticoId === 'home'} onClick={() => selectWall('home')} />
          {porticos.map(wall => (
            <PorticoTab key={wall.id} label={wall.name} active={activePorticoId === wall.id}
              activeTags={(wall.tags || []).filter(t => t.active)}
              onClick={() => selectWall(wall)}
              onDelete={async () => {
                await porticosApi.delete(wall.id)
                const updated = await porticosApi.list()
                setPorticos(updated.data)
                selectWall('home')
              }}
            />
          ))}
          <div style={{ flex: 1 }} />
          {isUnsaved && (
            showSavePortico ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 4 }}>
                <input className="input" value={newPorticoName} onChange={e => setNewPorticoName(e.target.value)}
                  placeholder="Portico name" style={{ padding: '3px 8px', fontSize: 12, width: 140 }}
                  autoFocus onKeyDown={e => e.key === 'Enter' && savePortico()} />
                <button className="btn btn-primary" style={{ fontSize: 11, padding: '3px 10px' }}
                  onClick={savePortico} disabled={savingPortico}>
                  {savingPortico ? <span className="spinner" /> : 'Save'}
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={() => setShowSavePortico(false)}>Cancel</button>
              </div>
            ) : (
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', marginBottom: 4 }}
                onClick={() => setShowSavePortico(true)}>+ Save as portico</button>
            )
          )}
        </div>

        {/* Panels — layout engine */}
        <PanelGrid
          panels={visiblePanels}
          subtrees={subtrees}
          portico={activePortico}
          density={density}
          allExpanded={allExpanded}
          customColumns={customColumns}
          onPanelResize={(panelId, newHeight) => {
            // Update local state immediately for instant re-render
            setPanels(prev => prev.map(p => {
              if (p.id !== panelId) return p
              const cfg = (() => { try { return JSON.parse(p.config || '{}') } catch { return {} } })()
              cfg.height = newHeight
              return { ...p, config: JSON.stringify(cfg) }
            }))
            // Persist to DB
            const panel = panels.find(p => p.id === panelId)
            if (panel) {
              const cfg = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
              cfg.height = newHeight
              panelsApi.update(panelId, { title: panel.title, config: JSON.stringify(cfg) }).catch(() => {})
            }
          }}
        />

        {visiblePanels.length === 0 && activeTags !== null && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 14 }}>
            No panels visible with current tag filters.
            {allTags.length > 0 && (
              <button className="btn btn-ghost" style={{ marginLeft: 12, fontSize: 13 }}
                onClick={() => { setActiveTags(allTags.map(t => t.id)); setActivePorticoId('home') }}>
                Show all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tag sidebar — desktop only, hidden on named porticos */}
      {allTags.length > 0 && (activePorticoId === 'home' || activePorticoId === '') && (
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
            onAll={() => { setActiveTags(allTags.map(t => t.id)); setActivePorticoId('home') }}
            onNone={() => { setActiveTags([]); setActivePorticoId('') }}
          />

        </div>
      )}
    <SearchModal allNodes={searchNodes} />
    </div>
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

function PorticoTab({ label, active, onClick, onDelete, activeTags }: {
  label: string; active: boolean; onClick: () => void; onDelete?: () => void
  activeTags?: { color: string; name: string }[]
}) {
  const dots = (activeTags || []).filter(t => t.color)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: -1 }}>
      <button onClick={onClick} style={{
        background: active ? 'var(--accent-bg)' : 'transparent',
        color: active ? 'var(--accent2)' : 'var(--text-muted)',
        border: 'none', borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        padding: '7px 12px', fontSize: 13, fontWeight: active ? 500 : 400,
        cursor: 'pointer', borderRadius: '6px 6px 0 0', transition: 'all 0.15s',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
      }}>
        {label}
        {dots.length > 0 && (
          <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
            {dots.map((t, i) => (
              <span key={i} title={t.name} style={{
                width: 5, height: 5, borderRadius: '50%',
                background: t.color, display: 'inline-block', flexShrink: 0,
                cursor: 'help',
              }} />
            ))}
          </div>
        )}
      </button>
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

function FlowSlot({ heightUnits, children, allExpanded }: {
  heightUnits: number; children: React.ReactNode; allExpanded?: boolean | null
}) {
  const [collapsedManual, setCollapsedManual] = React.useState<boolean | null>(null)
  // When a global expand/collapse fires, reset manual override so it takes full effect
  React.useEffect(() => {
    if (allExpanded !== null && allExpanded !== undefined) setCollapsedManual(null)
  }, [allExpanded])
  const collapsed = collapsedManual !== null ? collapsedManual
    : allExpanded !== null && allExpanded !== undefined ? !allExpanded : false
  const PILL_HEIGHT = 42
  return (
    <div style={
      collapsed
        ? {
            gridRow: 'auto',
            height: `${PILL_HEIGHT}px`,
            alignSelf: 'start',
          }
        : {
            gridRow: `span ${heightUnits}`,
            alignSelf: 'start',
            minWidth: 0,  // prevents grid cell from expanding to content width
            overflow: 'hidden',
          }
    }>
      {React.cloneElement(children as React.ReactElement, {
        onCollapseChange: (c: boolean) => setCollapsedManual(c),
      })}
    </div>
  )
}

// ── Layout engine ────────────────────────────────────────────────────────────
//
// Seira  (σειρά — row/series): panels flow left→right, wrap to next row.
//         Column count is explicit. Each panel spans its height in row units.
//         Mobile: single column, panel order preserved.
//
// Stylos (στῦλος — column/pillar): panels fill top→bottom in N columns.
//         Panels fill column 1 to colHeight, then column 2, etc.
//         Panel order is always respected — no balancing.
//         Mobile: single column, panel order preserved.

const DENSITY_MIN_WIDTH: Record<string, number> = {
  compact:     180,
  normal:      240,
  comfortable: 320,
}

const ROW_UNIT = 120 // px per 1x height unit
const GRID_GAP = 16  // gap between panels

function PanelGrid({ panels, subtrees, portico, density, allExpanded, customColumns, onPanelResize }: {
  panels: Panel[]
  subtrees: Record<string, BookmarkNode>
  portico: Portico | null
  density: string
  allExpanded?: boolean | null
  customColumns?: Record<string,number>
  onPanelResize?: (panelId: string, newHeight: number) => void
}) {
  const layout      = portico?.layout      ?? (portico?.id === 'home' ? 'seira' : 'stylos')
  const colCount    = portico?.columnCount  ?? 3
  const colHeight   = portico?.columnHeight ?? 8
  const minColWidth = DENSITY_MIN_WIDTH[density] ?? 240

  if (panels.length === 0) return null

  // ── Seira: left-to-right row flow with explicit column count ──────────────
  // Uses CSS grid row spans so panels of different heights coexist cleanly.
  // Panels wrap to the next row when the column count is exhausted.
  if (layout === 'seira' || layout === 'flow') {
    return (
      <div className="panel-grid-seira" style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${colCount}, minmax(${minColWidth}px, 1fr))`,
        gridAutoRows: `${ROW_UNIT + GRID_GAP}px`,
        gap: `${GRID_GAP}px`,
      }}>
        {panels.map(panel => {
          const h = getPanelHeight(panel)
          return (
            <FlowSlot key={panel.id} heightUnits={h} allExpanded={allExpanded}>
              <PanelCard panel={panel} subtree={subtrees[panel.id]} allExpanded={allExpanded}
                onResize={onPanelResize} />
            </FlowSlot>
          )
        })}
      </div>
    )
  }

  // ── Rema: left-to-right flex rows that collapse with their content ─────────
  // Panels are distributed into rows of colCount. Each row is a flex container
  // that sizes to its tallest (or only) visible panel. When all panels in a row
  // collapse to pill height the row collapses too — no wasted space.
  if (layout === 'rema') {
    const rows: Panel[][] = []
    for (let i = 0; i < panels.length; i += colCount) {
      rows.push(panels.slice(i, i + colCount))
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: GRID_GAP }}>
        {rows.map((row, ri) => (
          <div key={ri} className="panel-grid-rema-row" style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${row.length}, minmax(${minColWidth}px, 1fr))`,
            gap: GRID_GAP,
            alignItems: 'start',
          }}>
            {row.map(panel => (
              <PanelCard key={panel.id} panel={panel} subtree={subtrees[panel.id]} allExpanded={allExpanded} onResize={onPanelResize} />
            ))}
          </div>
        ))}
      </div>
    )
  }

  // ── Custom: user-assigned columns ───────────────────────────────────────────
  if (layout === 'custom') {
    const cols: Panel[][] = Array.from({ length: colCount }, () => [])
    let currentCol = 0
    for (const panel of panels) {
      // Column assignment from customColumns, clamped to [1, colCount], cascade-down behavior
      const assigned = (customColumns?.[panel.id] ?? 1)
      const col = Math.min(Math.max(assigned, 1), colCount) - 1
      if (col > currentCol) currentCol = col
      cols[currentCol].push(panel)
    }
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${colCount}, minmax(${minColWidth}px, 1fr))`,
        gap: GRID_GAP,
        alignItems: 'start',
      }}>
        {cols.map((col, ci) => (
          <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: GRID_GAP }}>
            {col.map(panel => (
              <PanelCard key={panel.id} panel={panel} subtree={subtrees[panel.id]}
                allExpanded={allExpanded} />
            ))}
          </div>
        ))}
      </div>
    )
  }

  // ── Stylos: top-to-bottom column fill ─────────────────────────────────────
  // If colHeight is explicitly set, fill each column to that height then advance.
  // If colHeight is not set (default), balance panels across columns by always
  // adding the next panel to the shortest column — avoids one column getting all content.
  const columns: Panel[][] = Array.from({ length: colCount }, () => [])
  const colFill = new Array(colCount).fill(0)
  const hasExplicitHeight = portico?.columnHeight != null

  if (hasExplicitHeight) {
    let currentCol = 0
    for (const panel of panels) {
      const height = getPanelHeight(panel)
      while (currentCol < colCount - 1 && colFill[currentCol] + height > colHeight) {
        currentCol++
      }
      columns[currentCol].push(panel)
      colFill[currentCol] += height
    }
  } else {
    // Balance: assign each panel to the column with the least total height
    for (const panel of panels) {
      const height = getPanelHeight(panel)
      const shortest = colFill.indexOf(Math.min(...colFill))
      columns[shortest].push(panel)
      colFill[shortest] += height
    }
  }

  return (
    <div className="panel-grid-stylos" style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${colCount}, minmax(${minColWidth}px, 1fr))`,
      gap: GRID_GAP,
      alignItems: 'start',
    }}>
      {columns.map((col, ci) => (
        <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: GRID_GAP }}>
          {col.map(panel => (
            <PanelCard key={panel.id} panel={panel} subtree={subtrees[panel.id]} allExpanded={allExpanded} onResize={onPanelResize} />
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

function PanelCard({ panel, subtree, onCollapseChange, allExpanded, onResize }: {
  panel: Panel; subtree?: BookmarkNode
  onCollapseChange?: (collapsed: boolean) => void
  allExpanded?: boolean | null
  onResize?: (panelId: string, newHeight: number) => void
}) {
  const [treeExpanded, setTreeExpanded] = useState<boolean | null>(null)
  const [collapsedManual, setCollapsedManual] = useState<boolean | null>(null)
  const [resizeMenu, setResizeMenu] = useState<{ x: number; y: number } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // When a global expand/collapse fires, reset the manual override so it takes full effect
  useEffect(() => {
    if (allExpanded !== null && allExpanded !== undefined) setCollapsedManual(null)
  }, [allExpanded])
  const collapsed = collapsedManual !== null ? collapsedManual
    : allExpanded !== null && allExpanded !== undefined ? !allExpanded : false
  const heightUnits = getPanelHeight(panel)
  const cardHeight = heightUnits * (ROW_UNIT + GRID_GAP) - GRID_GAP

  const handleRefresh = async () => {
    setRefreshing(true)
    setResizeMenu(null)
    try {
      await integrationsApi.getPanelData(panel.id, { nocache: '1' })
    } catch { /* cache busted — SSE worker will push fresh data */ }
    setTimeout(() => setRefreshing(false), 2000)
  }

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
      position: 'relative',
    }}
      onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
      onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
      onContextMenu={onResize ? e => {
        e.preventDefault()
        setResizeMenu({ x: e.clientX, y: e.clientY })
      } : undefined}
    >
      {/* Right-click / resize context menu */}
      {resizeMenu && onResize && (
        <>
          {/* Click-away backdrop */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }}
            onClick={() => setResizeMenu(null)} />
          <div style={{
            position: 'fixed', left: resizeMenu.x, top: resizeMenu.y,
            zIndex: 1000, background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            padding: '6px 0', minWidth: 140,
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '4px 12px 6px',
              borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
              Panel options
            </div>
            <button onClick={handleRefresh}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '5px 12px', fontSize: 13, cursor: refreshing ? 'default' : 'pointer',
                background: 'none', color: refreshing ? 'var(--text-dim)' : 'var(--text)',
                border: 'none',
              }}>
              {refreshing ? '⟳ Refreshing...' : '⟳ Refresh now'}
            </button>
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '4px 12px 2px' }}>Resize</div>
            {[1,2,3,4,5,6,7,8].map(h => (
              <button key={h} onClick={() => { onResize(panel.id, h); setResizeMenu(null) }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '5px 12px', fontSize: 13, cursor: 'pointer',
                  background: heightUnits === h ? 'var(--accent-bg)' : 'none',
                  color: heightUnits === h ? 'var(--accent2)' : 'var(--text)',
                  border: 'none', fontWeight: heightUnits === h ? 600 : 400,
                }}>
                {h}x {h === heightUnits ? '✓' : ''}
              </button>
            ))}
          </div>
        </>
      )}
      {/* Header */}
      <div style={{
        padding: '8px 14px',
        borderBottom: collapsed ? 'none' : '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      }}>
        <button onClick={() => {
            const next = !collapsed
            setCollapsedManual(next)
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

        {panel.uiUrl
          ? <a href={panel.uiUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 13, fontWeight: 500, flex: 1, color: 'inherit',
                textDecoration: 'none' }}
              onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseOut={e => (e.currentTarget.style.textDecoration = 'none')}>
              {panel.title}
            </a>
          : <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{panel.title}</span>
        }

        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="panel-tag-dots" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {(panel.tags || []).map(t => (
                <span key={t.id} style={{ width: 6, height: 6, borderRadius: '50%', background: t.color }} title={t.name} />
              ))}
            </span>
            {onResize && (
              <button title="Resize panel (or right-click)" onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect()
                setResizeMenu({ x: rect.left, y: rect.bottom + 4 })
              }} style={{
                width: 20, height: 20, borderRadius: 4, border: '1px solid var(--border)',
                background: 'var(--surface2)', color: 'var(--text-muted)', cursor: 'pointer',
                fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1, padding: 0, opacity: 0.6,
              }}
              onMouseOver={e => e.currentTarget.style.opacity = '1'}
              onMouseOut={e => e.currentTarget.style.opacity = '0.6'}
              >⊞</button>
            )}
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
          {panel.type === 'sonarr' && <SonarrPanel panel={panel} heightUnits={heightUnits} />}
          {panel.type === 'radarr' && <RadarrPanel panel={panel} heightUnits={heightUnits} />}
          {panel.type === 'lidarr' && <LidarrPanel panel={panel} heightUnits={heightUnits} />}
          {panel.type === 'plex' && <PlexPanel panel={panel} heightUnits={heightUnits} />}
          {panel.type === 'tautulli' && <TautulliPanel panel={panel} heightUnits={heightUnits} />}
          {panel.type === 'truenas' && <TrueNASPanel panel={panel} heightUnits={heightUnits} />}
          {panel.type === 'proxmox' && <ProxmoxPanel panel={panel} heightUnits={heightUnits} />}
          {panel.type === 'kuma' && <KumaPanel panel={panel} heightUnits={heightUnits} />}
          {panel.type === 'gluetun' && <GluetunPanel panel={panel} heightUnits={heightUnits} />}
          {panel.type === 'opnsense' && <OPNsensePanel panel={panel} heightUnits={heightUnits} />}
          {panel.type === 'transmission' && <TransmissionPanel panel={panel} heightUnits={heightUnits} />}
          {panel.type === 'photoprism' && <PhotoPrismPanel panel={panel} heightUnits={heightUnits} />}
          {panel.type === 'authentik' && <AuthentikPanel panel={panel} heightUnits={heightUnits} />}
          {panel.type === 'checklist' && <ChecklistPanel panel={panel} />}
          {panel.type === 'notes' && <NotesPanel panel={panel} />}
          {panel.type === 'customapi' && <CustomAPIPanel panel={panel} heightUnits={heightUnits} />}
          {panel.type === 'rss' && <RSSPanel panel={panel} heightUnits={heightUnits} />}
          {panel.type === 'weather' && <WeatherPanel panel={panel} heightUnits={heightUnits} />}
          {panel.type === 'steam' && <SteamPanel panel={panel} heightUnits={heightUnits} />}
          {panel.type === 'readarr' && <ReadarrPanel panel={panel} heightUnits={heightUnits} />}
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
