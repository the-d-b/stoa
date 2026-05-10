import { useEffect, useState } from 'react'
import { panelsApi, tagsApi, bookmarksApi, integrationsApi, groupsApi, Integration, Panel, Tag, BookmarkNode } from '../../api'
import PanelForm, { PANEL_TYPES } from './PanelForm'
import SectionHelp from './SectionHelp'







interface FlatNode {
  node: BookmarkNode
  depth: number
  label: string
}


function flattenTree(nodes: BookmarkNode[], depth = 0, prefix = ''): FlatNode[] {
  const result: FlatNode[] = []
  for (const node of nodes) {
    const label = prefix ? `${prefix} / ${node.name}` : node.name
    result.push({ node, depth, label })
    if (node.children?.length) {
      result.push(...flattenTree(node.children, depth + 1, label))
    }
  }
  return result
}


export default function PanelsAdminPanel() {
  const [panels, setPanels] = useState<Panel[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [bookmarkRoots, setBookmarkRoots] = useState<BookmarkNode[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const [expandedPanelId, setExpandedPanelId] = useState<string | null>(null)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [panelGroups, setPanelGroups] = useState<Record<string,string[]>>({})

  const refreshBookmarkTree = async () => {
    setLoading(true)
    const b = await bookmarksApi.tree()
    setBookmarkRoots(b.data || [])
    setLoading(false)
  }

  const load = async () => {
    // Admin panel only shows shared panels - personal panels managed in profile
    // Always reload bookmark tree to pick up renames
    const [p, t, b, ig, g] = await Promise.all([panelsApi.list(undefined, 'system'), tagsApi.list(), bookmarksApi.tree(), integrationsApi.list(), groupsApi.list()])
    // System panels only use SYSTEM-owned integrations
    setIntegrations((ig.data || []).filter((i: any) => i.createdBy === 'SYSTEM'))
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



  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

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
          <PanelForm
            scope="system"
            integrations={integrations}
            tags={tags}
            bookmarkRoots={flatNodes.map(({node, label}) => ({ id: node.id, label }))}
            onSaved={async () => { setShowForm(false); await load() }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter panels..." style={{ fontSize: 13 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {panels.filter(p => !search || p.title.toLowerCase().includes(search.toLowerCase())).map(p => {
          const expanded = expandedPanelId === p.id

          return (
            <div key={p.id} className="card-sm" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {/* Collapsed header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                cursor: 'pointer' }}
                onClick={() => setExpandedPanelId(expanded ? null : p.id)}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{expanded ? '▼' : '▶'}</span>
                <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4,
                  background: 'var(--surface2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
                  {PANEL_TYPES.find(t => t.id === p.type)?.label ?? p.type}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{p.title}</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
                  {(() => { try { return `${JSON.parse(p.config||'{}').height||2}x` } catch { return '2x' } })()}
                </span>
              </div>

              {/* Expanded edit form */}
              {expanded && (
                <div style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
                  <PanelForm
                    scope="system"
                    panel={p}
                    integrations={integrations}
                    tags={tags}
                    bookmarkRoots={flatNodes.map(({node, label}) => ({ id: node.id, label }))}
                    onSaved={async () => { setExpandedPanelId(null); await load() }}
                    onCancel={() => setExpandedPanelId(null)}
                    onDeleted={async () => { setExpandedPanelId(null); await load() }}
                  />
                </div>
              )}

              {/* Group assignment — always visible below header */}
              {groups.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
                  padding: '6px 14px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', marginRight: 2 }}>Groups:</span>
                  {(panelGroups[p.id] || []).length === 0 && (
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>(all users)</span>
                  )}
                  {groups.map((g: any) => {
                    const assigned = (panelGroups[p.id] || []).includes(g.id)
                    return (
                      <button key={g.id} onClick={async (e) => {
                        e.stopPropagation()
                        const current = panelGroups[p.id] || []
                        const next = assigned ? current.filter((id: string) => id !== g.id) : [...current, g.id]
                        await panelsApi.setGroups(p.id, next)
                        setPanelGroups((prev: Record<string,string[]>) => ({ ...prev, [p.id]: next }))
                      }} style={{
                        padding: '2px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                        background: assigned ? 'var(--accent-bg)' : 'transparent',
                        color: assigned ? 'var(--accent2)' : 'var(--text-dim)',
                        border: `1px solid ${assigned ? '#7c6fff30' : 'var(--border)'}`,
                      }}>{g.name}</button>
                    )
                  })}
                </div>
              )}
            </div>
          )

        })}
      </div>
    </div>
  )
}
