import { useEffect, useState } from 'react'
import { groupsApi, usersApi, Group, User } from '../../api'
import SectionHelp from './SectionHelp'

export default function GroupsPanel() {
  const [groups, setGroups]   = useState<Group[]>([])
  const [users, setUsers]     = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [name, setName]   = useState('')
  const [desc, setDesc]   = useState('')
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')

  const load = async () => {
    const [g, u] = await Promise.all([groupsApi.list(), usersApi.list()])
    setGroups(g.data); setUsers(u.data); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      await groupsApi.create(name.trim(), desc.trim())
      setName(''); setDesc(''); setShowForm(false); await load()
    } finally { setCreating(false) }
  }

  const remove = async (g: Group) => {
    if (!confirm(`Delete group "${g.name}"? This cannot be undone.`)) return
    await groupsApi.delete(g.id); await load()
  }

  const toggleUser = async (groupId: string, userId: string, inGroup: boolean) => {
    try {
      if (inGroup) await groupsApi.removeUser(groupId, userId)
      else await groupsApi.addUser(groupId, userId)
      await load()
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to update group membership')
    }
  }

  const filtered = groups.filter(g =>
    !search || g.name.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>

  return (
    <div>
      <SectionHelp storageKey="groups_panel" title="About groups">
        Groups control which panels users can see. Assign system panels to groups — members of that
        group can see those panels when the relevant tags are active. The default group auto-enrolls
        new users.
      </SectionHelp>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search groups…" style={{ flex: 1, fontSize: 13 }} />
        <button className="btn btn-primary" style={{ fontSize: 12 }}
          onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ New group'}
        </button>
      </div>

      {showForm && (
        <div style={{ padding: 16, background: 'var(--surface2)', borderRadius: 10,
          border: '1px solid var(--border)', marginBottom: 16,
          display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <input className="input" value={name} onChange={e => setName(e.target.value)}
              placeholder="Group name" autoFocus
              onKeyDown={e => e.key === 'Enter' && create()} />
            <input className="input" value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Description (optional)" />
          </div>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-start', fontSize: 12 }}
            onClick={create} disabled={creating || !name.trim()}>
            {creating ? <span className="spinner" /> : 'Create'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(g => {
          const memberIds = new Set((g.users || []).map((u: User) => u.id))
          const isOpen = expanded === g.id
          return (
            <div key={g.id} style={{
              background: 'var(--surface)',
              border: `1px solid ${isOpen ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 10, overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', cursor: 'pointer' }}
                onClick={() => setExpanded(isOpen ? null : g.id)}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{g.name}</span>
                    {(g as any).isDefault && (
                      <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10,
                        background: 'var(--accent-bg)', color: 'var(--accent2)',
                        fontWeight: 600, letterSpacing: '0.04em' }}>DEFAULT</span>
                    )}
                  </div>
                  {g.description && (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{g.description}</div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {(g.users || []).length} member{(g.users || []).length !== 1 ? 's' : ''}
                  </div>
                </div>
                {!(g as any).isDefault && (
                  <button className="btn btn-secondary" style={{ fontSize: 11 }}
                    onClick={async e => {
                      e.stopPropagation()
                      await groupsApi.setDefault(g.id)
                      await load()
                    }}>
                    Set default
                  </button>
                )}
                <button className="btn btn-danger" style={{ fontSize: 11 }}
                  onClick={e => { e.stopPropagation(); remove(g) }}>
                  Delete
                </button>
                <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {isOpen && (
                <div style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    Members
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {users.map(u => {
                      const inGroup = memberIds.has(u.id)
                      return (
                        <div key={u.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '6px 10px', borderRadius: 7,
                          background: inGroup ? 'var(--accent-bg)' : 'var(--surface2)',
                          border: `1px solid ${inGroup ? '#7c6fff30' : 'var(--border)'}`,
                        }}>
                          <span style={{ flex: 1, fontSize: 13 }}>
                            {u.username}
                            {u.email && (
                              <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 6 }}>
                                {u.email}
                              </span>
                            )}
                          </span>
                          <button
                            className={inGroup ? 'btn btn-ghost' : 'btn btn-secondary'}
                            style={{ fontSize: 11 }}
                            onClick={() => toggleUser(g.id, u.id, inGroup)}>
                            {inGroup ? 'Remove' : 'Add'}
                          </button>
                        </div>
                      )
                    })}
                    {users.length === 0 && (
                      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No users yet.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '24px 0' }}>
            {search ? 'No groups match your search.' : 'No groups yet.'}
          </div>
        )}
      </div>
    </div>
  )
}
