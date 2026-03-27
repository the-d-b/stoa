import { useEffect, useState } from 'react'
import { tagsApi, Tag } from '../../api'

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#64748b',
]

export default function TagsPanel() {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const load = () => {
    tagsApi.list()
      .then((res) => setTags(res.data))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const createTag = async () => {
    if (!newName.trim()) return
    setCreating(true)
    await tagsApi.create(newName.trim(), newColor)
    setNewName('')
    setNewColor(PRESET_COLORS[0])
    setShowForm(false)
    load()
    setCreating(false)
  }

  const deleteTag = async (t: Tag) => {
    if (!confirm(`Delete tag "${t.name}"? This will remove it from all groups.`)) return
    await tagsApi.delete(t.id)
    load()
  }

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">
          Tags are assigned to content and to groups. Users see content matching their group's tags.
        </p>
        <button className="btn-primary text-sm" onClick={() => setShowForm(!showForm)}>
          + New tag
        </button>
      </div>

      {showForm && (
        <div className="card mb-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="label">Tag name</label>
              <input
                className="input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. media, infra, work"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && createTag()}
              />
            </div>
            <button className="btn-primary" onClick={createTag} disabled={creating}>
              Create
            </button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>

          {/* Color picker */}
          <div className="mt-3">
            <label className="label">Color</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${newColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-110' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          {newName && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-gray-600">Preview:</span>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: newColor + '25', color: newColor }}
              >
                {newName}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm"
            style={{
              backgroundColor: t.color + '15',
              borderColor: t.color + '40',
              color: t.color,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.color }} />
            <span className="font-medium">{t.name}</span>
            <button
              onClick={() => deleteTag(t)}
              className="ml-1 opacity-50 hover:opacity-100 transition-opacity text-xs"
            >
              ✕
            </button>
          </div>
        ))}

        {tags.length === 0 && (
          <p className="text-sm text-gray-600">No tags yet. Tags are the foundation of Stoa's filtering system.</p>
        )}
      </div>
    </div>
  )
}
