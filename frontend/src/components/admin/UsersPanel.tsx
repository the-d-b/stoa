import { useEffect, useState } from 'react'
import { usersApi, User, Role } from '../../api'
import { useAuth } from '../../context/AuthContext'

export default function UsersPanel() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const { user: currentUser } = useAuth()

  const load = () => {
    usersApi.list()
      .then((res) => setUsers(res.data))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const toggleRole = async (u: User) => {
    const newRole: Role = u.role === 'admin' ? 'user' : 'admin'
    await usersApi.updateRole(u.id, newRole)
    load()
  }

  const deleteUser = async (u: User) => {
    if (!confirm(`Remove ${u.username}?`)) return
    await usersApi.delete(u.id)
    load()
  }

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>

  return (
    <div>
      <p className="text-sm text-gray-500 mb-6">
        Users are created automatically on first OAuth login. Local admin accounts cannot be deleted.
      </p>

      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-stoa-500/20 flex items-center justify-center text-stoa-400 text-sm font-medium">
                {u.username[0].toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-200 flex items-center gap-2">
                  {u.username}
                  {u.id === currentUser?.id && (
                    <span className="text-xs text-gray-600">(you)</span>
                  )}
                </div>
                <div className="text-xs text-gray-600">
                  {u.email || u.authProvider} · {u.lastLogin ? `last login ${new Date(u.lastLogin).toLocaleDateString()}` : 'never logged in'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                u.role === 'admin'
                  ? 'bg-stoa-500/15 text-stoa-400'
                  : 'bg-gray-800 text-gray-500'
              }`}>
                {u.role}
              </span>

              {u.id !== currentUser?.id && (
                <>
                  <button
                    onClick={() => toggleRole(u)}
                    className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-800 transition-colors"
                  >
                    {u.role === 'admin' ? 'Demote' : 'Promote'}
                  </button>
                  {u.authProvider !== 'local' && (
                    <button
                      onClick={() => deleteUser(u)}
                      className="text-xs text-red-600 hover:text-red-400 px-2 py-1 rounded hover:bg-gray-800 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}

        {users.length === 0 && (
          <p className="text-sm text-gray-600">No users yet.</p>
        )}
      </div>
    </div>
  )
}
