import { useEffect, useState } from 'react'
import { groupsApi, usersApi, tagsApi, Group, User, Tag } from '../../api'

export default function GroupsPanel() {
  const [groups, setGroups] = useState<Group[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const load = async () => {
    const [g, u, t] = await Promise.all([
      groupsApi.list(),
      usersApi.list(),
      tagsApi.list(),
    ])
    setGroups(g.data)
    setUsers(u.data)
    setTags(t.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const loadGroup = async (id: string) => {
    const res = await groupsApi.get(id)
    setGroups((gs) => gs.map((g) => g.id === id ? res.data : g))
    setExpanded(id)
  }

  const createGroup = async () => {
    if (!newName.trim()) return
    setCreating(true)
    await groupsApi.create(newName.trim(), newDesc.trim())
    setNewName('')
    setNewDesc('')
    setShowForm(false)
    await load()
    setCreating(false)
  }

  const deleteGroup = async (id: string, name: string) => {
    if (!confirm(`Delete group "${name}"?`)) return
    await groupsApi.delete(id)
    load()
  }

  const toggleUser = async (groupId: string, userId: string, inGroup: boolean) => {
    if (inGroup) {
      await groupsApi.removeUser(groupId, userId)
    } else {
      await groupsApi.addUser(groupId, userId)
    }
    loadGroup(groupId)
  }

  const toggleTag = async (groupId: string, tagId: string, inGroup: boolean) => {
    if (inGroup) {
      await groupsApi.removeTag(groupId, tagId)
    } else {
      await groupsApi.addTag(groupId, tagId)
    }
    loadGroup(groupId)
  }

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">
          Groups control which tags — and therefore which content — users can see.
        </p>
        <button className="btn-primary text-sm" onClick={() => setShowForm(!showForm)}>
          + New group
        </button>
      </div>

      {showForm && (
        <div className="card mb-4 flex gap-3 items-end">
          <div className="flex-1">
            <label className="label">Name</label>
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Group name" autoFocus />
          </div>
          <div className="flex-1">
            <label className="label">Description (optional)</label>
            <input className="input" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="What is this group for?" />
          </div>
          <button className="btn-primary" onClick={createGroup} disabled={creating}>
            Create
          </button>
          <button className="btn-secondary" onClick={() => setShowForm(false)}>
            Cancel
          </button>
        </div>
      )}

      <div className="space-y-2">
        {groups.map((g) => {
          const isExpanded = expanded === g.id
          const groupData = isExpanded ? g : null

          return (
            <div key={g.id} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-800/50 transition-colors"
                onClick={() => isExpanded ? setExpanded(null) : loadGroup(g.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-stoa-500 text-xs">{isExpanded ? '▼' : '▶'}</span>
                  <span className="text-sm font-medium text-gray-200">{g.name}</span>
                  {g.description && (
                    <span className="text-xs text-gray-600">{g.description}</span>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteGroup(g.id, g.name) }}
                  className="text-xs text-red-700 hover:text-red-400 px-2 py-1 rounded hover:bg-gray-800 transition-colors"
                >
                  Delete
                </button>
              </div>

              {isExpanded && groupData && (
                <div className="px-4 pb-4 border-t border-gray-800 pt-4 grid grid-cols-2 gap-6">
                  {/* Users */}
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Users</h4>
                    <div className="space-y-1">
                      {users.map((u) => {
                        const inGroup = groupData.users?.some((gu) => gu.id === u.id) ?? false
                        return (
                          <label key={u.id} className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={inGroup}
                              onChange={() => toggleUser(g.id, u.id, inGroup)}
                              className="accent-stoa-500"
                            />
                            <span className="text-sm text-gray-400 group-hover:text-gray-200 transition-colors">
                              {u.username}
                            </span>
                            <span className="text-xs text-gray-700">{u.role}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Tag access</h4>
                    <div className="space-y-1">
                      {tags.length === 0 && (
                        <p className="text-xs text-gray-600">No tags yet. Create some in the Tags tab.</p>
                      )}
                      {tags.map((t) => {
                        const inGroup = groupData.tags?.some((gt) => gt.id === t.id) ?? false
                        return (
                          <label key={t.id} className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={inGroup}
                              onChange={() => toggleTag(g.id, t.id, inGroup)}
                              className="accent-stoa-500"
                            />
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: t.color }}
                            />
                            <span className="text-sm text-gray-400 group-hover:text-gray-200 transition-colors">
                              {t.name}
                            </span>
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

        {groups.length === 0 && (
          <p className="text-sm text-gray-600">No groups yet.</p>
        )}
      </div>
    </div>
  )
}
