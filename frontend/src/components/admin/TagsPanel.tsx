import { useEffect, useState } from 'react'
import { tagsApi, Tag } from '../../api'
import SectionHelp from './SectionHelp'

const COLORS = [
  '#7c6fff','#a78bfa','#ec4899','#f87171',
  '#fb923c','#fbbf24','#4ade80','#2dd4bf',
  '#38bdf8','#64748b',
]

export default function TagsPanel() {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editColor, setEditColor] = useState('')
  const [editName, setEditName] = useState('')
  const [search, setSearch] = useState('')

  const load = () => tagsApi.list().then(r => setTags(r.data)).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const create = async () => {
    if (!name.trim()) return
    setCreating(true)
    await tagsApi.create(name.trim(), color)
    setName(''); setShowForm(false); load()
    setCreating(false)
  }

  const remove = async (t: Tag) => {
    if (!confirm(`Delete tag "${t.name}"? This removes it from all panels and groups.`)) return
    await tagsApi.delete(t.id); load()
  }

  const saveColor = async (id: string) => {
    await tagsApi.update(id, { color: editColor, name: editName })
    setEditingId(null); load()
  }

  if (loading) return <Loading />

  return (
    <div>
      <SectionHelp storageKey="tags" title="About tags">
        Tags are how users filter what appears on their dashboard. You assign tags to panels, and users
        activate the tags they care about to show only relevant content. Tags are purely for organization
        and filtering — they don't control access. Access is managed through groups. A panel can have
        multiple tags, and a user can have multiple tags active at once.
      </SectionHelp>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter tags..." style={{ fontSize: 13, flex: 1 }} />
        <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={() => setShowForm(!showForm)}>
          + New tag
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20, padding: 20 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label className="label">Tag name</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)}
                placeholder="media, infra, work..." autoFocus
                onKeyDown={e => e.key === 'Enter' && create()} />
            </div>
            <button className="btn btn-primary" onClick={create} disabled={creating}>
              {creating ? <span className="spinner" /> : 'Create'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
          <div>
            <label className="label">Color</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          {name && (
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Preview:</span>
              <TagPill name={name} color={color} />
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {tags.filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase())).map(t => (
          <div key={t.id}>
            {editingId === t.id ? (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                padding: 12, borderRadius: 10,
                background: 'var(--surface)', border: '1px solid var(--border2)',
                minWidth: 200,
              }}>
                <input className="input" value={editName} onChange={e => setEditName(e.target.value)}
                  style={{ fontSize: 13, fontWeight: 500 }} />
                <ColorPicker value={editColor} onChange={setEditColor} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 12px' }}
                    onClick={() => saveColor(t.id)}>Save</button>
                  <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 8,
                background: t.color + '14', border: `1px solid ${t.color}30`,
                color: t.color, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
                onClick={() => { setEditingId(t.id); setEditColor(t.color); setEditName(t.name) }}
                title="Click to edit color"
              >
                <span style={{ width: 6, height: 6, borderRadius: 3, background: t.color, flexShrink: 0 }} />
                {t.name}
                <button onClick={e => { e.stopPropagation(); remove(t) }} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'inherit', opacity: 0.4, padding: '0 0 0 4px',
                  fontSize: 12, lineHeight: 1,
                }}
                  onMouseOver={e => e.currentTarget.style.opacity = '1'}
                  onMouseOut={e => e.currentTarget.style.opacity = '0.4'}
                >✕</button>
              </div>
            )}
          </div>
        ))}
        {tags.length === 0 && <Empty message="No tags yet. Tags control which users see which panels." />}
      </div>
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {COLORS.map(c => (
        <button key={c} onClick={() => onChange(c)} style={{
          width: 24, height: 24, borderRadius: 6, background: c, border: 'none',
          cursor: 'pointer', outline: value === c ? '2px solid white' : 'none',
          outlineOffset: 2, transform: value === c ? 'scale(1.15)' : 'scale(1)',
          transition: 'all 0.15s',
        }} />
      ))}
    </div>
  )
}

function TagPill({ name, color }: { name: string; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 8,
      background: color + '14', border: `1px solid ${color}30`,
      color, fontSize: 13, fontWeight: 500,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
      {name}
    </span>
  )
}

function Loading() { return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div> }
function Empty({ message }: { message: string }) {
  return <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '8px 0' }}>{message}</div>
}
