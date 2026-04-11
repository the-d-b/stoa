import { useEffect, useState } from 'react'
import { groupsApi, usersApi, Group, User } from '../../api'

export default function GroupsPanel() {
  const [groups, setGroups] = useState<Group[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')

  const load = async () => {
    const [g, u] = await Promise.all([groupsApi.list(), usersApi.list()])
    setGroups(g.data); setUsers(u.data); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const loadGroup = async (id: string) => {
    try {
      const r = await groupsApi.get(id)
      setGroups(gs => gs.map(g => g.id === id ? r.data : g))
      setExpanded(id)
    } catch (e) {
      console.error('[Groups] failed to load group:', id, e)
      // Still expand to show the empty state
      setExpanded(id)
    }
  }

  const create = async () => {
    if (!name.trim()) return
    setCreating(true)
    await groupsApi.create(name.trim(), desc.trim())
    setName(''); setDesc(''); setShowForm(false)
    await load(); setCreating(false)
  }

  const remove = async (id: string, n: string) => {
    if (!confirm(`Delete group "${n}"?`)) return
    await groupsApi.delete(id); load()
  }

  const toggleUser = async (gid: string, uid: string, inGroup: boolean) => {
    if (inGroup) await groupsApi.removeUser(gid, uid)
    else await groupsApi.addUser(gid, uid)
    loadGroup(gid)
  }


  if (loading) return <Loading />

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter groups..." style={{ fontSize: 13, flex: 1 }} />
        <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={() => setShowForm(!showForm)}>
          + New group
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16, padding: 20 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label className="label">Name</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Group name" autoFocus />
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Description (optional)</label>
              <input className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="What is this group for?" />
            </div>
            <button className="btn btn-primary" onClick={create} disabled={creating}>
              {creating ? <span className="spinner" /> : 'Create'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {groups.filter(g => !search || g.name.toLowerCase().includes(search.toLowerCase())).map(g => {
          const open = expanded === g.id
          return (
            <div key={g.id} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, overflow: 'hidden',
              borderColor: open ? 'var(--border2)' : 'var(--border)',
            }}>
              {/* Header row */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '11px 16px', cursor: 'pointer',
                }}
                onClick={() => open ? setExpanded(null) : loadGroup(g.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'DM Mono, monospace' }}>
                    {open ? '▼' : '▶'}
                  </span>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{g.name}</span>
                  {g.description && (
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{g.description}</span>
                  )}
                </div>
                <button
                  className="btn btn-danger"
                  onClick={e => { e.stopPropagation(); remove(g.id, g.name) }}
                >
                  Delete
                </button>
              </div>

              {/* Expanded content */}
              {open && (
                <div style={{
                  borderTop: '1px solid var(--border)',
                  padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24,
                }}>
                  <div>
                    <div className="section-title">Users</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {users.map(u => {
                        const inGroup = g.users?.some(gu => gu.id === u.id) ?? false
                        return (
                          <label key={u.id} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            cursor: 'pointer', padding: '4px 0',
                          }}>
                            <input type="checkbox" checked={inGroup}
                              onChange={() => toggleUser(g.id, u.id, inGroup)}
                              style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
                            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{u.username}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{u.role}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>


                </div>
              )}
            </div>
          )
        })}
        {groups.length === 0 && <Empty message="No groups yet." />}
      </div>
    </div>
  )
}

function Loading() { return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div> }
function Empty({ message }: { message: string }) {
  return <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '24px 0' }}>{message}</div>
}
