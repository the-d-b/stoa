import { useEffect, useState } from 'react'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, useDroppable, useDraggable,
} from '@dnd-kit/core'
import { bookmarksApi, BookmarkNode } from '../../api'

export default function BookmarksPanel() {
  const [tree, setTree] = useState<BookmarkNode[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<{ parentId?: string; type: 'section' | 'bookmark' } | null>(null)
  const [activeNode, setActiveNode] = useState<BookmarkNode | null>(null)
  const [moving, setMoving] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const load = () => bookmarksApi.tree().then(r => setTree(r.data || [])).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const findNode = (nodes: BookmarkNode[], id: string): BookmarkNode | null => {
    for (const n of nodes) {
      if (n.id === id) return n
      if (n.children) { const f = findNode(n.children, id); if (f) return f }
    }
    return null
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveNode(findNode(tree, event.active.id as string))
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveNode(null)
    if (!over || active.id === over.id) return
    const dragged = findNode(tree, active.id as string)
    const target = findNode(tree, over.id as string)
    if (!dragged || !target) return
    const newParentId = target.type === 'section' ? target.id : (target.parentId || null)
    if (newParentId === dragged.parentId) return
    setMoving(true)
    try {
      await bookmarksApi.move(dragged.id, newParentId)
      await load()
    } catch (e: any) { alert(e.response?.data?.error || 'Failed to move node') }
    finally { setMoving(false) }
  }

  if (loading) return <Loading />

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.7, maxWidth: 460 }}>
            Drag nodes to reparent them. Sections sort before bookmarks.
            {moving && <span style={{ color: 'var(--accent2)', marginLeft: 8 }}>Moving...</span>}
          </p>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 16 }}>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setAdding({ type: 'section' })}>+ Section</button>
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setAdding({ type: 'bookmark' })}>+ Bookmark</button>
          </div>
        </div>

        {adding && !adding.parentId && (
          <AddNodeForm type={adding.type}
            onSave={async (name, url) => { await bookmarksApi.create({ name, type: adding.type, url }); setAdding(null); load() }}
            onCancel={() => setAdding(null)} />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {tree.length === 0 && <Empty message="No bookmarks yet. Add a section to get started." />}
          {tree.map(node => (
            <TreeNode key={node.id} node={node} depth={0} onRefresh={load} adding={adding} setAdding={setAdding} />
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeNode && (
          <div style={{
            padding: '6px 12px', borderRadius: 8, fontSize: 13,
            background: 'var(--accent-bg)', border: '1px solid var(--accent)',
            color: 'var(--accent2)', opacity: 0.9, cursor: 'grabbing',
          }}>
            {activeNode.type === 'section' ? '▤' : '↗'} {activeNode.name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function TreeNode({ node, depth, onRefresh, adding, setAdding }: {
  node: BookmarkNode; depth: number; onRefresh: () => void
  adding: { parentId?: string; type: 'section' | 'bookmark' } | null
  setAdding: (v: any) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(node.name)
  const [editUrl, setEditUrl] = useState(node.url || '')
  const [editIcon, setEditIcon] = useState(node.iconUrl || '')
  const [iconUrlInput, setIconUrlInput] = useState('')
  const [showIconInput, setShowIconInput] = useState(false)
  const [cachingIcon, setCachingIcon] = useState(false)

  const hasChildren = (node.children || []).length > 0
  const isAddingHere = adding?.parentId === node.id

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: node.id })
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: node.id })

  const setRef = (el: HTMLElement | null) => { setDropRef(el); setDragRef(el) }

  const handleDelete = async () => {
    if (!confirm(hasChildren ? `Delete "${node.name}" and all contents?` : `Delete "${node.name}"?`)) return
    await bookmarksApi.delete(node.id); onRefresh()
  }

  const handleSaveEdit = async () => {
    await bookmarksApi.update(node.id, { name: editName, url: editUrl, iconUrl: editIcon })
    setEditing(false); onRefresh()
  }

  const handleCacheIcon = async () => {
    if (!iconUrlInput.trim()) return
    setCachingIcon(true)
    try {
      const res = await bookmarksApi.cacheIcon(iconUrlInput.trim())
      setEditIcon(res.data.iconUrl); setShowIconInput(false); setIconUrlInput('')
    } catch { alert('Failed to fetch icon') }
    finally { setCachingIcon(false) }
  }

  return (
    <div style={{ marginLeft: depth > 0 ? 20 : 0, opacity: isDragging ? 0.4 : 1 }}>
      <div ref={setRef} {...attributes} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
        borderRadius: 8, marginBottom: 2, transition: 'all 0.1s',
        background: isOver ? 'var(--accent-bg)' : 'var(--surface)',
        border: `1px solid ${isOver ? 'var(--accent)' : 'var(--border)'}`,
      }}>
        <span {...listeners} title="Drag to reparent"
          style={{ cursor: 'grab', color: 'var(--text-dim)', fontSize: 11, padding: '0 2px', userSelect: 'none' }}>⠿</span>

        {node.type === 'section' ? (
          <button onClick={() => setExpanded(e => !e)} style={{
            background: 'none', border: 'none', cursor: hasChildren ? 'pointer' : 'default',
            color: 'var(--text-dim)', padding: 0, width: 16, fontSize: 11,
            opacity: hasChildren ? 1 : 0.2,
          }}>{expanded ? '▼' : '▶'}</button>
        ) : <span style={{ width: 16 }} />}

        {(editing ? { ...node, iconUrl: editIcon } : node).iconUrl
          ? <img src={(editing ? editIcon : node.iconUrl)} style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0 }} onError={e => (e.currentTarget.style.display = 'none')} />
          : <span style={{ fontSize: 12, color: node.type === 'section' ? 'var(--text-dim)' : 'var(--accent)', flexShrink: 0 }}>{node.type === 'section' ? '▤' : '↗'}</span>
        }

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
            {node.url && <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8, fontFamily: 'DM Mono, monospace' }}>
              {node.url.length > 40 ? node.url.substring(0, 40) + '…' : node.url}
            </span>}
          </span>
        )}

        {!editing && <>
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 4, flexShrink: 0,
            background: node.type === 'section' ? 'var(--surface2)' : 'var(--accent-bg)',
            color: node.type === 'section' ? 'var(--text-dim)' : 'var(--accent2)',
            border: '1px solid var(--border)',
          }}>{node.type}</span>
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            {node.type === 'section' && depth < 4 && <>
              <ActionBtn label="+ §" title="Add section here" onClick={() => setAdding({ parentId: node.id, type: 'section' })} />
              <ActionBtn label="+ ↗" title="Add bookmark here" onClick={() => setAdding({ parentId: node.id, type: 'bookmark' })} />
            </>}
            <ActionBtn label="✎" title="Edit" onClick={() => setEditing(true)} />
            <ActionBtn label="✕" title="Delete" danger onClick={handleDelete} />
          </div>
        </>}
      </div>

      {isAddingHere && (
        <div style={{ marginLeft: 36, marginBottom: 4 }}>
          <AddNodeForm type={adding!.type}
            onSave={async (name, url) => { await bookmarksApi.create({ parentId: node.id, name, type: adding!.type, url }); setAdding(null); onRefresh() }}
            onCancel={() => setAdding(null)} />
        </div>
      )}

      {expanded && (node.children || []).map((child: BookmarkNode) => (
        <TreeNode key={child.id} node={child} depth={depth + 1} onRefresh={onRefresh} adding={adding} setAdding={setAdding} />
      ))}
    </div>
  )
}

function AddNodeForm({ type, onSave, onCancel }: {
  type: 'section' | 'bookmark'; onSave: (name: string, url?: string) => Promise<void>; onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const handleSave = async () => {
    if (!name.trim() || (type === 'bookmark' && !url.trim())) return
    setSaving(true); await onSave(name.trim(), url.trim() || undefined); setSaving(false)
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 8, marginBottom: 2, background: 'var(--surface2)', border: '1px dashed var(--border2)' }}>
      <input className="input" value={name} onChange={e => setName(e.target.value)}
        placeholder={type === 'section' ? 'Section name' : 'Bookmark name'}
        style={{ padding: '4px 10px', fontSize: 13 }} autoFocus onKeyDown={e => e.key === 'Enter' && handleSave()} />
      {type === 'bookmark' && (
        <input className="input" value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://..." style={{ padding: '4px 10px', fontSize: 13 }}
          onKeyDown={e => e.key === 'Enter' && handleSave()} />
      )}
      <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={handleSave} disabled={saving}>
        {saving ? <span className="spinner" /> : 'Add'}
      </button>
      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={onCancel}>Cancel</button>
    </div>
  )
}

function ActionBtn({ label, title, onClick, danger = false }: { label: string; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button title={title} onClick={onClick} style={{
      background: 'none', border: 'none', cursor: 'pointer', fontSize: 11,
      color: danger ? 'var(--red)' : 'var(--text-dim)', padding: '2px 5px', borderRadius: 4,
      opacity: 0.6, transition: 'opacity 0.15s',
    }} onMouseOver={e => e.currentTarget.style.opacity = '1'} onMouseOut={e => e.currentTarget.style.opacity = '0.6'}>
      {label}
    </button>
  )
}

function Loading() { return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div> }
function Empty({ message }: { message: string }) { return <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '24px 0' }}>{message}</div> }
