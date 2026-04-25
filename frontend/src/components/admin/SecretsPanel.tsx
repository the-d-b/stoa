import { useEffect, useState } from 'react'
import SectionHelp from './SectionHelp'
import { secretsApi, groupsApi, Secret } from '../../api'

export default function SecretsPanel() {
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; name: string; value: string } | null>(null)
  const [search, setSearch] = useState('')

  const load = async () => {
    const [s, g] = await Promise.all([secretsApi.list(), groupsApi.list()])
    setSecrets((s.data || []).filter((x: Secret) => x.scope === 'shared'))
    setGroups(g.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!newName.trim() || !newValue.trim()) return
    setCreating(true)
    try {
      await secretsApi.create({ name: newName.trim(), value: newValue.trim(), scope: 'shared' })
      setNewName(''); setNewValue(''); setShowForm(false)
      await load()
    } finally { setCreating(false) }
  }

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete secret "${name}"?`)) return
    await secretsApi.delete(id)
    await load()
  }

  const saveEdit = async () => {
    if (!editing) return
    await secretsApi.update(editing.id, { name: editing.name, value: editing.value || undefined })
    setEditing(null); await load()
  }

  const toggleGroup = async (secretId: string, groupId: string, currentGroups: string[]) => {
    const next = currentGroups.includes(groupId)
      ? currentGroups.filter(g => g !== groupId)
      : [...currentGroups, groupId]
    await secretsApi.setGroups(secretId, next)
    await load()
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  return (
    <div>
      <SectionHelp storageKey="secrets" title="About secrets">
        Secrets store API keys and credentials used by integrations — safely encrypted at rest and
        never exposed in full after saving. System secrets created here can be shared with groups,
        making them available for use in any integration visible to those groups.
        <br /><br />
        <strong>How they connect:</strong> When you create an integration (Sonarr, Proxmox, TrueNAS, etc.),
        you select a secret to authenticate with. This keeps credentials in one place — rotate a key
        by updating the secret, and all integrations using it pick up the change automatically.
      </SectionHelp>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter secrets..." style={{ fontSize: 13, flex: 1 }} />
        <button className="btn btn-primary" style={{ flexShrink: 0 }}
          onClick={() => setShowForm(f => !f)}>+ New secret</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20, padding: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label className="label">Name</label>
              <input className="input" value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="e.g. My API Key" autoFocus />
            </div>
            <div>
              <label className="label">Value</label>
              <input type="password" className="input" value={newValue}
                onChange={e => setNewValue(e.target.value)} placeholder="Paste API key or secret"
                onKeyDown={e => e.key === 'Enter' && create()} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={create} disabled={creating}>
                {creating ? <span className="spinner" /> : 'Create'}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {secrets.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase())).map(s => (
          <div key={s.id} style={{
            background: 'var(--surface)', border: `1px solid ${expanded === s.id ? 'var(--border2)' : 'var(--border)'}`,
            borderRadius: 10, overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 16px', cursor: 'pointer',
            }} onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'DM Mono, monospace' }}>
                  {expanded === s.id ? '▼' : '▶'}
                </span>
                <span style={{ fontWeight: 500, fontSize: 14 }}>{s.name}</span>
                {s.groups.length === 0
                  ? <span style={{ fontSize: 11, color: 'var(--amber)', fontStyle: 'italic' }}>visible to all users</span>
                  : <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.groups.length} group{s.groups.length !== 1 ? 's' : ''}</span>
                }
              </div>
              <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                <button className="btn btn-ghost" style={{ fontSize: 12 }}
                  onClick={() => setEditing(editing?.id === s.id ? null : { id: s.id, name: s.name, value: '' })}>
                  Edit
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--red)' }}
                  onClick={() => remove(s.id, s.name)}>Delete</button>
              </div>
            </div>

            {expanded === s.id && (
              <div style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
                {editing?.id === s.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                    <div>
                      <label className="label">Name</label>
                      <input className="input" value={editing.name}
                        onChange={e => setEditing(ed => ed ? { ...ed, name: e.target.value } : null)} autoFocus />
                    </div>
                    <div>
                      <label className="label">New value (leave blank to keep current)</label>
                      <input type="password" className="input" value={editing.value}
                        onChange={e => setEditing(ed => ed ? { ...ed, value: e.target.value } : null)}
                        placeholder="Enter new value to rotate key" />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={saveEdit}>Save</button>
                      <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>Value</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: 'var(--text-muted)', letterSpacing: '0.15em' }}>
                      ••••••••••••••••
                    </div>
                  </div>
                )}

                {!editing && groups.length > 0 && (
                  <div>
                    <div className="section-title" style={{ marginBottom: 8, fontSize: 11 }}>Group access</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {groups.map(g => {
                        const has = s.groups.includes(g.id)
                        return (
                          <button key={g.id} onClick={() => toggleGroup(s.id, g.id, s.groups)} style={{
                            padding: '3px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                            background: has ? 'var(--accent-bg)' : 'var(--surface2)',
                            color: has ? 'var(--accent2)' : 'var(--text-muted)',
                            border: `1px solid ${has ? '#7c6fff30' : 'var(--border)'}`,
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
        ))}
        {secrets.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '24px 0' }}>
            No shared secrets yet. Create one to store API keys for glyphs and tickers.
          </div>
        )}
      </div>
    </div>
  )
}
