import { useEffect, useState } from 'react'
import { integrationsApi, secretsApi, groupsApi, Integration } from '../../api'

const INTEGRATION_TYPES = [
  { id: 'sonarr',  label: 'Sonarr',  desc: 'TV show management' },
  { id: 'radarr',  label: 'Radarr',  desc: 'Movie management' },
  { id: 'lidarr',  label: 'Lidarr',  desc: 'Music management' },
  { id: 'plex',    label: 'Plex',    desc: 'Media server' },
  { id: 'tautulli', label: 'Tautulli', desc: 'Plex analytics' },
  { id: 'truenas', label: 'TrueNAS', desc: 'NAS management' },
  { id: 'proxmox',  label: 'Proxmox',     desc: 'Hypervisor' },
  { id: 'kuma',     label: 'Uptime Kuma', desc: 'Status monitoring' },
  { id: 'gluetun',  label: 'Gluetun',    desc: 'VPN container' },
  { id: 'opnsense',     label: 'OPNsense',    desc: 'Firewall/router' },
  { id: 'transmission', label: 'Transmission', desc: 'BitTorrent client' },
  { id: 'photoprism',   label: 'PhotoPrism',   desc: 'Photo management' },
  { id: 'generic', label: 'Generic', desc: 'Other service' },
]

export default function IntegrationsPanel() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [secrets, setSecrets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [groups, setGroups] = useState<any[]>([])
  const [integrationGroups, setIntegrationGroups] = useState<Record<string, string[]>>({})
  const [search, setSearch] = useState('')

  // New form state
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('sonarr')
  const [newApiUrl, setNewApiUrl] = useState('')
  const [newUiUrl, setNewUiUrl] = useState('')
  const [newSecretId, setNewSecretId] = useState('')
  const [newSkipTls, setNewSkipTls] = useState(false)
  const [creating, setCreating] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const load = async () => {
    const [i, s, g] = await Promise.all([integrationsApi.list(), secretsApi.list(), groupsApi.list()])
    const list: Integration[] = i.data || []
    setIntegrations(list)
    setSecrets(s.data || [])
    setGroups(g.data || [])
    // Load group assignments for each integration
    const ig: Record<string, string[]> = {}
    // We'll load lazily when expanded to avoid N+1 on load
    setIntegrationGroups(ig)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const test = async () => {
    if (!newApiUrl) return
    setTesting(true); setTestResult(null)
    try {
      const res = await integrationsApi.test({
        type: newType,
        apiUrl: newApiUrl,
        secretId: newSecretId || undefined,
      })
      setTestResult(res.data)
    } catch {
      setTestResult({ ok: false, error: 'Request failed' })
    } finally { setTesting(false) }
  }

  const create = async () => {
    if (!newName || !newApiUrl) return
    setCreating(true)
    try {
      await integrationsApi.create({
        name: newName, type: newType,
        apiUrl: newApiUrl, uiUrl: newUiUrl,
        secretId: newSecretId || undefined, skipTls: newSkipTls,
      })
      setNewName(''); setNewApiUrl(''); setNewUiUrl('')
      setNewSecretId(''); setNewSkipTls(false); setTestResult(null); setShowForm(false)
      await load()
    } finally { setCreating(false) }
  }

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete integration "${name}"?`)) return
    await integrationsApi.delete(id); await load()
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter integrations..." style={{ fontSize: 13, flex: 1 }} />
        <button className="btn btn-primary" style={{ flexShrink: 0 }}
          onClick={() => { setShowForm(f => !f); setTestResult(null) }}>+ New integration</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20, padding: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label className="label">Name</label>
                <input className="input" value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. My Sonarr" autoFocus />
              </div>
              <div style={{ flex: 0.5 }}>
                <label className="label">Type</label>
                <select className="input" value={newType} onChange={e => setNewType(e.target.value)}
                  style={{ cursor: 'pointer' }}>
                  {INTEGRATION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="label">API URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(backend uses this)</span></label>
              <input className="input" value={newApiUrl} onChange={e => { setNewApiUrl(e.target.value); setTestResult(null) }}
                placeholder="http://truenas.local:8989" />
            </div>

            <div>
              <label className="label">UI URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(browser opens this)</span></label>
              <input className="input" value={newUiUrl} onChange={e => setNewUiUrl(e.target.value)}
                placeholder="https://sonarr.yourdomain.com (optional)" />
            </div>

            <div>
              <label className="label">API key secret</label>
              <select className="input" value={newSecretId} onChange={e => { setNewSecretId(e.target.value); setTestResult(null) }}
                style={{ cursor: 'pointer' }}>
                <option value="">— None / not required —</option>
                {secrets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Test result */}
            {testResult && (
              <div style={{
                padding: '8px 12px', borderRadius: 7, fontSize: 12,
                background: testResult.ok ? '#4ade8018' : '#f8717118',
                border: `1px solid ${testResult.ok ? '#4ade8040' : '#f8717140'}`,
                color: testResult.ok ? 'var(--green)' : 'var(--red)',
              }}>
                {testResult.ok ? '✓ Connection successful' : `✗ ${testResult.error}`}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={test} disabled={testing || !newApiUrl}>
                {testing ? <span className="spinner" /> : 'Test connection'}
              </button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', marginBottom: 8 }}>
                <input type="checkbox" checked={newSkipTls} onChange={e => setNewSkipTls(e.target.checked)} />
                Skip TLS verification
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>(for self-signed certs)</span>
              </label>
              <button className="btn btn-primary" onClick={create} disabled={creating || !newName || !newApiUrl}>
                {creating ? <span className="spinner" /> : 'Create'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setShowForm(false); setTestResult(null) }}>Cancel</button>
            </div>
          </div>
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
            onExpand={async () => {
              const next = expandedId === ig.id ? null : ig.id
              setExpandedId(next)
              if (next && integrationGroups[next] === undefined) {
                try {
                  const res = await integrationsApi.getGroups(next)
                  setIntegrationGroups(prev => ({ ...prev, [next]: res.data || [] }))
                } catch {
                  setIntegrationGroups(prev => ({ ...prev, [next]: [] }))
                }
              }
            }}
            onExpandAndEdit={async () => {
              setExpandedId(ig.id)
              if (integrationGroups[ig.id] === undefined) {
                try {
                  const res = await integrationsApi.getGroups(ig.id)
                  setIntegrationGroups(prev => ({ ...prev, [ig.id]: res.data || [] }))
                } catch {
                  setIntegrationGroups(prev => ({ ...prev, [ig.id]: [] }))
                }
              }
            }}

            onDelete={() => remove(ig.id, ig.name)}
            onUpdate={async (data) => { await integrationsApi.update(ig.id, data); await load() }}
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

function IntegrationRow({ integration: ig, secrets, groups, assignedGroups, onGroupsChange, expanded, onExpand, onExpandAndEdit, onDelete, onUpdate }: {
  integration: Integration; secrets: any[]
  groups: any[]; assignedGroups: string[]
  onGroupsChange: (groupIds: string[]) => void
  expanded: boolean; onExpand: () => void
  onExpandAndEdit: () => void
  onDelete: () => void; onUpdate: (data: any) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(ig.name)
  const [apiUrl, setApiUrl] = useState(ig.apiUrl)
  const [uiUrl, setUiUrl] = useState(ig.uiUrl)
  const [secretId, setSecretId] = useState(ig.secretId || '')
  const [skipTls, setSkipTls] = useState(ig.skipTls || false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    setName(ig.name); setApiUrl(ig.apiUrl)
    setUiUrl(ig.uiUrl); setSecretId(ig.secretId || '')
    setSkipTls(ig.skipTls || false)
    setTestResult(null)
  }, [ig])

  const typeDef = INTEGRATION_TYPES.find(t => t.id === ig.type)

  const test = async () => {
    setTesting(true); setTestResult(null)
    try {
      const res = await integrationsApi.test({ type: ig.type, apiUrl, secretId: secretId || undefined, skipTls })
      setTestResult(res.data)
    } catch { setTestResult({ ok: false, error: 'Request failed' }) }
    finally { setTesting(false) }
  }

  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${expanded ? 'var(--border2)' : 'var(--border)'}`,
      borderRadius: 10, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' }}
        onClick={onExpand}>
        <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'DM Mono, monospace' }}>
          {expanded ? '▼' : '▶'}
        </span>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{ig.name}</span>
          <span style={{
            marginLeft: 8, fontSize: 10, padding: '1px 6px', borderRadius: 4,
            background: 'var(--surface2)', color: 'var(--text-dim)', border: '1px solid var(--border)',
          }}>{typeDef?.label ?? ig.type}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>{ig.apiUrl}</span>
          {assignedGroups.length === 0
            ? <span style={{ fontSize: 10, color: 'var(--amber)', fontStyle: 'italic' }}>visible to all users</span>
            : <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{assignedGroups.length} group{assignedGroups.length !== 1 ? 's' : ''}</span>
          }
        </div>
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }}
            onClick={() => {
                      if (!expanded) { onExpandAndEdit(); setEditing(true) }
                      else setEditing(e => !e)
                    }}>Edit</button>
          <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--red)' }}
            onClick={onDelete}>Delete</button>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="label">Name</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div>
                <label className="label">API URL</label>
                <input className="input" value={apiUrl}
                  onChange={e => { setApiUrl(e.target.value); setTestResult(null) }} />
              </div>
              <div>
                <label className="label">UI URL</label>
                <input className="input" value={uiUrl} onChange={e => setUiUrl(e.target.value)} />
              </div>
              <div>
                <label className="label">API key secret</label>
                <select className="input" value={secretId}
                  onChange={e => { setSecretId(e.target.value); setTestResult(null) }}
                  style={{ cursor: 'pointer' }}>
                  <option value="">— None —</option>
                  {secrets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {testResult && (
                <div style={{
                  padding: '8px 12px', borderRadius: 7, fontSize: 12,
                  background: testResult.ok ? '#4ade8018' : '#f8717118',
                  border: `1px solid ${testResult.ok ? '#4ade8040' : '#f8717140'}`,
                  color: testResult.ok ? 'var(--green)' : 'var(--red)',
                }}>
                  {testResult.ok ? '✓ Connection successful' : `✗ ${testResult.error}`}
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={skipTls} onChange={e => setSkipTls(e.target.checked)} />
                Skip TLS verification
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>(for self-signed certs)</span>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={test} disabled={testing}>
                  {testing ? <span className="spinner" /> : 'Test'}
                </button>
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => {
                  onUpdate({ name, apiUrl, uiUrl, secretId: secretId || '', skipTls })
                  setEditing(false)
                }}>Save</button>
                <button className="btn btn-ghost" style={{ fontSize: 12 }}
                  onClick={() => { setEditing(false); setTestResult(null) }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>API URL</div>
                <div style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>{ig.apiUrl}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>UI URL</div>
                <div style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>{ig.uiUrl || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>API Key</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {ig.secretId ? '••••••••' : 'None'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>Type</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{typeDef?.desc ?? ig.type}</div>
              </div>
            </div>
          )}

          {/* Group access */}
          {groups.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
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
        </div>
      )}
    </div>
  )
}
