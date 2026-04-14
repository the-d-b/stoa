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
  const [editingMaxMbps, setEditingMaxMbps] = useState<{id: string; val: number} | null>(null)
  const [editingCustomAPI, setEditingCustomAPI] = useState<{id: string; url: string; apiKey: string; mappings: string; refreshSecs: number} | null>(null)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [panelGroups, setPanelGroups] = useState<Record<string,string[]>>({})
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
    const [p, t, b, ig, g] = await Promise.all([panelsApi.list(undefined, 'system'), tagsApi.list(), bookmarksApi.tree(), integrationsApi.list(), groupsApi.list()])
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
    const config = newType === 'customapi'
      ? JSON.stringify({ url: '', apiKey: '', mappings: [], refreshSecs: 600, height: newHeight })
      : ['sonarr','radarr','lidarr','plex','tautulli','truenas','proxmox','kuma','gluetun','opnsense','transmission','photoprism','authentik'].includes(newType)
      ? JSON.stringify({ integrationId: newRootId, height: newHeight, refreshSecs: 300, ...(newType === 'opnsense' ? { maxMbps: 1000 } : {}) })
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
                <option value="radarr">Radarr</option>
                <option value="lidarr">Lidarr</option>
                <option value="plex">Plex</option>
                <option value="tautulli">Tautulli</option>
                <option value="truenas">TrueNAS</option>
                <option value="proxmox">Proxmox</option>
                <option value="kuma">Uptime Kuma</option>
                <option value="gluetun">Gluetun</option>
                <option value="opnsense">OPNsense</option>
                <option value="transmission">Transmission</option>
                <option value="photoprism">PhotoPrism</option>
                <option value="customapi">Custom API</option>
                <option value="authentik">Authentik</option>
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
            {['sonarr','radarr','lidarr','plex','tautulli','truenas','proxmox','kuma','gluetun','opnsense','transmission','photoprism','authentik'].includes(newType) && (
              <div style={{ flex: 1 }}>
                <label className="label">Integration</label>
                <select className="input" value={newRootId} onChange={e => setNewRootId(e.target.value)}
                  style={{ cursor: 'pointer' }}>
                  <option value="">— Select integration —</option>
                  {integrations.filter(i => i.type === newType).map(i => (
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

      <div style={{ marginBottom: 12 }}>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter panels..." style={{ fontSize: 13 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {panels.filter(p => !search || p.title.toLowerCase().includes(search.toLowerCase())).map(p => {
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

                  {p.type === 'opnsense' && (
                    editingMaxMbps?.id === p.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Max Mbps</span>
                        <input type="number" className="input" style={{ fontSize: 12, width: 80, padding: '3px 6px' }}
                          value={editingMaxMbps.val}
                          onChange={e => setEditingMaxMbps(m => m ? { ...m, val: Number(e.target.value) } : null)} />
                        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={async () => {
                          const cfg = safeParseConfig(p.config)
                          cfg.maxMbps = editingMaxMbps.val
                          await panelsApi.update(p.id, { title: p.title, config: JSON.stringify(cfg) })
                          setEditingMaxMbps(null); load()
                        }}>Save</button>
                        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditingMaxMbps(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => {
                        const mbps = (() => { try { return JSON.parse(p.config||'{}').maxMbps||1000 } catch { return 1000 } })()
                        setEditingMaxMbps({ id: p.id, val: mbps })
                      }}>
                        {(() => { try { return JSON.parse(p.config||'{}').maxMbps||1000 } catch { return 1000 } })()} Mbps
                      </button>
                    )
                  )}
                  {p.type === 'customapi' && (
                    editingCustomAPI?.id === p.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0', width: '100%' }}>
                        <div>
                          <label className="label">API URL</label>
                          <input className="input" style={{ fontSize: 12, fontFamily: 'DM Mono, monospace' }}
                            value={editingCustomAPI.url}
                            onChange={e => setEditingCustomAPI(c => c ? { ...c, url: e.target.value } : null)}
                            placeholder="http://host:port/api/stats" />
                        </div>
                        <div>
                          <label className="label">Bearer token (optional)</label>
                          <input className="input" style={{ fontSize: 12, fontFamily: 'DM Mono, monospace' }}
                            value={editingCustomAPI.apiKey}
                            onChange={e => setEditingCustomAPI(c => c ? { ...c, apiKey: e.target.value } : null)}
                            placeholder="Leave blank if no auth required" />
                        </div>
                        <div>
                          <label className="label">Field mappings</label>
                          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
                            One per line: <code>path.to.value | Label</code>
                          </div>
                          <textarea className="input" style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', minHeight: 80, resize: 'vertical' }}
                            value={editingCustomAPI.mappings}
                            onChange={e => setEditingCustomAPI(c => c ? { ...c, mappings: e.target.value } : null)} />
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <label className="label" style={{ margin: 0 }}>Refresh (sec)</label>
                          <input type="number" className="input" style={{ fontSize: 12, width: 80 }}
                            value={editingCustomAPI.refreshSecs}
                            onChange={e => setEditingCustomAPI(c => c ? { ...c, refreshSecs: Number(e.target.value) } : null)} />
                          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={async () => {
                            const cfg = safeParseConfig(p.config)
                            cfg.url = editingCustomAPI.url
                            cfg.apiKey = editingCustomAPI.apiKey
                            cfg.refreshSecs = editingCustomAPI.refreshSecs
                            cfg.mappings = editingCustomAPI.mappings.split('\n')
                              .map((line: string) => line.trim())
                              .filter((line: string) => line.includes('|'))
                              .map((line: string) => {
                                const [path, ...rest] = line.split('|')
                                return { path: path.trim(), label: rest.join('|').trim() }
                              })
                            await panelsApi.update(p.id, { title: p.title, config: JSON.stringify(cfg) })
                            setEditingCustomAPI(null); load()
                          }}>Save</button>
                          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditingCustomAPI(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => {
                        const cfg = safeParseConfig(p.config)
                        const mappings = (cfg.mappings || []).map((m: any) => `${m.path} | ${m.label}`).join('\n')
                        setEditingCustomAPI({ id: p.id, url: cfg.url || '', apiKey: cfg.apiKey || '', mappings, refreshSecs: cfg.refreshSecs || 600 })
                      }}>Configure</button>
                    )
                  )}
                  <button className="btn btn-danger" onClick={() => remove(p.id, p.title)}>Delete</button>
                </div>
              </div>

              {/* Calendar sources - inline */}
              {p.type === 'calendar' && (() => {
                const calIntegrations = integrations.filter((i: any) => ['sonarr','radarr','lidarr'].includes(i.type))
                const existingSources: any[] = (() => { try { return JSON.parse(p.config||'{}').sources || [] } catch { return [] } })()
                return (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Calendar sources</div>
                    {existingSources.map((src: any, si: number) => {
                      const ig = integrations.find((i: any) => i.id === src.integrationId)
                      return (
                        <div key={si} style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                          background: 'var(--surface2)', borderRadius: 7, marginBottom: 6, fontSize: 13,
                        }}>
                          <span style={{ flex: 1 }}>
                            {ig?.name ?? src.integrationId}
                            <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>{src.daysAhead}d ahead</span>
                          </span>
                          <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)' }}
                            onClick={async () => {
                              const cfg = (() => { try { return JSON.parse(p.config||'{}') } catch { return {} } })()
                              const newSources = existingSources.filter((_: any, idx: number) => idx !== si)
                              await panelsApi.update(p.id, { title: p.title, config: JSON.stringify({ ...cfg, sources: newSources }) })
                              await load()
                            }}>Remove</button>
                        </div>
                      )
                    })}
                    {calIntegrations.length > 0 ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 4 }}>
                        <AdminCalendarSourceAdder
                          panelId={p.id} panelTitle={p.title} panelConfig={p.config}
                          integrations={calIntegrations} onAdded={load}
                        />
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        No compatible integrations. Add Sonarr, Radarr, etc. in the Integrations tab first.
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Tag assignment */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', marginRight: 4 }}>Tags:</span>
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

              {/* Inline group access */}
              {groups.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', marginRight: 4 }}>Groups:</span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', marginRight: 4 }}>
                    {(panelGroups[p.id] || []).length === 0 ? '(all users)' : ''}
                  </span>
                  {groups.map(g => {
                    const assigned = (panelGroups[p.id] || []).includes(g.id)
                    return (
                      <button key={g.id} onClick={async () => {
                        const current = panelGroups[p.id] || []
                        const next = assigned ? current.filter((id: string) => id !== g.id) : [...current, g.id]
                        await panelsApi.setGroups(p.id, next)
                        setPanelGroups((prev: Record<string,string[]>) => ({ ...prev, [p.id]: next }))
                      }} style={{
                        padding: '2px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                        background: assigned ? 'var(--accent-bg)' : 'transparent',
                        color: assigned ? 'var(--accent2)' : 'var(--text-dim)',
                        border: `1px solid ${assigned ? '#7c6fff30' : 'var(--border)'}`,
                        transition: 'all 0.15s',
                      }}>{g.name}</button>
                    )
                  })}
                </div>
              )}
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

// ── Inline calendar source adder ─────────────────────────────────────────────

function AdminCalendarSourceAdder({ panelId, panelTitle, panelConfig, integrations, onAdded }: {
  panelId: string; panelTitle: string; panelConfig: string
  integrations: Integration[]; onAdded: () => void
}) {
  const [newIntId, setNewIntId] = useState('')
  const [newDays, setNewDays] = useState(14)
  const [adding, setAdding] = useState(false)

  const add = async () => {
    if (!newIntId) return
    setAdding(true)
    try {
      const cfg = (() => { try { return JSON.parse(panelConfig || '{}') } catch { return {} } })()
      const ig = integrations.find(i => i.id === newIntId)
      const sources = [...(cfg.sources || []), { type: ig?.type, integrationId: newIntId, daysAhead: newDays }]
      await panelsApi.update(panelId, { title: panelTitle, config: JSON.stringify({ ...cfg, sources }) })
      setNewIntId('')
      onAdded()
    } finally { setAdding(false) }
  }

  return (
    <>
      <div style={{ flex: 1 }}>
        <select className="input" value={newIntId} onChange={e => setNewIntId(e.target.value)} style={{ cursor: 'pointer' }}>
          <option value="">— Select integration —</option>
          {integrations.map(ig => <option key={ig.id} value={ig.id}>{ig.name} ({ig.type})</option>)}
        </select>
      </div>
      <div>
        <select className="input" value={newDays} onChange={e => setNewDays(Number(e.target.value))} style={{ cursor: 'pointer', width: 100 }}>
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
        </select>
      </div>
      <button className="btn btn-secondary" onClick={add} disabled={adding || !newIntId}>
        {adding ? <span className="spinner" /> : 'Add'}
      </button>
    </>
  )
}
