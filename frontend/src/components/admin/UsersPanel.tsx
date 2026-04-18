import { useEffect, useState } from 'react'
import { usersApi, User } from '../../api'
import { useAuth } from '../../context/AuthContext'
import SectionHelp from './SectionHelp'

export default function UsersPanel() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [resetId, setResetId] = useState<string | null>(null)
  const [resetPw, setResetPw] = useState('')
  const [resetting, setResetting] = useState(false)
  const { user: me } = useAuth()

  const [newUsername, setNewUsername] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const load = async () => {
    try {
      const r = await usersApi.list()
      setUsers((r.data || []).filter((u: User) => u.id !== 'SYSTEM'))
    } catch (e) {
      console.error('Failed to load users', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!newUsername || !newPassword) return
    setCreating(true); setCreateError('')
    try {
      await usersApi.create({
        username: newUsername,
        email: newEmail || undefined,
        password: newPassword,
        role: newRole,
      })
      setNewUsername(''); setNewEmail(''); setNewPassword(''); setNewRole('user')
      setShowForm(false)
      await load()
    } catch (e: any) {
      setCreateError(e?.response?.data?.error || 'Username already exists or invalid data.')
    } finally { setCreating(false) }
  }

  const toggleRole = async (u: User) => {
    try {
      await usersApi.updateRole(u.id, u.role === 'admin' ? 'user' : 'admin')
      await load()
    } catch (e) { console.error('toggleRole failed', e) }
  }

  const remove = async (u: User) => {
    if (!confirm(`Remove ${u.username}? This cannot be undone.`)) return
    try { await usersApi.delete(u.id); await load() }
    catch (e) { console.error('delete failed', e) }
  }

  const resetPassword = async (id: string) => {
    if (!resetPw) return
    setResetting(true)
    try {
      await usersApi.resetPassword(id, resetPw)
      setResetId(null); setResetPw('')
    } catch (e) { console.error('reset failed', e) }
    finally { setResetting(false) }
  }

  const filtered = users.filter(u =>
    !search ||
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  return (
    <div>
      <SectionHelp storageKey="users" title="About users">
        Users can be <strong>admins</strong> (full access to all settings and content) or <strong>regular users</strong> (can
        personalize their own experience within what's been shared with them). Every user gets their own
        login, their own panel layout, and can add personal integrations. Local accounts always work
        regardless of OAuth configuration — useful as a fallback if SSO is misconfigured.
      </SectionHelp>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter users..." style={{ fontSize: 13, flex: 1 }} />
        <button className="btn btn-primary" style={{ flexShrink: 0 }}
          onClick={() => { setShowForm(f => !f); setCreateError('') }}>+ New user</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label className="label">Username</label>
                <input className="input" value={newUsername}
                  onChange={e => setNewUsername(e.target.value)} placeholder="jsmith" autoFocus />
              </div>
              <div style={{ flex: 1 }}>
                <label className="label">Email (optional)</label>
                <input className="input" value={newEmail}
                  onChange={e => setNewEmail(e.target.value)} placeholder="j@example.com" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label className="label">Password</label>
                <input className="input" type="password" value={newPassword}
                  onChange={e => setNewPassword(e.target.value)} placeholder="Temporary password" />
              </div>
              <div style={{ flex: 0.4 }}>
                <label className="label">Role</label>
                <select className="input" value={newRole}
                  onChange={e => setNewRole(e.target.value as 'user' | 'admin')}
                  style={{ cursor: 'pointer' }}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            {createError && (
              <div style={{ fontSize: 12, color: 'var(--red)', padding: '6px 10px',
                background: '#f8717118', borderRadius: 6, border: '1px solid #f8717140' }}>
                {createError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={create}
                disabled={creating || !newUsername || !newPassword}>
                {creating ? <span className="spinner" /> : 'Create'}
              </button>
              <button className="btn btn-ghost"
                onClick={() => { setShowForm(false); setCreateError('') }}>Cancel</button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0, lineHeight: 1.6 }}>
              Local users log in with username + password. OAuth users are created automatically on first login.
            </p>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(u => (
          <div key={u.id} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, overflow: 'hidden',
          }}>
            <div className="card-row" style={{ border: 'none', borderRadius: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 8,
                  background: u.authProvider === 'local' ? 'var(--surface2)' : 'var(--accent-bg)',
                  border: u.authProvider === 'local' ? '1px solid var(--border)' : '1px solid #7c6fff22',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 600,
                  color: u.authProvider === 'local' ? 'var(--text-muted)' : 'var(--accent2)',
                  flexShrink: 0,
                }}>
                  {(u.username || '?')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {u.username}
                    {u.id === me?.id && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>you</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
                    {u.authProvider === 'local' ? '🔑 local' : `⬡ ${u.authProvider}`}
                    {u.email ? ` · ${u.email}` : ''}
                    {u.lastLogin ? ` · last login ${new Date(u.lastLogin).toLocaleDateString()}` : ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={u.role === 'admin' ? 'badge badge-admin' : 'badge badge-user'}>
                  {u.role}
                </span>
                {u.id !== me?.id && (
                  <>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }}
                      onClick={() => toggleRole(u)}>
                      {u.role === 'admin' ? 'Demote' : 'Promote'}
                    </button>
                    {u.authProvider === 'local' && (
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={() => { setResetId(resetId === u.id ? null : u.id); setResetPw('') }}>
                        Reset pw
                      </button>
                    )}
                    <button className="btn btn-danger" onClick={() => remove(u)}>Remove</button>
                  </>
                )}
              </div>
            </div>
            {resetId === u.id && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)',
                background: 'var(--surface2)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="input" type="password" value={resetPw}
                  onChange={e => setResetPw(e.target.value)}
                  placeholder="New password" style={{ fontSize: 13, flex: 1 }} autoFocus />
                <button className="btn btn-primary" style={{ fontSize: 12 }}
                  disabled={resetting || !resetPw} onClick={() => resetPassword(u.id)}>
                  {resetting ? <span className="spinner" /> : 'Set'}
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 12 }}
                  onClick={() => { setResetId(null); setResetPw('') }}>Cancel</button>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '24px 0' }}>
            {search ? 'No users match your search.' : 'No users yet.'}
          </div>
        )}
      </div>
    </div>
  )
}
