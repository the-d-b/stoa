import { useEffect, useState } from 'react'
import { secretsApi, groupsApi, Secret } from '../../api'

export default function SecretsPanel() {
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newScope, setNewScope] = useState<'shared' | 'personal'>('shared')
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; name: string; value: string } | null>(null)

  const load = async () => {
    const [s, g] = await Promise.all([secretsApi.list(), groupsApi.list()])
    setSecrets(s.data || [])
    setGroups(g.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!newName.trim() || !newValue.trim()) return
    setCreating(true)
    try {
      await secretsApi.create({ name: newName.trim(), value: newValue.trim(), scope: newScope })
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
    await secretsApi.update(editing.id, {
      name: editing.name,
      value: editing.value || undefined,
    })
    setEditing(null)
    await load()
  }

  const toggleGroup = async (secretId: string, groupId: string, currentGroups: string[]) => {
    const next = currentGroups.includes(groupId)
      ? currentGroups.filter(g => g !== groupId)
      : [...currentGroups, groupId]
    await secretsApi.setGroups(secretId, next)
    await load()
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  const sharedSecrets = secrets.filter(s => s.scope === 'shared')
  const personalSecrets = secrets.filter(s => s.scope === 'personal')

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.7, maxWidth: 500 }}>
          Secrets store API keys and tokens used by glyphs, tickers, and interactive panels.
          Shared secrets can be granted to groups. Users can also create personal secrets from their profile.
        </p>
        <button className="btn btn-primary" style={{ flexShrink: 0, marginLeft: 16 }}
          onClick={() => setShowForm(f => !f)}>
          + New secret
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20, padding: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label className="label">Name</label>
                <input className="input" value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. OpenWeather API Key" autoFocus />
              </div>
              <div style={{ flex: 0.4 }}>
                <label className="label">Scope</label>
                <select className="input" value={newScope}
                  onChange={e => setNewScope(e.target.value as any)}
                  style={{ cursor: 'pointer' }}>
                  <option value="shared">Shared</option>
                  <option value="personal">Personal</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Value</label>
              <input type="password" className="input" value={newValue}
                onChange={e => setNewValue(e.target.value)}
                placeholder="Paste API key or secret" />
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

      {/* Shared secrets */}
      {sharedSecrets.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-title" style={{ marginBottom: 10 }}>Shared secrets</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sharedSecrets.map(s => (
              <SecretRow key={s.id} secret={s} groups={groups}
                expanded={expanded === s.id}
                onExpand={() => setExpanded(expanded === s.id ? null : s.id)}
                onDelete={() => remove(s.id, s.name)}
                onEdit={() => setEditing({ id: s.id, name: s.name, value: '' })}
                onToggleGroup={(gid) => toggleGroup(s.id, gid, s.groups)}
                editing={editing?.id === s.id ? editing : null}
                onEditChange={v => setEditing(e => e ? { ...e, ...v } : null)}
                onSaveEdit={saveEdit}
                onCancelEdit={() => setEditing(null)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Personal secrets (admin view) */}
      {personalSecrets.length > 0 && (
        <div>
          <div className="section-title" style={{ marginBottom: 10 }}>Personal secrets (your own)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {personalSecrets.map(s => (
              <SecretRow key={s.id} secret={s} groups={[]}
                expanded={expanded === s.id}
                onExpand={() => setExpanded(expanded === s.id ? null : s.id)}
                onDelete={() => remove(s.id, s.name)}
                onEdit={() => setEditing({ id: s.id, name: s.name, value: '' })}
                onToggleGroup={() => {}}
                editing={editing?.id === s.id ? editing : null}
                onEditChange={v => setEditing(e => e ? { ...e, ...v } : null)}
                onSaveEdit={saveEdit}
                onCancelEdit={() => setEditing(null)}
              />
            ))}
          </div>
        </div>
      )}

      {secrets.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '24px 0' }}>
          No secrets yet. Create one to store API keys for glyphs and tickers.
        </div>
      )}
    </div>
  )
}

function SecretRow({ secret, groups, expanded, onExpand, onDelete, onEdit,
  onToggleGroup, editing, onEditChange, onSaveEdit, onCancelEdit }: {
  secret: Secret; groups: any[]; expanded: boolean
  onExpand: () => void; onDelete: () => void; onEdit: () => void
  onToggleGroup: (gid: string) => void
  editing: { id: string; name: string; value: string } | null
  onEditChange: (v: Partial<{ name: string; value: string }>) => void
  onSaveEdit: () => void; onCancelEdit: () => void
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden',
      borderColor: expanded ? 'var(--border2)' : 'var(--border)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '11px 16px', cursor: 'pointer',
      }} onClick={onExpand}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'DM Mono, monospace' }}>
            {expanded ? '▼' : '▶'}
          </span>
          <span style={{ fontWeight: 500, fontSize: 14 }}>{secret.name}</span>
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 4,
            background: secret.scope === 'shared' ? 'var(--accent-bg)' : 'var(--surface2)',
            color: secret.scope === 'shared' ? 'var(--accent2)' : 'var(--text-dim)',
            border: '1px solid var(--border)',
          }}>{secret.scope}</span>
          {secret.scope === 'shared' && secret.groups.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {secret.groups.length} group{secret.groups.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onEdit}>Edit</button>
          <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--red)' }} onClick={onDelete}>Delete</button>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="label">Name</label>
                <input className="input" value={editing.name}
                  onChange={e => onEditChange({ name: e.target.value })} autoFocus />
              </div>
              <div>
                <label className="label">New value (leave blank to keep current)</label>
                <input type="password" className="input" value={editing.value}
                  onChange={e => onEditChange({ value: e.target.value })}
                  placeholder="Enter new value to rotate key" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={onSaveEdit}>Save</button>
                <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={onCancelEdit}>Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>Value</div>
              <div style={{
                fontFamily: 'DM Mono, monospace', fontSize: 12,
                color: 'var(--text-muted)', letterSpacing: '0.1em',
              }}>••••••••••••••••</div>
            </div>
          )}

          {secret.scope === 'shared' && groups.length > 0 && !editing && (
            <div style={{ marginTop: 14 }}>
              <div className="section-title" style={{ marginBottom: 8, fontSize: 11 }}>Group access</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {groups.map(g => {
                  const has = secret.groups.includes(g.id)
                  return (
                    <button key={g.id} onClick={() => onToggleGroup(g.id)} style={{
                      padding: '3px 10px', borderRadius: 8, cursor: 'pointer',
                      background: has ? 'var(--accent-bg)' : 'var(--surface2)',
                      color: has ? 'var(--accent2)' : 'var(--text-muted)',
                      border: `1px solid ${has ? '#7c6fff30' : 'var(--border)'}`,
                      fontSize: 12, transition: 'all 0.15s',
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
