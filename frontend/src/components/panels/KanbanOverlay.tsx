import { useEffect, useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { kanbanApi, KanbanCard } from '../../api'

// ── Constants ─────────────────────────────────────────────────────────────────

export const STATUSES = [
  { value: 'not_started', label: 'Not Started', color: '#6b7280' },
  { value: 'in_progress', label: 'In Progress', color: '#3b82f6' },
  { value: 'on_hold',     label: 'On Hold',     color: '#f59e0b' },
  { value: 'completed',   label: 'Completed',   color: '#22c55e' },
  { value: 'cancelled',   label: 'Cancelled',   color: '#ef4444' },
]
const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.value, s]))

function statusLabel(v: string) { return STATUS_MAP[v]?.label ?? v }
function statusColor(v: string) { return STATUS_MAP[v]?.color ?? '#6b7280' }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function isOverdue(dueDate: string) {
  if (!dueDate) return false
  return dueDate < new Date().toISOString().slice(0, 10)
}

function defaultSort(a: KanbanCard, b: KanbanCard) {
  if (a.dueDate && !b.dueDate) return -1
  if (!a.dueDate && b.dueDate) return 1
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
  return a.createdAt.localeCompare(b.createdAt)
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, small }: { status: string; small?: boolean }) {
  const color = statusColor(status)
  const size = small ? 10 : 11
  return (
    <span style={{ fontSize: size, fontWeight: 600, color,
      padding: small ? '1px 5px' : '2px 7px',
      background: color + '18', borderRadius: 10,
      border: `1px solid ${color}40`, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {statusLabel(status)}
    </span>
  )
}

// ── Card modal (add/edit) ─────────────────────────────────────────────────────

function CardModal({ card, defaultStatus = 'not_started', onSave, onCancel, onDelete }: {
  card?: KanbanCard
  defaultStatus?: string
  onSave: (data: { title: string; status: string; dueDate: string; notes: string }) => Promise<void>
  onCancel: () => void
  onDelete?: () => void
}) {
  const [title, setTitle] = useState(card?.title ?? '')
  const [status, setStatus] = useState(card?.status ?? defaultStatus)
  const [dueDate, setDueDate] = useState(card?.dueDate ?? '')
  const [notes, setNotes] = useState(card?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!title.trim()) return
    setSaving(true)
    try { await onSave({ title: title.trim(), status, dueDate, notes }) }
    finally { setSaving(false) }
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCancel])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 700,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)',
        borderRadius: 12, padding: '20px 22px', width: 'min(480px, 92vw)',
        display: 'flex', flexDirection: 'column', gap: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
          {card ? 'Edit card' : 'New card'}
        </div>
        <div>
          <label className="label">Title</label>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Card title" autoFocus />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={e => setStatus(e.target.value)}
              style={{ cursor: 'pointer' }}>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">Due date <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span></label>
            <input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Notes <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span></label>
          <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)}
            rows={3} placeholder="Additional notes..." style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={submit} disabled={saving || !title.trim()}>
            {saving ? <span className="spinner" /> : card ? 'Save' : 'Add card'}
          </button>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          {card && onDelete && (
            <button className="btn btn-danger" style={{ marginLeft: 'auto' }}
              onClick={onDelete}>Delete</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── List view ─────────────────────────────────────────────────────────────────

type SortCol = 'title' | 'status' | 'dueDate' | null

function ListView({ cards, onEdit, onDelete }: {
  cards: KanbanCard[]
  onEdit: (card: KanbanCard) => void
  onDelete: (card: KanbanCard) => void
}) {
  const [filterStatuses, setFilterStatuses] = useState<string[]>([])
  const [sortCol, setSortCol] = useState<SortCol>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const toggleFilter = (v: string) =>
    setFilterStatuses(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }
  const setDir = (fn: (d: 'asc' | 'desc') => 'asc' | 'desc') =>
    setSortDir(d => fn(d))

  let displayed = filterStatuses.length > 0
    ? cards.filter(c => filterStatuses.includes(c.status))
    : [...cards]

  if (sortCol) {
    displayed.sort((a, b) => {
      const av = a[sortCol] ?? ''
      const bv = b[sortCol] ?? ''
      if (!av && bv) return sortDir === 'asc' ? 1 : -1
      if (av && !bv) return sortDir === 'asc' ? -1 : 1
      const cmp = av.localeCompare(bv)
      return sortDir === 'asc' ? cmp : -cmp
    })
  } else {
    displayed.sort(defaultSort)
  }

  const SortHeader = ({ col, label }: { col: SortCol; label: string }) => (
    <th onClick={() => handleSort(col)} style={{ textAlign: 'left', padding: '6px 8px',
      cursor: 'pointer', userSelect: 'none', fontSize: 11,
      textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
      whiteSpace: 'nowrap',
      color: sortCol === col ? 'var(--accent2)' : 'var(--text-dim)' }}>
      {label} {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
      {/* Status filter pills */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
        {STATUSES.map(s => {
          const active = filterStatuses.length === 0 || filterStatuses.includes(s.value)
          const count = cards.filter(c => c.status === s.value).length
          return (
            <button key={s.value} onClick={() => toggleFilter(s.value)}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, cursor: 'pointer',
                background: active ? s.color + '18' : 'var(--surface2)',
                border: `1px solid ${active ? s.color + '50' : 'var(--border)'}`,
                color: active ? s.color : 'var(--text-dim)',
                fontWeight: active ? 600 : 400 }}>
              {s.label} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
            </button>
          )
        })}
        {filterStatuses.length > 0 && (
          <button onClick={() => setFilterStatuses([])}
            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 10, cursor: 'pointer',
              background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
            Clear
          </button>
        )}
      </div>
      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <SortHeader col="title" label="Title" />
              <SortHeader col="status" label="Status" />
              <SortHeader col="dueDate" label="Due" />
              <th style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text-dim)',
                textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left' }}>Notes</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '20px 8px', textAlign: 'center',
                fontSize: 12, color: 'var(--text-dim)' }}>No cards</td></tr>
            )}
            {displayed.map(card => (
              <tr key={card.id} style={{ borderBottom: '1px solid var(--border)',
                cursor: 'pointer' }}
                onClick={() => onEdit(card)}
                onMouseOver={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'}
                onMouseOut={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                <td style={{ padding: '7px 8px', fontSize: 12, color: 'var(--text)', maxWidth: 240 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {card.title}
                  </div>
                </td>
                <td style={{ padding: '7px 8px' }}>
                  <StatusBadge status={card.status} small />
                </td>
                <td style={{ padding: '7px 8px', fontSize: 11, fontFamily: 'DM Mono, monospace',
                  color: isOverdue(card.dueDate ?? '') ? '#ef4444' : 'var(--text-dim)',
                  whiteSpace: 'nowrap' }}>
                  {card.dueDate ? fmtDate(card.dueDate) : '—'}
                </td>
                <td style={{ padding: '7px 8px', fontSize: 11, color: 'var(--text-dim)',
                  maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {card.notes || '—'}
                </td>
                <td style={{ padding: '7px 4px' }}>
                  <button onClick={e => { e.stopPropagation(); onDelete(card) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-dim)', fontSize: 13, padding: '2px 4px', opacity: 0.4 }}
                    onMouseOver={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--red)' }}
                    onMouseOut={e => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = 'var(--text-dim)' }}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Desktop status view (DnD) ─────────────────────────────────────────────────

function DesktopStatusView({ cards, boardId, onEdit, onCardsChange }: {
  cards: KanbanCard[]
  boardId: string
  onEdit: (card: KanbanCard) => void
  onCardsChange: (cards: KanbanCard[]) => void
}) {
  const cardsByStatus = (status: string) =>
    cards.filter(c => c.status === status).sort((a, b) => a.sortOrder - b.sortOrder)

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return
    const { source, destination } = result
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const srcId = source.droppableId
    const dstId = destination.droppableId

    // Build per-status sorted lanes
    const lanes: Record<string, KanbanCard[]> = {}
    for (const s of STATUSES) {
      lanes[s.value] = cards.filter(c => c.status === s.value)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    }

    const srcCards = [...lanes[srcId]]
    const [moved] = srcCards.splice(source.index, 1)
    const updatedCard = { ...moved, status: dstId }

    if (srcId === dstId) {
      srcCards.splice(destination.index, 0, updatedCard)
      lanes[srcId] = srcCards
    } else {
      lanes[srcId] = srcCards
      const dstCards = [...lanes[dstId]]
      dstCards.splice(destination.index, 0, updatedCard)
      lanes[dstId] = dstCards
    }

    // Rebuild flat list with new sort_orders
    const newCards: KanbanCard[] = []
    const payload: { id: string; sortOrder: number; status: string }[] = []
    for (const [status, laneCards] of Object.entries(lanes)) {
      laneCards.forEach((c, i) => {
        const updated = { ...c, status, sortOrder: i + 1 }
        newCards.push(updated)
        payload.push({ id: c.id, sortOrder: i + 1, status })
      })
    }

    onCardsChange(newCards)
    kanbanApi.reorderCards(boardId, payload).catch(() => {
      // Silently ignore - data will refresh on next load
    })
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div style={{ display: 'flex', gap: 10, height: '100%', overflow: 'auto' }}>
        {STATUSES.map(status => {
          const laneCards = cardsByStatus(status.value)
          return (
            <div key={status.value} style={{ flex: 1, minWidth: 160, display: 'flex',
              flexDirection: 'column', gap: 6 }}>
              {/* Column header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                padding: '4px 8px', borderRadius: 6,
                background: status.color + '12', borderBottom: `2px solid ${status.color}` }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: status.color,
                  textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
                  {status.label}
                </span>
                <span style={{ fontSize: 11, color: status.color + 'CC',
                  fontFamily: 'DM Mono, monospace' }}>{laneCards.length}</span>
              </div>
              {/* Droppable lane */}
              <Droppable droppableId={status.value}>
                {(provided, snapshot) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}
                    style={{ flex: 1, minHeight: 60, padding: '2px 0',
                      background: snapshot.isDraggingOver ? status.color + '08' : 'transparent',
                      borderRadius: 6, transition: 'background 0.15s',
                      overflowY: 'auto' }}>
                    {laneCards.map((card, index) => (
                      <Draggable key={card.id} draggableId={card.id} index={index}>
                        {(prov, snap) => (
                          <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}
                            style={{ ...prov.draggableProps.style,
                              marginBottom: 6, padding: '7px 8px', borderRadius: 7,
                              background: 'var(--surface)', border: `1px solid ${snap.isDragging ? status.color + '80' : 'var(--border)'}`,
                              boxShadow: snap.isDragging ? `0 4px 16px rgba(0,0,0,0.2)` : 'none',
                              cursor: 'grab', transition: snap.isDragging ? 'none' : 'border-color 0.1s' }}
                            onClick={() => !snap.isDragging && onEdit(card)}
                            onMouseOver={e => { if (!snap.isDragging) (e.currentTarget as HTMLElement).style.borderColor = status.color + '60' }}
                            onMouseOut={e => { if (!snap.isDragging) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
                            <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500,
                              overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                              {card.title}
                            </div>
                            {(card.dueDate || card.notes) && (
                              <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                {card.dueDate && (
                                  <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace',
                                    color: isOverdue(card.dueDate) ? '#ef4444' : 'var(--text-dim)' }}>
                                    {isOverdue(card.dueDate) ? '⚠ ' : ''}{fmtDate(card.dueDate)}
                                  </span>
                                )}
                                {card.notes && (
                                  <span style={{ fontSize: 10, color: 'var(--text-dim)', opacity: 0.7 }}>
                                    📝
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          )
        })}
      </div>
    </DragDropContext>
  )
}

// ── Mobile status view ────────────────────────────────────────────────────────

function MobileStatusView({ cards, onEdit, onCardsChange }: {
  cards: KanbanCard[]
  onEdit: (card: KanbanCard) => void
  onCardsChange: (cards: KanbanCard[]) => void
}) {
  const [activeLane, setActiveLane] = useState('not_started')

  const moveCard = async (card: KanbanCard, newStatus: string) => {
    const updated = cards.map(c => c.id === card.id ? { ...c, status: newStatus } : c)
    onCardsChange(updated)
    try {
      await kanbanApi.updateCard(card.id, {
        title: card.title, status: newStatus, dueDate: card.dueDate, notes: card.notes
      })
    } catch {}
  }

  const laneCards = cards.filter(c => c.status === activeLane).sort(defaultSort)
  const status = STATUS_MAP[activeLane]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
      {/* Lane picker */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
        {STATUSES.map(s => {
          const count = cards.filter(c => c.status === s.value).length
          const active = activeLane === s.value
          return (
            <button key={s.value} onClick={() => setActiveLane(s.value)}
              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 10, cursor: 'pointer',
                background: active ? s.color + '18' : 'var(--surface2)',
                border: `1px solid ${active ? s.color : 'var(--border)'}`,
                color: active ? s.color : 'var(--text-dim)',
                fontWeight: active ? 700 : 400 }}>
              {s.label} {count > 0 ? `(${count})` : ''}
            </button>
          )
        })}
      </div>
      {/* Cards in active lane */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {laneCards.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '20px 0', textAlign: 'center' }}>
            No cards in {status?.label}
          </div>
        )}
        {laneCards.map(card => (
          <div key={card.id} style={{ padding: '10px 12px', borderRadius: 8,
            background: 'var(--surface2)', border: '1px solid var(--border)',
            display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)',
                marginBottom: 2 }}>{card.title}</div>
              {card.dueDate && (
                <div style={{ fontSize: 10, color: isOverdue(card.dueDate) ? '#ef4444' : 'var(--text-dim)',
                  fontFamily: 'DM Mono, monospace' }}>
                  {isOverdue(card.dueDate) ? '⚠ ' : ''}{fmtDate(card.dueDate)}
                </div>
              )}
              {card.notes && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {card.notes}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={() => onEdit(card)}>Edit</button>
              {/* Move button */}
              <select value={activeLane}
                onChange={e => moveCard(card, e.target.value)}
                style={{ fontSize: 11, padding: '3px 6px', borderRadius: 6, cursor: 'pointer',
                  background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {STATUSES.filter(s => s.value !== activeLane).map(s => (
                  <option key={s.value} value={s.value}>→ {s.label}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main overlay ──────────────────────────────────────────────────────────────

interface OverlayState {
  boardId: string
  boardName: string
  panelTitle: string
}

export default function KanbanOverlay() {
  const [open, setOpen] = useState<OverlayState | null>(null)
  const [cards, setCards] = useState<KanbanCard[]>([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'list' | 'status'>('status')
  const [addingCard, setAddingCard] = useState(false)
  const [addLane, setAddLane] = useState('not_started')
  const [editingCard, setEditingCard] = useState<KanbanCard | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  // Mobile detection
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    setIsMobile(mq.matches)
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  // Listen for open event
  useEffect(() => {
    const handler = (e: Event) => {
      const { boardId, boardName, panelTitle } = (e as CustomEvent).detail || {}
      if (!boardId) return
      setOpen({ boardId, boardName, panelTitle: panelTitle || '' })
    }
    window.addEventListener('stoa-open-kanban-board', handler)
    return () => window.removeEventListener('stoa-open-kanban-board', handler)
  }, [])

  // Load cards when board opens
  useEffect(() => {
    if (!open) return
    setLoading(true)
    setCards([])
    kanbanApi.listCards(open.boardId)
      .then(r => setCards(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open?.boardId])

  // ESC to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && open && !addingCard && !editingCard) close() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, addingCard, editingCard])

  const close = () => { setOpen(null); setCards([]) }


  const handleAddCard = async (data: { title: string; status: string; dueDate: string; notes: string }) => {
    if (!open) return
    const r = await kanbanApi.createCard(open.boardId, data)
    setCards(prev => [...prev, r.data])
    setAddingCard(false)
  }

  const handleEditCard = async (data: { title: string; status: string; dueDate: string; notes: string }) => {
    if (!editingCard) return
    await kanbanApi.updateCard(editingCard.id, data)
    setCards(prev => prev.map(c => c.id === editingCard.id ? { ...c, ...data } : c))
    setEditingCard(null)
  }

  const handleDeleteCard = async (card: KanbanCard) => {
    if (!confirm(`Delete "${card.title}"?`)) return
    await kanbanApi.deleteCard(card.id)
    setCards(prev => prev.filter(c => c.id !== card.id))
    setEditingCard(null)
  }

  if (!open) return null

  const overlayW = isMobile ? '100vw' : 'min(96vw, 1300px)'
  const overlayH = isMobile ? '100dvh' : 'min(90vh, 820px)'

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.55)', display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center' }}
        onClick={e => { if (e.target === e.currentTarget) close() }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: isMobile ? '16px 16px 0 0' : 14,
          width: overlayW, height: overlayH,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
          overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {open.panelTitle && (
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 1 }}>{open.panelTitle}</div>
              )}
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {open.boardName}
              </div>
            </div>
            {/* View toggle */}
            <div style={{ display: 'flex', background: 'var(--surface2)',
              border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden', flexShrink: 0 }}>
              {(['list', 'status'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  style={{ padding: '4px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
                    background: view === v ? 'var(--accent-bg)' : 'transparent',
                    color: view === v ? 'var(--accent2)' : 'var(--text-dim)',
                    fontWeight: view === v ? 600 : 400 }}>
                  {v === 'list' ? 'List' : 'Board'}
                </button>
              ))}
            </div>
            {/* Add card */}
            <button className="btn btn-primary" style={{ fontSize: 12, flexShrink: 0 }}
              onClick={() => { setAddLane('not_started'); setAddingCard(true) }}>
              + Add card
            </button>
            <button onClick={close}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-dim)', fontSize: 22, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}>
              ×
            </button>
          </div>

          {/* Content */}
          <div style={{ flex: 1, minHeight: 0, padding: '12px 18px', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>
                Loading...
              </div>
            ) : view === 'list' ? (
              <ListView
                cards={cards}
                onEdit={setEditingCard}
                onDelete={handleDeleteCard}
              />
            ) : isMobile ? (
              <MobileStatusView
                cards={cards}
                onEdit={setEditingCard}
                onCardsChange={setCards}
              />
            ) : (
              <DesktopStatusView
                cards={cards}
                boardId={open.boardId}
                onEdit={setEditingCard}
                onCardsChange={setCards}
              />
            )}
          </div>
        </div>
      </div>

      {/* Add card modal */}
      {addingCard && (
        <CardModal
          defaultStatus={addLane}
          onSave={handleAddCard}
          onCancel={() => setAddingCard(false)}
        />
      )}

      {/* Edit card modal */}
      {editingCard && (
        <CardModal
          card={editingCard}
          onSave={handleEditCard}
          onCancel={() => setEditingCard(null)}
          onDelete={() => handleDeleteCard(editingCard)}
        />
      )}
    </>
  )
}
