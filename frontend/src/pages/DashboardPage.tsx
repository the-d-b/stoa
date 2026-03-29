import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { panelsApi, wallsApi, bookmarksApi, tagsApi, Panel, Wall, Tag, BookmarkNode } from '../api'
import BookmarkTree from '../components/BookmarkTree'

export default function DashboardPage() {
  const { isAdmin } = useAuth()
  const [panels, setPanels] = useState<Panel[]>([])
  const [walls, setWalls] = useState<Wall[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [subtrees, setSubtrees] = useState<Record<string, BookmarkNode>>({})
  const [activeWallId, setActiveWallId] = useState<string | null>(null)
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [savingWall, setSavingWall] = useState(false)
  const [newWallName, setNewWallName] = useState('')
  const [showSaveWall, setShowSaveWall] = useState(false)

  useEffect(() => {
    Promise.all([panelsApi.list(), wallsApi.list(), tagsApi.list()])
      .then(async ([p, w, t]) => {
        const panelData = p.data || []
        const wallData = w.data || []
        const tagData = t.data || []
        setPanels(panelData)
        setWalls(wallData)
        setAllTags(tagData)

        // Default: all tags active (Home)
        setActiveTags(new Set(tagData.map((t: Tag) => t.id)))
        setActiveWallId('home')

        // Load subtrees
        const map: Record<string, BookmarkNode> = {}
        for (const panel of panelData) {
          if (panel.type === 'bookmarks') {
            try {
              const config = JSON.parse(panel.config || '{}')
              if (config.rootNodeId) {
                const res = await bookmarksApi.subtree(config.rootNodeId)
                map[panel.id] = res.data
              } else {
                const res = await bookmarksApi.tree()
                map[panel.id] = {
                  id: 'root', name: 'root', path: '/', type: 'section',
                  sortOrder: 0, scope: 'shared', createdAt: '',
                  children: res.data || [],
                }
              }
            } catch {}
          }
        }
        setSubtrees(map)
      })
      .finally(() => setLoading(false))
  }, [])

  const visiblePanels = panels.filter(panel => {
    if (isAdmin) return true
    if (!panel.tags || panel.tags.length === 0) return true
    return panel.tags.some(t => activeTags.has(t.id))
  }).sort((a, b) => a.position - b.position)

  const handleSelectWall = (wall: Wall | 'home') => {
    if (wall === 'home') {
      setActiveWallId('home')
      setActiveTags(new Set(allTags.map(t => t.id)))
    } else {
      setActiveWallId(wall.id)
      const active = new Set(
        (wall.tags || []).filter(t => t.active).map(t => t.tagId)
      )
      setActiveTags(active)
    }
  }

  const handleTagToggle = (tagId: string) => {
    setActiveTags(prev => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
    setActiveWallId(null) // unsaved filter state
  }

  const handleSaveWall = async () => {
    if (!newWallName.trim()) return
    setSavingWall(true)
    try {
      const res = await wallsApi.create(newWallName.trim(), false)
      const wall = res.data
      // Save current active tags to the wall
      for (const tag of allTags) {
        await wallsApi.setTagActive(wall.id, tag.id, activeTags.has(tag.id))
      }
      const updated = await wallsApi.list()
      setWalls(updated.data)
      setActiveWallId(wall.id)
      setShowSaveWall(false)
      setNewWallName('')
    } finally {
      setSavingWall(false)
    }
  }

  const isHomeActive = activeWallId === 'home'
  const allTagsOn = allTags.every(t => activeTags.has(t.id))
  const hasUnsavedFilter = !isHomeActive && walls.every(w => w.id !== activeWallId)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (panels.length === 0) return <EmptyState isAdmin={isAdmin} />

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Wall tabs */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16,
          borderBottom: '1px solid var(--border)', paddingBottom: 0,
          flexWrap: 'wrap',
        }}>
          {/* Home tab */}
          <WallTab
            label="Home"
            active={isHomeActive || (allTagsOn && !walls.find(w => w.id === activeWallId))}
            onClick={() => handleSelectWall('home')}
          />
          {walls.map(wall => (
            <WallTab
              key={wall.id}
              label={wall.name}
              active={activeWallId === wall.id}
              onClick={() => handleSelectWall(wall)}
              onDelete={async () => {
                await wallsApi.delete(wall.id)
                const updated = await wallsApi.list()
                setWalls(updated.data)
                setActiveWallId('home')
                setActiveTags(new Set(allTags.map(t => t.id)))
              }}
            />
          ))}

          {hasUnsavedFilter && (
            <>
              {showSaveWall ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
                  <input
                    className="input"
                    value={newWallName}
                    onChange={e => setNewWallName(e.target.value)}
                    placeholder="Wall name"
                    style={{ padding: '3px 8px', fontSize: 12, width: 140 }}
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleSaveWall()}
                  />
                  <button className="btn btn-primary" style={{ fontSize: 11, padding: '3px 10px' }}
                    onClick={handleSaveWall} disabled={savingWall}>
                    {savingWall ? <span className="spinner" /> : 'Save'}
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => setShowSaveWall(false)}>Cancel</button>
                </div>
              ) : (
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: '4px 10px', marginLeft: 8, marginBottom: -1 }}
                  onClick={() => setShowSaveWall(true)}
                >
                  + Save as wall
                </button>
              )}
            </>
          )}
        </div>

        {/* Panels grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}>
          {visiblePanels.map(panel => (
            <PanelCard key={panel.id} panel={panel} subtree={subtrees[panel.id]} />
          ))}
        </div>

        {visiblePanels.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 14 }}>
            No panels visible with current tag filters.
          </div>
        )}
      </div>

      {/* Tag sidebar */}
      {allTags.length > 0 && (
        <div style={{
          width: 180, flexShrink: 0,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 14, height: 'fit-content',
          position: 'sticky', top: 72,
        }}>
          <div className="section-title" style={{ marginBottom: 10 }}>Filter tags</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {allTags.map(tag => {
              const on = activeTags.has(tag.id)
              return (
                <label key={tag.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer', padding: '4px 0',
                }}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => handleTagToggle(tag.id)}
                    style={{ accentColor: tag.color, width: 13, height: 13 }}
                  />
                  <span style={{
                    width: 7, height: 7, borderRadius: 2,
                    background: on ? tag.color : 'var(--text-dim)',
                    flexShrink: 0, transition: 'background 0.15s',
                  }} />
                  <span style={{
                    fontSize: 13, color: on ? 'var(--text)' : 'var(--text-muted)',
                    transition: 'color 0.15s',
                  }}>{tag.name}</span>
                </label>
              )
            })}
          </div>

          {/* Select all / none */}
          <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', flex: 1 }}
              onClick={() => setActiveTags(new Set(allTags.map(t => t.id)))}>
              All
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', flex: 1 }}
              onClick={() => setActiveTags(new Set())}>
              None
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function WallTab({ label, active, onClick, onDelete }: {
  label: string; active: boolean; onClick: () => void; onDelete?: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4, marginBottom: -1,
    }}>
      <button onClick={onClick} style={{
        background: active ? 'var(--accent-bg)' : 'transparent',
        color: active ? 'var(--accent2)' : 'var(--text-muted)',
        border: 'none', borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        padding: '7px 12px', fontSize: 13, fontWeight: active ? 500 : 400,
        cursor: 'pointer', borderRadius: '6px 6px 0 0',
        transition: 'all 0.15s',
      }}>
        {label}
      </button>
      {onDelete && (
        <button onClick={onDelete} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-dim)', fontSize: 10, padding: '0 4px',
          opacity: 0.5,
        }} onMouseOver={e => e.currentTarget.style.opacity = '1'}
          onMouseOut={e => e.currentTarget.style.opacity = '0.5'}
          title="Delete wall">✕</button>
      )}
    </div>
  )
}

function PanelCard({ panel, subtree }: { panel: Panel; subtree?: BookmarkNode }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.15s',
    }}
      onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border2)'}
      onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{panel.title}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(panel.tags || []).map(t => (
            <span key={t.id} style={{ width: 6, height: 6, borderRadius: '50%', background: t.color }} title={t.name} />
          ))}
        </div>
      </div>
      <div style={{ padding: '10px 14px', maxHeight: 400, overflowY: 'auto' }}>
        {panel.type === 'bookmarks' && subtree && (
          <BookmarkTree nodes={
            subtree.id === 'root' ? (subtree.children || []) : [subtree]
          } />
        )}
        {panel.type === 'bookmarks' && !subtree && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Loading...</div>
        )}
      </div>
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
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px', letterSpacing: '-0.02em' }}>No panels yet</h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 340, lineHeight: 1.7, margin: 0 }}>
        {isAdmin
          ? <>Go to <a href="/admin/bookmarks" style={{ color: 'var(--accent2)', textDecoration: 'none' }}>Bookmarks</a> to add content,
             then create <a href="/admin/panels" style={{ color: 'var(--accent2)', textDecoration: 'none' }}>Panels</a> to display it.</>
          : "The admin hasn't created any panels yet."}
      </p>
    </div>
  )
}
