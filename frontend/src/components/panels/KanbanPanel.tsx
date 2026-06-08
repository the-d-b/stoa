import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, kanbanApi, KanbanBoard, Panel } from '../../api'

interface KanbanPanelData {
  panelId: string
  boards: KanbanBoard[]
  cards: any[]
}

const STATUS_COLOR: Record<string, string> = {
  not_started: '#6b7280',
  in_progress: '#3b82f6',
  on_hold:     '#f59e0b',
  completed:   '#22c55e',
  cancelled:   '#ef4444',
}

function countByStatus(cards: any[], boardId: string) {
  const bCards = cards.filter(c => c.boardId === boardId)
  const inProgress = bCards.filter(c => c.status === 'in_progress').length
  const notStarted = bCards.filter(c => c.status === 'not_started').length
  return { inProgress, notStarted, total: bCards.length }
}

export default function KanbanPanel({ panel }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<KanbanPanelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [addingBoard, setAddingBoard] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await integrationsApi.getPanelData(panel.id)
      setData(r.data)
    } catch {}
    finally { setLoading(false) }
  }, [panel.id])

  useEffect(() => { load() }, [load])

  const openBoard = (board: KanbanBoard) => {
    window.dispatchEvent(new CustomEvent('stoa-open-kanban-board', {
      detail: { boardId: board.id, boardName: board.name, panelTitle: panel.title }
    }))
  }

  const createBoard = async () => {
    if (!newBoardName.trim()) return
    setSaving(true)
    try {
      await kanbanApi.createBoard(panel.id, newBoardName.trim())
      setNewBoardName(''); setAddingBoard(false)
      await load()
    } finally { setSaving(false) }
  }

  const deleteBoard = async (board: KanbanBoard, e: React.MouseEvent) => {
    e.stopPropagation()
    const msg = board.cardCount > 0
      ? `Delete "${board.name}" and its ${board.cardCount} card${board.cardCount !== 1 ? 's' : ''}? This cannot be undone.`
      : `Delete "${board.name}"?`
    if (!confirm(msg)) return
    setDeletingId(board.id)
    try { await kanbanApi.deleteBoard(board.id); await load() }
    finally { setDeletingId(null) }
  }

  if (loading) return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>Loading...</div>

  const boards = data?.boards ?? []
  const cards = data?.cards ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '8px 12px', gap: 6 }}>
      {/* Board list */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {boards.length === 0 && !addingBoard && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '12px 0', textAlign: 'center' }}>
            No boards yet — click + to create one
          </div>
        )}
        {boards.map(board => {
          const { inProgress, notStarted, total } = countByStatus(cards, board.id)
          return (
            <div key={board.id} onClick={() => openBoard(board)}
              style={{ display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                border: '1px solid var(--border)', background: 'var(--surface2)',
                transition: 'border-color 0.15s',
                opacity: deletingId === board.id ? 0.4 : 1 }}
              onMouseOver={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'}
              onMouseOut={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}>
              {/* Status mini-dots */}
              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                {inProgress > 0 && (
                  <div style={{ width: 6, height: 6, borderRadius: '50%',
                    background: STATUS_COLOR.in_progress }} title={`${inProgress} in progress`} />
                )}
                {notStarted > 0 && (
                  <div style={{ width: 6, height: 6, borderRadius: '50%',
                    background: STATUS_COLOR.not_started }} title={`${notStarted} not started`} />
                )}
                {board.overdue > 0 && (
                  <div style={{ width: 6, height: 6, borderRadius: '50%',
                    background: STATUS_COLOR.cancelled }} title={`${board.overdue} overdue`} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {board.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
                  {total} card{total !== 1 ? 's' : ''}
                  {board.dueSoon > 0 && (
                    <span style={{ color: '#f59e0b', marginLeft: 6 }}>
                      {board.dueSoon} due soon
                    </span>
                  )}
                  {board.overdue > 0 && (
                    <span style={{ color: STATUS_COLOR.cancelled, marginLeft: 6 }}>
                      {board.overdue} overdue
                    </span>
                  )}
                </div>
              </div>
              <button onClick={e => deleteBoard(board, e)}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-dim)', fontSize: 13, padding: '2px 4px', opacity: 0.4,
                  flexShrink: 0 }}
                onMouseOver={e => { e.stopPropagation(); e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--red)' }}
                onMouseOut={e => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = 'var(--text-dim)' }}>
                ✕
              </button>
            </div>
          )
        })}
      </div>

      {/* Add board form */}
      {addingBoard ? (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <input className="input" value={newBoardName}
            onChange={e => setNewBoardName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createBoard(); if (e.key === 'Escape') { setAddingBoard(false); setNewBoardName('') } }}
            placeholder="Board name" style={{ flex: 1, fontSize: 12 }} autoFocus />
          <button className="btn btn-primary" style={{ fontSize: 12 }}
            disabled={saving || !newBoardName.trim()} onClick={createBoard}>
            {saving ? <span className="spinner" /> : 'Add'}
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 12 }}
            onClick={() => { setAddingBoard(false); setNewBoardName('') }}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setAddingBoard(true)}
          style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed var(--border)',
            borderRadius: 6, color: 'var(--text-dim)', fontSize: 12, padding: '4px 12px',
            cursor: 'pointer', flexShrink: 0 }}
          onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
          + New board
        </button>
      )}
    </div>
  )
}
