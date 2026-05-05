import { useEffect, useState } from 'react'
import { integrationsApi, secretsApi, groupsApi, weatherApi, steamApi, Integration } from '../../api'
import SectionHelp from './SectionHelp'

const INTEGRATION_TYPES = [
  { id: 'authentik',    label: 'Authentik',    desc: 'Identity provider' },
  { id: 'gluetun',      label: 'Gluetun',      desc: 'VPN container' },
  { id: 'kuma',         label: 'Uptime Kuma',  desc: 'Status monitoring' },
  { id: 'lidarr',       label: 'Lidarr',       desc: 'Music management' },
  { id: 'opnsense',     label: 'OPNsense',     desc: 'Firewall/router' },
  { id: 'photoprism',   label: 'PhotoPrism',   desc: 'Photo management' },
  { id: 'plex',         label: 'Plex',         desc: 'Media server' },
  { id: 'proxmox',      label: 'Proxmox',      desc: 'Hypervisor' },
  { id: 'radarr',       label: 'Radarr',       desc: 'Movie management' },
  { id: 'rss',          label: 'RSS Feed',     desc: 'RSS or Atom feed reader' },
  { id: 'readarr',      label: 'Readarr',      desc: 'Book & audiobook management' },
  { id: 'sonarr',       label: 'Sonarr',       desc: 'TV show management' },
  { id: 'tautulli',     label: 'Tautulli',     desc: 'Plex analytics' },
  { id: 'transmission', label: 'Transmission', desc: 'BitTorrent client' },
  { id: 'truenas',      label: 'TrueNAS',      desc: 'NAS management' },
  { id: 'weather',      label: 'Weather',      desc: 'Current conditions & forecast (Open-Meteo, no key required)' },
  { id: 'steam',        label: 'Steam',        desc: 'Steam library, activity & store' },
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
  const [newRefreshSecs, setNewRefreshSecs] = useState(60)
  const [showNewSecret, setShowNewSecret] = useState(false)
  const [newSecretNameField, setNewSecretNameField] = useState('')
  const [newSecretValueField, setNewSecretValueField] = useState('')
  const [savingNewSecret, setSavingNewSecret] = useState(false)

  const createNewSecret = async () => {
    if (!newSecretNameField.trim() || !newSecretValueField.trim()) return
    setSavingNewSecret(true)
    try {
      const res = await secretsApi.create({ name: newSecretNameField.trim(), value: newSecretValueField.trim(), scope: 'shared' })
      const newSec = { id: res.data.id, name: newSecretNameField.trim() }
      setSecrets(prev => [...prev, newSec])
      setNewSecretId(newSec.id)
      setNewSecretNameField(''); setNewSecretValueField(''); setShowNewSecret(false)
    } finally { setSavingNewSecret(false) }
  }
  const [creating, setCreating] = useState(false)
  // Weather geocoder state
  const [geoQuery, setGeoQuery] = useState('')
  const [geoResults, setGeoResults] = useState<any[]>([])
  const [geoSearching, setGeoSearching] = useState(false)
  // Steam vanity resolver state
  const [steamVanity, setSteamVanity] = useState('')
  const [steamResolving, setSteamResolving] = useState(false)
  const searchGeo = async () => {
    if (!geoQuery.trim()) return
    setGeoSearching(true)
    try {
      const r = await weatherApi.geocode(geoQuery)
      setGeoResults(r.data || [])
    } finally { setGeoSearching(false) }
  }

  const selectGeoResult = (r: any) => {
    const city = [r.name, r.admin1, r.country].filter(Boolean).join(', ')
    setNewApiUrl(`${r.latitude},${r.longitude},${city},f`)
    setGeoResults([]); setGeoQuery('')
  }

  const resolveVanity = async () => {
    if (!steamVanity.trim() || !newSecretId) return
    setSteamResolving(true)
    try {
      const sec = secrets.find((s: any) => s.id === newSecretId)
      if (!sec) { alert('Select API key first'); return }
      const r = await steamApi.resolveVanity(steamVanity, sec.value || newSecretId)
      setNewApiUrl(r.data.steamId)
      setSteamVanity('')
    } catch { alert('Could not resolve vanity URL — check API key and username') }
    finally { setSteamResolving(false) }
  }

  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; tlsError?: boolean; skipTlsWorks?: boolean } | null>(null)
  const [testing, setTesting] = useState(false)

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

  const test = async () => {
    if (!newApiUrl) return
    setTesting(true); setTestResult(null)
    try {
      const res = await integrationsApi.test({
        type: newType,
        apiUrl: newApiUrl,
        secretId: newSecretId || undefined,
        skipTls: newSkipTls,
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
        secretId: newSecretId || undefined, skipTls: newSkipTls, refreshSecs: newRefreshSecs,
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
          onClick={() => { setShowForm(f => !f); setTestResult(null) }}>+ New integration</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20, padding: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1.5 }}>
                <label className="label">Name</label>
                <input className="input" value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. My Sonarr" autoFocus />
              </div>
              <div style={{ flex: 0.7 }}>
                <label className="label">Type</label>
                <select className="input" value={newType} onChange={e => setNewType(e.target.value)}
                  style={{ cursor: 'pointer' }}>
                  {INTEGRATION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="label">API key secret</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select className="input" value={newSecretId} onChange={e => { setNewSecretId(e.target.value); setTestResult(null) }}
                    style={{ cursor: 'pointer', flex: 1 }}>
                    <option value="">— None —</option>
                    {secrets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button className="btn btn-ghost" style={{ fontSize: 12, flexShrink: 0 }}
                    onClick={() => setShowNewSecret(v => !v)}>
                    {showNewSecret ? 'Cancel' : '+ New'}
                  </button>
                </div>
                {showNewSecret && (
                  <div style={{ marginTop: 6, padding: '10px 12px', borderRadius: 8,
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                    display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <label className="label">Name</label>
                        <input className="input" value={newSecretNameField}
                          onChange={e => setNewSecretNameField(e.target.value)}
                          placeholder="e.g. Sonarr API Key" autoFocus />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="label">Value</label>
                        <input className="input" type="password" value={newSecretValueField}
                          onChange={e => setNewSecretValueField(e.target.value)}
                          placeholder="Paste key here" />
                      </div>
                    </div>
                    <button className="btn btn-primary" style={{ fontSize: 12, alignSelf: 'flex-start' }}
                      disabled={savingNewSecret || !newSecretNameField || !newSecretValueField}
                      onClick={createNewSecret}>
                      {savingNewSecret ? <span className="spinner" /> : 'Save & select'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Weather — geocoder UI instead of raw API URL */}
            {newType === 'weather' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label className="label">Location</label>
                {newApiUrl && (
                  <div style={{ fontSize: 12, color: 'var(--accent2)' }}>
                    📍 {newApiUrl.split(',').slice(2).join(',') || newApiUrl}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="input" value={geoQuery}
                    onChange={e => setGeoQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchGeo()}
                    placeholder="Search city or region..." style={{ flex: 1 }} />
                  <button className="btn btn-ghost" style={{ fontSize: 12 }}
                    onClick={searchGeo} disabled={geoSearching}>
                    {geoSearching ? '...' : 'Search'}
                  </button>
                </div>
                {geoResults.length > 0 && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                    {geoResults.map((r, i) => (
                      <button key={i} onClick={() => selectGeoResult(r)}
                        style={{ display: 'block', width: '100%', textAlign: 'left',
                          padding: '7px 12px', fontSize: 12, background: 'none',
                          border: 'none', borderBottom: i < geoResults.length-1 ? '1px solid var(--border)' : 'none',
                          cursor: 'pointer', color: 'var(--text)' }}>
                        {[r.name, r.admin1, r.country].filter(Boolean).join(', ')}
                        <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 8 }}>
                          {r.latitude.toFixed(3)}, {r.longitude.toFixed(3)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label className="label" style={{ marginBottom: 0 }}>Unit:</label>
                  <select className="input" style={{ maxWidth: 160, cursor: 'pointer' }}
                    value={newApiUrl.split(',')[3] || 'f'}
                    onChange={e => {
                      const parts = newApiUrl.split(',')
                      while (parts.length < 4) parts.push('')
                      parts[3] = e.target.value
                      setNewApiUrl(parts.join(','))
                    }}>
                    <option value="f">Fahrenheit (°F)</option>
                    <option value="c">Celsius (°C)</option>
                  </select>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  No API key required. Data from Open-Meteo (open source, free).
                </div>
              </div>
            ) : newType === 'steam' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label className="label">Steam ID <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(17-digit number)</span></label>
                <input className="input" value={newApiUrl}
                  onChange={e => setNewApiUrl(e.target.value)}
                  placeholder="76561198000000000" />
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="input" value={steamVanity}
                    onChange={e => setSteamVanity(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && resolveVanity()}
                    placeholder="Or enter profile vanity name to resolve..." style={{ flex: 1 }} />
                  <button className="btn btn-ghost" style={{ fontSize: 12 }}
                    onClick={resolveVanity} disabled={steamResolving || !newSecretId}>
                    {steamResolving ? '...' : 'Resolve'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  API key required above. Find your Steam ID at steamid.io
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label className="label">API URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(backend)</span></label>
                  <input className="input" value={newApiUrl} onChange={e => { setNewApiUrl(e.target.value); setTestResult(null) }}
                    placeholder="http://truenas.local:8989" />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="label">UI URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(browser, optional)</span></label>
                  <input className="input" value={newUiUrl} onChange={e => setNewUiUrl(e.target.value)}
                    placeholder="https://sonarr.yourdomain.com" />
                </div>
              </div>
            )}

            {/* Test result */}
            {testResult && (
              <div style={{
                padding: '8px 12px', borderRadius: 7, fontSize: 12,
                background: testResult.ok ? '#4ade8018' : '#f8717118',
                border: `1px solid ${testResult.ok ? '#4ade8040' : '#f8717140'}`,
                color: testResult.ok ? 'var(--green)' : 'var(--red)',
              }}>
                {testResult.ok ? '✓ Connection successful' : `✗ ${testResult.error}`}
                {!testResult.ok && testResult.tlsError && testResult.skipTlsWorks && (
                  <div style={{ marginTop: 4, color: 'var(--amber)', fontSize: 11 }}>
                    ⚠ Connection works without certificate verification — enable "Skip TLS" below, or add the service's root CA to your system's trusted certificate store.
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={newSkipTls} onChange={e => setNewSkipTls(e.target.checked)} />
                Skip TLS <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>(self-signed certs)</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>Refresh every</label>
                <input className="input" type="number" min={15} value={newRefreshSecs}
                  onChange={e => setNewRefreshSecs(Math.max(15, Number(e.target.value)))}
                  style={{ width: 100 }} />
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>s</span>
              </div>
              <div style={{ flex: 1 }} />
              {!['weather','steam','rss'].includes(newType) && (
                <button className="btn btn-secondary" onClick={test} disabled={testing || !newApiUrl}>
                  {testing ? <span className="spinner" /> : 'Test'}
                </button>
              )}
              <button className="btn btn-primary" onClick={create} disabled={creating || !newName || (['weather','steam','rss'].includes(newType) ? false : !newApiUrl)}>
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
  // Geo/vanity state for weather and steam edit forms
  const [rowGeoQuery, setRowGeoQuery] = useState('')
  const [rowGeoResults, setRowGeoResults] = useState<any[]>([])
  const [rowGeoSearching, setRowGeoSearching] = useState(false)
  const [rowSteamVanity, setRowSteamVanity] = useState('')
  const [rowSteamResolving, setRowSteamResolving] = useState(false)

  const rowSearchGeo = async () => {
    if (!rowGeoQuery.trim()) return
    setRowGeoSearching(true)
    try { const r = await weatherApi.geocode(rowGeoQuery); setRowGeoResults(r.data || []) }
    finally { setRowGeoSearching(false) }
  }
  const rowSelectGeo = (r: any) => {
    const city = [r.name, r.admin1, r.country].filter(Boolean).join(', ')
    setApiUrl(`${r.latitude},${r.longitude},${city},f`)
    setRowGeoResults([]); setRowGeoQuery('')
  }
  const rowResolveVanity = async () => {
    if (!rowSteamVanity.trim() || !secretId) return
    setRowSteamResolving(true)
    try {
      const sec = secrets.find(s => s.id === secretId)
      if (!sec) return
      const r = await steamApi.resolveVanity(rowSteamVanity, sec.value || secretId)
      setApiUrl(r.data.steamId); setRowSteamVanity('')
    } catch { alert('Could not resolve vanity URL') }
    finally { setRowSteamResolving(false) }
  }
  const [uiUrl, setUiUrl] = useState(ig.uiUrl)
  const [secretId, setSecretId] = useState(ig.secretId || '')
  const [showAddSecret, setShowAddSecret] = useState(false)
  const [newSecretName, setNewSecretName] = useState('')
  const [newSecretValue, setNewSecretValue] = useState('')
  const [savingSecret, setSavingSecret] = useState(false)

  const createSecret = async () => {
    if (!newSecretName.trim() || !newSecretValue.trim()) return
    setSavingSecret(true)
    try {
      const res = await secretsApi.create({ name: newSecretName.trim(), value: newSecretValue.trim(), scope: 'shared' })
      const newSec = { id: res.data.id, name: newSecretName.trim() }
      setSecretId(newSec.id)
      onUpdate({}) // trigger parent reload to refresh secrets list
      setNewSecretName(''); setNewSecretValue(''); setShowAddSecret(false)
    } finally { setSavingSecret(false) }
  }
  const [skipTls, setSkipTls] = useState(ig.skipTls || false)
  const [refreshSecs, setRefreshSecs] = useState(ig.refreshSecs || 60)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; tlsError?: boolean; skipTlsWorks?: boolean } | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    setName(ig.name); setApiUrl(ig.apiUrl)
    setUiUrl(ig.uiUrl); setSecretId(ig.secretId || '')
    setSkipTls(ig.skipTls || false)
    setRefreshSecs(ig.refreshSecs || 60)
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
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1.5 }}>
                  <label className="label">Name</label>
                  <input className="input" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="label">API key secret</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select className="input" value={secretId}
                      onChange={e => { setSecretId(e.target.value); setTestResult(null) }}
                      style={{ cursor: 'pointer', flex: 1 }}>
                      <option value="">— None —</option>
                      {secrets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button className="btn btn-ghost" style={{ fontSize: 12, flexShrink: 0 }}
                      onClick={() => setShowAddSecret(v => !v)}>
                      {showAddSecret ? 'Cancel' : '+ New'}
                    </button>
                  </div>
                  {showAddSecret && (
                    <div style={{ marginTop: 6, padding: '10px 12px', borderRadius: 8,
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <label className="label">Name</label>
                          <input className="input" value={newSecretName}
                            onChange={e => setNewSecretName(e.target.value)}
                            placeholder="e.g. Sonarr API Key" autoFocus />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label className="label">Value</label>
                          <input className="input" type="password" value={newSecretValue}
                            onChange={e => setNewSecretValue(e.target.value)}
                            placeholder="Paste key here" />
                        </div>
                      </div>
                      <button className="btn btn-primary" style={{ fontSize: 12, alignSelf: 'flex-start' }}
                        disabled={savingSecret || !newSecretName || !newSecretValue}
                        onClick={createSecret}>
                        {savingSecret ? <span className="spinner" /> : 'Save & select'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {ig.type === 'weather' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="label">Location</label>
                  {apiUrl && (
                    <div style={{ fontSize: 12, color: 'var(--accent2)' }}>
                      📍 {apiUrl.split(',').slice(2).join(',') || apiUrl}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="input" value={rowGeoQuery}
                      onChange={e => setRowGeoQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && rowSearchGeo()}
                      placeholder="Search city to change location..." style={{ flex: 1 }} />
                    <button className="btn btn-ghost" style={{ fontSize: 12 }}
                      onClick={rowSearchGeo} disabled={rowGeoSearching}>
                      {rowGeoSearching ? '...' : 'Search'}
                    </button>
                  </div>
                  {rowGeoResults.length > 0 && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                      {rowGeoResults.map((r, i) => (
                        <button key={i} onClick={() => rowSelectGeo(r)}
                          style={{ display: 'block', width: '100%', textAlign: 'left',
                            padding: '7px 12px', fontSize: 12, background: 'none',
                            border: 'none', borderBottom: i < rowGeoResults.length-1 ? '1px solid var(--border)' : 'none',
                            cursor: 'pointer', color: 'var(--text)' }}>
                          {[r.name, r.admin1, r.country].filter(Boolean).join(', ')}
                          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 8 }}>
                            {r.latitude.toFixed(3)}, {r.longitude.toFixed(3)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label className="label" style={{ marginBottom: 0 }}>Unit:</label>
                    <select className="input" style={{ maxWidth: 160, cursor: 'pointer' }}
                      value={apiUrl.split(',')[3] || 'f'}
                      onChange={e => {
                        const parts = apiUrl.split(',')
                        while (parts.length < 4) parts.push('')
                        parts[3] = e.target.value
                        setApiUrl(parts.join(','))
                      }}>
                      <option value="f">Fahrenheit (°F)</option>
                      <option value="c">Celsius (°C)</option>
                    </select>
                  </div>
                </div>
              ) : ig.type === 'steam' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="label">Steam ID</label>
                  <input className="input" value={apiUrl}
                    onChange={e => setApiUrl(e.target.value)}
                    placeholder="76561198000000000" />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="input" value={rowSteamVanity}
                      onChange={e => setRowSteamVanity(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && rowResolveVanity()}
                      placeholder="Or enter profile vanity name to resolve..." style={{ flex: 1 }} />
                    <button className="btn btn-ghost" style={{ fontSize: 12 }}
                      onClick={rowResolveVanity} disabled={rowSteamResolving}>
                      {rowSteamResolving ? '...' : 'Resolve'}
                    </button>
                  </div>
                </div>
              ) : ig.type === 'rss' ? (
                <div>
                  <label className="label">Feed URL</label>
                  <input className="input" value={apiUrl}
                    onChange={e => setApiUrl(e.target.value)}
                    placeholder="https://example.com/feed.xml" />
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label className="label">API URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(backend)</span></label>
                    <input className="input" value={apiUrl}
                      onChange={e => { setApiUrl(e.target.value); setTestResult(null) }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="label">UI URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(browser, optional)</span></label>
                    <input className="input" value={uiUrl} onChange={e => setUiUrl(e.target.value)} />
                  </div>
                </div>
              )}
              {testResult && (
                <div style={{
                  padding: '8px 12px', borderRadius: 7, fontSize: 12,
                  background: testResult.ok ? '#4ade8018' : '#f8717118',
                  border: `1px solid ${testResult.ok ? '#4ade8040' : '#f8717140'}`,
                  color: testResult.ok ? 'var(--green)' : 'var(--red)',
                }}>
                  {testResult.ok ? '✓ Connection successful' : `✗ ${testResult.error}`}
                {!testResult.ok && testResult.tlsError && testResult.skipTlsWorks && (
                  <div style={{ marginTop: 4, color: 'var(--amber)', fontSize: 11 }}>
                    ⚠ Connection works without certificate verification — enable "Skip TLS" below, or add the service's root CA to your system's trusted certificate store.
                  </div>
                )}
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={skipTls} onChange={e => setSkipTls(e.target.checked)} />
                  Skip TLS <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>(self-signed certs)</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>Refresh every</label>
                  <input className="input" type="number" min={15} value={refreshSecs}
                    onChange={e => setRefreshSecs(Math.max(15, Number(e.target.value)))}
                    style={{ width: 100 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>s</span>
                </div>
                <div style={{ flex: 1 }} />
                {!['weather','steam','rss'].includes(ig.type) && (
                  <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={test} disabled={testing}>
                    {testing ? <span className="spinner" /> : 'Test'}
                  </button>
                )}
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => {
                  onUpdate({ name, apiUrl, uiUrl, secretId: secretId || '', skipTls, refreshSecs })
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
