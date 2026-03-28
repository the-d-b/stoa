import { useEffect, useState } from 'react'
import { usersApi, User } from '../../api'
import { useAuth } from '../../context/AuthContext'

export default function UsersPanel() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const { user: me } = useAuth()

  const load = () => usersApi.list().then(r => setUsers(r.data)).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const toggleRole = async (u: User) => {
    await usersApi.updateRole(u.id, u.role === 'admin' ? 'user' : 'admin')
    load()
  }

  const remove = async (u: User) => {
    if (!confirm(`Remove ${u.username}?`)) return
    await usersApi.delete(u.id)
    load()
  }

  if (loading) return <Loading />

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0, marginBottom: 24, lineHeight: 1.7 }}>
        Users are created automatically on first OAuth login. Local admin accounts cannot be removed.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {users.map(u => (
          <div key={u.id} className="card-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Avatar */}
              <div style={{
                width: 34, height: 34, borderRadius: 8,
                background: 'var(--accent-bg)', border: '1px solid #7c6fff22',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600, color: 'var(--accent2)',
                flexShrink: 0,
              }}>
                {u.username[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {u.username}
                  {u.id === me?.id && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>you</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
                  {u.email || u.authProvider}
                  {u.lastLogin && ` · ${new Date(u.lastLogin).toLocaleDateString()}`}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={u.role === 'admin' ? 'badge badge-admin' : 'badge badge-user'}>
                {u.role}
              </span>
              {u.id !== me?.id && (
                <>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => toggleRole(u)}>
                    {u.role === 'admin' ? 'Demote' : 'Promote'}
                  </button>
                  {u.authProvider !== 'local' && (
                    <button className="btn btn-danger" onClick={() => remove(u)}>Remove</button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        {users.length === 0 && <Empty message="No users yet." />}
      </div>
    </div>
  )
}

function Loading() { return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div> }
function Empty({ message }: { message: string }) {
  return <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '24px 0' }}>{message}</div>
}
