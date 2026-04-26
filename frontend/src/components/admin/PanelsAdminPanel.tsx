import { useEffect, useState } from 'react'
import { panelsApi, myPanelsApi, tagsApi, bookmarksApi, integrationsApi, groupsApi, Integration, Panel, Tag, BookmarkNode, googleApi } from '../../api'
import SectionHelp from './SectionHelp'

function IfaceCapEditorWithSave({ initialCaps, onSave }: {
  initialCaps: Record<string,number>
  onSave: (caps: Record<string,number>) => void
}) {
  const [pairs, setPairs] = useState<{dev:string;cap:number}[]>(() =>
    Object.entries(initialCaps).map(([dev, cap]) => ({ dev, cap })))
  const [saving, setSaving] = useState(false)
  const sync = (next: {dev:string;cap:number}[]) => setPairs(next)
  const save = async () => {
    setSaving(true)
    const obj: Record<string,number> = {}
    for (const { dev, cap } of pairs) { if (dev) obj[dev] = cap }
    await onSave(obj)
    setSaving(false)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
      <label className="label">Bandwidth cap per interface</label>
      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
        Device name (e.g. <code>wan</code>, <code>lan</code>) and cap in Mbps. Scales the arc gauges.
      </div>
      {pairs.map((row, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="input" value={row.dev} style={{ fontSize: 12, width: 80 }}
            onChange={e => sync(pairs.map((r,i) => i===idx ? {...r,dev:e.target.value} : r))} />
          <input type="number" className="input" value={row.cap} style={{ fontSize: 12, width: 80 }}
            onChange={e => sync(pairs.map((r,i) => i===idx ? {...r,cap:Number(e.target.value)} : r))} />
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Mbps</span>
          <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)' }}
            onClick={() => sync(pairs.filter((_,i) => i !== idx))}>✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-ghost" style={{ fontSize: 12 }}
          onClick={() => sync([...pairs, { dev: '', cap: 1000 }])}>
          + Add interface
        </button>
        <button className="btn btn-primary" style={{ fontSize: 12 }}
          onClick={save} disabled={saving}>
          {saving ? <span className="spinner" /> : 'Save caps'}
        </button>
      </div>
    </div>
  )
}

// Panel types that require a matching integration to be configured
const PANEL_NEEDS_INTEGRATION: Record<string, string> = {
  authentik: 'authentik', gluetun: 'gluetun', lidarr: 'lidarr',
  opnsense: 'opnsense', photoprism: 'photoprism', plex: 'plex',
  proxmox: 'proxmox', radarr: 'radarr', sonarr: 'sonarr',
  tautulli: 'tautulli', transmission: 'transmission', truenas: 'truenas',
  kuma: 'kuma',
  // customapi: no integration needed (self-contained)
  // bookmarks, calendar: no integration needed
}

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
  const [editingCustomAPI, setEditingCustomAPI] = useState<{id: string; url: string; apiKey: string; mappings: string; refreshSecs: number} | null>(null)
  const [customAPIPreview, setCustomAPIPreview] = useState<{loading: boolean; json: string; error: string} | null>(null)
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
    // Load group assignments for all shared panels in parallel
    const sharedPanels = (p.data || []).filter((panel: any) => panel.scope === 'shared')
    const groupResults = await Promise.all(
      sharedPanels.map((panel: any) => panelsApi.getGroups(panel.id).then(r => ({ id: panel.id, groups: r.data || [] })))
    )
    const pg: Record<string,string[]> = {}
    groupResults.forEach(({ id, groups }) => { pg[id] = groups })
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
      <SectionHelp storageKey="panels" title="About panels">
        Panels are the widgets on your dashboard — Sonarr queues, server stats, bookmarks, media info, and more.
        System panels created here are shared with groups, making them visible to all group members.
        Each panel connects to an integration for its data, and can have tags assigned for filtering.
        Users can also add personal panels from their profile for content only they need to see.
      </SectionHelp>
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
              {(() => {
                const PANEL_LABELS: Record<string,string> = {
                  authentik:'Authentik', bookmarks:'Bookmarks', calendar:'Calendar', checklist:'Checklist',
                  customapi:'Custom API', gluetun:'Gluetun', iframe:'Web Embed',
                  kuma:'Uptime Kuma', lidarr:'Lidarr', opnsense:'OPNsense',
                  photoprism:'PhotoPrism', plex:'Plex', proxmox:'Proxmox',
                  radarr:'Radarr', sonarr:'Sonarr', tautulli:'Tautulli',
                  custom:'Text/HTML', transmission:'Transmission', truenas:'TrueNAS',
                }
                return (
                  <select className="input" value={newType} onChange={e => setNewType(e.target.value)} style={{ cursor: 'pointer' }}>
                    {Object.entries(PANEL_LABELS).map(([type, label]) => {
                      const needed = PANEL_NEEDS_INTEGRATION[type]
                      const hasInt = !needed || integrations.some(i => i.type === type)
                      return <option key={type} value={type}>{label}{!hasInt ? ' ⚠' : ''}</option>
                    })}
                  </select>
                )
              })()}
            </div>
            {(() => {
              const needed = PANEL_NEEDS_INTEGRATION[newType]
              if (!needed) return null
              const hasInt = integrations.some(i => i.type === newType)
              if (hasInt) return null
              return (
                <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4 }}>
                  ⚠ No {newType} integration configured.{' '}
                  <a href="/admin/integrations" style={{ color: 'var(--accent2)' }}>Add one →</a>
                </div>
              )
            })()}
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

                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                            One per line: <code>path | Label</code> or <code>path | Label | format</code> — formats: <code>integer</code>, <code>currency</code>, <code>text</code>
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
                          <button className="btn btn-secondary" style={{ fontSize: 12 }}
                            disabled={customAPIPreview?.loading}
                            onClick={async () => {
                              if (!editingCustomAPI.url) return
                              setCustomAPIPreview({ loading: true, json: '', error: '' })
                              try {
                                // Use preview endpoint with current (possibly unsaved) URL
                                const res = await fetch('/api/customapi/preview', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${localStorage.getItem('stoa_token')}` },
                                  body: JSON.stringify({ url: editingCustomAPI.url, apiKey: editingCustomAPI.apiKey })
                                })
                                if (!res.ok) {
                                  const err = await res.json().catch(() => ({}))
                                  throw new Error(err.error || `HTTP ${res.status}`)
                                }
                                const raw = await res.json()
                                setCustomAPIPreview({ loading: false, json: JSON.stringify(raw, null, 2), error: '' })
                              } catch (e: any) {
                                setCustomAPIPreview({ loading: false, json: '', error: e.message || 'Fetch failed' })
                              }
                            }}>
                            {customAPIPreview?.loading ? <span className="spinner" /> : 'Test & Preview'}
                          </button>
                          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={async () => {
                            const cfg = safeParseConfig(p.config)
                            cfg.url = editingCustomAPI.url
                            cfg.apiKey = editingCustomAPI.apiKey
                            cfg.refreshSecs = editingCustomAPI.refreshSecs
                            cfg.mappings = editingCustomAPI.mappings.split('\n')
                              .map((line: string) => line.trim())
                              .filter((line: string) => line.includes('|'))
                              .map((line: string) => {
                                const parts = line.split('|').map((s: string) => s.trim())
                                return { path: parts[0], label: parts[1] || '', format: parts[2] || '' }
                              })
                            await panelsApi.update(p.id, { title: p.title, config: JSON.stringify(cfg) })
                            setEditingCustomAPI(null); setCustomAPIPreview(null); load()
                          }}>Save</button>
                          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => { setEditingCustomAPI(null); setCustomAPIPreview(null) }}>Cancel</button>
                        </div>
                        {customAPIPreview && !customAPIPreview.loading && (
                          <div style={{ marginTop: 4 }}>
                            {customAPIPreview.error
                              ? <div style={{ fontSize: 12, color: 'var(--red)' }}>{customAPIPreview.error}</div>
                              : <>
                                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
                                    Raw response — copy field paths for use in mappings (e.g. <code>data.temperature | Temp</code>)
                                  </div>
                                  <textarea readOnly value={customAPIPreview.json}
                                    style={{ width: '100%', minHeight: 160, fontSize: 11,
                                      fontFamily: 'DM Mono, monospace', background: 'var(--surface)',
                                      border: '1px solid var(--border)', borderRadius: 6,
                                      padding: 8, color: 'var(--text-muted)', resize: 'vertical',
                                      boxSizing: 'border-box' }} />
                                </>
                            }
                          </div>
                        )}
                      </div>
                    ) : (
                      <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => {
                        const cfg = safeParseConfig(p.config)
                        const mappings = (cfg.mappings || []).map((m: any) => m.format ? `${m.path} | ${m.label} | ${m.format}` : `${m.path} | ${m.label}`).join('\n')
                        setCustomAPIPreview(null)
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
                            {src.type === 'weather'
                              ? <>🌤 {src.city} <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>°{(src.unit || 'f').toUpperCase()}</span></>
                              : src.type === 'google'
                                ? <>📅 {src.label || src.integrationId}</>
                                : src.type === 'checklist'
                                  ? <>☑ {src.label || 'Checklist'}</>
                                  : <>{ig?.name ?? src.integrationId}
                                      {src.daysAhead && <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>{src.daysAhead}d ahead</span>}
                                    </>
                            }
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
                    <UnifiedCalendarSourceAdder
                        panelId={p.id} panelTitle={p.title} panelConfig={p.config}
                        integrations={calIntegrations} onAdded={load}
                        isSystem={true}
                      />
                  </div>
                )
              })()}

              {p.type === 'opnsense' && (() => {
                const cfg = safeParseConfig(p.config)
                return (
                  <IfaceCapEditorWithSave initialCaps={cfg.ifaceCaps || {}} onSave={async caps => {
                    cfg.ifaceCaps = caps
                    delete cfg.maxMbps
                    await panelsApi.update(p.id, { title: p.title, config: JSON.stringify(cfg) })
                    load()
                  }} />
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

// ── Weather source adder ─────────────────────────────────────────────────────
function UnifiedCalendarSourceAdder({ panelId, panelTitle, panelConfig, integrations, onAdded, isSystem }: {
  panelId: string; panelTitle: string; panelConfig: string
  integrations: Integration[]; onAdded: () => void; isSystem?: boolean
}) {
  const [sourceKind, setSourceKind] = useState<'integration'|'google'|'weather'|'checklist'>('integration')
  const [intId, setIntId] = useState('')
  const [googleTokenId, setGoogleTokenId] = useState('')
  const [googleCalendarId, setGoogleCalendarId] = useState('primary')
  const [googleCalendars, setGoogleCalendars] = useState<any[]>([])
  const [googleTokens, setGoogleTokens] = useState<any[]>([])
  const [city, setCity] = useState('')
  const [unit, setUnit] = useState<'f'|'c'>('f')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [adding, setAdding] = useState(false)
  const [checklistPanels, setChecklistPanels] = useState<Panel[]>([])
  const [checklistPanelId, setChecklistPanelId] = useState('')

  useEffect(() => {
    googleApi.getConfig().then(res => {
      if (res.data.configured) {
        const scope = isSystem ? 'system' : 'personal'
        googleApi.listTokens(scope).then(r => setGoogleTokens(r.data || []))
      }
    })
    // Load checklist panels — system scope only
    panelsApi.list(undefined, 'system').then(r =>
      setChecklistPanels((r.data || []).filter((p: any) => p.type === 'checklist'))
    ).catch(() => {})
  }, [isSystem])

  useEffect(() => {
    if (googleTokenId) {
      googleApi.listCalendars(googleTokenId).then(r => {
        setGoogleCalendars(r.data || [])
        setGoogleCalendarId('primary')
      })
    }
  }, [googleTokenId])

  const search = async () => {
    if (!city.trim()) return
    setSearching(true); setSearchResults([])
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en&format=json`)
      const data = await res.json()
      setSearchResults(data.results || [])
    } catch { setSearchResults([]) }
    finally { setSearching(false) }
  }

  const add = async (weatherResult?: any) => {
    setAdding(true)
    try {
      const cfg = (() => { try { return JSON.parse(panelConfig || '{}') } catch { return {} } })()
      let newSource: any
      if (sourceKind === 'weather' && weatherResult) {
        const label = `${weatherResult.name}, ${weatherResult.admin1 || weatherResult.country}`
        newSource = { type: 'weather', lat: String(weatherResult.latitude), lon: String(weatherResult.longitude), city: label, unit }
      } else if (sourceKind === 'google') {
        if (!googleTokenId) return
        const tok = googleTokens.find((t: any) => t.id === googleTokenId)
        newSource = { type: 'google', integrationId: googleTokenId, calendarId: googleCalendarId, daysAhead: 14, label: tok?.email || googleTokenId }
      } else if (sourceKind === 'checklist') {
        if (!checklistPanelId) return
        const cl = checklistPanels.find((p: any) => p.id === checklistPanelId)
        newSource = { type: 'checklist', panelId: checklistPanelId, label: cl?.title || 'Checklist' }
      } else {
        if (!intId) return
        const ig = integrations.find((i: any) => i.id === intId)
        newSource = { type: ig?.type, integrationId: intId, daysAhead: 14 }
      }
      const sources = [...(cfg.sources || []), newSource]
      const updater = isSystem ? panelsApi : myPanelsApi
      await updater.update(panelId, { title: panelTitle, config: JSON.stringify({ ...cfg, sources }) })
      setIntId(''); setGoogleTokenId(''); setCity(''); setSearchResults([]); setChecklistPanelId('')
      onAdded()
    } finally { setAdding(false) }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <select className="input" value={sourceKind}
          onChange={e => { setSourceKind(e.target.value as any); setIntId(''); setGoogleTokenId(''); setCity(''); setSearchResults([]); setChecklistPanelId('') }}
          style={{ cursor: 'pointer', width: 160, fontSize: 12 }}>
          <option value="integration">Stoa integration</option>
          {googleTokens.length > 0 && <option value="google">Google Calendar</option>}
          <option value="weather">Weather</option>
          {checklistPanels.length > 0 && <option value="checklist">Checklist</option>}
        </select>

        {sourceKind === 'integration' && (
          <>
            <select className="input" value={intId} onChange={e => setIntId(e.target.value)}
              style={{ cursor: 'pointer', flex: 1, fontSize: 12 }}>
              <option value="">— Select integration —</option>
              {integrations.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <button className="btn btn-secondary" style={{ fontSize: 12 }}
              onClick={() => add()} disabled={adding || !intId}>
              {adding ? <span className="spinner" /> : 'Add'}
            </button>
          </>
        )}

        {sourceKind === 'checklist' && (
          <>
            <select className="input" value={checklistPanelId} onChange={e => setChecklistPanelId(e.target.value)}
              style={{ cursor: 'pointer', flex: 1, fontSize: 12 }}>
              <option value="">— Select checklist panel —</option>
              {checklistPanels.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <button className="btn btn-secondary" style={{ fontSize: 12 }}
              onClick={() => add()} disabled={adding || !checklistPanelId}>
              {adding ? <span className="spinner" /> : 'Add'}
            </button>
          </>
        )}

        {sourceKind === 'google' && (
          <>
            <select className="input" value={googleTokenId} onChange={e => setGoogleTokenId(e.target.value)}
              style={{ cursor: 'pointer', flex: 1, fontSize: 12 }}>
              <option value="">— Select account —</option>
              {googleTokens.map(t => <option key={t.id} value={t.id}>{t.email}</option>)}
            </select>
            {googleCalendars.length > 0 && (
              <select className="input" value={googleCalendarId} onChange={e => setGoogleCalendarId(e.target.value)}
                style={{ cursor: 'pointer', flex: 1, fontSize: 12 }}>
                {googleCalendars.map((c: any) => <option key={c.id} value={c.id}>{c.summary}</option>)}
              </select>
            )}
            <button className="btn btn-secondary" style={{ fontSize: 12 }}
              onClick={() => add()} disabled={adding || !googleTokenId}>
              {adding ? <span className="spinner" /> : 'Add'}
            </button>
          </>
        )}

        {sourceKind === 'weather' && (
          <>
            <input className="input" value={city} onChange={e => setCity(e.target.value)}
              placeholder="City name..." style={{ flex: 1, fontSize: 12 }}
              onKeyDown={e => e.key === 'Enter' && search()} />
            <select className="input" value={unit} onChange={e => setUnit(e.target.value as 'f'|'c')}
              style={{ width: 65, fontSize: 12, cursor: 'pointer' }}>
              <option value="f">°F</option>
              <option value="c">°C</option>
            </select>
            <button className="btn btn-secondary" style={{ fontSize: 12 }}
              onClick={search} disabled={searching || !city.trim()}>
              {searching ? <span className="spinner" /> : 'Search'}
            </button>
          </>
        )}
      </div>

      {sourceKind === 'weather' && searchResults.length > 0 && (
        <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {searchResults.map((r: any, i: number) => (
            <button key={i} onClick={() => add(r)} disabled={adding}
              style={{ width: '100%', padding: '8px 12px', background: 'var(--surface2)',
                border: 'none', borderBottom: i < searchResults.length-1 ? '1px solid var(--border)' : 'none',
                textAlign: 'left', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
              {r.name}, {r.admin1 || ''} <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{r.country}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


