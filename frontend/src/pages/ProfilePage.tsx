import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { StoaLogo } from '../App'
import { panelsApi, porticosApi, myPanelsApi, myBookmarksApi, profileApi, preferencesApi, secretsApi, glyphsApi, Glyph, Secret, Panel, Wall } from '../api'
import BookmarksPanel from '../components/admin/BookmarksPanel'

type Tab = 'overview' | 'bookmarks' | 'panels' | 'porticos' | 'secrets' | 'glyphs'

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
    if (t && ['overview', 'bookmarks', 'panels', 'porticos'].includes(t)) setTab(t)
  }, [location.search])

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview',  label: 'Overview',    icon: '○' },
    { id: 'bookmarks', label: 'My Bookmarks', icon: '↗' },
    { id: 'panels',    label: 'Panel Order',  icon: '▤' },
    { id: 'porticos',  label: 'Porticos',     icon: '◧' },
    { id: 'secrets',   label: 'Secrets',      icon: '🔑' },
    { id: 'glyphs',    label: 'Glyphs',       icon: '◈' },
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
      {tab === 'porticos'  && <WallsTab />}
      {tab === 'secrets'   && <SecretsTab />}
      {tab === 'glyphs'    && <GlyphsTab />}
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

      {/* Density setting */}
      <DensityPicker />

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
        <StoaLogo size={14} />stoa v0.0.5
      </div>
    </div>
  )
}

// ── My Bookmarks ──────────────────────────────────────────────────────────────

function BookmarksTab() {
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0, marginBottom: 20, lineHeight: 1.7 }}>
        Your personal bookmarks — only visible to you. They appear on your Home portico via your personal bookmark panel.
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
  // Personal panel portico assignment
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
      // Load portico assignments from panel config
      try {
        const config = JSON.parse(personal.config || '{}')
        setAssignedWalls(config.assignedWalls || [])
      } catch { setAssignedWalls([]) }
    }
  }

  useEffect(() => {
    Promise.all([panelsApi.list(), porticosApi.list()]).then(([p, w]) => {
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
      // Store portico assignments in panel config
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
        <div className="section-title" style={{ marginBottom: 10 }}>Ordering for portico</div>
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

      {/* Personal panel portico assignment */}
      {hasPersonalPanel && personalPanelId && walls.length > 0 && (
        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
            Personal panel — portico visibility
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
            Your personal panel always shows on Home. Select additional porticos to show it on:
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
            {savingAssignment ? <span className="spinner" /> : 'Save portico assignment'}
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
    porticosApi.list().then(r => setWalls(r.data || [])).finally(() => setLoading(false))
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
      await porticosApi.updateOrder(walls.map((w, i) => ({ porticoId: w.id, position: i + 1 })))
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  const deleteWall = async (wall: Wall) => {
    if (!confirm(`Delete portico "${wall.name}"?`)) return
    await porticosApi.delete(wall.id)
    setWalls(w => w.filter(x => x.id !== wall.id))
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.7 }}>
          Drag or use arrows to reorder your porticos. The Home portico always appears first.
        </p>
        <button className="btn btn-primary" style={{ fontSize: 12, flexShrink: 0, marginLeft: 16 }}
          onClick={saveOrder} disabled={saving}>
          {saving ? <span className="spinner" /> : saved ? '✓ Saved' : 'Save order'}
        </button>
      </div>

      {/* Home portico - always first, not draggable */}
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
            {/* Layout controls */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                value={wall.layout || 'columns'}
                onChange={async e => {
                  await porticosApi.update(wall.id, { layout: e.target.value })
                  const updated = await porticosApi.list()
                  setWalls(updated.data || [])
                }}
                style={{
                  fontSize: 11, padding: '2px 6px', borderRadius: 5,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', cursor: 'pointer',
                }}>
                <option value="columns">Columns</option>
                <option value="flow">Flow</option>
              </select>
              {wall.layout !== 'flow' && (
                <select
                  value={wall.columnCount || 3}
                  onChange={async e => {
                    await porticosApi.update(wall.id, { columnCount: Number(e.target.value) })
                    const updated = await porticosApi.list()
                    setWalls(updated.data || [])
                  }}
                  style={{
                    fontSize: 11, padding: '2px 6px', borderRadius: 5,
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                    color: 'var(--text-muted)', cursor: 'pointer',
                  }}>
                  {[2,3,4,5,6].map(n => <option key={n} value={n}>{n} cols</option>)}
                </select>
              )}
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
            No saved porticos yet. Create one from the dashboard by filtering tags and clicking "+ Save as wall".
          </div>
        )}
      </div>
    </div>
  )
}

// ── Secrets ───────────────────────────────────────────────────────────────────

function SecretsTab() {
  const [shared, setShared] = useState<Secret[]>([])
  const [personal, setPersonal] = useState<Secret[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<{ id: string; name: string; value: string } | null>(null)

  const load = async () => {
    const res = await secretsApi.list()
    setShared((res.data || []).filter((s: Secret) => s.scope === 'shared'))
    setPersonal((res.data || []).filter((s: Secret) => s.scope === 'personal'))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!newName.trim() || !newValue.trim()) return
    setCreating(true)
    try {
      await secretsApi.create({ name: newName.trim(), value: newValue.trim(), scope: 'personal' })
      setNewName(''); setNewValue(''); setShowForm(false)
      await load()
    } finally { setCreating(false) }
  }

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete secret "${name}"?`)) return
    await secretsApi.delete(id); await load()
  }

  const saveEdit = async () => {
    if (!editing) return
    await secretsApi.update(editing.id, { name: editing.name, value: editing.value || undefined })
    setEditing(null); await load()
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  return (
    <div>
      {/* Shared secrets accessible to this user — read-only view */}
      {shared.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div className="section-title" style={{ marginBottom: 10 }}>Shared secrets you can use</div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 12, lineHeight: 1.6 }}>
            These are managed by your admin and shared with your groups. Values are not visible.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {shared.map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 8,
                background: 'var(--surface)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12 }}>🔑</span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</span>
                </div>
                <span style={{
                  fontFamily: 'DM Mono, monospace', fontSize: 12,
                  color: 'var(--text-dim)', letterSpacing: '0.15em',
                }}>••••••••</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Personal secrets */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div className="section-title">My personal secrets</div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
            Only visible to you. Use these in your personal glyphs and tickers.
          </p>
        </div>
        <button className="btn btn-primary" style={{ fontSize: 12, flexShrink: 0, marginLeft: 16 }}
          onClick={() => setShowForm(f => !f)}>+ New</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label className="label">Name</label>
              <input className="input" value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="e.g. My Alpha Vantage Key" autoFocus />
            </div>
            <div>
              <label className="label">Value</label>
              <input type="password" className="input" value={newValue}
                onChange={e => setNewValue(e.target.value)} placeholder="Paste your API key"
                onKeyDown={e => e.key === 'Enter' && create()} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={create} disabled={creating}>
                {creating ? <span className="spinner" /> : 'Create'}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {personal.map(s => (
          <div key={s.id} style={{
            background: 'var(--surface)', border: `1px solid ${editing?.id === s.id ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 8, padding: '10px 14px',
          }}>
            {editing?.id === s.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input className="input" value={editing.name}
                  onChange={e => setEditing(ed => ed ? { ...ed, name: e.target.value } : null)}
                  style={{ fontSize: 13 }} autoFocus />
                <input type="password" className="input" value={editing.value}
                  onChange={e => setEditing(ed => ed ? { ...ed, value: e.target.value } : null)}
                  placeholder="New value (blank = keep current)" style={{ fontSize: 13 }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={saveEdit}>Save</button>
                  <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12 }}>🔑</span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.15em' }}>••••••••</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }}
                    onClick={() => setEditing({ id: s.id, name: s.name, value: '' })}>Edit</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)' }}
                    onClick={() => remove(s.id, s.name)}>Delete</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {personal.length === 0 && !showForm && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '16px 0' }}>
            No personal secrets yet.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Glyphs ────────────────────────────────────────────────────────────────────

const GLYPH_TYPES = [
  { id: 'clock',   label: 'Clock',   desc: 'Time and date display',          needsSecret: false },
  { id: 'weather', label: 'Weather', desc: 'Current conditions (OpenWeatherMap)', needsSecret: true  },
]

const ZONES = [
  { id: 'header-left',    label: 'Header left' },
  { id: 'header-right',   label: 'Header right' },
  { id: 'footer-left',    label: 'Footer left' },
  { id: 'footer-center',  label: 'Footer center' },
  { id: 'footer-right',   label: 'Footer right' },
]

function GlyphsTab() {
  const [glyphs, setGlyphs] = useState<Glyph[]>([])
  const [secrets, setSecrets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newType, setNewType] = useState('clock')
  const [newZone, setNewZone] = useState('header-right')
  const [creating, setCreating] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const load = async () => {
    const [g, s] = await Promise.all([glyphsApi.list(), secretsApi.list()])
    setGlyphs(g.data || [])
    setSecrets(s.data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    setCreating(true)
    try {
      const defaultConfig = newType === 'clock'
        ? JSON.stringify({ format: '12h', showSeconds: false, showDate: true })
        : JSON.stringify({ zip: '', country: 'US', units: 'imperial', refreshSecs: 1800, secretId: '' })
      await glyphsApi.create({ type: newType, zone: newZone, config: defaultConfig })
      setShowForm(false); await load()
    } finally { setCreating(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this glyph?')) return
    await glyphsApi.delete(id); await load()
  }

  const toggleEnabled = async (g: Glyph) => {
    await glyphsApi.update(g.id, { enabled: !g.enabled }); await load()
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.7, maxWidth: 460 }}>
          Glyphs appear in the header and footer. Each user configures their own.
        </p>
        <button className="btn btn-primary" style={{ flexShrink: 0, marginLeft: 16 }}
          onClick={() => setShowForm(f => !f)}>+ Add glyph</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="label">Type</label>
              <select className="input" value={newType} onChange={e => setNewType(e.target.value)} style={{ cursor: 'pointer' }}>
                {GLYPH_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Zone</label>
              <select className="input" value={newZone} onChange={e => setNewZone(e.target.value)} style={{ cursor: 'pointer' }}>
                {ZONES.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={create} disabled={creating}>
              {creating ? <span className="spinner" /> : 'Add'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 10 }}>
            {GLYPH_TYPES.find(t => t.id === newType)?.desc}
            {GLYPH_TYPES.find(t => t.id === newType)?.needsSecret && ' · Requires an API key secret'}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {glyphs.map(g => (
          <GlyphRow key={g.id} glyph={g} secrets={secrets}
            editing={editId === g.id}
            onEdit={() => setEditId(editId === g.id ? null : g.id)}
            onToggle={() => toggleEnabled(g)}
            onDelete={() => remove(g.id)}
            onSave={async (config) => {
              await glyphsApi.update(g.id, { config, zone: g.zone })
              setEditId(null); await load()
            }}
            onZoneChange={async (zone) => {
              await glyphsApi.update(g.id, { zone, config: g.config })
              await load()
            }}
          />
        ))}
        {glyphs.length === 0 && !showForm && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '24px 0' }}>
            No glyphs yet. Add a clock to get started.
          </div>
        )}
      </div>
    </div>
  )
}

function GlyphRow({ glyph, secrets, editing, onEdit, onToggle, onDelete, onSave, onZoneChange }: {
  glyph: Glyph; secrets: any[]; editing: boolean
  onEdit: () => void; onToggle: () => void; onDelete: () => void
  onSave: (config: string) => void; onZoneChange: (zone: string) => void
}) {
  const config = (() => { try { return JSON.parse(glyph.config) } catch { return {} } })()
  const [localConfig, setLocalConfig] = useState(config)
  const typeDef = GLYPH_TYPES.find(t => t.id === glyph.type)
  const zoneDef = ZONES.find(z => z.id === glyph.zone)

  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${editing ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 10, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{typeDef?.label ?? glyph.type}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{zoneDef?.label ?? glyph.zone}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Enabled toggle */}
          <button onClick={onToggle} style={{
            fontSize: 11, padding: '2px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: glyph.enabled ? 'var(--accent-bg)' : 'var(--surface2)',
            color: glyph.enabled ? 'var(--accent2)' : 'var(--text-dim)',
          }}>{glyph.enabled ? 'On' : 'Off'}</button>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onEdit}>Configure</button>
          <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--red)' }} onClick={onDelete}>Delete</button>
        </div>
      </div>

      {editing && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Zone picker */}
            <div>
              <label className="label">Zone</label>
              <select className="input" value={glyph.zone}
                onChange={e => onZoneChange(e.target.value)} style={{ cursor: 'pointer' }}>
                {ZONES.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
              </select>
            </div>

            {/* Clock config */}
            {glyph.type === 'clock' && (
              <>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label className="label">Format</label>
                    <select className="input" value={localConfig.format || '12h'}
                      onChange={e => setLocalConfig((c: any) => ({ ...c, format: e.target.value }))}
                      style={{ cursor: 'pointer' }}>
                      <option value="12h">12-hour</option>
                      <option value="24h">24-hour</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="label">Show seconds</label>
                    <select className="input" value={localConfig.showSeconds ? 'yes' : 'no'}
                      onChange={e => setLocalConfig((c: any) => ({ ...c, showSeconds: e.target.value === 'yes' }))}
                      style={{ cursor: 'pointer' }}>
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="label">Show date</label>
                    <select className="input" value={localConfig.showDate !== false ? 'yes' : 'no'}
                      onChange={e => setLocalConfig((c: any) => ({ ...c, showDate: e.target.value === 'yes' }))}
                      style={{ cursor: 'pointer' }}>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Weather config */}
            {glyph.type === 'weather' && (
              <>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label className="label">ZIP code</label>
                    <input className="input" value={localConfig.zip || ''}
                      onChange={e => setLocalConfig((c: any) => ({ ...c, zip: e.target.value }))}
                      placeholder="e.g. 80918" />
                  </div>
                  <div>
                    <label className="label">Country</label>
                    <input className="input" value={localConfig.country || 'US'}
                      onChange={e => setLocalConfig((c: any) => ({ ...c, country: e.target.value }))}
                      style={{ width: 80 }} />
                  </div>
                  <div>
                    <label className="label">Units</label>
                    <select className="input" value={localConfig.units || 'imperial'}
                      onChange={e => setLocalConfig((c: any) => ({ ...c, units: e.target.value }))}
                      style={{ cursor: 'pointer' }}>
                      <option value="imperial">°F</option>
                      <option value="metric">°C</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">API key secret</label>
                  <select className="input" value={localConfig.secretId || ''}
                    onChange={e => setLocalConfig((c: any) => ({ ...c, secretId: e.target.value }))}
                    style={{ cursor: 'pointer' }}>
                    <option value="">— Select a secret —</option>
                    {secrets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {secrets.length === 0 && (
                    <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4 }}>
                      No secrets yet. Add an OpenWeatherMap API key in the Secrets tab.
                    </div>
                  )}
                </div>
                <div>
                  <label className="label">Refresh every</label>
                  <select className="input" value={localConfig.refreshSecs || 1800}
                    onChange={e => setLocalConfig((c: any) => ({ ...c, refreshSecs: Number(e.target.value) }))}
                    style={{ cursor: 'pointer' }}>
                    <option value={300}>5 minutes</option>
                    <option value={900}>15 minutes</option>
                    <option value={1800}>30 minutes</option>
                    <option value={3600}>1 hour</option>
                  </select>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ fontSize: 12 }}
                onClick={() => onSave(JSON.stringify(localConfig))}>Save</button>
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={onEdit}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Density picker ────────────────────────────────────────────────────────────

function DensityPicker() {
  const [density, setDensityState] = useState('normal')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    preferencesApi.get().then(r => setDensityState(r.data.density || 'normal')).catch(() => {})
  }, [])

  const save = async (val: string) => {
    setDensityState(val)
    setSaving(true)
    try {
      await preferencesApi.save({ density: val })
      setSaved(true); setTimeout(() => setSaved(false), 1500)
    } finally { setSaving(false) }
  }

  const options = [
    { id: 'compact',     label: 'Compact',     desc: '~6 columns · 180px min' },
    { id: 'normal',      label: 'Normal',       desc: '~5 columns · 240px min' },
    { id: 'comfortable', label: 'Comfortable',  desc: '~3 columns · 320px min' },
  ]

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Panel density</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Controls minimum panel width on desktop</div>
        </div>
        {saved && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ saved</span>}
        {saving && <span className="spinner" />}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {options.map(o => (
          <button key={o.id} onClick={() => save(o.id)} style={{
            flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
            background: density === o.id ? 'var(--accent-bg)' : 'var(--surface2)',
            border: `1px solid ${density === o.id ? '#7c6fff50' : 'var(--border)'}`,
            color: density === o.id ? 'var(--accent2)' : 'var(--text-muted)',
            transition: 'all 0.15s', textAlign: 'left',
          }}>
            <div style={{ fontSize: 13, fontWeight: density === o.id ? 500 : 400 }}>{o.label}</div>
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>{o.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
