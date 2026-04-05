import { useEffect, useState } from 'react'
import { panelsApi, tagsApi, bookmarksApi, integrationsApi, groupsApi, Integration, Panel, Tag, BookmarkNode } from '../../api'

export default function PanelsAdminPanel() {
  const [panels, setPanels] = useState<Panel[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [bookmarkRoots, setBookmarkRoots] = useState<BookmarkNode[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newRootId, setNewRootId] = useState('')
  const [newHeight, setNewHeight] = useState(2)
  const [editingHeight, setEditingHeight] = useState<{id: string; height: number} | null>(null)
  const [showCalConfig, setShowCalConfig] = useState(false)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [calConfigPanel, setCalConfigPanel] = useState<any>(null)
  const [panelGroups, setPanelGroups] = useState<Record<string,string[]>>({})
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null)
  const [loadingTree, setLoadingTree] = useState(false)

  const refreshBookmarkTree = async () => {
    setLoadingTree(true)
    const b = await bookmarksApi.tree()
    setBookmarkRoots(b.data || [])
    setLoadingTree(false)
  }
  const [creating, setCreating] = useState(false)

  const load = async () => {
    // Admin panel only shows shared panels - personal panels managed in profile
    // Always reload bookmark tree to pick up renames
    const [p, t, b, ig, g] = await Promise.all([panelsApi.list(), tagsApi.list(), bookmarksApi.tree(), integrationsApi.list(), groupsApi.list()])
    setIntegrations(ig.data || [])
    setGroups(g.data || [])
    setPanels((p.data || []).filter((panel: any) => panel.scope !== 'personal'))
    setTags(t.data || [])
    // Load group assignments for each shared panel
    const pg: Record<string,string[]> = {}
    for (const panel of (p.data || [])) {
      if (panel.scope === 'shared') {
        const gr = await panelsApi.getGroups(panel.id)
        pg[panel.id] = gr.data || []
      }
    }
    setPanelGroups(pg)
    setBookmarkRoots(b.data || [])
    setLoading(false)
  }
  useEffect(() => {
    load()
    // Reload when window regains focus (user comes back from bookmarks tab)
    const onFocus = () => { bookmarksApi.tree().then(b => setBookmarkRoots(b.data || [])) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const [newType, setNewType] = useState('bookmarks')

  const create = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    const config = newType === 'sonarr'
      ? JSON.stringify({ integrationId: newRootId, height: newHeight, refreshSecs: 300 })
      : newType === 'calendar'
      ? JSON.stringify({ firstDay: 0, height: newHeight, sources: [] })
      : JSON.stringify({ rootNodeId: newRootId || undefined, height: newHeight })
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

  const flatNodes = flattenTree(bookmarkRoots)  // FlatNode[]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.7, maxWidth: 460 }}>
          Panels appear on the dashboard. Each panel points to a node in the bookmark tree.
          Assign tags to control who can see each panel.
        </p>
        <button className="btn btn-primary" style={{ flexShrink: 0, marginLeft: 16 }}
          onClick={() => { setShowForm(f => !f); if (!showForm) refreshBookmarkTree() }}>
          + New panel
        </button>
      </div>

      {/* Group access panel */}
      {expandedPanel && groups.length > 0 && (
        <div style={{ marginTop: 8, padding: '12px 16px', background: 'var(--surface2)',
          borderRadius: 8, border: '1px solid var(--border)' }}>
          <div className="section-title" style={{ marginBottom: 8 }}>
            Group access — {panels.find(p => p.id === expandedPanel)?.title}
            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 8 }}>
              (no groups = visible to all users)
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {groups.map(g => {
              const assigned = (panelGroups[expandedPanel] || []).includes(g.id)
              return (
                <button key={g.id} onClick={async () => {
                  const current = panelGroups[expandedPanel] || []
                  const next = assigned ? current.filter((id: string) => id !== g.id) : [...current, g.id]
                  await panelsApi.setGroups(expandedPanel, next)
                  setPanelGroups((prev: Record<string,string[]>) => ({ ...prev, [expandedPanel]: next }))
                }} style={{
                  padding: '3px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                  background: assigned ? 'var(--accent-bg)' : 'var(--surface)',
                  color: assigned ? 'var(--accent2)' : 'var(--text-muted)',
                  border: `1px solid ${assigned ? '#7c6fff30' : 'var(--border)'}`,
                  transition: 'all 0.15s',
                }}>{g.name}</button>
              )
            })}
          </div>
        </div>
      )}

      {/* Calendar source config modal */}
      {showCalConfig && (
        <CalendarConfigModal
          panel={calConfigPanel}
          integrations={integrations.filter(i => ['sonarr','radarr'].includes(i.type))}
          onClose={() => { setShowCalConfig(false); setCalConfigPanel(null) }}
          onSave={async (sources) => {
            if (calConfigPanel) {
              const existing = (() => { try { return JSON.parse(calConfigPanel.config||'{}') } catch { return {} } })()
              await panelsApi.update(calConfigPanel.id, { title: calConfigPanel.title, config: JSON.stringify({ ...existing, sources }) })
              await load()
            }
            setShowCalConfig(false); setCalConfigPanel(null)
          }}
        />
      )}

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
                <option value="calendar">Calendar</option>
                <option value="sonarr">Sonarr</option>
              </select>
            </div>
            {newType === 'bookmarks' && (
              <div style={{ flex: 1 }}>
                <label className="label">Bookmark root (optional)</label>
                <select className="input" value={newRootId} onChange={e => setNewRootId(e.target.value)}
                  style={{ cursor: 'pointer' }}>
                  <option value="">— All bookmarks —</option>
                  {loadingTree && <option disabled>Loading...</option>}
                  {!loadingTree && flatNodes.map(({ node, label }) => (
                    <option key={node.id} value={node.id}>{label}</option>
                  ))}
                </select>
              </div>
            )}
            {newType === 'calendar' && (
              <div style={{ flex: 1 }}>
                <label className="label">Configuration</label>
                <button className="btn btn-secondary" style={{ fontSize: 12 }}
                  onClick={() => setShowCalConfig(true)}>Configure ↗</button>
              </div>
            )}
            {newType === 'sonarr' && (
              <div style={{ flex: 1 }}>
                <label className="label">Integration</label>
                <select className="input" value={newRootId} onChange={e => setNewRootId(e.target.value)}
                  style={{ cursor: 'pointer' }}>
                  <option value="">— Select integration —</option>
                  {integrations.filter(i => i.type === 'sonarr').map(i => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ flex: 0.4 }}>
              <label className="label">Height</label>
              <select className="input" value={newHeight}
                onChange={e => setNewHeight(Number(e.target.value))}
                style={{ cursor: 'pointer' }}>
                <option value={1}>1x — Compact</option>
                <option value={2}>2x — Normal</option>
                <option value={4}>4x — Tall</option>
                <option value={8}>8x — Full</option>
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
            ? flatNodes.find(({ node }) => node.id === config.rootNodeId)?.node
            : null

          return (
            <div key={p.id} className="card-sm" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', marginTop: 2 }}>
                    {rootNode ? rootNode.name : '/ (all shared)'}
                    {' · '}
                    {(() => { try { const h = JSON.parse(p.config||'{}').height||2; return `${h}x` } catch { return '2x' } })()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {editingHeight?.id === p.id ? (
                    <>
                      <select className="input" style={{ fontSize: 12, padding: '3px 8px', cursor: 'pointer' }}
                        value={editingHeight.height}
                        onChange={e => setEditingHeight(eh => eh ? { ...eh, height: Number(e.target.value) } : null)}>
                        <option value={1}>1x — Compact</option>
                        <option value={2}>2x — Normal</option>
                        <option value={4}>4x — Tall</option>
                        <option value={8}>8x — Full</option>
                      </select>
                      <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={async () => {
                        const config = safeParseConfig(p.config)
                        config.height = editingHeight.height
                        await panelsApi.update(p.id, { title: p.title, config: JSON.stringify(config) })
                        setEditingHeight(null); load()
                      }}>Save</button>
                      <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditingHeight(null)}>Cancel</button>
                    </>
                  ) : (
                    <button className="btn btn-ghost" style={{ fontSize: 12 }}
                      onClick={() => {
                        const h = (() => { try { return JSON.parse(p.config||'{}').height||2 } catch { return 2 } })()
                        setEditingHeight({ id: p.id, height: h })
                      }}>
                      Resize
                    </button>
                  )}
                  {p.type === 'calendar' && (
                    <button className="btn btn-ghost" style={{ fontSize: 12 }}
                      onClick={() => { setCalConfigPanel(p); setShowCalConfig(true) }}>
                      Sources
                    </button>
                  )}
                  <button className="btn btn-ghost" style={{ fontSize: 12 }}
                    onClick={() => setExpandedPanel(expandedPanel === p.id ? null : p.id)}>
                    Groups
                  </button>
                  <button className="btn btn-danger" onClick={() => remove(p.id, p.title)}>Delete</button>
                </div>
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

interface FlatNode {
  node: BookmarkNode
  depth: number
  label: string
}

function flattenTree(nodes: BookmarkNode[], result: FlatNode[] = [], depth = 0): FlatNode[] {
  for (const n of nodes) {
    const indent = '    '.repeat(depth)  // non-breaking spaces for indent
    const icon = n.type === 'section' ? '▤ ' : '↗ '  // ▤ or ↗
    result.push({ node: n, depth, label: indent + icon + n.name })
    if (n.children && n.children.length > 0) flattenTree(n.children, result, depth + 1)
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

// ── Calendar source config modal ──────────────────────────────────────────────

function CalendarConfigModal({ panel, integrations, onClose, onSave }: {
  panel: any; integrations: Integration[]
  onClose: () => void; onSave: (sources: any[]) => void
}) {
  const existingSources = (() => {
    try { return JSON.parse(panel?.config || '{}').sources || [] } catch { return [] }
  })()

  const [sources, setSources] = useState<any[]>(existingSources)
  const [newIntId, setNewIntId] = useState('')
  const [newDays, setNewDays] = useState(14)

  const addSource = () => {
    if (!newIntId) return
    const ig = integrations.find(i => i.id === newIntId)
    if (!ig) return
    setSources(s => [...s, { type: ig.type, integrationId: newIntId, daysAhead: newDays }])
    setNewIntId('')
  }

  const removeSource = (i: number) => setSources(s => s.filter((_, idx) => idx !== i))

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div className="card" style={{ padding: 24, maxWidth: 480, width: '90%' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>
          Calendar data sources
        </div>

        {/* Existing sources */}
        {sources.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {sources.map((src, i) => {
              const ig = integrations.find(ig => ig.id === src.integrationId)
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                  background: 'var(--surface2)', borderRadius: 7, marginBottom: 6,
                }}>
                  <span style={{ flex: 1, fontSize: 13 }}>
                    {ig?.name ?? src.integrationId}
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>
                      {src.daysAhead}d ahead
                    </span>
                  </span>
                  <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)' }}
                    onClick={() => removeSource(i)}>Remove</button>
                </div>
              )
            })}
          </div>
        )}

        {/* Add source */}
        {integrations.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <label className="label">Add source</label>
              <select className="input" value={newIntId} onChange={e => setNewIntId(e.target.value)}
                style={{ cursor: 'pointer' }}>
                <option value="">— Select integration —</option>
                {integrations.map(ig => <option key={ig.id} value={ig.id}>{ig.name} ({ig.type})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Days ahead</label>
              <select className="input" value={newDays} onChange={e => setNewDays(Number(e.target.value))}
                style={{ cursor: 'pointer' }}>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </div>
            <button className="btn btn-secondary" onClick={addSource} disabled={!newIntId}>Add</button>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            No compatible integrations found. Add a Sonarr or Radarr integration in the Integrations tab first.
          </p>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => onSave(sources)}>Save</button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
