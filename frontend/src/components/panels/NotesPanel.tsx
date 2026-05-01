import { useEffect, useState, useRef, useCallback } from 'react'
import { notesApi, Note, NoteActivityUser, Panel } from '../../api'

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  if (diff < 86400*7) return `${Math.floor(diff/86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month:'short', day:'numeric' })
}

function RichEditor({ value, onChange, readOnly = false }: { value: string; onChange: (v: string) => void; readOnly?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const lastVal = useRef(value)

  // Set initial HTML only once
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value
      lastVal.current = value
    }
  }, [])

  const cmd = (command: string, val?: string) => {
    if (readOnly) return
    ref.current?.focus()
    document.execCommand(command, false, val)
    if (ref.current) {
      const v = ref.current.innerHTML
      lastVal.current = v
      onChange(v)
    }
  }

  const handleInput = () => {
    if (ref.current) {
      const v = ref.current.innerHTML
      lastVal.current = v
      onChange(v)
    }
  }

  const btnStyle = (active?: boolean): React.CSSProperties => ({
    padding: '3px 7px', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600,
    background: active ? 'var(--accent-bg)' : 'var(--surface2)',
    color: active ? 'var(--accent2)' : 'var(--text-muted)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 0', borderBottom: '1px solid var(--border)',
        flexShrink: 0, flexWrap: 'wrap', opacity: readOnly ? 0.4 : 1, pointerEvents: readOnly ? 'none' : 'auto' }}>
        <button style={btnStyle()} onClick={() => cmd('bold')} title="Bold"><b>B</b></button>
        <button style={btnStyle()} onClick={() => cmd('italic')} title="Italic"><i>I</i></button>
        <button style={btnStyle()} onClick={() => cmd('underline')} title="Underline"><u>U</u></button>
        <button style={btnStyle()} onClick={() => cmd('strikeThrough')} title="Strike"><s>S</s></button>
        <div style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />
        <button style={btnStyle()} onClick={() => cmd('insertUnorderedList')} title="Bullet list">• List</button>
        <button style={btnStyle()} onClick={() => cmd('insertOrderedList')} title="Numbered list">1. List</button>
        <div style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />
        <button style={btnStyle()} onClick={() => cmd('formatBlock', 'h3')} title="Heading">H</button>
        <button style={btnStyle()} onClick={() => cmd('formatBlock', 'p')} title="Normal text">¶</button>
        <div style={{ flex: 1 }} />
        <button style={btnStyle()} onClick={() => cmd('removeFormat')} title="Clear formatting">✕ fmt</button>
      </div>
      {/* Editor */}
      <div
        ref={ref}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={handleInput}
        style={{
          flex: 1, overflowY: 'auto', padding: '12px 4px', outline: 'none',
          fontSize: 13, lineHeight: 1.6, color: 'var(--text)',
          minHeight: 200,
        }}
      />
      <style>{`
        [contenteditable] h3 { font-size: 15px; font-weight: 600; margin: 8px 0 4px; }
        [contenteditable] ul, [contenteditable] ol { padding-left: 20px; margin: 4px 0; }
        [contenteditable] li { margin: 2px 0; }
        [contenteditable] p { margin: 4px 0; }
        [contenteditable]:empty:before { content: 'Start writing...'; color: var(--text-dim); }
      `}</style>
    </div>
  )
}

function NoteOverlay({ note, onClose, onDelete, initialLockedBy }: {
  note: Note; onClose: (updated: Note) => void; onDelete: (id: string) => void
  initialLockedBy?: string | null
}) {
  const [title, setTitle] = useState(note.title || '')
  const [body, setBody] = useState(note.body || '')
  const [saved, setSaved] = useState(true)
  const [activity, setActivity] = useState<NoteActivityUser[]>([])
  // null = we own lock, string = locked by someone else, 'pending' = checking
  const [lockedBy, setLockedBy] = useState<string | null>(initialLockedBy || 'pending')
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const heartbeatTimer = useRef<ReturnType<typeof setInterval>>()
  const latestTitle = useRef(title)
  const latestBody = useRef(body)

  latestTitle.current = title
  latestBody.current = body

  const readOnly = lockedBy !== null // pending or locked-by-other both block editing

  // Acquire lock, start heartbeat, track read, load activity on open
  useEffect(() => {
    if (initialLockedBy) {
      // Already know it's locked — don't attempt to acquire
      setLockedBy(initialLockedBy)
    } else {
      notesApi.lock(note.id)
        .then(() => setLockedBy(null)) // we got the lock — null means we own it
        .catch((e: any) => {
          const status = e.response?.status
          const data = e.response?.data
          if (status === 409 && data?.error === 'locked') {
            setLockedBy(data.lockedBy || 'another user')
          } else {
            setLockedBy(null) // fail open
          }
        })
    }
    notesApi.trackRead(note.id)
    notesApi.activity(note.id).then(r => setActivity(r.data || []))

    // Heartbeat — refresh lock every 30s
    heartbeatTimer.current = setInterval(() => {
      if (!readOnly) notesApi.lock(note.id).catch(() => {})
    }, 30000)

    return () => {
      clearInterval(heartbeatTimer.current)
      notesApi.unlock(note.id).catch(() => {})
    }
  }, [note.id])

  const save = useCallback(async (t = latestTitle.current, b = latestBody.current) => {
    await notesApi.update(note.id, t, b)
    setSaved(true)
  }, [note.id])

  const schedSave = (t: string, b: string) => {
    setSaved(false)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(t, b), 800)
  }

  const handleClose = async () => {
    clearTimeout(saveTimer.current)
    clearInterval(heartbeatTimer.current)
    if (!readOnly) await save()
    await notesApi.unlock(note.id).catch(() => {})
    onClose({ ...note, title: latestTitle.current, body: latestBody.current,
      updatedAt: new Date().toISOString() })
  }

  const handleDelete = async () => {
    if (!confirm(`Delete "${title || 'Untitled'}"?`)) return
    await notesApi.delete(note.id)
    onDelete(note.id)
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 600,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) handleClose() }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
        width: 'min(820px, 94vw)', height: 'min(680px, 90vh)',
        display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        padding: '20px 24px',
      }}>
        {/* Lock banner */}
        {lockedBy === 'pending' && (
          <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, flexShrink: 0,
            background: 'var(--surface2)', border: '1px solid var(--border)',
            fontSize: 12, color: 'var(--text-dim)' }}>
            Checking availability...
          </div>
        )}
        {lockedBy && lockedBy !== 'pending' && (
          <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, flexShrink: 0,
            background: '#fef3c720', border: '1px solid #f59e0b',
            fontSize: 12, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 8 }}>
            🔒 <strong>{lockedBy}</strong> is currently editing this note. You can read but not edit.
          </div>
        )}

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexShrink: 0 }}>
          <input
            className="input"
            value={title}
            readOnly={readOnly}
            onChange={e => { if (!readOnly) { setTitle(e.target.value); schedSave(e.target.value, latestBody.current) } }}
            placeholder="Note title"
            style={{ flex: 1, fontSize: 18, fontWeight: 600, border: 'none',
              background: 'transparent', padding: '4px 0', outline: 'none',
              borderBottom: '1px solid var(--border)',
              opacity: readOnly ? 0.7 : 1, cursor: readOnly ? 'default' : 'text' }}
          />
          <span style={{ fontSize: 11, color: saved ? 'var(--green)' : 'var(--text-dim)',
            fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>
            {saved ? '✓ saved' : 'saving...'}
          </span>
          {/* Activity avatars */}
          {activity.length > 0 && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
              {activity.map(u => {
                const initials = u.username.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) || '?'
                const hasRead = !!u.lastReadAt
                const hasEdited = !!u.lastEditAt
                const tooltip = [
                  u.username,
                  u.lastEditAt ? `Edited: ${timeAgo(u.lastEditAt)}` : 'Never edited',
                  u.lastReadAt ? `Opened: ${timeAgo(u.lastReadAt)}` : 'Never opened',
                ].join('\n')
                return (
                  <div key={u.userId} title={tooltip} style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: u.avatarUrl ? 'transparent' : 'var(--surface2)',
                    border: `2px solid ${hasEdited ? 'var(--accent)' : hasRead ? 'var(--green)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', cursor: 'help',
                    opacity: hasRead ? 1 : 0.45,
                  }}>
                    {u.avatarUrl
                      ? <img src={u.avatarUrl} alt={u.username}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>{initials}</span>
                    }
                  </div>
                )
              })}
            </div>
          )}
          {!readOnly && (
            <button onClick={handleDelete} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-dim)', fontSize: 14, padding: '4px 6px', borderRadius: 5,
            }} title="Delete note">🗑</button>
          )}
          <button onClick={handleClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-dim)', fontSize: 20, lineHeight: 1, padding: '2px 4px',
          }} title="Close (Esc)">×</button>
        </div>

        {/* Rich editor */}
        <RichEditor
          value={body}
          readOnly={readOnly}
          onChange={v => { if (!readOnly) { setBody(v); schedSave(latestTitle.current, v) } }}
        />
      </div>
    </div>
  )
}

export default function NotesPanel({ panel }: { panel: Panel }) {
  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<'asc'|'desc'>(config.notesSort || 'desc')
  const [search, setSearch] = useState('')
  const [openNote, setOpenNote] = useState<Note | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [initialLockedBy, setInitialLockedBy] = useState<string | null>(null)

  const load = async (s = sort) => {
    try {
      const res = await notesApi.list(panel.id, s)
      setNotes(res.data || [])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [panel.id])

  const handleCreate = async () => {
    const res = await notesApi.create(panel.id)
    const newNote: Note = {
      id: res.data.id, panelId: panel.id, title: '', body: '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }
    setNotes(prev => sort === 'desc' ? [newNote, ...prev] : [...prev, newNote])
    setOpenNote(newNote)
  }

  const handleClose = (updated: Note) => {
    setNotes(prev => prev.map(n => n.id === updated.id ? updated : n))
    setOpenNote(null)
    setInitialLockedBy(null)
  }

  const handleDelete = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id))
    setOpenNote(null)
  }

  const toggleSort = () => {
    const next = sort === 'desc' ? 'asc' : 'desc'
    setSort(next)
    load(next)
  }

  const filtered = notes.filter(n =>
    !search || n.title.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return (
    <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 12 }}>Loading...</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '8px 12px' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search notes..." style={{ flex: 1, fontSize: 12 }} />
        <button onClick={toggleSort} title={`Sort: ${sort === 'desc' ? 'newest first' : 'oldest first'}`}
          style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
            background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-dim)',
            flexShrink: 0 }}>
          {sort === 'desc' ? '↓ newest' : '↑ oldest'}
        </button>
        <button onClick={handleCreate}
          style={{ fontSize: 18, width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
            background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          +
        </button>
      </div>

      {/* Note list */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {filtered.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '16px 0', textAlign: 'center' }}>
            {notes.length === 0 ? 'No notes yet — click + to create one' : 'No matches'}
          </div>
        )}
        {filtered.map(note => (
          <div key={note.id} onClick={async () => {
            if (openingId) return
            setOpeningId(note.id)
            try {
              const res = await notesApi.get(note.id)
              const fresh = res.data
              setInitialLockedBy(fresh.lockedByName || fresh.lockedBy || null)
              setOpenNote({ ...note, title: fresh.title, body: fresh.body })
            } catch {
              setOpenNote(note) // fallback to stale on error
              setInitialLockedBy(null)
            } finally {
              setOpeningId(null)
            }
          }}
            style={{ padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
              borderBottom: '1px solid var(--border)',
              transition: 'background 0.1s',
            }}
            onMouseOver={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'}
            onMouseOut={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 6 }}>
              {openingId === note.id
                ? <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>Opening...</span>
                : (note.title || <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Untitled</span>)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2,
              fontFamily: 'DM Mono, monospace', display: 'flex', gap: 8 }}>
              <span>modified {timeAgo(note.updatedAt)}</span>
              <span style={{ opacity: 0.5 }}>created {timeAgo(note.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Note overlay */}
      {openNote && (
        <NoteOverlay note={openNote} onClose={handleClose} onDelete={handleDelete}
          initialLockedBy={initialLockedBy} />
      )}
    </div>
  )
}
