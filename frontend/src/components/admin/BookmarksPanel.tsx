import { useEffect, useState } from 'react'
import { bookmarksApi, BookmarkNode } from '../../api'

export default function BookmarksPanel() {
  const [tree, setTree] = useState<BookmarkNode[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<{ parentId?: string; type: 'section' | 'bookmark' } | null>(null)

  const load = () => bookmarksApi.tree()
    .then(r => setTree(r.data))
    .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  if (loading) return <Loading />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.7, maxWidth: 460 }}>
          The bookmark tree. Sections organize bookmarks into groups. Panels on the dashboard
          point to a node and display its subtree.
        </p>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 16 }}>
          <button className="btn btn-secondary" style={{ fontSize: 12 }}
            onClick={() => setAdding({ type: 'section' })}>
            + Section
          </button>
          <button className="btn btn-primary" style={{ fontSize: 12 }}
            onClick={() => setAdding({ type: 'bookmark' })}>
            + Bookmark
          </button>
        </div>
      </div>

      {adding && !adding.parentId && (
        <AddNodeForm
          type={adding.type}
          onSave={async (name, url, iconUrl) => {
            await bookmarksApi.create({ name, type: adding.type, url, iconUrl })
            setAdding(null); load()
          }}
          onCancel={() => setAdding(null)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {tree.length === 0 && (
          <Empty message="No bookmarks yet. Add a section to get started." />
        )}
        {tree.map(node => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            onRefresh={load}
            adding={adding}
            setAdding={setAdding}
          />
        ))}
      </div>
    </div>
  )
}

function TreeNode({ node, depth, onRefresh, adding, setAdding }: {
  node: BookmarkNode
  depth: number
  onRefresh: () => void
  adding: { parentId?: string; type: 'section' | 'bookmark' } | null
  setAdding: (v: any) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(node.name)
  const [editUrl, setEditUrl] = useState(node.url || '')

  const hasChildren = node.children && node.children.length > 0
  const isAddingHere = adding?.parentId === node.id

  const handleDelete = async () => {
    const msg = hasChildren
      ? `Delete "${node.name}" and all its contents?`
      : `Delete "${node.name}"?`
    if (!confirm(msg)) return
    await bookmarksApi.delete(node.id)
    onRefresh()
  }

  const handleSaveEdit = async () => {
    await bookmarksApi.update(node.id, { name: editName, url: editUrl })
    setEditing(false); onRefresh()
  }

  return (
    <div style={{ marginLeft: depth > 0 ? 20 : 0 }}>
      {/* Node row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', borderRadius: 8,
        background: 'var(--surface)', border: '1px solid var(--border)',
        marginBottom: 2,
      }}>
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            background: 'none', border: 'none', cursor: hasChildren ? 'pointer' : 'default',
            color: 'var(--text-dim)', padding: 0, width: 16, fontSize: 10,
            opacity: hasChildren ? 1 : 0,
          }}
        >
          {expanded ? '▼' : '▶'}
        </button>

        {/* Icon */}
        <NodeIcon node={node} />

        {/* Name / edit */}
        {editing ? (
          <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
            <input className="input" value={editName} onChange={e => setEditName(e.target.value)}
              style={{ padding: '3px 8px', fontSize: 13 }} autoFocus />
            {node.type === 'bookmark' && (
              <input className="input" value={editUrl} onChange={e => setEditUrl(e.target.value)}
                style={{ padding: '3px 8px', fontSize: 13 }} placeholder="URL" />
            )}
            <button className="btn btn-primary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={handleSaveEdit}>Save</button>
            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        ) : (
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>
            {node.name}
            {node.url && (
              <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8, fontFamily: 'DM Mono, monospace' }}>
                {node.url}
              </span>
            )}
          </span>
        )}

        {/* Type badge */}
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 4,
          background: node.type === 'section' ? 'var(--surface2)' : 'var(--accent-bg)',
          color: node.type === 'section' ? 'var(--text-dim)' : 'var(--accent2)',
          border: '1px solid var(--border)',
        }}>
          {node.type}
        </span>

        {/* Actions */}
        {!editing && (
          <div style={{ display: 'flex', gap: 4 }}>
            {node.type === 'section' && depth < 4 && (
              <>
                <ActionBtn label="+ §" title="Add section" onClick={() => setAdding({ parentId: node.id, type: 'section' })} />
                <ActionBtn label="+ ↗" title="Add bookmark" onClick={() => setAdding({ parentId: node.id, type: 'bookmark' })} />
              </>
            )}
            <ActionBtn label="✎" title="Edit" onClick={() => setEditing(true)} />
            <ActionBtn label="✕" title="Delete" danger onClick={handleDelete} />
          </div>
        )}
      </div>

      {/* Add form inline */}
      {isAddingHere && (
        <div style={{ marginLeft: 36, marginBottom: 4 }}>
          <AddNodeForm
            type={adding!.type}
            onSave={async (name, url, iconUrl) => {
              await bookmarksApi.create({ parentId: node.id, name, type: adding!.type, url, iconUrl })
              setAdding(null); onRefresh()
            }}
            onCancel={() => setAdding(null)}
          />
        </div>
      )}

      {/* Children */}
      {expanded && node.children && node.children.map(child => (
        <TreeNode key={child.id} node={child} depth={depth + 1}
          onRefresh={onRefresh} adding={adding} setAdding={setAdding} />
      ))}
    </div>
  )
}

function AddNodeForm({ type, onSave, onCancel }: {
  type: 'section' | 'bookmark'
  onSave: (name: string, url?: string, iconUrl?: string) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    if (type === 'bookmark' && !url.trim()) return
    setSaving(true)
    await onSave(name.trim(), url.trim() || undefined)
    setSaving(false)
  }

  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'center',
      padding: '8px 10px', borderRadius: 8,
      background: 'var(--surface2)', border: '1px dashed var(--border2)',
      marginBottom: 2,
    }}>
      <input className="input" value={name} onChange={e => setName(e.target.value)}
        placeholder={type === 'section' ? 'Section name' : 'Bookmark name'}
        style={{ padding: '4px 10px', fontSize: 13 }} autoFocus />
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

function NodeIcon({ node }: { node: BookmarkNode }) {
  if (node.iconUrl) {
    return <img src={node.iconUrl} style={{ width: 16, height: 16, borderRadius: 3 }}
      onError={e => (e.currentTarget.style.display = 'none')} />
  }
  if (node.type === 'section') {
    return <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>▤</span>
  }
  return <span style={{ fontSize: 12, color: 'var(--accent)' }}>↗</span>
}

function ActionBtn({ label, title, onClick, danger = false }: {
  label: string; title: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: danger ? 'var(--red)' : 'var(--text-dim)',
        fontSize: 11, padding: '2px 5px', borderRadius: 4,
        opacity: 0.6, transition: 'opacity 0.15s',
      }}
      onMouseOver={e => e.currentTarget.style.opacity = '1'}
      onMouseOut={e => e.currentTarget.style.opacity = '0.6'}
    >
      {label}
    </button>
  )
}

function Loading() { return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div> }
function Empty({ message }: { message: string }) {
  return <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '24px 0' }}>{message}</div>
}
