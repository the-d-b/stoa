import { useEffect, useState } from 'react'
import { integrationsApi, secretsApi, groupsApi, Integration } from '../../api'
import IntegrationForm, { INTEGRATION_TYPES } from './IntegrationForm'
import SectionHelp from './SectionHelp'


export default function IntegrationsPanel() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [secrets, setSecrets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [groups, setGroups] = useState<any[]>([])
  const [integrationGroups, setIntegrationGroups] = useState<Record<string, string[]>>({})
  const [search, setSearch] = useState('')



  const load = async () => {
    const [i, s, g] = await Promise.all([integrationsApi.list(), secretsApi.list(), groupsApi.list()])
    // System settings only shows SYSTEM-owned integrations
    // Admins' personal integrations belong in Profile > My Integrations
    const list: Integration[] = (i.data || []).filter((ig: any) => ig.createdBy === 'SYSTEM')
    setIntegrations(list)
    setSecrets(s.data || [])
    setGroups(g.data || [])
    // Load all group assignments in parallel so display is correct on first render
    const groupResults = await Promise.all(
      list.map(item => integrationsApi.getGroups(item.id)
        .then(r => ({ id: item.id, groups: r.data || [] }))
        .catch(() => ({ id: item.id, groups: [] }))
      )
    )
    const ig: Record<string, string[]> = {}
    groupResults.forEach(({ id, groups }) => { ig[id] = groups })
    setIntegrationGroups(ig)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete integration "${name}"?`)) return
    await integrationsApi.delete(id); await load()
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  return (
    <div>
      <SectionHelp storageKey="integrations" title="About integrations">
        Integrations connect Stoa to your services — Sonarr, Proxmox, TrueNAS, OPNsense, and more.
        Each panel needs an integration to pull its data from. System integrations are created here by
        admins and can be shared across multiple panels and groups. Users can also create personal
        integrations from their profile for services only they use.
      </SectionHelp>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter integrations..." style={{ fontSize: 13, flex: 1 }} />
        <button className="btn btn-primary" style={{ flexShrink: 0 }}
          onClick={() => setShowForm(f => !f)}>+ New integration</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20, padding: 20 }}>
          <IntegrationForm
            scope="system"
            secrets={secrets}
            onSaved={async () => { setShowForm(false); await load() }}
            onCancel={() => setShowForm(false)}
            onSecretsChanged={setSecrets}
          />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {integrations.filter(ig => !search || ig.name.toLowerCase().includes(search.toLowerCase())).map(ig => (
          <IntegrationRow key={ig.id} integration={ig} secrets={secrets}
            groups={groups}
            assignedGroups={integrationGroups[ig.id] || []}
            onGroupsChange={async (groupIds) => {
              await integrationsApi.setGroups(ig.id, groupIds)
              setIntegrationGroups(prev => ({ ...prev, [ig.id]: groupIds }))
            }}
            expanded={expandedId === ig.id}
            onExpand={() => setExpandedId(expandedId === ig.id ? null : ig.id)}
            onDelete={() => remove(ig.id, ig.name)}
            onUpdate={load}
          />
        ))}
        {integrations.length === 0 && !showForm && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '24px 0' }}>
            No integrations yet. Add one to connect Sonarr, Radarr, Plex, or other services.
          </div>
        )}
      </div>
    </div>
  )
}

function IntegrationRow({ integration: ig, secrets, groups, assignedGroups, onGroupsChange,
  expanded, onExpand, onDelete, onUpdate }: {
  integration: Integration; secrets: any[]
  groups: any[]; assignedGroups: string[]
  onGroupsChange: (groupIds: string[]) => void
  expanded: boolean; onExpand: () => void
  onDelete: () => void; onUpdate: () => void
}) {
  const [editing, setEditing] = useState(false)
  const typeDef = INTEGRATION_TYPES.find(t => t.id === ig.type)

  const apiUrlSummary = (() => {
    if (ig.type === 'stocks') {
      try { const s = JSON.parse(ig.apiUrl || '{}').symbols || []; return `${s.length} symbol${s.length !== 1 ? 's' : ''}` } catch { return '' }
    }
    if (ig.type === 'crypto') {
      try { const c = JSON.parse(ig.apiUrl || '{}').coins || []; return `${c.length} coin${c.length !== 1 ? 's' : ''}` } catch { return '' }
    }
    if (ig.type === 'sports') {
      try {
        const cfg = JSON.parse(ig.apiUrl || '{}')
        const leagues: string[] = cfg.leagues || []
        const teams: string[] = cfg.teams || []
        const parts = [leagues.map((l: string) => l.toUpperCase()).join(', ')]
        if (teams.length) parts.push(`${teams.length} team${teams.length !== 1 ? 's' : ''}`)
        return parts.filter(Boolean).join(' · ') || ig.apiUrl
      } catch { return ig.apiUrl }
    }
    return ig.apiUrl
  })()

  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${expanded ? 'var(--border2)' : 'var(--border)'}`,
      borderRadius: 10, overflow: 'hidden',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' }}
        onClick={() => { onExpand(); if (!expanded) setEditing(false) }}>
        <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'DM Mono, monospace' }}>
          {expanded ? '▼' : '▶'}
        </span>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{ig.name}</span>
          <span style={{ marginLeft: 8, fontSize: 10, padding: '1px 6px', borderRadius: 4,
            background: 'var(--surface2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
            {typeDef?.label ?? ig.type}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace',
            maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apiUrlSummary}</span>
          {assignedGroups.length === 0
            ? <span style={{ fontSize: 10, color: 'var(--amber)', fontStyle: 'italic' }}>visible to all users</span>
            : <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{assignedGroups.length} group{assignedGroups.length !== 1 ? 's' : ''}</span>
          }
        </div>
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }}
            onClick={() => { if (!expanded) onExpand(); setEditing(e => !e) }}>
            {editing ? 'View' : 'Edit'}
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--red)' }}
            onClick={onDelete}>Delete</button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
          {editing ? (
            <IntegrationForm
              scope="system"
              integration={ig}
              secrets={secrets}
              onSaved={() => { setEditing(false); onUpdate() }}
              onCancel={() => setEditing(false)}
              onSecretsChanged={() => {}}
            >
              {/* Group access slot */}
              {groups.length > 0 && (
                <div style={{ paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                  <div className="section-title" style={{ marginBottom: 8 }}>
                    Group access
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 8 }}>
                      (no groups = visible to all users)
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {groups.map(g => {
                      const assigned = assignedGroups.includes(g.id)
                      return (
                        <button key={g.id} onClick={() => {
                          const next = assigned
                            ? assignedGroups.filter(id => id !== g.id)
                            : [...assignedGroups, g.id]
                          onGroupsChange(next)
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
            </IntegrationForm>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>
                  {['stocks','crypto','sports'].includes(ig.type) ? 'Config' : 'API URL'}
                </div>
                <div style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)',
                  overflowWrap: 'break-word', wordBreak: 'break-all' }}>
                  {['stocks','crypto','sports'].includes(ig.type) ? apiUrlSummary : ig.apiUrl}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>UI URL</div>
                <div style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>{ig.uiUrl || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>API Key</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ig.secretId ? '••••••••' : 'None'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>Type</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{typeDef?.desc ?? ig.type}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
