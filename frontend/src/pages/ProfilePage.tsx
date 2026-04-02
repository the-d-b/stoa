import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { StoaLogo } from '../App'
import { panelsApi, wallsApi, myPanelsApi, myBookmarksApi, profileApi, Panel, Wall } from '../api'
import BookmarksPanel from '../components/admin/BookmarksPanel'

type Tab = 'overview' | 'bookmarks' | 'panels' | 'walls'

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
    if (t && ['overview', 'bookmarks', 'panels', 'walls'].includes(t)) setTab(t)
  }, [location.search])

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview',  label: 'Overview',    icon: '○' },
    { id: 'bookmarks', label: 'My Bookmarks', icon: '↗' },
    { id: 'panels',    label: 'Panel Order',  icon: '▤' },
    { id: 'walls',     label: 'Walls',        icon: '◧' },
  ]

  return (
    <div className="fade-up" style={{ maxWidth: 720 }}>
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
      {tab === 'walls'     && <WallsTab />}
    </div>
  )
}

// ── Overview ──────────────────────────────────────────────────────────────────

function OverviewTab() {
  const { user, setUser } = useAuth()
  const [email, setEmail] = useState(user?.email || '')
  const [editingEmail, setEditingEmail] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailSaved, setEmailSaved] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState('')

  useEffect(() => {
    profileApi.get().then(r => {
      setEmail(r.data.email || '')
      setAvatarUrl(r.data.avatarUrl || '')
    }).catch(() => {})
  }, [])

  const saveEmail = async () => {
    setSavingEmail(true)
    try {
      await profileApi.update({ email })
      if (setUser) setUser({ ...user, email } as any)
      setEditingEmail(false)
      setEmailSaved(true)
      setTimeout(() => setEmailSaved(false), 2000)
    } finally { setSavingEmail(false) }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setAvatarError('Image must be under 2MB'); return }
    setAvatarError('')
    setUploadingAvatar(true)
    try {
      const res = await profileApi.uploadAvatar(file)
      setAvatarUrl(res.data.avatarUrl + '?t=' + Date.now())
    } catch { setAvatarError('Upload failed') }
    finally { setUploadingAvatar(false) }
  }

  const initials = user?.username
    ? user.username.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Avatar */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Profile picture</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative' }}>
            {avatarUrl
              ? <img src={avatarUrl} style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', border: '2px solid var(--border)' }}
                  onError={() => setAvatarUrl('')} />
              : <div style={{
                  width: 64, height: 64, borderRadius: 12,
                  background: 'var(--accent-bg)', border: '2px solid var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, fontWeight: 600, color: 'var(--accent2)',
                }}>{initials}</div>
            }
          </div>
          <div>
            <label style={{
              display: 'inline-block', cursor: 'pointer',
              padding: '6px 14px', borderRadius: 8, fontSize: 12,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              color: 'var(--text)', transition: 'all 0.15s',
            }}>
              {uploadingAvatar ? <span className="spinner" /> : 'Upload image'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
            </label>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>JPG, PNG, GIF, WebP · max 2MB</div>
            {avatarError && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{avatarError}</div>}
          </div>
        </div>
      </div>

      {/* Email */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Email address</div>
        {editingEmail ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="input" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" style={{ flex: 1 }}
              onKeyDown={e => e.key === 'Enter' && saveEmail()} autoFocus />
            <button className="btn btn-primary" onClick={saveEmail} disabled={savingEmail}>
              {savingEmail ? <span className="spinner" /> : 'Save'}
            </button>
            <button className="btn btn-secondary" onClick={() => { setEditingEmail(false); setEmail(user?.email || '') }}>
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: email ? 'var(--text)' : 'var(--text-dim)' }}>
              {email || 'No email set'}
              {emailSaved && <span style={{ color: 'var(--green)', marginLeft: 8, fontSize: 12 }}>✓ saved</span>}
            </span>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditingEmail(true)}>Edit</button>
          </div>
        )}
      </div>

      {/* Coming soon items */}
      {[
        { title: 'Theme',       desc: 'CSS download/upload for custom themes — use color wheel for now' },
        { title: 'Date & time', desc: 'Customize how dates and times are displayed' },
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
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>coming soon</span>
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: 12 }}>
        <StoaLogo size={14} />stoa v0.0.4
      </div>
    </div>
  )
}

// ── My Bookmarks ──────────────────────────────────────────────────────────────

function BookmarksTab() {
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0, marginBottom: 20, lineHeight: 1.7 }}>
        Your personal bookmarks — only visible to you. They appear on your Home wall via your personal bookmark panel.
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
  const [newPanelType] = useState('bookmarks')
  // Personal panel wall assignment
  const [personalPanelId, setPersonalPanelId] = useState<string | null>(null)
  const [assignedWalls, setAssignedWalls] = useState<string[]>([])
  const [savingAssignment, setSavingAssignment] = useState(false)

  const loadPanels = async (wallId?: string) => {
    const wallParam = wallId && wallId !== 'home' ? wallId : undefined
    const res = await panelsApi.list(wallParam)
    let sorted = [...(res.data || [])]

    if (wallId && wallId !== 'home') {
      const wall = walls.find(w => w.id === wallId)
      if (wall) {
        const wallTagIds = new Set((wall.tags || []).filter(t => t.active).map(t => t.tagId))
        sorted = sorted.filter((p: Panel) => {
          // Personal panels only show on walls they're assigned to
          if (p.scope === 'personal') {
            const config = (() => { try { return JSON.parse(p.config || '{}') } catch { return {} } })()
            const assigned: string[] = config.assignedWalls || []
            return assigned.includes(wallId)
          }
          if (!p.tags || p.tags.length === 0) return true
          return p.tags.some((t: any) => wallTagIds.has(t.id))
        })
      }
    }
    // Personal panels always appear in Home ordering
    console.log('[ProfilePage] loadPanels wall=' + wallId + ' panels=' + sorted.length +
      ' (' + sorted.filter((p: Panel) => p.scope === 'personal').length + ' personal)')
    sorted.forEach((p: Panel) => console.log('  panel:', p.id, p.title, 'pos=' + p.position, 'scope=' + p.scope))
    setPanels(sorted)
    const personal = (res.data || []).find((p: Panel) => p.scope === 'personal')
    setHasPersonalPanel(!!personal)
    if (personal) {
      setPersonalPanelId(personal.id)
      // Load wall assignments from panel config
      try {
        const config = JSON.parse(personal.config || '{}')
        setAssignedWalls(config.assignedWalls || [])
      } catch { setAssignedWalls([]) }
    }
  }

  useEffect(() => {
    Promise.all([panelsApi.list(), wallsApi.list()]).then(([p, w]) => {
      console.log('[Profile] loaded panels:', p.data?.length, p.data?.map((x: Panel) => `${x.title}(${x.scope})`))
      const sorted = [...(p.data || [])]
      setPanels(sorted)
      setWalls(w.data || [])
      const personal = (p.data || []).find((pan: Panel) => pan.scope === 'personal')
      setHasPersonalPanel(!!personal)
      if (personal) {
        setPersonalPanelId(personal.id)
        try {
          const config = JSON.parse(personal.config || '{}')
          setAssignedWalls(config.assignedWalls || [])
        } catch { setAssignedWalls([]) }
      }
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
      const order = panels.map((p, i) => ({ panelId: p.id, position: i + 1 }))
      console.log('[ProfilePage] saving order wall=' + wallId)
      order.forEach(o => console.log('  panelId=' + o.panelId + ' position=' + o.position))
      await panelsApi.updateOrder(wallId, order)
      console.log('[ProfilePage] order saved successfully')
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  const saveWallAssignment = async () => {
    if (!personalPanelId) return
    setSavingAssignment(true)
    try {
      // Store wall assignments in panel config
      const currentConfig = (() => {
        try { return JSON.parse(panels.find(p => p.id === personalPanelId)?.config || '{}') } catch { return {} }
      })()
      const newConfig = JSON.stringify({ ...currentConfig, assignedWalls })
      await myPanelsApi.update(personalPanelId, {
        title: panels.find(p => p.id === personalPanelId)?.title || 'My Bookmarks',
        config: newConfig,
      })
    } finally { setSavingAssignment(false) }
  }

  const createPersonalPanel = async () => {
    if (!newPanelTitle.trim()) return
    if (hasPersonalPanel) {
      alert('You already have a personal bookmarks panel.')
      return
    }
    await myPanelsApi.create({ type: newPanelType, title: newPanelTitle.trim(), config: '{}' })
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
          {(['home', ...walls.map(w => w.id)] as string[]).map(wid => {
            const label = wid === 'home' ? 'Home' : walls.find(w => w.id === wid)?.name || wid
            const active = selectedWall === wid
            return (
              <button key={wid} onClick={() => handleWallSelect(wid)} style={{
                padding: '5px 14px', borderRadius: 8, cursor: 'pointer',
                background: active ? 'var(--accent-bg)' : 'var(--surface2)',
                color: active ? 'var(--accent2)' : 'var(--text-muted)',
                fontSize: 13, fontWeight: active ? 500 : 400,
                border: `1px solid ${active ? '#7c6fff30' : 'var(--border)'}`,
                transition: 'all 0.15s',
              }}>{label}</button>
            )
          })}
        </div>
      </div>

      {/* Personal panel wall assignment */}
      {hasPersonalPanel && personalPanelId && walls.length > 0 && (
        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
            Personal panel — wall visibility
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
            Your personal panel always shows on Home. Select additional walls to show it on:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {walls.map(wall => {
              const on = assignedWalls.includes(wall.id)
              return (
                <button key={wall.id} onClick={() => {
                  setAssignedWalls(prev =>
                    prev.includes(wall.id) ? prev.filter(id => id !== wall.id) : [...prev, wall.id]
                  )
                }} style={{
                  padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
                  background: on ? 'var(--accent-bg)' : 'var(--surface2)',
                  color: on ? 'var(--accent2)' : 'var(--text-muted)',
                  border: `1px solid ${on ? '#7c6fff30' : 'var(--border)'}`,
                  fontSize: 13, transition: 'all 0.15s',
                }}>{wall.name}</button>
              )
            })}
          </div>
          <button className="btn btn-secondary" style={{ fontSize: 12 }}
            onClick={saveWallAssignment} disabled={savingAssignment}>
            {savingAssignment ? <span className="spinner" /> : 'Save wall assignment'}
          </button>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Drag or use arrows to reorder. Changes apply to your view only.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {!hasPersonalPanel && (
            <button className="btn btn-secondary" style={{ fontSize: 12 }}
              onClick={() => setShowCreatePanel(s => !s)}>
              + Personal panel
            </button>
          )}
          <button className="btn btn-primary" style={{ fontSize: 12 }}
            onClick={saveOrder} disabled={saving}>
            {saving ? <span className="spinner" /> : saved ? '✓ Saved' : 'Save order'}
          </button>
        </div>
      </div>

      {showCreatePanel && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 0.5 }}>
              <label className="label">Panel type</label>
              <select className="input" style={{ cursor: 'pointer' }} disabled>
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
        </div>
      )}

      {/* Panel list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {panels.map((panel, i) => (
          <div key={panel.id} draggable
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
                background: 'none', border: 'none', cursor: 'pointer',
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

// ── Walls ─────────────────────────────────────────────────────────────────────

function WallsTab() {
  const [walls, setWalls] = useState<Wall[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  useEffect(() => {
    wallsApi.list().then(r => setWalls(r.data || [])).finally(() => setLoading(false))
  }, [])

  const handleDragStart = (i: number) => setDragging(i)
  const handleDragOver  = (e: React.DragEvent, i: number) => { e.preventDefault(); setDragOver(i) }
  const handleDrop = (i: number) => {
    if (dragging === null || dragging === i) { setDragging(null); setDragOver(null); return }
    const next = [...walls]
    const [moved] = next.splice(dragging, 1)
    next.splice(i, 0, moved)
    setWalls(next)
    setDragging(null); setDragOver(null)
  }

  const moveUp   = (i: number) => { if (i === 0) return; const n = [...walls]; [n[i-1], n[i]] = [n[i], n[i-1]]; setWalls(n) }
  const moveDown = (i: number) => { if (i === walls.length - 1) return; const n = [...walls]; [n[i], n[i+1]] = [n[i+1], n[i]]; setWalls(n) }

  const saveOrder = async () => {
    setSaving(true)
    try {
      await wallsApi.updateOrder(walls.map((w, i) => ({ wallId: w.id, position: i + 1 })))
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  const deleteWall = async (wall: Wall) => {
    if (!confirm(`Delete wall "${wall.name}"?`)) return
    await wallsApi.delete(wall.id)
    setWalls(w => w.filter(x => x.id !== wall.id))
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.7 }}>
          Drag or use arrows to reorder your walls. The Home wall always appears first.
        </p>
        <button className="btn btn-primary" style={{ fontSize: 12, flexShrink: 0, marginLeft: 16 }}
          onClick={saveOrder} disabled={saving}>
          {saving ? <span className="spinner" /> : saved ? '✓ Saved' : 'Save order'}
        </button>
      </div>

      {/* Home wall - always first, not draggable */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderRadius: 8, marginBottom: 4,
        background: 'var(--surface2)', border: '1px solid var(--border)',
        opacity: 0.6,
      }}>
        <span style={{ color: 'var(--text-dim)', fontSize: 14 }}>⠿</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Home</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>always first · all tags active</div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>fixed</span>
      </div>

      {/* User walls - draggable */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {walls.map((wall, i) => (
          <div key={wall.id} draggable
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
              <div style={{ fontSize: 13, fontWeight: 500 }}>{wall.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>
                {(wall.tags || []).filter(t => t.active).length} active tag{(wall.tags || []).filter(t => t.active).length !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <button onClick={() => moveUp(i)} disabled={i === 0} style={{
                background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer',
                color: 'var(--text-muted)', fontSize: 10, padding: '0 4px',
                opacity: i === 0 ? 0.2 : 0.6, lineHeight: 1,
              }}>▲</button>
              <button onClick={() => moveDown(i)} disabled={i === walls.length - 1} style={{
                background: 'none', border: 'none', cursor: i === walls.length - 1 ? 'default' : 'pointer',
                color: 'var(--text-muted)', fontSize: 10, padding: '0 4px',
                opacity: i === walls.length - 1 ? 0.2 : 0.6, lineHeight: 1,
              }}>▼</button>
            </div>
            <button onClick={() => deleteWall(wall)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--red)', fontSize: 11, opacity: 0.5, padding: '0 4px',
            }}
              onMouseOver={e => e.currentTarget.style.opacity = '1'}
              onMouseOut={e => e.currentTarget.style.opacity = '0.5'}>✕</button>
          </div>
        ))}
        {walls.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '24px 0' }}>
            No saved walls yet. Create one from the dashboard by filtering tags and clicking "+ Save as wall".
          </div>
        )}
      </div>
    </div>
  )
}
