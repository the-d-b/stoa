import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { panelsApi, wallsApi, bookmarksApi, tagsApi, Panel, Wall, Tag, BookmarkNode } from '../api'
import BookmarkTree from '../components/BookmarkTree'

export default function DashboardPage() {
  const { user, isAdmin } = useAuth()
  const [panels, setPanels] = useState<Panel[]>([])
  const [walls, setWalls] = useState<Wall[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [bookmarkSubtrees, setBookmarkSubtrees] = useState<Record<string, BookmarkNode>>({})
  const [activeWall, setActiveWall] = useState<Wall | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      panelsApi.list(),
      wallsApi.list(),
      tagsApi.list(),
    ]).then(async ([p, w, t]) => {
      const panelData = p.data
      setPanels(panelData)
      setWalls(w.data)
      setAllTags(t.data)

      // Set default wall
      const defaultWall = w.data.find((wall: Wall) => wall.isDefault) || w.data[0] || null
      setActiveWall(defaultWall)

      // Load bookmark subtrees for each bookmark panel
      const subtreeMap: Record<string, BookmarkNode> = {}
      for (const panel of panelData) {
        if (panel.type === 'bookmarks') {
          try {
            const config = JSON.parse(panel.config || '{}')
            if (config.rootNodeId) {
              const res = await bookmarksApi.subtree(config.rootNodeId)
              subtreeMap[panel.id] = res.data
            } else {
              // Load full tree
              const res = await bookmarksApi.tree()
              subtreeMap[panel.id] = { id: 'root', name: 'root', path: '/', type: 'section',
                sortOrder: 0, scope: 'shared', createdAt: '', children: res.data }
            }
          } catch {}
        }
      }
      setBookmarkSubtrees(subtreeMap)
    }).finally(() => setLoading(false))
  }, [])

  // Determine visible panels based on active wall's tag filters
  const visiblePanels = panels.filter(panel => {
    if (isAdmin) return true

    // Untagged panels are visible to all
    if (!panel.tags || panel.tags.length === 0) return true

    if (!activeWall) return false

    // Panel visible if any of its tags are "active" in the current wall
    // and the user's groups have access to that tag
    const activeTags = new Set(
      (activeWall.tags || []).filter(t => t.active).map(t => t.tagId)
    )
    return panel.tags.some(t => activeTags.has(t.id))
  })

  // Sort by user's saved position
  const sortedPanels = [...visiblePanels].sort((a, b) => a.position - b.position)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (panels.length === 0) {
    return <EmptyState isAdmin={isAdmin} />
  }

  return (
    <div>
      {/* Wall selector */}
      {walls.length > 0 && (
        <WallSelector
          walls={walls}
          activeWall={activeWall}
          allTags={allTags}
          onSelectWall={setActiveWall}
          onTagToggle={async (wallId, tagId, active) => {
            await wallsApi.setTagActive(wallId, tagId, active)
            const res = await wallsApi.list()
            setWalls(res.data)
            setActiveWall(res.data.find((w: Wall) => w.id === wallId) || null)
          }}
          onCreateWall={async (name) => {
            await wallsApi.create(name)
            const res = await wallsApi.list()
            setWalls(res.data)
          }}
        />
      )}

      {/* Panels grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 16,
        marginTop: walls.length > 0 ? 20 : 0,
      }}>
        {sortedPanels.map(panel => (
          <PanelCard
            key={panel.id}
            panel={panel}
            subtree={bookmarkSubtrees[panel.id]}
          />
        ))}
      </div>

      {sortedPanels.length === 0 && panels.length > 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 14 }}>
          No panels visible with current wall filters.
          {activeWall && <span> Try adjusting the tags in your wall.</span>}
        </div>
      )}
    </div>
  )
}

function PanelCard({ panel, subtree }: { panel: Panel; subtree?: BookmarkNode }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}
      onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
      onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      {/* Panel header */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{panel.title}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {panel.tags?.map(t => (
            <span key={t.id} style={{
              width: 6, height: 6, borderRadius: '50%', background: t.color,
            }} title={t.name} />
          ))}
        </div>
      </div>

      {/* Panel content */}
      <div style={{ padding: '10px 14px', maxHeight: 400, overflowY: 'auto' }}>
        {panel.type === 'bookmarks' && subtree && (
          <BookmarkTree
            nodes={subtree.type === 'section' && subtree.id === 'root'
              ? (subtree.children || [])
              : [subtree]}
          />
        )}
        {panel.type === 'bookmarks' && !subtree && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Loading...</div>
        )}
      </div>
    </div>
  )
}

function WallSelector({ walls, activeWall, allTags, onSelectWall, onTagToggle, onCreateWall }: {
  walls: Wall[]
  activeWall: Wall | null
  allTags: Tag[]
  onSelectWall: (w: Wall) => void
  onTagToggle: (wallId: string, tagId: string, active: boolean) => void
  onCreateWall: (name: string) => void
}) {
  const [showTagPicker, setShowTagPicker] = useState(false)
  const [newWallName, setNewWallName] = useState('')
  const [showNewWall, setShowNewWall] = useState(false)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 12px', background: 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: 10,
      flexWrap: 'wrap',
    }}>
      {/* Wall tabs */}
      {walls.map(wall => (
        <button
          key={wall.id}
          onClick={() => onSelectWall(wall)}
          style={{
            background: activeWall?.id === wall.id ? 'var(--accent-bg)' : 'transparent',
            color: activeWall?.id === wall.id ? 'var(--accent2)' : 'var(--text-muted)',
            border: `1px solid ${activeWall?.id === wall.id ? '#7c6fff30' : 'transparent'}`,
            borderRadius: 6, padding: '4px 10px', fontSize: 13,
            cursor: 'pointer', fontWeight: activeWall?.id === wall.id ? 500 : 400,
            transition: 'all 0.15s',
          }}
        >
          {wall.name}
        </button>
      ))}

      <div style={{ flex: 1 }} />

      {/* Active tag filters */}
      {activeWall && allTags.length > 0 && (
        <div style={{ position: 'relative' }}>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: '3px 10px' }}
            onClick={() => setShowTagPicker(p => !p)}
          >
            ◇ Filter tags
          </button>
          {showTagPicker && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50,
              background: 'var(--surface)', border: '1px solid var(--border2)',
              borderRadius: 10, padding: 12, minWidth: 180,
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}>
              <div className="section-title" style={{ marginBottom: 8 }}>Show panels tagged:</div>
              {allTags.map(tag => {
                const wallTag = activeWall.tags?.find(t => t.tagId === tag.id)
                const active = wallTag?.active ?? true
                return (
                  <label key={tag.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    cursor: 'pointer', padding: '4px 0',
                  }}>
                    <input type="checkbox" checked={active}
                      onChange={() => onTagToggle(activeWall.id, tag.id, !active)}
                      style={{ accentColor: tag.color }} />
                    <span style={{ width: 6, height: 6, borderRadius: 2, background: tag.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{tag.name}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* New wall */}
      {showNewWall ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="input" value={newWallName} onChange={e => setNewWallName(e.target.value)}
            placeholder="Wall name" style={{ padding: '3px 8px', fontSize: 12, width: 120 }}
            autoFocus onKeyDown={e => {
              if (e.key === 'Enter' && newWallName.trim()) {
                onCreateWall(newWallName.trim()); setNewWallName(''); setShowNewWall(false)
              }
            }} />
          <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}
            onClick={() => setShowNewWall(false)}>Cancel</button>
        </div>
      ) : (
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }}
          onClick={() => setShowNewWall(true)}>
          + Wall
        </button>
      )}
    </div>
  )
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
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
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
        No panels yet
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 340, lineHeight: 1.7, margin: 0 }}>
        {isAdmin
          ? <>Go to <a href="/admin/bookmarks" style={{ color: 'var(--accent2)', textDecoration: 'none' }}>Bookmarks</a> to add content,
             then create <a href="/admin/panels" style={{ color: 'var(--accent2)', textDecoration: 'none' }}>Panels</a> to display it.</>
          : 'The admin hasn\'t created any panels yet.'}
      </p>
    </div>
  )
}
