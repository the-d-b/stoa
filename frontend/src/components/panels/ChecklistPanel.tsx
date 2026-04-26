import { useEffect, useState, useRef } from 'react'
import { checklistApi, ChecklistItem, Panel } from '../../api'

function fmtDate(d: string) {
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function isOverdue(dueDate?: string) {
  if (!dueDate) return false
  return new Date(dueDate + 'T00:00:00') < new Date(new Date().toDateString())
}

function isDueToday(dueDate?: string) {
  if (!dueDate) return false
  return dueDate === new Date().toISOString().slice(0, 10)
}

function isDueSoon(dueDate?: string) {
  if (!dueDate) return false
  const due = new Date(dueDate + 'T00:00:00')
  const today = new Date(new Date().toDateString())
  const diff = (due.getTime() - today.getTime()) / 86400000
  return diff >= 0 && diff <= 3
}

export default function ChecklistPanel({ panel }: { panel: Panel }) {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [showCompleted, setShowCompleted] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newText, setNewText] = useState('')
  const [newDue, setNewDue] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editDue, setEditDue] = useState('')
  const [loading, setLoading] = useState(true)
  const addInputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    try {
      const res = await checklistApi.list(panel.id)
      setItems(res.data || [])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [panel.id])
  useEffect(() => { if (adding) addInputRef.current?.focus() }, [adding])

  const handleAdd = async () => {
    if (!newText.trim()) return
    // Optimistic: add temp item immediately
    const tempId = '__tmp__' + Date.now()
    const tempItem: ChecklistItem = {
      id: tempId, panelId: panel.id, text: newText.trim(),
      dueDate: newDue || undefined, completed: false,
      createdAt: new Date().toISOString(),
    }
    setItems(prev => [...prev, tempItem])
    setNewText(''); setNewDue(''); setAdding(false)
    try {
      const res = await checklistApi.create(panel.id, tempItem.text, tempItem.dueDate)
      // Replace temp with real ID from server
      setItems(prev => prev.map(i => i.id === tempId ? { ...i, id: res.data.id } : i))
    } catch {
      // Rollback on failure
      setItems(prev => prev.filter(i => i.id !== tempId))
    }
  }

  const handleToggle = async (item: ChecklistItem) => {
    // Optimistic: flip immediately
    setItems(prev => prev.map(i => i.id === item.id
      ? { ...i, completed: !item.completed, completedAt: !item.completed ? new Date().toISOString() : undefined }
      : i))
    try {
      await checklistApi.toggle(item.id, !item.completed)
    } catch {
      // Rollback
      setItems(prev => prev.map(i => i.id === item.id ? item : i))
    }
  }

  const handleDelete = async (id: string) => {
    const prev = items
    setItems(items.filter(i => i.id !== id))
    try {
      await checklistApi.delete(id)
    } catch {
      setItems(prev)
    }
  }

  const startEdit = (item: ChecklistItem) => {
    setEditingId(item.id)
    setEditText(item.text)
    setEditDue(item.dueDate || '')
  }

  const handleSaveEdit = async () => {
    if (!editText.trim() || !editingId) return
    const original = items.find(i => i.id === editingId)
    // Optimistic: update text immediately
    setItems(prev => prev.map(i => i.id === editingId
      ? { ...i, text: editText.trim(), dueDate: editDue || undefined }
      : i))
    setEditingId(null)
    try {
      await checklistApi.update(editingId, editText.trim(), editDue || undefined)
    } catch {
      // Rollback
      if (original) setItems(prev => prev.map(i => i.id === editingId ? original : i))
    }
  }

  const incomplete = items.filter(i => !i.completed)
  const completed  = items.filter(i => i.completed)
  const visible = showCompleted ? [...incomplete, ...completed] : incomplete

  if (loading) return (
    <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 12 }}>Loading...</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '8px 12px', gap: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {completed.length > 0 && (
            <button onClick={() => setShowCompleted(v => !v)} style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 8, cursor: 'pointer',
              background: showCompleted ? 'var(--accent-bg)' : 'var(--surface2)',
              color: showCompleted ? 'var(--accent2)' : 'var(--text-dim)',
              border: `1px solid ${showCompleted ? 'var(--accent)' : 'var(--border)'}`,
            }}>
              {showCompleted ? 'Hide' : 'Show'} {completed.length} done
            </button>
          )}
        </div>
        <button onClick={() => setAdding(v => !v)} style={{
          fontSize: 18, lineHeight: 1, width: 26, height: 26, borderRadius: 6,
          cursor: 'pointer', background: adding ? 'var(--accent-bg)' : 'var(--surface2)',
          color: adding ? 'var(--accent2)' : 'var(--text-dim)',
          border: `1px solid ${adding ? 'var(--accent)' : 'var(--border)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>+</button>
      </div>

      {/* Add form */}
      {adding && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10,
          padding: '8px', background: 'var(--surface2)', borderRadius: 8,
          border: '1px solid var(--border)', flexShrink: 0 }}>
          <input ref={addInputRef} className="input" value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder="Item description..."
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
            style={{ fontSize: 12 }} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>Due:</span>
            <input type="date" className="input" value={newDue}
              onChange={e => setNewDue(e.target.value)}
              style={{ fontSize: 11, flex: 1 }} />
            <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={handleAdd}>Add</button>
            <button className="btn btn-ghost" style={{ fontSize: 11 }}
              onClick={() => { setAdding(false); setNewText(''); setNewDue('') }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Item list */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {visible.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '16px 0', textAlign: 'center' }}>
            {items.length === 0 ? 'No items yet — click + to add one' : 'Nothing to show'}
          </div>
        )}
        {visible.map(item => {
          const overdue = !item.completed && isOverdue(item.dueDate)
          const today   = !item.completed && isDueToday(item.dueDate)
          const soon    = !item.completed && isDueSoon(item.dueDate)
          const editing = editingId === item.id

          return (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '6px 4px', borderBottom: '1px solid var(--border)',
              opacity: item.completed ? 0.5 : 1,
            }}>
              {/* Checkbox */}
              <button onClick={() => handleToggle(item)} style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 2,
                cursor: 'pointer', border: `2px solid ${item.completed ? 'var(--green)' : 'var(--border)'}`,
                background: item.completed ? 'var(--green)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {item.completed && <span style={{ color: 'white', fontSize: 10, lineHeight: 1 }}>✓</span>}
              </button>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {editing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input className="input" value={editText} onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingId(null) }}
                      autoFocus style={{ fontSize: 12 }} />
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Due:</span>
                      <input type="date" className="input" value={editDue}
                        onChange={e => setEditDue(e.target.value)} style={{ fontSize: 11, flex: 1 }} />
                      <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={handleSaveEdit}>Save</button>
                      <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{
                      fontSize: 13, color: item.completed ? 'var(--text-dim)' : 'var(--text)',
                      textDecoration: item.completed ? 'line-through' : 'none',
                      wordBreak: 'break-word', lineHeight: 1.4,
                    }}>{item.text}</div>
                    {item.dueDate && (
                      <div style={{ fontSize: 10, marginTop: 2, fontFamily: 'DM Mono, monospace',
                        color: overdue ? 'var(--red)' : today ? 'var(--amber)' : soon ? '#f59e0b' : 'var(--text-dim)',
                        fontWeight: overdue || today ? 600 : 400,
                      }}>
                        {overdue ? '⚠ Overdue · ' : today ? '· Due today · ' : '· Due '}
                        {fmtDate(item.dueDate)}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Actions */}
              {!editing && (
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => startEdit(item)} style={{
                    fontSize: 11, cursor: 'pointer', background: 'none', border: 'none',
                    color: 'var(--text-dim)', padding: '1px 4px', borderRadius: 4,
                  }} title="Edit">✎</button>
                  <button onClick={() => handleDelete(item.id)} style={{
                    fontSize: 11, cursor: 'pointer', background: 'none', border: 'none',
                    color: 'var(--text-dim)', padding: '1px 4px', borderRadius: 4,
                  }} title="Delete">✕</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
