import { useEffect, useState } from 'react'
import { bookmarksApi, BookmarkNode } from '../../api'

function flatSections(nodes: BookmarkNode[], excludeId?: string): BookmarkNode[] {
  const result: BookmarkNode[] = []
  const excludedNode = excludeId ? findNodeInTree(nodes, excludeId) : null
  const walk = (ns: BookmarkNode[]) => {
    for (const n of ns) {
      if (excludeId && (n.id === excludeId ||
        (excludedNode && n.path.startsWith(excludedNode.path + '/')))) continue
      if (n.type === 'section') result.push(n)
      if (n.children) walk(n.children)
    }
  }
  walk(nodes)
  return result
}

function findNodeInTree(nodes: BookmarkNode[], id: string): BookmarkNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) { const f = findNodeInTree(n.children, id); if (f) return f }
  }
  return null
}

interface BookmarksPanelProps {
  apiOverride?: any
}

export default function BookmarksPanel({ apiOverride }: BookmarksPanelProps = {}) {
  const api = apiOverride || bookmarksApi
  const [tree, setTree] = useState<BookmarkNode[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<{ parentId?: string; type: 'section' | 'bookmark' } | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [globalExpanded, setGlobalExpanded] = useState<boolean | null>(null) // null=default, true=all, false=none
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [multiMoving, setMultiMoving] = useState(false)

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleMultiMove = async (newParentId: string | null) => {
    setMultiMoving(true)
    try {
      for (const id of selectedIds) {
        await api.move(id, newParentId)
      }
      setSelectedIds(new Set())
      setMovingId(null)
      await load()
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to move items')
    } finally { setMultiMoving(false) }
  }

  // api.tree() returns shared nodes only (scope=shared), rooted under /shared/
  const load = () => api.tree().then((r: any) => setTree(r.data || [])).finally(() => setLoading(false))
  useEffect(() => { load() }, [])


  const handleMove = async (nodeId: string, newParentId: string | null) => {
    try {
      await api.move(nodeId, newParentId)
      setMovingId(null)
      await load()
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to move node')
    }
  }

  if (loading) return <Loading />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.7, maxWidth: 460 }}>
          Sections sort before bookmarks alphabetically at every level. Use ↕ to move a node to a new parent.
          {selectedIds.size > 0 && <span style={{ color: 'var(--accent2)', marginLeft: 8 }}>{selectedIds.size} selected</span>}
        </p>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }}
            onClick={() => setGlobalExpanded(true)}>Expand all</button>
          <button className="btn btn-ghost" style={{ fontSize: 12 }}
            onClick={() => setGlobalExpanded(false)}>Collapse all</button>
          {selectedIds.size > 1 && (
            <button className="btn btn-secondary" style={{ fontSize: 12 }}
              onClick={() => setMovingId('__multi__')}>
              Move {selectedIds.size} items
            </button>
          )}
          {selectedIds.size > 0 && (
            <button className="btn btn-ghost" style={{ fontSize: 12 }}
              onClick={() => setSelectedIds(new Set())}>Clear</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 16 }}>
          <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setAdding({ type: 'section' })}>+ Section</button>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setAdding({ type: 'bookmark' })}>+ Bookmark</button>
        </div>
      </div>

      {adding && !adding.parentId && (
        <AddNodeForm type={adding.type}
          onSave={async (name, url) => { await api.create({ name, type: adding.type, url }); setAdding(null); load() }}
          onCancel={() => setAdding(null)} />
      )}



      {/* Multi-item move picker */}
      {movingId === '__multi__' && selectedIds.size > 0 && (() => {
        const firstId = Array.from(selectedIds)[0]
        const fakeNode = { id: firstId, name: `${selectedIds.size} selected items`, parentId: undefined, path: '', type: 'bookmark' as const, children: [], sortOrder: 0, scope: 'shared', createdAt: '' }
        return (
          <div style={{ marginBottom: 12 }}>
            <MovePicker
              node={fakeNode as BookmarkNode}
              sections={flatSections(tree)}
              onMove={(_id, parentId) => handleMultiMove(parentId)}
              onCancel={() => setMovingId(null)}
              loading={multiMoving}
            />
          </div>
        )
      })()}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {tree.length === 0 && <Empty message="No bookmarks yet. Add a section to get started." />}
        {tree.map(node => (
          <TreeNode key={node.id} node={node} depth={0}
            onRefresh={load} adding={adding} setAdding={setAdding}
            onMove={(id) => setMovingId(id)}
            movingId={movingId}
            allTree={tree}
            onMoveConfirm={handleMove}
            onMoveCancel={() => setMovingId(null)}
            bookmarkApi={api}
            globalExpanded={globalExpanded}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect} />
        ))}
      </div>
    </div>
  )
}

// ── Move picker ───────────────────────────────────────────────────────────────

function MovePicker({ node, sections, onMove, onCancel, loading: externalLoading }: {
  node: BookmarkNode
  sections: BookmarkNode[]
  onMove: (nodeId: string, newParentId: string | null) => void
  onCancel: () => void
  loading?: boolean
}) {
  const [selected, setSelected] = useState<string>('__root__')
  const [moving, setMoving] = useState(false)
  const [filter, setFilter] = useState('')

  const isMoving = moving || externalLoading

  const handleConfirm = async () => {
    setMoving(true)
    await onMove(node.id, selected === '__root__' ? null : selected)
    setMoving(false)
  }

  const filteredSections = filter.trim()
    ? sections.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()))
    : sections

  return (
    <div style={{
      marginBottom: 16, padding: 16, borderRadius: 10,
      background: 'var(--surface2)', border: '1px solid var(--accent)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>
        Move <span style={{ color: 'var(--accent2)' }}>"{node.name}"</span> to:
      </div>

      <input className="input" value={filter} onChange={e => setFilter(e.target.value)}
        placeholder="Filter sections..." style={{ fontSize: 12, marginBottom: 8 }} autoFocus />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14, maxHeight: 240, overflowY: 'auto' }}>
        {/* Root option */}
        <ParentOption
          id="__root__"
          label="/ (root — top level)"
          depth={0}
          selected={selected === '__root__'}
          onSelect={setSelected}
          current={!node.parentId}
        />
        {/* All sections */}
        {filteredSections.map(s => (
          <ParentOption
            key={s.id}
            id={s.id}
            label={s.name}
            depth={s.path.split('/').length - 2}
            selected={selected === s.id}
            onSelect={setSelected}
            current={node.parentId === s.id}
          />
        ))}
        {sections.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '4px 0' }}>
            No other sections available
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={handleConfirm} disabled={isMoving ||
          (selected === '__root__' && !node.parentId) ||
          (selected === node.parentId)
        }>
          {isMoving ? <span className="spinner" /> : 'Move here'}
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function ParentOption({ id, label, depth, selected, onSelect, current }: {
  id: string; label: string; depth: number
  selected: boolean; onSelect: (id: string) => void; current: boolean
}) {
  return (
    <button
      onClick={() => !current && onSelect(id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', paddingLeft: 10 + depth * 16 + 'px',
        borderRadius: 6, border: 'none', cursor: current ? 'default' : 'pointer',
        background: selected ? 'var(--accent-bg)' : 'transparent',
        color: current ? 'var(--text-dim)' : selected ? 'var(--accent2)' : 'var(--text)',
        fontSize: 13, textAlign: 'left', width: '100%',
        transition: 'all 0.1s',
        outline: selected ? '1px solid var(--accent)' : 'none',
      }}
    >
      <span style={{ fontSize: 10, opacity: 0.5 }}>{depth === 0 && id === '__root__' ? '/' : '▤'}</span>
      {label}
      {current && <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 'auto' }}>current</span>}
    </button>
  )
}

// ── Tree node ─────────────────────────────────────────────────────────────────

function TreeNode({ node, depth, onRefresh, adding, setAdding, onMove, movingId, allTree, onMoveConfirm, onMoveCancel, bookmarkApi, globalExpanded, selectedIds, onToggleSelect }: {
  node: BookmarkNode; depth: number; onRefresh: () => void
  adding: { parentId?: string; type: 'section' | 'bookmark' } | null
  setAdding: (v: any) => void
  onMove: (id: string) => void
  movingId: string | null
  allTree: BookmarkNode[]
  onMoveConfirm: (nodeId: string, newParentId: string | null) => void
  onMoveCancel: () => void
  bookmarkApi: any
  globalExpanded?: boolean | null
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
}) {
  const [expandedLocal, setExpandedLocal] = useState(true)
  const expanded = globalExpanded !== null && globalExpanded !== undefined ? globalExpanded : expandedLocal
  const setExpanded = (v: boolean | ((p: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(expandedLocal) : v
    setExpandedLocal(next)
  }
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(node.name)
  const [editUrl, setEditUrl] = useState(node.url || '')
  const [editIcon, setEditIcon] = useState(node.iconUrl || '')
  const [iconUrlInput, setIconUrlInput] = useState('')
  const [showIconInput, setShowIconInput] = useState(false)
  const [cachingIcon, setCachingIcon] = useState(false)

  const hasChildren = (node.children || []).length > 0
  const isAddingHere = adding?.parentId === node.id

  const handleDelete = async () => {
    if (!confirm(hasChildren ? `Delete "${node.name}" and all contents?` : `Delete "${node.name}"?`)) return
    await bookmarkApi.delete(node.id); onRefresh()
  }

  const handleSaveEdit = async () => {
    await bookmarkApi.update(node.id, { name: editName, url: editUrl, iconUrl: editIcon })
    setEditing(false); onRefresh()
  }

  const handleCacheIcon = async () => {
    if (!iconUrlInput.trim()) return
    setCachingIcon(true)
    try {
      const res = await bookmarkApi.cacheIcon(iconUrlInput.trim())
      setEditIcon(res.data.iconUrl); setShowIconInput(false); setIconUrlInput('')
    } catch { alert('Failed to fetch icon') }
    finally { setCachingIcon(false) }
  }

  return (
    <div style={{ marginLeft: depth > 0 ? 20 : 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
        borderRadius: 8, marginBottom: 2,
        background: 'var(--surface)', border: '1px solid var(--border)',
      }}>
        {/* Multi-select checkbox */}
        {onToggleSelect && (
          <input type="checkbox" checked={selectedIds?.has(node.id) || false}
            onChange={() => onToggleSelect(node.id)}
            style={{ width: 13, height: 13, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--accent)' }} />
        )}

        {/* Expand toggle */}
        {node.type === 'section' ? (
          <button onClick={() => setExpanded(e => !e)} style={{
            background: 'none', border: 'none', cursor: hasChildren ? 'pointer' : 'default',
            color: 'var(--text-dim)', padding: 0, width: 16, fontSize: 11,
            opacity: hasChildren ? 1 : 0.2,
          }}>{expanded ? '▼' : '▶'}</button>
        ) : <span style={{ width: 16 }} />}

        {/* Icon */}
        {editIcon && editing
          ? <img src={editIcon} style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0 }} onError={e => (e.currentTarget.style.display = 'none')} />
          : node.iconUrl
            ? <img src={node.iconUrl} style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0 }} onError={e => (e.currentTarget.style.display = 'none')} />
            : <span style={{ fontSize: 12, color: node.type === 'section' ? 'var(--text-dim)' : 'var(--accent)', flexShrink: 0 }}>{node.type === 'section' ? '▤' : '↗'}</span>
        }

        {/* Name / edit */}
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="input" value={editName} onChange={e => setEditName(e.target.value)}
                style={{ padding: '3px 8px', fontSize: 13 }} autoFocus placeholder="Name" />
              {node.type === 'bookmark' && (
                <input className="input" value={editUrl} onChange={e => setEditUrl(e.target.value)}
                  style={{ padding: '3px 8px', fontSize: 13 }} placeholder="URL" />
              )}
            </div>
            {node.type === 'bookmark' && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input className="input" value={editIcon} onChange={e => setEditIcon(e.target.value)}
                  style={{ padding: '3px 8px', fontSize: 12 }} placeholder="icon URL (leave blank to auto-scrape)" />
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', whiteSpace: 'nowrap' }}
                  onClick={() => setShowIconInput(s => !s)}>Fetch</button>
              </div>
            )}
            {showIconInput && (
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="input" value={iconUrlInput} onChange={e => setIconUrlInput(e.target.value)}
                  style={{ padding: '3px 8px', fontSize: 12 }} placeholder="https://example.com/icon.png" />
                <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }}
                  onClick={handleCacheIcon} disabled={cachingIcon}>
                  {cachingIcon ? <span className="spinner" /> : 'Cache locally'}
                </button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={handleSaveEdit}>Save</button>
              <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>
            {node.name}
            {node.url && (
              <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8, fontFamily: 'DM Mono, monospace' }}>
                {node.url.length > 40 ? node.url.substring(0, 40) + '…' : node.url}
              </span>
            )}
          </span>
        )}

        {/* Type badge + actions */}
        {!editing && (
          <>
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 4, flexShrink: 0,
              background: node.type === 'section' ? 'var(--surface2)' : 'var(--accent-bg)',
              color: node.type === 'section' ? 'var(--text-dim)' : 'var(--accent2)',
              border: '1px solid var(--border)',
            }}>{node.type}</span>

            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
              {node.type === 'section' && depth < 4 && (
                <>
                  <ActionBtn label="+ §" title="Add section here" onClick={() => setAdding({ parentId: node.id, type: 'section' })} />
                  <ActionBtn label="+ ↗" title="Add bookmark here" onClick={() => setAdding({ parentId: node.id, type: 'bookmark' })} />
                </>
              )}
              <ActionBtn label="↕" title="Move to different parent" onClick={() => onMove(node.id)} />
              <ActionBtn label="✎" title="Edit" onClick={() => setEditing(true)} />
              <ActionBtn label="✕" title="Delete" danger onClick={handleDelete} />
            </div>
          </>
        )}
      </div>

      {/* Inline move picker — appears directly under this node */}
      {movingId === node.id && (
        <div style={{ marginLeft: 36, marginBottom: 4 }}>
          <MovePicker
            node={node}
            sections={flatSections(allTree, node.id)}
            onMove={onMoveConfirm}
            onCancel={onMoveCancel}
          />
        </div>
      )}

      {/* Inline add form */}
      {isAddingHere && (
        <div style={{ marginLeft: 36, marginBottom: 4 }}>
          <AddNodeForm type={adding!.type}
            onSave={async (name, url) => {
              await bookmarkApi.create({ parentId: node.id, name, type: adding!.type, url })
              setAdding(null); onRefresh()
            }}
            onCancel={() => setAdding(null)} />
        </div>
      )}

      {/* Children */}
      {expanded && (node.children || []).map((child: BookmarkNode) => (
        <TreeNode key={child.id} node={child} depth={depth + 1}
          onRefresh={onRefresh} adding={adding} setAdding={setAdding} onMove={onMove}
          movingId={movingId} allTree={allTree}
          onMoveConfirm={onMoveConfirm} onMoveCancel={onMoveCancel}
          bookmarkApi={bookmarkApi}
          globalExpanded={globalExpanded}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect} />
      ))}
    </div>
  )
}

// ── Add form ──────────────────────────────────────────────────────────────────

function AddNodeForm({ type, onSave, onCancel }: {
  type: 'section' | 'bookmark'
  onSave: (name: string, url?: string) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || (type === 'bookmark' && !url.trim())) return
    setSaving(true)
    await onSave(name.trim(), url.trim() || undefined)
    setSaving(false)
  }

  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px',
      borderRadius: 8, marginBottom: 2, background: 'var(--surface2)',
      border: '1px dashed var(--border2)',
    }}>
      <input className="input" value={name} onChange={e => setName(e.target.value)}
        placeholder={type === 'section' ? 'Section name' : 'Bookmark name'}
        style={{ padding: '4px 10px', fontSize: 13 }} autoFocus
        onKeyDown={e => e.key === 'Enter' && handleSave()} />
      {type === 'bookmark' && (
        <input className="input" value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://..." style={{ padding: '4px 10px', fontSize: 13 }}
          onKeyDown={e => e.key === 'Enter' && handleSave()} />
      )}
      <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 12px' }}
        onClick={handleSave} disabled={saving}>
        {saving ? <span className="spinner" /> : 'Add'}
      </button>
      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }}
        onClick={onCancel}>Cancel</button>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────



function ActionBtn({ label, title, onClick, danger = false }: {
  label: string; title: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button title={title} onClick={onClick} style={{
      background: 'none', border: 'none', cursor: 'pointer', fontSize: 11,
      color: danger ? 'var(--red)' : 'var(--text-dim)', padding: '2px 5px',
      borderRadius: 4, opacity: 0.6, transition: 'opacity 0.15s',
    }}
      onMouseOver={e => e.currentTarget.style.opacity = '1'}
      onMouseOut={e => e.currentTarget.style.opacity = '0.6'}>
      {label}
    </button>
  )
}

function Loading() { return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div> }
function Empty({ message }: { message: string }) {
  return <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '24px 0' }}>{message}</div>
}
