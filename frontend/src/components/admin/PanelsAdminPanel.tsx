import { useEffect, useState } from 'react'
import { panelsApi, tagsApi, bookmarksApi, Panel, Tag, BookmarkNode } from '../../api'

export default function PanelsAdminPanel() {
  const [panels, setPanels] = useState<Panel[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [bookmarkRoots, setBookmarkRoots] = useState<BookmarkNode[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newRootId, setNewRootId] = useState('')
  const [creating, setCreating] = useState(false)

  const load = async () => {
    // Admin panel only shows shared panels - personal panels managed in profile
    const [p, t, b] = await Promise.all([panelsApi.list(), tagsApi.list(), bookmarksApi.tree()])
    setPanels((p.data || []).filter((panel: any) => panel.scope !== 'personal')); setTags(t.data || []); setBookmarkRoots(b.data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const [newType, setNewType] = useState('bookmarks')

  const create = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    const config = newRootId ? JSON.stringify({ rootNodeId: newRootId }) : '{}'
    await panelsApi.create({ type: newType, title: newTitle.trim(), config })
    setNewTitle(''); setNewRootId(''); setShowForm(false)
    await load(); setCreating(false)
  }

  const remove = async (id: string, title: string) => {
    if (!confirm(`Delete panel "${title}"?`)) return
    await panelsApi.delete(id); load()
  }

  const toggleTag = async (panelId: string, tagId: string, hasTag: boolean) => {
    if (hasTag) await panelsApi.removeTag(panelId, tagId)
    else await panelsApi.addTag(panelId, tagId)
    load()
  }

  if (loading) return <Loading />

  const flatNodes = flattenTree(bookmarkRoots)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.7, maxWidth: 460 }}>
          Panels appear on the dashboard. Each panel points to a node in the bookmark tree.
          Assign tags to control who can see each panel.
        </p>
        <button className="btn btn-primary" style={{ flexShrink: 0, marginLeft: 16 }}
          onClick={() => setShowForm(!showForm)}>
          + New panel
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20, padding: 20 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label className="label">Panel title</label>
              <input className="input" value={newTitle} onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. Media Links" autoFocus />
            </div>
            <div style={{ flex: 0.5 }}>
              <label className="label">Panel type</label>
              <select className="input" value={newType} onChange={e => setNewType(e.target.value)} style={{ cursor: 'pointer' }}>
                <option value="bookmarks">Bookmarks</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Bookmark root (optional)</label>
              <select className="input" value={newRootId} onChange={e => setNewRootId(e.target.value)}
                style={{ cursor: 'pointer' }}>
                <option value="">— All bookmarks —</option>
                {flatNodes.map(n => (
                  <option key={n.id} value={n.id}>
                    {n.path.replace(/^\/shared/, '').replace(/\//g, ' / ').replace(/^ \/ /, '') || '(root)'}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" onClick={create} disabled={creating}>
              {creating ? <span className="spinner" /> : 'Create'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {panels.map(p => {
          const config = safeParseConfig(p.config)
          const rootNode = config.rootNodeId
            ? flatNodes.find(n => n.id === config.rootNodeId)
            : null

          return (
            <div key={p.id} className="card-sm" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', marginTop: 2 }}>
                    {rootNode ? rootNode.path.replace(/^\/shared/, '') || '/' : '/ (all shared)'}
                  </div>
                </div>
                <button className="btn btn-danger" onClick={() => remove(p.id, p.title)}>Delete</button>
              </div>

              {/* Tag assignment */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', marginRight: 4 }}>Access:</span>
                {tags.length === 0 && (
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>No tags yet</span>
                )}
                {tags.map(t => {
                  const hasTag = p.tags?.some(pt => pt.id === t.id)
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleTag(p.id, t.id, !!hasTag)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 6, cursor: 'pointer',
                        border: `1px solid ${hasTag ? t.color + '60' : 'var(--border)'}`,
                        background: hasTag ? t.color + '18' : 'transparent',
                        color: hasTag ? t.color : 'var(--text-dim)',
                        fontSize: 12, fontWeight: hasTag ? 500 : 400,
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ width: 5, height: 5, borderRadius: '50%',
                        background: hasTag ? t.color : 'var(--text-dim)' }} />
                      {t.name}
                    </button>
                  )
                })}
                {p.tags?.length === 0 && (
                  <span style={{ fontSize: 11, color: 'var(--amber)', marginLeft: 4 }}>
                    ⚠ untagged — visible to everyone
                  </span>
                )}
              </div>
            </div>
          )
        })}
        {panels.length === 0 && <Empty message="No panels yet. Create one pointing at a bookmark node." />}
      </div>
    </div>
  )
}

function flattenTree(nodes: BookmarkNode[], result: BookmarkNode[] = []): BookmarkNode[] {
  for (const n of nodes) {
    result.push(n)
    if (n.children) flattenTree(n.children, result)
  }
  return result
}

function safeParseConfig(config: string): any {
  try { return JSON.parse(config) } catch { return {} }
}

function Loading() { return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div> }
function Empty({ message }: { message: string }) {
  return <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '24px 0' }}>{message}</div>
}
