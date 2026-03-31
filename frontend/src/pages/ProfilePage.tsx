import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { StoaLogo } from '../App'
import { panelsApi, wallsApi, myPanelsApi, myBookmarksApi, Panel, Wall } from '../api'
import BookmarksPanel from '../components/admin/BookmarksPanel'

type Tab = 'overview' | 'bookmarks' | 'panels'

export default function ProfilePage() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')

  const initials = user?.username
    ? user.username.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const t = params.get('tab') as Tab
    if (t && ['overview', 'bookmarks', 'panels'].includes(t)) setTab(t)
  }, [location.search])

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview',  label: 'Overview',      icon: '○' },
    { id: 'bookmarks', label: 'My Bookmarks',   icon: '↗' },
    { id: 'panels',    label: 'Panel Order',    icon: '▤' },
  ]

  return (
    <div className="fade-up" style={{ maxWidth: 720 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 12,
          background: 'var(--accent-bg)', border: '2px solid var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 600, color: 'var(--accent2)', flexShrink: 0,
        }}>{initials}</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 18, letterSpacing: '-0.01em' }}>{user?.username}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {user?.email || 'No email set'} · <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{user?.role}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <nav style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid var(--border)' }}>
        {tabs.map(t => {
          const active = tab === t.id
          return (
            <button key={t.id}
              onClick={() => { setTab(t.id); navigate(`/profile?tab=${t.id}`, { replace: true }) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', fontSize: 13, fontWeight: 500,
                background: active ? 'var(--accent-bg)' : 'transparent',
                color: active ? 'var(--accent2)' : 'var(--text-muted)',
                border: 'none', borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer', borderRadius: '8px 8px 0 0',
                transition: 'all 0.15s', marginBottom: -1,
              }}>
              <span style={{ fontSize: 11 }}>{t.icon}</span>{t.label}
            </button>
          )
        })}
      </nav>

      {tab === 'overview'  && <OverviewTab />}
      {tab === 'bookmarks' && <BookmarksTab />}
      {tab === 'panels'    && <PanelsOrderTab />}
    </div>
  )
}

// ── Overview ──────────────────────────────────────────────────────────────────

function OverviewTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[
        { title: 'Theme',           desc: 'CSS download/upload for custom themes',          done: false },
        { title: 'Email address',   desc: 'Update your email address',                       done: false },
        { title: 'Profile picture', desc: 'Upload a custom avatar',                          done: false },
        { title: 'Date & time',     desc: 'Customize how dates and times are displayed',     done: false },
      ].map(item => (
        <div key={item.title} style={{
          padding: '12px 16px', borderRadius: 10,
          background: 'var(--surface)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{item.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{item.desc}</div>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
            coming soon
          </span>
        </div>
      ))}
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: 12 }}>
        <StoaLogo size={14} />
        stoa v0.0.4
      </div>
    </div>
  )
}

// ── My Bookmarks ──────────────────────────────────────────────────────────────

function BookmarksTab() {
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0, marginBottom: 20, lineHeight: 1.7 }}>
        Your personal bookmarks — only visible to you. They appear on your Home wall
        via your personal bookmark panel (create one from the Panel Order tab).
      </p>
      <BookmarksPanel apiOverride={myBookmarksApi} />
    </div>
  )
}

// ── Panel Order ───────────────────────────────────────────────────────────────

function PanelsOrderTab() {
  const [panels, setPanels]     = useState<Panel[]>([])
  const [walls, setWalls]       = useState<Wall[]>([])
  const [selectedWall, setSelectedWall] = useState<string>('home')
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [hasPersonalPanel, setHasPersonalPanel] = useState(false)
  const [showCreatePanel, setShowCreatePanel] = useState(false)
  const [newPanelTitle, setNewPanelTitle] = useState('')
  const [newPanelType, setNewPanelType] = useState('bookmarks')

  const loadPanels = async (wallId?: string) => {
    const res = await panelsApi.list(wallId && wallId !== 'home' ? wallId : undefined)
    const sorted = (res.data || []).sort((a: Panel, b: Panel) => a.position - b.position)
    setPanels(sorted)
    setHasPersonalPanel(sorted.some((p: Panel) => p.scope === 'personal'))
  }

  useEffect(() => {
    Promise.all([panelsApi.list(), wallsApi.list()]).then(([p, w]) => {
      const sorted = (p.data || []).sort((a: Panel, b: Panel) => a.position - b.position)
      setPanels(sorted)
      setWalls(w.data || [])
      setHasPersonalPanel(sorted.some((p: Panel) => p.scope === 'personal'))
    }).finally(() => setLoading(false))
  }, [])

  const handleWallSelect = async (wallId: string) => {
    setSelectedWall(wallId)
    setLoading(true)
    await loadPanels(wallId)
    setLoading(false)
  }

  const handleDragStart = (i: number) => setDragging(i)
  const handleDragOver  = (e: React.DragEvent, i: number) => { e.preventDefault(); setDragOver(i) }
  const handleDrop = (i: number) => {
    if (dragging === null || dragging === i) { setDragging(null); setDragOver(null); return }
    const next = [...panels]
    const [moved] = next.splice(dragging, 1)
    next.splice(i, 0, moved)
    setPanels(next)
    setDragging(null); setDragOver(null)
  }

  const moveUp   = (i: number) => { if (i === 0) return; const n = [...panels]; [n[i-1], n[i]] = [n[i], n[i-1]]; setPanels(n) }
  const moveDown = (i: number) => { if (i === panels.length - 1) return; const n = [...panels]; [n[i], n[i+1]] = [n[i+1], n[i]]; setPanels(n) }

  const saveOrder = async () => {
    setSaving(true)
    try {
      const wallId = selectedWall !== 'home' ? selectedWall : null
      await panelsApi.updateOrder(wallId, panels.map((p, i) => ({ panelId: p.id, position: i })))
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  const createPersonalPanel = async () => {
    if (!newPanelTitle.trim()) return
    if (hasPersonalPanel && newPanelType === 'bookmarks') {
      alert('You already have a personal bookmarks panel. Each user can have one personal bookmark panel.')
      return
    }
    // Config marks this as personal scope so dashboard loads from /my/bookmarks
    const config = JSON.stringify({ scope: 'personal', type: newPanelType })
    await myPanelsApi.create({ type: newPanelType, title: newPanelTitle.trim(), config })
    setNewPanelTitle(''); setShowCreatePanel(false)
    await loadPanels(selectedWall)
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  return (
    <div>
      {/* Wall selector */}
      <div style={{ marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 10 }}>Ordering for wall</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => handleWallSelect('home')} style={{
            padding: '5px 14px', borderRadius: 8, cursor: 'pointer',
            background: selectedWall === 'home' ? 'var(--accent-bg)' : 'var(--surface2)',
            color: selectedWall === 'home' ? 'var(--accent2)' : 'var(--text-muted)',
            fontSize: 13, fontWeight: selectedWall === 'home' ? 500 : 400,
            border: selectedWall === 'home' ? '1px solid #7c6fff30' : '1px solid var(--border)',
            transition: 'all 0.15s',
          } as any}>Home</button>
          {walls.map(wall => (
            <button key={wall.id} onClick={() => handleWallSelect(wall.id)} style={{
              padding: '5px 14px', borderRadius: 8, cursor: 'pointer',
              background: selectedWall === wall.id ? 'var(--accent-bg)' : 'var(--surface2)',
              color: selectedWall === wall.id ? 'var(--accent2)' : 'var(--text-muted)',
              fontSize: 13, fontWeight: selectedWall === wall.id ? 500 : 400,
              border: selectedWall === wall.id ? '1px solid #7c6fff30' : '1px solid var(--border)',
              transition: 'all 0.15s',
            } as any}>{wall.name}</button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Drag or use arrows to reorder. Changes apply to your view only.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" style={{ fontSize: 12 }}
            onClick={() => setShowCreatePanel(s => !s)}>
            + Personal panel
          </button>
          <button className="btn btn-primary" style={{ fontSize: 12 }}
            onClick={saveOrder} disabled={saving}>
            {saving ? <span className="spinner" /> : saved ? '✓ Saved' : 'Save order'}
          </button>
        </div>
      </div>

      {/* Create personal panel form */}
      {showCreatePanel && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 0.5 }}>
              <label className="label">Panel type</label>
              <select className="input" value={newPanelType}
                onChange={e => setNewPanelType(e.target.value)}
                style={{ cursor: 'pointer' }}>
                <option value="bookmarks">Bookmarks</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Panel title</label>
              <input className="input" value={newPanelTitle}
                onChange={e => setNewPanelTitle(e.target.value)}
                placeholder="e.g. My Links"
                onKeyDown={e => e.key === 'Enter' && createPersonalPanel()} />
            </div>
            <button className="btn btn-primary" onClick={createPersonalPanel}>Create</button>
            <button className="btn btn-secondary" onClick={() => setShowCreatePanel(false)}>Cancel</button>
          </div>
          {hasPersonalPanel && newPanelType === 'bookmarks' && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--amber)' }}>
              ⚠ You already have a personal bookmarks panel. Creating another will be blocked.
            </div>
          )}
        </div>
      )}

      {/* Panel list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {panels.map((panel, i) => (
          <div key={panel.id}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={e => handleDragOver(e, i)}
            onDrop={() => handleDrop(i)}
            onDragEnd={() => { setDragging(null); setDragOver(null) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 8, cursor: 'grab',
              background: dragOver === i ? 'var(--accent-bg)' : 'var(--surface)',
              border: `1px solid ${dragOver === i ? 'var(--accent)' : 'var(--border)'}`,
              transition: 'all 0.1s', opacity: dragging === i ? 0.4 : 1,
            }}>
            <span style={{ color: 'var(--text-dim)', fontSize: 14, userSelect: 'none' }}>⠿</span>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{panel.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1, fontFamily: 'DM Mono, monospace' }}>
                {panel.scope === 'personal' ? 'personal' : 'shared'} · {panel.type}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 3 }}>
              {(panel.tags || []).map(t => (
                <span key={t.id} style={{ width: 6, height: 6, borderRadius: '50%', background: t.color }} title={t.name} />
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <button onClick={() => moveUp(i)} disabled={i === 0} style={{
                background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer',
                color: 'var(--text-muted)', fontSize: 10, padding: '0 4px',
                opacity: i === 0 ? 0.2 : 0.6, lineHeight: 1,
              }}>▲</button>
              <button onClick={() => moveDown(i)} disabled={i === panels.length - 1} style={{
                background: 'none', border: 'none', cursor: i === panels.length - 1 ? 'default' : 'pointer',
                color: 'var(--text-muted)', fontSize: 10, padding: '0 4px',
                opacity: i === panels.length - 1 ? 0.2 : 0.6, lineHeight: 1,
              }}>▼</button>
            </div>

            {panel.scope === 'personal' && (
              <button onClick={async () => {
                if (!confirm(`Delete "${panel.title}"?`)) return
                await myPanelsApi.delete(panel.id)
                await loadPanels(selectedWall)
              }} style={{
                background: 'none', cursor: 'pointer',
                color: 'var(--red)', fontSize: 11, opacity: 0.5, padding: '0 4px',
              }}
                onMouseOver={e => e.currentTarget.style.opacity = '1'}
                onMouseOut={e => e.currentTarget.style.opacity = '0.5'}>✕</button>
            )}
          </div>
        ))}
        {panels.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '24px 0' }}>No panels visible on this wall.</div>
        )}
      </div>
    </div>
  )
}
