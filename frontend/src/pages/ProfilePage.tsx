import { useEffect, useState } from 'react'
import SectionHelp from '../components/admin/SectionHelp'
import MailConfigPanel from '../components/admin/MailConfigPanel'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme, THEMES as THEME_DEFS } from '../context/ThemeContext'
import { APP_VERSION } from '../version'
import { cssApi } from '../api'
import { StoaLogo } from '../App'
import { panelsApi, porticosApi, myPanelsApi, myIntegrationsApi, myTagsApi, mySecretsApi, myBookmarksApi, profileApi, preferencesApi, secretsApi, glyphsApi, tickersApi, integrationsApi, tagsApi, googleApi, customColumnsApi, Integration, Ticker, Glyph, Secret, Panel, Portico, Tag } from '../api'
import { useUserMode } from '../context/UserModeContext'
import BookmarksPanel from '../components/admin/BookmarksPanel'

type Tab = 'overview' | 'tags' | 'secrets' | 'integrations' | 'bookmarks' | 'mypanels' | 'glyphs' | 'tickers' | 'porticos' | 'panels' | 'mail'

export default function ProfilePage() {
  const { user } = useAuth()
  const userMode = useUserMode()
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

  type NavGroup = { label: string; items: { id: Tab; label: string; icon: string }[] }
  const navGroups: NavGroup[] = [
    {
      label: 'Overview',
      items: [
        { id: 'overview', label: 'Overview', icon: '○' },
        ...(userMode === 'single' ? [{ id: 'mail' as Tab, label: 'Mail & Sessions', icon: '✉' }] : []),
      ],
    },
    {
      label: 'My Setup',
      items: [
        { id: 'tags',         label: 'My Tags',         icon: '◉' },
        { id: 'secrets',      label: 'My Secrets',      icon: '🔑' },
        { id: 'integrations', label: 'My Integrations', icon: '⇄' },
      ],
    },
    {
      label: 'My Content',
      items: [
        { id: 'bookmarks', label: 'My Bookmarks', icon: '↗' },
        { id: 'mypanels',  label: 'My Panels',   icon: '⊞' },
        { id: 'glyphs',    label: 'My Glyphs',   icon: '◈' },
        { id: 'tickers',   label: 'My Tickers',  icon: '▶' },
      ],
    },
    {
      label: 'My Layout',
      items: [
        { id: 'porticos', label: 'Porticos',    icon: '◧' },
        { id: 'panels',   label: 'Panel Order', icon: '▤' },
      ],
    },
  ]

  return (
    <div className="fade-up profile-layout" style={{ display: 'flex', gap: 32, alignItems: 'flex-start', maxWidth: 960 }}>

      {/* Vertical sidebar */}
      <div className="profile-sidebar" style={{ width: 180, flexShrink: 0 }}>
        {/* User identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: 'var(--accent-bg)', border: '1px solid var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 600, color: 'var(--accent2)',
          }}>{initials}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.username}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>{user?.role}</div>
          </div>
        </div>

        {/* Nav groups */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {navGroups.map(group => (
            <div key={group.label}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4, paddingLeft: 8 }}>
                {group.label}
              </div>
              {group.items.map(item => {
                const active = tab === item.id
                return (
                  <button key={item.id}
                    onClick={() => { setTab(item.id); navigate(`/profile?tab=${item.id}`, { replace: true }) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '7px 10px', fontSize: 13, fontWeight: active ? 500 : 400,
                      background: active ? 'var(--accent-bg)' : 'transparent',
                      color: active ? 'var(--accent2)' : 'var(--text-muted)',
                      border: 'none', borderRadius: 7,
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'all 0.12s',
                    }}
                    onMouseOver={e => { if (!active) e.currentTarget.style.background = 'var(--surface2)' }}
                    onMouseOut={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ fontSize: 11, width: 14, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                    {item.label}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {tab === 'overview'      && <OverviewTab />}
        {tab === 'mail'          && <MailSettingsTab />}
        {tab === 'tags'          && <PersonalTagsTab />}
        {tab === 'secrets'       && <SecretsTab />}
        {tab === 'integrations'  && <><PersonalIntegrationsTab /><PersonalGoogleCalendarSection /></>}
        {tab === 'bookmarks'     && <BookmarksTab />}
        {tab === 'mypanels'      && <MyPanelsTab />}
        {tab === 'glyphs'        && <GlyphsTab />}
        {tab === 'tickers'       && <TickersTab />}
        {tab === 'porticos'      && <PorticosTab />}
        {tab === 'panels'        && <PanelsOrderTab />}
      </div>
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
  const [username, setUsername] = useState(user?.username || '')
  const [editingUsername, setEditingUsername] = useState(false)
  const [savingUsername, setSavingUsername] = useState(false)
  const [usernameSaved, setUsernameSaved] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  // Password change (local users only)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSaved, setPwSaved] = useState(false)
  const [savingPw, setSavingPw] = useState(false)
  const isLocalUser = user?.authProvider === 'local'

  useEffect(() => {
    profileApi.get().then(r => {
      setEmail(r.data.email || '')
      setUsername(r.data.username || user?.username || '')
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

  const saveUsername = async () => {
    if (!username.trim()) return
    setSavingUsername(true)
    try {
      await profileApi.update({ username: username.trim() })
      if (setUser) setUser({ ...user, username: username.trim() } as any)
      setEditingUsername(false)
      setUsernameSaved(true)
      setTimeout(() => setUsernameSaved(false), 2000)
    } finally { setSavingUsername(false) }
  }

  const { setAvatarUrl: setSharedAvatarUrl } = useAuth()

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setAvatarError('Image must be under 2MB'); return }
    setAvatarError('')
    setUploadingAvatar(true)
    try {
      const res = await profileApi.uploadAvatar(file)
      const freshUrl = res.data.avatarUrl + '?t=' + Date.now()
      setAvatarUrl(freshUrl)       // update local profile display
      setSharedAvatarUrl(freshUrl) // update AuthContext → Layout top-right avatar
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

      {/* Display name */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Display name</div>
        {editingUsername ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="input" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="Your name" style={{ flex: 1 }}
              onKeyDown={e => e.key === 'Enter' && saveUsername()} autoFocus />
            <button className="btn btn-primary" onClick={saveUsername} disabled={savingUsername}>
              {savingUsername ? <span className="spinner" /> : 'Save'}
            </button>
            <button className="btn btn-secondary" onClick={() => { setEditingUsername(false); setUsername(user?.username || '') }}>
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: username ? 'var(--text)' : 'var(--text-dim)' }}>
              {username || 'No name set'}
              {usernameSaved && <span style={{ color: 'var(--green)', marginLeft: 8, fontSize: 12 }}>✓ saved</span>}
            </span>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditingUsername(true)}>Edit</button>
          </div>
        )}
      </div>

      {/* Theme + Density combined */}
      {/* Password change — local users only */}
      {isLocalUser && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Change password</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input type="password" className="input" value={currentPw}
              onChange={e => { setCurrentPw(e.target.value); setPwError('') }}
              placeholder="Current password" />
            <input type="password" className="input" value={newPw}
              onChange={e => { setNewPw(e.target.value); setPwError('') }}
              placeholder="New password" />
            <input type="password" className="input" value={confirmPw}
              onChange={e => { setConfirmPw(e.target.value); setPwError('') }}
              placeholder="Confirm new password" />
            {pwError && <div style={{ fontSize: 12, color: 'var(--red)' }}>{pwError}</div>}
            {pwSaved && <div style={{ fontSize: 12, color: 'var(--green)' }}>✓ Password changed</div>}
            <button className="btn btn-primary" style={{ fontSize: 12, alignSelf: 'flex-start' }}
              disabled={savingPw || !currentPw || !newPw || !confirmPw}
              onClick={async () => {
                if (newPw !== confirmPw) { setPwError('Passwords do not match'); return }
                if (newPw.length < 8) { setPwError('Password must be at least 8 characters'); return }
                setSavingPw(true); setPwError('')
                try {
                  await profileApi.changePassword(currentPw, newPw)
                  setCurrentPw(''); setNewPw(''); setConfirmPw('')
                  setPwSaved(true); setTimeout(() => setPwSaved(false), 3000)
                } catch (e: any) {
                  setPwError(e.response?.data?.error || 'Failed to change password')
                } finally { setSavingPw(false) }
              }}>
              {savingPw ? <span className="spinner" /> : 'Change password'}
            </button>
          </div>
        </div>
      )}

      <ThemeDensityBlock />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: 12 }}>
        <StoaLogo size={14} />stoa {APP_VERSION}
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
  const [porticos, setPorticos] = useState<Portico[]>([])
  const [selectedPortico, setSelectedPortico] = useState<string>('home')
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const loadPanels = async (porticoId?: string) => {
    const resolvedPorticoId = porticoId && porticoId !== 'home' ? porticoId : undefined
    const sys = await panelsApi.list(resolvedPorticoId)
    const merged = sys.data || []

    if (porticoId) {
      // Filter to panels visible on this portico by tag
      const portico = porticos.find(w => w.id === resolvedPorticoId)
      if (portico) {
        const porticoTagIds = new Set((portico.tags || []).filter((t: any) => t.active).map((t: any) => t.tagId))
        const filtered = merged.filter((p: Panel) => {
          if (!p.tags || p.tags.length === 0) return true
          return p.tags.some((t: any) => porticoTagIds.has(t.id))
        })
        // Sort by saved position
        filtered.sort((a, b) => {
          if (a.position > 0 && b.position > 0) return a.position - b.position
          if (a.position > 0) return -1
          if (b.position > 0) return 1
          return 0
        })
        setPanels(filtered)
        return
      }
    }
    // Home: sort by position
    merged.sort((a, b) => {
      if (a.position > 0 && b.position > 0) return a.position - b.position
      if (a.position > 0) return -1
      if (b.position > 0) return 1
      return 0
    })
    setPanels(merged)
  }

  useEffect(() => {
    Promise.all([panelsApi.list(), porticosApi.list()]).then(([sys, w]) => {
      const merged = [...(sys.data || [])]
      merged.sort((a, b) => {
        if (a.position > 0 && b.position > 0) return a.position - b.position
        if (a.position > 0) return -1
        if (b.position > 0) return 1
        return 0
      })
      setPanels(merged)
      setPorticos(w.data || [])
    }).finally(() => setLoading(false))
  }, [])

  const handlePorticoSelect = async (porticoId: string) => {
    setSelectedPortico(porticoId)
    setLoading(true)
    await loadPanels(porticoId)
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
      const porticoId = selectedPortico !== 'home' ? selectedPortico : null
      const order = panels.map((p, i) => ({ panelId: p.id, position: i + 1 }))
      await panelsApi.updateOrder(porticoId, order)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }




  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  return (
    <div>
      {/* Portico selector */}
      <SectionHelp storageKey="profile_panels_order" title="Panel order">
        Drag panels up and down to change the order they appear on your dashboard.
        If you have multiple porticos, each one has its own independent panel order.
        Your layout is personal — reordering doesn't affect other users.
      </SectionHelp>
      <div style={{ marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 10 }}>Ordering for portico</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['home', ...porticos.map(w => w.id)] as string[]).map(wid => {
            const label = wid === 'home' ? 'Home' : porticos.find(w => w.id === wid)?.name || wid
            const active = selectedPortico === wid
            return (
              <button key={wid} onClick={() => handlePorticoSelect(wid)} style={{
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


      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Drag or use arrows to reorder. Changes apply to your view only.
        </p>
        <button className="btn btn-primary" style={{ fontSize: 12 }}
          onClick={saveOrder} disabled={saving}>
          {saving ? <span className="spinner" /> : saved ? '✓ Saved' : 'Save order'}
        </button>
      </div>



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
                {panel.scope === 'personal' ? 'personal' : 'shared'} · {panel.type} · {(() => { try { return (JSON.parse(panel.config || '{}').height || 2) + 'x' } catch { return '2x' } })()}
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
                await loadPanels(selectedPortico)
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
          <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '24px 0' }}>No panels visible on this portico.</div>
        )}
      </div>
    </div>
  )
}

// ── Mail & Sessions tab ──────────────────────────────────────────────────────
function MailSettingsTab() {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Mail & Sessions</div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 20, lineHeight: 1.6 }}>
        Configure your SMTP server for password reset emails and set your session duration.
      </div>
      <MailConfigPanel />
    </div>
  )
}

// ── Porticos ─────────────────────────────────────────────────────────────────

// ── Portico layout preview ────────────────────────────────────────────────────
// Renders a tiny schematic of the portico layout — proportional blocks
// representing panels in their computed positions. Mirrors PanelGrid logic.
function CustomColumnConfigurator({ porticoId, colCount }: { porticoId: string; colCount: number }) {
  const [open, setOpen] = useState(false)
  const [panels, setPanels] = useState<Panel[]>([])
  const [columns, setColumns] = useState<Record<string,number>>({})
  const [saving, setSaving] = useState(false)

  const load = async () => {
    // Use the same panelsApi.list(porticoId) call that panel order tab uses —
    // it already returns the correct panels for this portico with position + customColumn
    const pr = await panelsApi.list(porticoId)
    // Only panels with a saved position for this portico — position=0 means not in this portico's order
    const items: Panel[] = (pr.data || []).filter((p: Panel) => (p.position || 0) > 0)

    // Items are already sorted by position from the backend.
    // Build column map — validate monotonically non-decreasing, reset to 1 if invalid
    const colData: Record<string,number> = {}
    let lastCol = 1
    let valid = true
    for (const p of items) {
      const col = (p as any).customColumn || 1
      if (col < lastCol) { valid = false; break }
      lastCol = col
    }
    items.forEach((p: Panel) => {
      colData[p.id] = valid ? ((p as any).customColumn || 1) : 1
    })

    setPanels(items)
    setColumns(colData)
  }

  useEffect(() => { if (open) load() }, [open, porticoId])

  const setCol = (panelId: string, col: number, allPanels: Panel[]) => {
    const idx = allPanels.findIndex(p => p.id === panelId)
    if (idx < 0) return
    const next = { ...columns }
    next[panelId] = col

    // Cascade forward: panels after this one must be >= col (if increasing)
    // Cascade backward: panels after this one must be <= col (if decreasing)
    // Rule: the list must always be non-decreasing in column number.
    // Going UP (col > old): push everything after up to at least col
    // Going DOWN (col < old): pull everything after down to at most col
    const old = columns[panelId] ?? 1
    if (col > old) {
      // Pushed up — cascade forward: everything below must be >= col
      for (let i = idx + 1; i < allPanels.length; i++) {
        if ((next[allPanels[i].id] ?? 1) < col) next[allPanels[i].id] = col
        else break // already >= col, stop cascading
      }
    } else if (col < old) {
      // Pulled down — cascade forward: everything below must be <= col
      for (let i = idx + 1; i < allPanels.length; i++) {
        if ((next[allPanels[i].id] ?? 1) > col) next[allPanels[i].id] = col
        else break // already <= col, stop cascading
      }
      // Also cascade backward: panels before this one must be <= col
      for (let i = idx - 1; i >= 0; i--) {
        if ((next[allPanels[i].id] ?? 1) > col) next[allPanels[i].id] = col
        else break
      }
    }

    setColumns(next)
  }

  const save = async () => {
    setSaving(true)
    await customColumnsApi.set(porticoId, columns, panels.map(p => p.id))
    setSaving(false)
    setOpen(false)
  }

  if (!open) return (
    <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setOpen(true)}>
      Configure columns
    </button>
  )

  // Full-screen modal so it doesn't interact with page scroll
  return (
    <>
      <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setOpen(false)}>
        Configure columns ✕
      </button>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }} onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24, width: 480, maxWidth: '92vw',
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
        }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
            Column assignments
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
            Click a number to set the column. Panels cascade — changing one panel
            adjusts adjacent panels to maintain a valid order.
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {panels.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No panels in this portico yet.</div>
              : panels.map(p => {
                  const col = columns[p.id] ?? 1
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.title}
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {Array.from({ length: colCount }, (_, i) => i + 1).map(n => (
                          <button key={n} onClick={() => setCol(p.id, n, panels)}
                            style={{
                              width: 28, height: 24, borderRadius: 5, fontSize: 11, fontWeight: 600,
                              cursor: 'pointer', border: '1px solid var(--border)',
                              background: col === n ? 'var(--accent)' : 'var(--surface2)',
                              color: col === n ? 'white' : 'var(--text-dim)',
                            }}>{n}</button>
                        ))}
                      </div>
                    </div>
                  )
                })
            }
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8, paddingTop: 12,
            borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-primary" style={{ fontSize: 12 }}
              onClick={save} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Save'}
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }}
              onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      </div>
    </>
  )
}

function PorticoPreview({ portico, panels, columnAssignments = {} }: {
  portico: Portico; panels: Panel[]; columnAssignments?: Record<string,number>
}) {
  if (panels.length === 0) return (
    <div style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic', padding: '6px 0' }}>
      No panels match this portico's tags
    </div>
  )

  const layout    = portico.layout    || 'stylos'
  const colCount  = portico.columnCount  || 3
  const colHeight = portico.columnHeight || 8
  const isCustom  = layout === 'custom'
  const W = 200; const UNIT = 10; const GAP = 2

  function getPanelHeight(p: Panel): number {
    try { return JSON.parse(p.config || '{}').height ?? 2 } catch { return 2 }
  }

  // Panel type → color
  const TYPE_COLORS: Record<string, string> = {
    sonarr: '#7c6fff', radarr: '#a78bfa', lidarr: '#ec4899',
    truenas: '#38bdf8', proxmox: '#fb923c', opnsense: '#4ade80',
    plex: '#fbbf24', kuma: '#2dd4bf', bookmarks: '#64748b',
    default: 'var(--accent)',
  }
  function panelColor(p: Panel) {
    try {
      const cfg = JSON.parse(p.config || '{}')
      const type = (p.type || cfg.type || '').toLowerCase()
      for (const key of Object.keys(TYPE_COLORS)) {
        if (type.includes(key)) return TYPE_COLORS[key]
      }
    } catch {}
    return TYPE_COLORS.default
  }

  interface Block { x: number; y: number; w: number; h: number; color: string }
  const blocks: Block[] = []
  const colW = (W - (colCount - 1) * GAP) / colCount

  if (layout === 'seira' || layout === 'flow') {
    // Simulate CSS Grid auto-placement with gridRow: span N.
    // Grid cells are UNIT px tall. Track which row-unit each column is occupied up to.
    // For each panel, find the first row-unit where it fits across its column span of 1.
    const colFill = new Array(colCount).fill(0) // next free row-unit per column
    panels.forEach(p => {
      const h = getPanelHeight(p) // in row units
      // Find leftmost column with enough consecutive free space
      // CSS grid auto-placement: scan row by row left to right
      let placed = false
      for (let row = 0; !placed; row++) {
        for (let col = 0; col < colCount; col++) {
          if (colFill[col] <= row) {
            // Place here
            const y = row * UNIT
            const x = col * (colW + GAP)
            blocks.push({ x, y, w: colW, h: h * UNIT - GAP, color: panelColor(p) })
            colFill[col] = row + h
            placed = true
            break
          }
        }
      }
    })
  } else if (layout === 'rema') {
    // Rows of colCount panels. Each panel renders at its OWN height.
    // Row reserves space = tallest panel height but shorter panels don't stretch.
    let rowY = 0
    for (let i = 0; i < panels.length; i += colCount) {
      const row = panels.slice(i, i + colCount)
      const rowH = Math.max(...row.map(p => getPanelHeight(p))) * UNIT
      row.forEach((p, ci) => {
        const h = getPanelHeight(p) * UNIT
        blocks.push({ x: ci * (colW + GAP), y: rowY, w: colW, h: h - GAP, color: panelColor(p) })
      })
      rowY += rowH + GAP
    }
  } else if (isCustom && Object.keys(columnAssignments).length > 0) {
    // Custom layout — use saved column assignments
    // Each panel goes into its assigned column (1-based), rendered top-to-bottom per column
    const cols: Panel[][] = Array.from({ length: colCount }, () => [])
    panels.forEach(p => {
      const col = (columnAssignments[p.id] || 1) - 1 // convert to 0-based
      const safeCol = Math.min(Math.max(col, 0), colCount - 1)
      cols[safeCol].push(p)
    })
    cols.forEach((col, ci) => {
      let y = 0
      col.forEach(p => {
        const h = getPanelHeight(p) * UNIT
        blocks.push({ x: ci * (colW + GAP), y, w: colW, h: h - GAP, color: panelColor(p) })
        y += h + GAP
      })
    })
  } else {
    // Stylos — top-to-bottom column fill (greedy)
    const cols: Panel[][] = Array.from({ length: colCount }, () => [])
    const fill = new Array(colCount).fill(0)
    let cur = 0
    panels.forEach(p => {
      const h = getPanelHeight(p)
      while (cur < colCount - 1 && fill[cur] + h > colHeight) cur++
      cols[cur].push(p)
      fill[cur] += h
    })
    cols.forEach((col, ci) => {
      let y = 0
      col.forEach(p => {
        const h = getPanelHeight(p) * UNIT
        blocks.push({ x: ci * (colW + GAP), y, w: colW, h: h - GAP, color: panelColor(p) })
        y += h + GAP
      })
    })
  }

  const totalH = blocks.length > 0 ? Math.max(...blocks.map(b => b.y + b.h)) + 4 : 20

  return (
    <div style={{ marginTop: 10, marginBottom: 4 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase',
        letterSpacing: '0.06em', fontWeight: 600 }}>Preview</div>
      <svg width={W} height={Math.min(totalH, 120)} style={{ overflow: 'hidden', display: 'block',
        borderRadius: 6, background: 'var(--surface)' }}>
        {blocks.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h}
            rx={2} fill={b.color} opacity={0.7} />
        ))}
      </svg>
    </div>
  )
}


function PorticosTab() {
  const [porticos, setPorticos] = useState<Portico[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [previewPanels, setPreviewPanels] = useState<Panel[]>([])
  const [previewColumns, setPreviewColumns] = useState<Record<string,number>>({})

  const load = async () => {
    const [w, sysT] = await Promise.all([porticosApi.list(), tagsApi.list()])
    setPorticos(w.data || [])
    setAllTags(sysT.data || [])
  }

  const loadPreview = async (porticoId: string) => {
    try {
      const [res, colRes, porticoRes] = await Promise.all([
        panelsApi.list(),
        customColumnsApi.get(porticoId),
        porticosApi.list(),
      ])
      const allPanels: Panel[] = res.data || []
      const colData: Record<string,number> = colRes.data || {}
      const portico = porticoRes.data?.find((p: any) => p.id === porticoId)
      const activeTags: string[] = (portico?.tags || []).filter((t: any) => t.active).map((t: any) => t.tagId)
      const filtered = allPanels.filter((p: Panel) => {
        if (p.scope === 'personal') {
          const cfg = (() => { try { return JSON.parse(p.config || '{}') } catch { return {} } })()
          return (cfg.assignedWalls || []).includes(porticoId)
        }
        if (!p.tags || p.tags.length === 0) return true
        if (activeTags.length === 0) return false
        return p.tags.some((t: any) => activeTags.includes(t.id) || activeTags.includes(t.tagId))
      })
      // Sort by saved position if available
      filtered.sort((a, b) => (a.position || 9999) - (b.position || 9999))
      setPreviewPanels(filtered)
      setPreviewColumns(colData)
    } catch { setPreviewPanels([]); setPreviewColumns({}) }
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  const create = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await porticosApi.create(newName.trim())
      setNewName(''); setShowForm(false)
      await load()
    } finally { setCreating(false) }
  }

  const rename = async (id: string) => {
    if (!editName.trim()) return
    await porticosApi.update(id, { name: editName.trim() })
    setRenamingId(null)
    await load()
  }

  const handleDragStart = (i: number) => setDragging(i)
  const handleDragOver  = (e: React.DragEvent, i: number) => { e.preventDefault(); setDragOver(i) }
  const handleDrop = (i: number) => {
    if (dragging === null || dragging === i) { setDragging(null); setDragOver(null); return }
    const next = [...porticos]
    const [moved] = next.splice(dragging, 1)
    next.splice(i, 0, moved)
    setPorticos(next)
    setDragging(null); setDragOver(null)
  }

  const moveUp   = (i: number) => { if (i === 0) return; const n = [...porticos]; [n[i-1], n[i]] = [n[i], n[i-1]]; setPorticos(n) }
  const moveDown = (i: number) => { if (i === porticos.length - 1) return; const n = [...porticos]; [n[i], n[i+1]] = [n[i+1], n[i]]; setPorticos(n) }

  const saveOrder = async () => {
    setSaving(true)
    try {
      await porticosApi.updateOrder(porticos.map((w, i) => ({ porticoId: w.id, position: i + 1 })))
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  const deletePortico = async (portico: Portico) => {
    if (!confirm(`Delete portico "${portico.name}"?`)) return
    await porticosApi.delete(portico.id)
    setPorticos(w => w.filter(x => x.id !== portico.id))
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  return (
    <div>
      <SectionHelp storageKey="profile_porticos" title="Porticos">
        Porticos are named views of your dashboard — like tabs or saved filter presets.
        Each portico can have its own set of active tags, so switching porticos instantly
        changes which panels are visible. Create a portico for work, home, media, or any
        context you switch between regularly. You can drag to reorder them.
      </SectionHelp>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button className="btn btn-primary" style={{ fontSize: 12 }}
          onClick={() => setShowForm(f => !f)}>+ New portico</button>
        <button className="btn btn-secondary" style={{ fontSize: 12 }}
          onClick={saveOrder} disabled={saving}>
          {saving ? <span className="spinner" /> : saved ? '✓ Order saved' : 'Save order'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 12, padding: 14 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label className="label">Portico name</label>
              <input className="input" value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Media, Work, Gaming" autoFocus
                onKeyDown={e => e.key === 'Enter' && create()} />
            </div>
            <button className="btn btn-primary" onClick={create} disabled={creating || !newName}>
              {creating ? <span className="spinner" /> : 'Create'}
            </button>
            <button className="btn btn-ghost" onClick={() => { setShowForm(false); setNewName('') }}>Cancel</button>
          </div>
        </div>
      )}

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

      {/* User porticos - draggable */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {porticos.map((portico, i) => (
          <div key={portico.id}
            style={{
              borderRadius: 8, overflow: 'hidden',
              background: dragOver === i ? 'var(--accent-bg)' : 'var(--surface)',
              border: `1px solid ${expandedId === portico.id ? 'var(--border2)' : dragOver === i ? 'var(--accent)' : 'var(--border)'}`,
              transition: 'all 0.1s', opacity: dragging === i ? 0.4 : 1,
              marginBottom: 4,
            }}>
            <div draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={e => handleDragOver(e, i)}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => { setDragging(null); setDragOver(null) }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'grab' }}>
            <span style={{ color: 'var(--text-dim)', fontSize: 14, userSelect: 'none' }}>⠿</span>
            <div style={{ flex: 1 }}>
              {renamingId === portico.id ? (
                <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                  <input className="input" value={editName} onChange={e => setEditName(e.target.value)}
                    style={{ fontSize: 12, flex: 1 }} autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') rename(portico.id); if (e.key === 'Escape') setRenamingId(null) }} />
                  <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => rename(portico.id)}>Save</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setRenamingId(null)}>Cancel</button>
                </div>
              ) : (
                <div style={{ fontSize: 13, fontWeight: 500 }}>{portico.name}</div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>
                {(portico.tags || []).filter(t => t.active).length} active tag{(portico.tags || []).filter(t => t.active).length !== 1 ? 's' : ''}
              </div>
            </div>
            {/* Layout controls */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {(() => {
                const layout = portico.layout || 'stylos'
                const colCount = portico.columnCount || 3
                const colHeight = portico.columnHeight || 8
                const updatePortico = async (patch: Record<string, unknown>) => {
                  await porticosApi.update(portico.id, {
                    layout, columnCount: colCount, columnHeight: colHeight, ...patch
                  })
                  const updated = await porticosApi.list()
                  setPorticos(updated.data || [])
                }
                return (<>
                  <select
                    value={layout}
                    onChange={e => updatePortico({ layout: e.target.value })}
                    style={{
                      fontSize: 11, padding: '2px 6px', borderRadius: 5,
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      color: 'var(--text-muted)', cursor: 'pointer',
                    }}
                    title="Stylos: panels fill top→bottom by column. Seira: panels flow left→right, aligned grid. Rema: panels flow left→right, rows collapse when panels collapse.">
                    <option value="stylos">Stylos</option>
                    <option value="seira">Seira</option>
                    <option value="rema">Rema</option>
                    <option value="custom">Custom</option>
                  </select>
                  <select
                    value={colCount}
                    onChange={e => updatePortico({ columnCount: Number(e.target.value) })}
                    style={{
                      fontSize: 11, padding: '2px 6px', borderRadius: 5,
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      color: 'var(--text-muted)', cursor: 'pointer',
                    }}
                    title="Number of columns">
                    {[2,3,4,5].map(n => <option key={n} value={n}>{n} cols</option>)}
                  </select>
                  {layout === 'custom' && (
                    <CustomColumnConfigurator porticoId={portico.id} colCount={colCount} />
                  )}
                  {(layout === 'stylos' || layout === 'columns') && (
                    <select
                      value={colHeight}
                      onChange={e => updatePortico({ columnHeight: Number(e.target.value) })}
                      style={{
                        fontSize: 11, padding: '2px 6px', borderRadius: 5,
                        background: 'var(--surface2)', border: '1px solid var(--border)',
                        color: 'var(--text-muted)', cursor: 'pointer',
                      }}
                      title="Column height — how many units tall before wrapping to next column">
                      {[4,6,8,10,12,16].map(n => <option key={n} value={n}>{n}u tall</option>)}
                    </select>
                  )}
                </>)
              })()}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <button onClick={() => moveUp(i)} disabled={i === 0} style={{
                background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer',
                color: 'var(--text-muted)', fontSize: 10, padding: '0 4px',
                opacity: i === 0 ? 0.2 : 0.6, lineHeight: 1,
              }}>▲</button>
              <button onClick={() => moveDown(i)} disabled={i === porticos.length - 1} style={{
                background: 'none', border: 'none', cursor: i === porticos.length - 1 ? 'default' : 'pointer',
                color: 'var(--text-muted)', fontSize: 10, padding: '0 4px',
                opacity: i === porticos.length - 1 ? 0.2 : 0.6, lineHeight: 1,
              }}>▼</button>
            </div>
            <button onClick={e => { e.stopPropagation(); setRenamingId(portico.id); setEditName(portico.name) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-dim)', fontSize: 11, padding: '0 4px' }}
              title="Rename">✎</button>
            <button onClick={e => { e.stopPropagation(); const nextId = expandedId === portico.id ? null : portico.id
              setExpandedId(nextId)
              if (nextId) loadPreview(nextId)
              else { setPreviewPanels([]); setPreviewColumns({}) } }}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: expandedId === portico.id ? 'var(--accent2)' : 'var(--text-dim)', fontSize: 11, padding: '0 4px' }}
              title="Edit tags">◉</button>
            <button onClick={() => deletePortico(portico)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--red)', fontSize: 11, opacity: 0.5, padding: '0 4px',
            }}
              onMouseOver={e => e.currentTarget.style.opacity = '1'}
              onMouseOut={e => e.currentTarget.style.opacity = '0.5'}>✕</button>
          </div>
          {expandedId === portico.id && (
            <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
                Active tags — panels matching these tags appear on this portico
              </div>
              {allTags.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {allTags.map(t => {
                    const porticoTag = (portico.tags || []).find((wt: any) => wt.tagId === t.id)
                    const active = porticoTag?.active ?? false
                    return (
                      <button key={t.id} onClick={async () => {
                        await porticosApi.setTagActive(portico.id, t.id, !active)
                        await load()
                        await loadPreview(portico.id)
                      }} style={{
                        padding: '3px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12,
                        background: active ? t.color + '20' : 'transparent',
                        border: `1px solid ${active ? t.color + '60' : 'var(--border)'}`,
                        color: active ? t.color : 'var(--text-dim)',
                        transition: 'all 0.15s',
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: 2, background: active ? t.color : 'var(--text-dim)',
                          display: 'inline-block', marginRight: 5, verticalAlign: 'middle' }} />
                        {t.name}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  No system tags yet. Add tags in My Setup → My Tags or admin settings.
                </div>
              )}
              <PorticoPreview portico={portico} panels={previewPanels} columnAssignments={previewColumns} />
            </div>
          )}
        </div>
        ))}
        {porticos.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '24px 0' }}>
            No porticos yet. Click "+ New portico" to create one, then assign tags to control which panels appear.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Secrets ───────────────────────────────────────────────────────────────────

function SecretsTab() {
  const userMode = useUserMode()
  const [shared, setShared] = useState<Secret[]>([])
  const [personal, setPersonal] = useState<Secret[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<{ id: string; name: string; value: string } | null>(null)

  const load = async () => {
    const [sysRes, myRes] = await Promise.all([secretsApi.list(), mySecretsApi.list()])
    setShared((sysRes.data || []).filter((s: Secret) => s.createdBy === 'SYSTEM'))
    setPersonal(myRes.data || [])
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
      {/* Search */}
      <SectionHelp storageKey="profile_secrets" title="API keys & secrets">
        Secrets store API keys and credentials for your personal integrations. They're
        encrypted at rest and never exposed in the UI after saving. Give each secret a
        descriptive name so you can tell them apart when connecting integrations.
      </SectionHelp>
      <div style={{ marginBottom: 16 }}>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter secrets..." style={{ fontSize: 13 }} />
      </div>

      {/* System secrets accessible to this user — read-only view */}
      {userMode === 'multi' && shared.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div className="section-title" style={{ marginBottom: 10 }}>System secrets</div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 12, lineHeight: 1.6 }}>
            These are managed by your admin and shared with your groups. Values are not visible.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {shared.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase())).map(s => (
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
        {personal.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase())).map(s => (
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
  { id: 'clock',    label: 'Clock',       desc: 'Time and date display',                needsIntegration: false },
  { id: 'weather',  label: 'Weather',     desc: 'Current conditions — no API key needed', needsIntegration: false },
  { id: 'kuma',     label: 'Uptime Kuma', desc: 'Monitor status summary',               needsIntegration: true  },
  { id: 'truenas',  label: 'TrueNAS',     desc: 'CPU usage and temperature',             needsIntegration: true  },
  { id: 'opnsense', label: 'OPNsense',    desc: 'WAN throughput and gateway status',     needsIntegration: true  },
  { id: 'proxmox',  label: 'Proxmox',     desc: 'Cluster CPU and memory',               needsIntegration: true  },
  { id: 'ping',     label: 'Ping',        desc: 'HTTP response time to a host',         needsIntegration: false },
  { id: 'text',     label: 'Static text', desc: 'Fixed label or status indicator',      needsIntegration: false },
]

const ZONES = [
  { id: 'header-left',    label: 'Header left' },
  { id: 'header-right',   label: 'Header right' },
  { id: 'footer-left',    label: 'Footer left' },
  { id: 'footer-center',  label: 'Footer center' },
  { id: 'footer-right',   label: 'Footer right' },
]

function WeatherGlyphConfig({ localConfig, setLocalConfig }: { localConfig: any; setLocalConfig: any }) {
  const [city, setCity] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<any[]>([])
  const search = async () => {
    if (!city.trim()) return
    setSearching(true); setResults([])
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=6&language=en&format=json`)
      const d = await res.json()
      setResults(d.results || [])
    } catch { setResults([]) }
    finally { setSearching(false) }
  }
  const pick = (r: any) => {
    const label = r.name
    setLocalConfig((c: any) => ({ ...c, lat: String(r.latitude), lon: String(r.longitude), label }))
    setResults([]); setCity('')
  }
  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label className="label">Label (optional)</label>
          <input className="input" value={localConfig.label || ''}
            onChange={e => setLocalConfig((c: any) => ({ ...c, label: e.target.value }))}
            placeholder="e.g. Home, Office" />
        </div>
        <div>
          <label className="label">Units</label>
          <select className="input" value={localConfig.unit || 'f'}
            onChange={e => setLocalConfig((c: any) => ({ ...c, unit: e.target.value }))}
            style={{ cursor: 'pointer', width: 72 }}>
            <option value="f">°F</option>
            <option value="c">°C</option>
          </select>
        </div>
      </div>
      {localConfig.lat && localConfig.lon && (
        <div style={{ fontSize: 12, color: 'var(--green)', padding: '4px 8px',
          background: 'var(--surface2)', borderRadius: 6 }}>
          ✓ {localConfig.label || (localConfig.lat + ', ' + localConfig.lon)}
        </div>
      )}
      <div>
        <label className="label">City search — no API key required</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" value={city} onChange={e => setCity(e.target.value)}
            placeholder="Search city..." onKeyDown={e => e.key === 'Enter' && search()} />
          <button className="btn btn-secondary" onClick={search} disabled={searching || !city.trim()}>
            {searching ? <span className="spinner" /> : 'Search'}
          </button>
        </div>
        {results.length > 0 && (
          <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {results.map((r: any, i: number) => (
              <button key={i} onClick={() => pick(r)}
                style={{ width: '100%', padding: '7px 12px', background: 'var(--surface2)',
                  border: 'none', borderBottom: i < results.length-1 ? '1px solid var(--border)' : 'none',
                  textAlign: 'left', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
                {r.name}{r.admin1 ? ', ' + r.admin1 : ''} <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{r.country}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function GlyphsTab() {
  const [glyphs, setGlyphs] = useState<Glyph[]>([])
  const [porticos, setPorticos] = useState<Portico[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newType, setNewType] = useState('clock')
  const [newZone, setNewZone] = useState('header-right')
  const [creating, setCreating] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const [integrations, setIntegrations] = useState<Integration[]>([])

  const load = async () => {
    const [g, sysI, p] = await Promise.all([
      glyphsApi.list(),
      integrationsApi.list(),
      porticosApi.list(),
    ])
    setGlyphs(g.data || [])
    setIntegrations(sysI.data || [])
    setPorticos(p.data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    setCreating(true)
    try {
      const defaultConfig =
        newType === 'clock'   ? JSON.stringify({ format: '12h', showSeconds: false, showDate: true, timezone: '', label: '' }) :
        newType === 'weather' ? JSON.stringify({ city: '', lat: '', lon: '', unit: 'f', refreshSecs: 1800 }) :
        newType === 'ping'    ? JSON.stringify({ host: '', label: '', refreshSecs: 30 }) :
        newType === 'text'    ? JSON.stringify({ text: 'Label', color: '', size: 'normal' }) :
        newType === 'truenas' || newType === 'opnsense' || newType === 'proxmox' || newType === 'kuma'
          ? JSON.stringify({ integrationId: '', refreshSecs: 30 })
          : JSON.stringify({ refreshSecs: 60 })
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
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 480 }}>
          Glyphs are small status indicators that float on the edge of your dashboard — always visible
          regardless of which panels are shown. Use them for at-a-glance status: Kuma uptime, weather,
          server health, or a clock. Each glyph can be positioned independently around the dashboard border.
        </div>
        <button className="btn btn-primary" style={{ flexShrink: 0, marginLeft: 16 }}
          onClick={() => setShowForm(f => !f)}>+ Add glyph</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="label">Type</label>
              <select className="input" value={newType} onChange={e => setNewType(e.target.value)} style={{ cursor: 'pointer' }}>
                {GLYPH_TYPES.map(t => {
                  const hasInt = !t.needsIntegration || integrations.some(i => i.type === t.id)
                  return <option key={t.id} value={t.id}>{t.label}{!hasInt ? ' ⚠ needs integration' : ''}</option>
                })}
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
            {(() => {
              const t = GLYPH_TYPES.find(g => g.id === newType)
              if (!t?.needsIntegration) return null
              const hasInt = integrations.some(i => i.type === newType)
              if (hasInt) return <span style={{ color: 'var(--green)', marginLeft: 6 }}>✓ integration available</span>
              return <span style={{ color: 'var(--amber)', marginLeft: 6 }}>
                ⚠ No {newType} integration configured.{' '}
                <a href="/admin/integrations" style={{ color: 'var(--accent2)' }}>Add one →</a>
              </span>
            })()}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {glyphs.map(g => (
          <GlyphRow key={g.id} glyph={g} integrations={integrations} porticos={porticos}
            editing={editId === g.id}
            onEdit={() => setEditId(editId === g.id ? null : g.id)}
            onToggle={() => toggleEnabled(g)}
            onDelete={() => remove(g.id)}
            onSave={async (config) => {
              await glyphsApi.update(g.id, { config })
              setEditId(null); await load()
            }}
            onZoneChange={async (zone) => {
              await glyphsApi.update(g.id, { zone })
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

function GlyphRow({ glyph, integrations, porticos, editing, onEdit, onToggle, onDelete, onSave, onZoneChange }: {
  glyph: Glyph; integrations: Integration[]; porticos: Portico[]; editing: boolean
  onEdit: () => void; onToggle: () => void; onDelete: () => void
  onSave: (config: string) => void; onZoneChange: (zone: string) => void
}) {
  const typeDef = GLYPH_TYPES.find(t => t.id === glyph.type)
  const zoneDef = ZONES.find(z => z.id === glyph.zone)
  const [localConfig, setLocalConfig] = useState(() => {
    try { return JSON.parse(glyph.config) } catch { return {} }
  })

  // Sync when glyph prop changes (after save/reload)
  useEffect(() => {
    try { setLocalConfig(JSON.parse(glyph.config)) } catch { setLocalConfig({}) }
  }, [glyph.config])



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
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label className="label">Timezone</label>
                    <select className="input" value={localConfig.timezone || ''}
                      onChange={e => setLocalConfig((c: any) => ({ ...c, timezone: e.target.value }))}
                      style={{ cursor: 'pointer' }}>
                      <option value="">— Local (browser default) —</option>
                      <optgroup label="United States">
                        <option value="America/New_York">Eastern — New York</option>
                        <option value="America/Chicago">Central — Chicago</option>
                        <option value="America/Denver">Mountain — Denver</option>
                        <option value="America/Phoenix">Mountain (no DST) — Phoenix</option>
                        <option value="America/Los_Angeles">Pacific — Los Angeles</option>
                        <option value="America/Anchorage">Alaska — Anchorage</option>
                        <option value="Pacific/Honolulu">Hawaii — Honolulu</option>
                      </optgroup>
                      <optgroup label="Europe">
                        <option value="Europe/London">London (GMT/BST)</option>
                        <option value="Europe/Paris">Paris / Berlin / Rome</option>
                        <option value="Europe/Helsinki">Helsinki / Athens</option>
                        <option value="Europe/Moscow">Moscow</option>
                      </optgroup>
                      <optgroup label="Asia / Pacific">
                        <option value="Asia/Dubai">Dubai</option>
                        <option value="Asia/Kolkata">India — Kolkata</option>
                        <option value="Asia/Bangkok">Bangkok / Jakarta</option>
                        <option value="Asia/Shanghai">China — Shanghai</option>
                        <option value="Asia/Tokyo">Japan — Tokyo</option>
                        <option value="Australia/Sydney">Australia — Sydney</option>
                        <option value="Pacific/Auckland">New Zealand — Auckland</option>
                      </optgroup>
                      <optgroup label="Other">
                        <option value="UTC">UTC</option>
                        <option value="America/Sao_Paulo">Brazil — São Paulo</option>
                        <option value="America/Toronto">Canada — Toronto</option>
                        <option value="America/Vancouver">Canada — Vancouver</option>
                      </optgroup>
                    </select>
                  </div>
                  <div style={{ flex: 0.4 }}>
                    <label className="label">Label (optional)</label>
                    <input className="input" value={localConfig.label || ''}
                      onChange={e => setLocalConfig((c: any) => ({ ...c, label: e.target.value }))}
                      placeholder="e.g. NYC" />
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3 }}>
                      Shown above the time
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Weather config */}

            {glyph.type === 'weather' && (
              <WeatherGlyphConfig localConfig={localConfig} setLocalConfig={setLocalConfig} />
            )}
            {/* New glyph type configs */}
            {(glyph.type === 'truenas' || glyph.type === 'opnsense' || glyph.type === 'proxmox' || glyph.type === 'kuma') && (
              <>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label className="label">Integration</label>
                    <select className="input" value={localConfig.integrationId || ''}
                      onChange={e => setLocalConfig((c: any) => ({ ...c, integrationId: e.target.value }))}
                      style={{ cursor: 'pointer' }}>
                      <option value="">— Select integration —</option>
                      {integrations
                        .filter(i => i.type === glyph.type)
                        .map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 0.6 }}>
                    <label className="label">Label (optional)</label>
                    <input className="input" value={localConfig.label || ''}
                      onChange={e => setLocalConfig((c: any) => ({ ...c, label: e.target.value }))}
                      placeholder="e.g. NAS, Proxmox" />
                  </div>
                </div>
              </>
            )}
            {glyph.type === 'ping' && (
              <>
                <div>
                  <label className="label">Host or URL</label>
                  <input className="input" value={localConfig.host || ''}
                    onChange={e => setLocalConfig((c: any) => ({ ...c, host: e.target.value }))}
                    placeholder="e.g. https://google.com or 192.168.1.1" />
                </div>
                <div>
                  <label className="label">Label (optional)</label>
                  <input className="input" value={localConfig.label || ''}
                    onChange={e => setLocalConfig((c: any) => ({ ...c, label: e.target.value }))}
                    placeholder="e.g. Google" />
                </div>
              </>
            )}
            {glyph.type === 'text' && (
              <>
                <div>
                  <label className="label">Text</label>
                  <input className="input" value={localConfig.text || ''}
                    onChange={e => setLocalConfig((c: any) => ({ ...c, text: e.target.value }))}
                    placeholder="e.g. HOMELAB · PROD" />
                </div>
                <div>
                  <label className="label">Color (optional)</label>
                  <input className="input" value={localConfig.color || ''}
                    onChange={e => setLocalConfig((c: any) => ({ ...c, color: e.target.value }))}
                    placeholder="e.g. #7c6fff or var(--accent)" />
                </div>
                <div>
                  <label className="label">Size</label>
                  <select className="input" value={localConfig.size || 'normal'}
                    onChange={e => setLocalConfig((c: any) => ({ ...c, size: e.target.value }))}
                    style={{ cursor: 'pointer' }}>
                    <option value="small">Small</option>
                    <option value="normal">Normal</option>
                    <option value="large">Large</option>
                  </select>
                </div>
              </>
            )}
            {/* Portico assignment for glyphs */}
            <div>
              <label className="label">Show on porticos (leave all unselected = show everywhere)</label>
              {porticos.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  No saved porticos yet — ticker shows everywhere. Create porticos in the{' '}
                  <a href="/profile?tab=porticos" style={{ color: 'var(--accent2)' }}>Porticos tab</a> to restrict by view.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {porticos.map(p => {
                      const on = (localConfig.porticos || []).includes(p.id)
                      return (
                        <button key={p.id} onClick={() => setLocalConfig((c: any) => ({
                          ...c,
                          porticos: on
                            ? (c.porticos || []).filter((id: string) => id !== p.id)
                            : [...(c.porticos || []), p.id]
                        }))} style={{
                          padding: '3px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                          background: on ? 'var(--accent-bg)' : 'var(--surface2)',
                          border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                          color: on ? 'var(--accent2)' : 'var(--text-muted)',
                        }}>{p.name}</button>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                    {(localConfig.porticos || []).length === 0
                      ? 'Showing on all porticos'
                      : `Showing on ${(localConfig.porticos || []).length} portico${(localConfig.porticos || []).length !== 1 ? 's' : ''}`}
                  </div>
                </>
              )}
            </div>

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

// ── Theme + Density combined block ───────────────────────────────────────────

// THEMES_LIST is replaced by THEME_DEFS from ThemeContext

function ThemeDensityBlock() {
  const [density, setDensityState] = useState('normal')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const { theme: currentTheme, setTheme: applyTheme } = useTheme()
  const [activeTheme, setActiveTheme] = useState(currentTheme)

  // Custom CSS state
  const [cssSheets, setCssSheets] = useState<{ id: string; name: string; filename: string }[]>([])
  const [activeCssId, setActiveCssId] = useState<string>('system') // 'system' = built-in theme
  const [uploadName, setUploadName] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [customVarKeys, setCustomVarKeys] = useState<string[]>([])

  useEffect(() => {
    Promise.all([preferencesApi.get(), cssApi.list()]).then(([prefs, sheets]) => {
      setDensityState(prefs.data.density || 'normal')
      if (prefs.data.theme) {
        // Sync local selector state with server value, but don't re-apply
        // the theme — ThemeContext already applied it on login
        setActiveTheme(prefs.data.theme as any)
      }
      const list = sheets.data || []
      setCssSheets(list)
      // Restore saved CSS selection
      const savedCssId = localStorage.getItem('stoa_custom_css_id')
      const savedCssFile = localStorage.getItem('stoa_custom_css_file')
      if (savedCssId && savedCssFile && list.find((s: any) => s.id === savedCssId)) {
        setActiveCssId(savedCssId)
        fetchAndApplyCSS(savedCssFile)
      }
    }).catch(() => {})
  }, [])

  const saveDensity = async (val: string) => {
    setDensityState(val); setSaving(true)
    try {
      await preferencesApi.save({ density: val })
      setSaved(true); setTimeout(() => setSaved(false), 1500)
    } finally { setSaving(false) }
  }

  const clearCustomCSS = (_keys?: string[]) => {
    // Remove the dedicated style element — fully clears all custom CSS
    // regardless of what was applied in a previous session
    const el = document.getElementById('stoa-custom-css')
    if (el) el.remove()
    // Also clear any inline :root properties from the old approach
    const root = document.documentElement
    if (_keys?.length) _keys.forEach(k => root.style.removeProperty(k))
    setCustomVarKeys([])
  }

  const fetchAndApplyCSS = async (filename: string) => {
    try {
      const res = await fetch(cssApi.url(filename))
      const text = await res.text()
      // Remove any previously injected custom CSS element
      const existing = document.getElementById('stoa-custom-css')
      if (existing) existing.remove()
      // Also clear old inline :root properties from previous approach
      const root = document.documentElement
      customVarKeys.forEach(k => root.style.removeProperty(k))
      // Inject the full CSS as a <style> element — fully replaces previous
      const style = document.createElement('style')
      style.id = 'stoa-custom-css'
      style.textContent = text
      document.head.appendChild(style)
      // Track var keys for cleanup if needed
      const matches = text.match(/--[a-zA-Z0-9-]+\s*:/g) || []
      setCustomVarKeys(matches.map(m => m.replace(':', '').trim()))
    } catch (e) { console.error('Failed to apply CSS', e) }
  }

  const saveTheme = async (themeId: string) => {
    localStorage.removeItem('stoa_custom_css_id')
    localStorage.removeItem('stoa_custom_css_file')
    clearCustomCSS(customVarKeys)
    setActiveCssId('system')
    localStorage.removeItem('stoa_custom_css_id')
    localStorage.removeItem('stoa_custom_css_file')
    setActiveTheme(themeId as any)
    applyTheme(themeId as any)
    try { await preferencesApi.save({ theme: themeId }) } catch {}
  }

  const applyCustomCSS = async (id: string, filename: string) => {
    setActiveCssId(id)
    await fetchAndApplyCSS(filename)
    localStorage.setItem('stoa_custom_css_id', id)
    localStorage.setItem('stoa_custom_css_file', filename)
  }

  const downloadCurrentCSS = () => {
    // Read vars from document inline styles (set by ThemeContext or custom CSS)
    const root = document.documentElement
    const style = root.style
    const allVarNames = [
      '--bg','--surface','--surface2','--border','--border2',
      '--text','--text-muted','--text-dim',
      '--accent','--accent2','--accent-bg',
      '--green','--red','--amber',
    ]
    const lines = allVarNames
      .map(k => {
        const v = style.getPropertyValue(k).trim()
        return v ? `  ${k}: ${v};` : null
      })
      .filter(Boolean)
      .join('\n')

    const themeName = activeCssId === 'system'
      ? (THEME_DEFS.find(t => t.name === activeTheme)?.label ?? activeTheme)
      : (cssSheets.find(s => s.id === activeCssId)?.name ?? 'custom')

    const output = [
      `/* Stoa theme export — based on "${themeName}" */`,
      `/* Edit any value below, save as .css, then upload via Overview > Theme > Upload */`,
      `/* Tip: you only need to include the variables you want to change */`,
      ``,
      `:root {`,
      lines,
      `}`,
      ``,
      `/* ── Common customisations ──────────────────────────────────────────── */`,
      `/* Uncomment and edit these to quickly personalise your theme:          */`,
      ``,
      `/* :root {                                                               */`,
      `/*   --bg: #1a1a2e;         Main page background                        */`,
      `/*   --surface: #16213e;    Card / panel background                     */`,
      `/*   --accent: #e94560;     Accent colour (buttons, highlights)         */`,
      `/*   --accent2: #ff6b6b;    Accent text colour                          */`,
      `/* }                                                                     */`,
    ].join('\n')

    const blob = new Blob([output], { type: 'text/css' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stoa-${themeName.toLowerCase().replace(/\s+/g, '-')}.css`
    a.click()
    URL.revokeObjectURL(url)
  }

  const uploadCSS = async (file: File) => {
    if (!uploadName.trim()) return
    setUploading(true)
    try {
      const text = await file.text()
      const res = await cssApi.upload(uploadName.trim(), text)
      const newSheet = res.data
      setCssSheets(prev => [...prev, newSheet])
      await applyCustomCSS(newSheet.id, newSheet.filename)
      setUploadName(''); setShowUpload(false)
    } finally { setUploading(false) }
  }

  const deleteSheet = async (id: string) => {
    await cssApi.delete(id)
    setCssSheets(prev => prev.filter(s => s.id !== id))
    if (activeCssId === id) {
      clearCustomCSS(customVarKeys)
      setActiveCssId('system')
      localStorage.removeItem('stoa_custom_css_id')
      localStorage.removeItem('stoa_custom_css_file')
    }
  }

  const densityOptions = [
    { id: 'compact',     label: 'Compact',     desc: '~6 cols' },
    { id: 'normal',      label: 'Normal',       desc: '~5 cols' },
    { id: 'comfortable', label: 'Comfortable',  desc: '~3 cols' },
  ]

  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Theme selection */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Theme</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {saved && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ saved</span>}
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={downloadCurrentCSS}>
              ↓ Export CSS
            </button>
          </div>
        </div>

        {/* System themes */}
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Built-in
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {THEME_DEFS.map(t => {
            const active = activeCssId === 'system' && activeTheme === t.name
            return (
              <button key={t.name} onClick={() => saveTheme(t.name)} style={{
                padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12,
                background: active ? 'var(--accent-bg)' : 'var(--surface2)',
                border: `1px solid ${active ? '#7c6fff50' : 'var(--border)'}`,
                color: active ? 'var(--accent2)' : 'var(--text-muted)',
                fontWeight: active ? 500 : 400, transition: 'all 0.15s',
              }}>{t.label}</button>
            )
          })}
        </div>

        {/* Custom CSS sheets */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Custom CSS {cssSheets.length > 0 ? `(${cssSheets.length})` : ''}
          </div>
          <button className="btn btn-ghost" style={{ fontSize: 11 }}
            onClick={() => setShowUpload(v => !v)}>
            {showUpload ? 'Cancel' : '+ Upload'}
          </button>
        </div>

        {showUpload && (
          <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 8,
            background: 'var(--surface2)', border: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label className="label">Sheet name</label>
              <input className="input" value={uploadName} onChange={e => setUploadName(e.target.value)}
                placeholder="e.g. My Dark Theme" style={{ fontSize: 13 }} />
            </div>
            <div>
              <label className="label">CSS file</label>
              <input type="file" accept=".css,text/css"
                disabled={!uploadName.trim()}
                style={{ fontSize: 12, color: 'var(--text-muted)', opacity: uploadName.trim() ? 1 : 0.4, cursor: uploadName.trim() ? 'pointer' : 'not-allowed' }}
                onChange={e => { const f = e.target.files?.[0]; if (f && uploadName.trim()) uploadCSS(f) }} />
              {!uploadName.trim() && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Enter a name above before choosing a file</div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                Select a .css file — it will be applied immediately
              </div>
            </div>
            {uploading && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Uploading…</div>}
          </div>
        )}

        {cssSheets.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {cssSheets.map(s => {
              const active = activeCssId === s.id
              return (
                <div key={s.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 4px 3px 10px', borderRadius: 8,
                  background: active ? 'var(--accent-bg)' : 'var(--surface2)',
                  border: `1px solid ${active ? '#7c6fff50' : 'var(--border)'}`,
                  cursor: 'pointer',
                }} onClick={() => applyCustomCSS(s.id, s.filename)}>
                  <span style={{ fontSize: 12, color: active ? 'var(--accent2)' : 'var(--text-muted)', fontWeight: active ? 500 : 400 }}>
                    {s.name}
                  </span>
                  <button onClick={e => { e.stopPropagation(); deleteSheet(s.id) }} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-dim)', fontSize: 14, lineHeight: 1, padding: '0 3px',
                  }}>×</button>
                </div>
              )
            })}
          </div>
        )}
        {cssSheets.length === 0 && !showUpload && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Upload a .css file to override any built-in theme variable
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* Density */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Panel density</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>Controls minimum panel width</div>
          </div>
          {saving && <span className="spinner" />}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {densityOptions.map(o => (
            <button key={o.id} onClick={() => saveDensity(o.id)} style={{
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
    </div>
  )
}

// ── Tickers ───────────────────────────────────────────────────────────────────

const TICKER_TYPES = [
  { id: 'stocks',  label: 'Stocks',        desc: 'Finnhub API — real-time US equity quotes',   needsSecret: true  },
  { id: 'crypto',  label: 'Crypto',        desc: 'CoinMarketCap API — cryptocurrency prices',  needsSecret: true  },
  { id: 'weather', label: 'Weather',       desc: 'Current conditions — Open-Meteo, no API key', needsSecret: false },
  { id: 'sports',  label: 'Sports scores', desc: 'Live scores — NFL, NBA, NHL, MLB via ESPN',  needsSecret: false },
  { id: 'rss',     label: 'RSS headlines', desc: 'Scrolling headlines from any RSS/Atom feed', needsSecret: false },
]

const TICKER_ZONES = [
  { id: 'header', label: 'Header (below nav)' },
  { id: 'footer', label: 'Footer (above footer bar)' },
]

const TICKER_MODES = [
  { id: 'static', label: 'Static with swoosh', desc: 'Tiles refresh with a swoosh animation' },
  { id: 'scroll', label: 'Scrolling', desc: 'Continuous horizontal scroll' },
]

function TickersTab() {
  const [tickers, setTickers] = useState<Ticker[]>([])
  const [secrets, setSecrets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newType, setNewType] = useState('stocks')
  const [newZone, setNewZone] = useState('footer')
  const [creating, setCreating] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const [porticos, setPorticos] = useState<Portico[]>([])
  const load = async () => {
    const [t, sysS, p] = await Promise.all([tickersApi.list(), secretsApi.list(), porticosApi.list()])
    setTickers(t.data || [])
    setSecrets(sysS.data || []) // /secrets already includes user's own + accessible system secrets
    setPorticos(p.data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    setCreating(true)
    try {
      const defaultConfig =
        newType === 'weather' ? JSON.stringify({ city: '', lat: '', lon: '', unit: 'f', refreshSecs: 1800 }) :
        newType === 'sports'  ? JSON.stringify({ league: 'nba', refreshSecs: 300 }) :
        newType === 'rss'     ? JSON.stringify({ url: '', refreshSecs: 900 }) :
        JSON.stringify({ mode: 'static', refreshSecs: 300, secretId: '' })
      await tickersApi.create({ type: newType, zone: newZone, symbols: '[]', config: defaultConfig })
      setShowForm(false); await load()
    } finally { setCreating(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this ticker?')) return
    await tickersApi.delete(id); await load()
  }

  const toggleEnabled = async (t: Ticker) => {
    await tickersApi.update(t.id, { enabled: !t.enabled }); await load()
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 480 }}>
          Tickers scroll live data across a strip at the top or bottom of your dashboard —
          stock prices, crypto, sports scores, or custom feeds. Each ticker can show multiple
          symbols and updates on a configurable interval. Add as many tickers as you need;
          they stack if you have more than one zone active.
        </div>
        <button className="btn btn-primary" style={{ flexShrink: 0, marginLeft: 16 }}
          onClick={() => setShowForm(f => !f)}>+ Add ticker</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="label">Type</label>
              <select className="input" value={newType} onChange={e => setNewType(e.target.value)} style={{ cursor: 'pointer' }}>
                {TICKER_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Zone</label>
              <select className="input" value={newZone} onChange={e => setNewZone(e.target.value)} style={{ cursor: 'pointer' }}>
                {TICKER_ZONES.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={create} disabled={creating}>
              {creating ? <span className="spinner" /> : 'Add'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 10 }}>
            {TICKER_TYPES.find(t => t.id === newType)?.desc}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tickers.map(t => (
          <TickerRow key={t.id} ticker={t} secrets={secrets} porticos={porticos}
            editing={editId === t.id}
            onEdit={() => setEditId(editId === t.id ? null : t.id)}
            onToggle={() => toggleEnabled(t)}
            onDelete={() => remove(t.id)}
            onSave={load}
            onSecretCreated={(s) => setSecrets((prev: any[]) => [...prev, s])}
          />
        ))}
        {tickers.length === 0 && !showForm && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '24px 0' }}>
            No tickers yet. Add a stocks or crypto ticker to get started.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Single location adder — used by multi-location weather ticker ─────────────
function WeatherLocationAdder({ onAdd }: { onAdd: (loc: any) => void }) {
  const [citySearch, setCitySearch] = useState('')
  const [unit, setUnit] = useState<'f'|'c'>('f')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<any[]>([])

  const search = async () => {
    if (!citySearch.trim()) return
    setSearching(true); setResults([])
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(citySearch)}&count=5&language=en&format=json`)
      const data = await res.json()
      setResults(data.results || [])
    } catch { setResults([]) }
    finally { setSearching(false) }
  }

  const pick = (r: any) => {
    const label = `${r.name}, ${r.admin1 || r.country}`
    onAdd({ lat: String(r.latitude), lon: String(r.longitude), city: label, unit })
    setCitySearch(''); setResults([])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input" value={citySearch} onChange={e => setCitySearch(e.target.value)}
          placeholder="Add city..." style={{ flex: 1 }}
          onKeyDown={e => e.key === 'Enter' && search()} />
        <select className="input" value={unit} onChange={e => setUnit(e.target.value as 'f'|'c')}
          style={{ width: 70, cursor: 'pointer' }}>
          <option value="f">°F</option>
          <option value="c">°C</option>
        </select>
        <button className="btn btn-secondary" style={{ fontSize: 12 }}
          onClick={search} disabled={searching || !citySearch.trim()}>
          {searching ? <span className="spinner" /> : 'Search'}
        </button>
      </div>
      {results.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {results.map((r, i) => (
            <button key={i} onClick={() => pick(r)}
              style={{ width: '100%', padding: '8px 12px', background: 'var(--surface2)',
                border: 'none', borderBottom: i < results.length-1 ? '1px solid var(--border)' : 'none',
                textAlign: 'left', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
              {r.name}, {r.admin1 || ''} <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{r.country}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Weather location config — reused by weather glyph and ticker ─────────────
function TickerRow({ ticker, secrets, porticos, editing, onEdit, onToggle, onDelete, onSave, onSecretCreated }: {
  ticker: Ticker; secrets: any[]; porticos: Portico[]; editing: boolean
  onEdit: () => void; onToggle: () => void; onDelete: () => void
  onSave: () => void
  onSecretCreated: (secret: any) => void
}) {
  const config = (() => { try { return JSON.parse(ticker.config) } catch { return {} } })()
  const symbolsArr: string[] = (() => { try { return JSON.parse(ticker.symbols) } catch { return [] } })()
  const [showAddSecret, setShowAddSecret] = useState(false)
  const [newSecretName, setNewSecretName] = useState('')
  const [newSecretValue, setNewSecretValue] = useState('')
  const [savingSecret, setSavingSecret] = useState(false)

  const [localSecretId, setLocalSecretId] = useState(config.secretId || '')

  const createSecret = async () => {
    if (!newSecretName.trim() || !newSecretValue.trim()) return
    setSavingSecret(true)
    try {
      const res = await secretsApi.create({ name: newSecretName.trim(), value: newSecretValue.trim(), scope: 'personal' })
      const newSecret = { id: res.data.id, name: newSecretName.trim() }
      setLocalSecretId(newSecret.id)
      onSecretCreated(newSecret)
      setNewSecretName(''); setNewSecretValue(''); setShowAddSecret(false)
    } finally { setSavingSecret(false) }
  }
  const [localMode, setLocalMode] = useState(config.mode || 'static')
  const [localRefresh, setLocalRefresh] = useState(config.refreshSecs || 300)
  const [localSymbols, setLocalSymbols] = useState(symbolsArr.join(', '))
  const [localZone, setLocalZone] = useState(ticker.zone)
  const [localPorticos, setLocalPorticos] = useState<string[]>(() => {
    try { return JSON.parse(ticker.config).porticos || [] } catch { return [] }
  })
  const [localConfig, setLocalConfig] = useState<any>(config)

  useEffect(() => {
    const c = (() => { try { return JSON.parse(ticker.config) } catch { return {} } })()
    setLocalSecretId(c.secretId || '')
    setLocalMode(c.mode || 'static')
    setLocalRefresh(c.refreshSecs || 300)
    setLocalSymbols((() => { try { return JSON.parse(ticker.symbols).join(', ') } catch { return '' } })())
    setLocalZone(ticker.zone)
    try { setLocalPorticos(JSON.parse(ticker.config).porticos || []) } catch { setLocalPorticos([]) }
    setLocalConfig((() => { try { return JSON.parse(ticker.config) } catch { return {} } })())
  }, [ticker.config, ticker.symbols, ticker.zone])

  const typeDef = TICKER_TYPES.find(t => t.id === ticker.type)
  const zoneDef = TICKER_ZONES.find(z => z.id === ticker.zone)

  const handleSave = async () => {
    const symbols = JSON.stringify(
      localSymbols.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean)
    )
    const newConfig = JSON.stringify({
      secretId: localSecretId,
      mode: localMode,
      refreshSecs: localRefresh,
      porticos: localPorticos,
      // Weather fields — locations array or single
      ...(ticker.type === 'weather' ? { locations: localConfig.locations || (localConfig.lat ? [{ lat: localConfig.lat, lon: localConfig.lon, city: localConfig.city, unit: localConfig.unit }] : []) } : {}),
      // Sports fields
      ...(ticker.type === 'sports' ? { leagues: localConfig.leagues || [localConfig.league || 'nba'] } : {}),
      // RSS fields
      ...(ticker.type === 'rss' ? { url: localConfig.url } : {}),
    })
    // Send each changed field independently — never send enabled (would reset it)
    if (localZone !== ticker.zone) {
      await tickersApi.update(ticker.id, { zone: localZone })
    }
    await tickersApi.update(ticker.id, { symbols })
    await tickersApi.update(ticker.id, { config: newConfig })
    onEdit()  // close the edit panel
    onSave()
  }

  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${editing ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 10, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{typeDef?.label ?? ticker.type}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
            {zoneDef?.label ?? ticker.zone} · {symbolsArr.length} symbol{symbolsArr.length !== 1 ? 's' : ''}
            {symbolsArr.length > 0 && (
              <span style={{ fontFamily: 'DM Mono, monospace', marginLeft: 6 }}>
                {symbolsArr.slice(0, 5).join(' ')}
                {symbolsArr.length > 5 ? ` +${symbolsArr.length - 5}` : ''}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={onToggle} style={{
            fontSize: 11, padding: '2px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: ticker.enabled ? 'var(--accent-bg)' : 'var(--surface2)',
            color: ticker.enabled ? 'var(--accent2)' : 'var(--text-dim)',
          }}>{ticker.enabled ? 'On' : 'Off'}</button>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onEdit}>Configure</button>
          <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--red)' }} onClick={onDelete}>Delete</button>
        </div>
      </div>

      {editing && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label className="label">Zone</label>
                <select className="input" value={localZone} onChange={e => setLocalZone(e.target.value)} style={{ cursor: 'pointer' }}>
                  {TICKER_ZONES.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="label">Display mode</label>
                <select className="input" value={localMode} onChange={e => setLocalMode(e.target.value)} style={{ cursor: 'pointer' }}>
                  {TICKER_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 0.7 }}>
                <label className="label">Refresh every</label>
                <select className="input" value={localRefresh} onChange={e => setLocalRefresh(Number(e.target.value))} style={{ cursor: 'pointer' }}>
                  <option value={60}>1 minute</option>
                  <option value={300}>5 minutes</option>
                  <option value={900}>15 minutes</option>
                  <option value={1800}>30 minutes</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">API key secret</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select className="input" value={localSecretId}
                  onChange={e => setLocalSecretId(e.target.value)}
                  style={{ cursor: 'pointer', flex: 1 }}>
                  <option value="">— Select a secret —</option>
                  {secrets.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button className="btn btn-ghost" style={{ fontSize: 12, flexShrink: 0 }}
                  onClick={() => setShowAddSecret(v => !v)}>
                  {showAddSecret ? 'Cancel' : '+ New'}
                </button>
              </div>
              {showAddSecret && (
                <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label className="label">Name</label>
                      <input className="input" value={newSecretName}
                        onChange={e => setNewSecretName(e.target.value)}
                        placeholder="e.g. Finnhub Key" autoFocus />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="label">Value</label>
                      <input className="input" type="password" value={newSecretValue}
                        onChange={e => setNewSecretValue(e.target.value)}
                        placeholder="Paste key here" />
                    </div>
                  </div>
                  <button className="btn btn-primary" style={{ fontSize: 12, alignSelf: 'flex-start' }}
                    disabled={savingSecret || !newSecretName || !newSecretValue}
                    onClick={createSecret}>
                    {savingSecret ? <span className="spinner" /> : 'Save & select'}
                  </button>
                </div>
              )}
            </div>

            {/* Stocks/Crypto symbols */}
            {(ticker.type === 'stocks' || ticker.type === 'crypto') && (
              <div>
                <label className="label">Symbols (comma separated)</label>
                <input className="input" value={localSymbols}
                  onChange={e => setLocalSymbols(e.target.value)}
                  placeholder={ticker.type === 'stocks' ? 'AAPL, MSFT, NVDA, TSLA' : 'BTC, ETH, SOL'} />
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>
                  {ticker.type === 'stocks' ? 'Use standard NYSE/NASDAQ ticker symbols' : 'Use CoinMarketCap symbol codes'}
                </div>
              </div>
            )}

            {/* Weather ticker config — multiple locations */}
            {ticker.type === 'weather' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(localConfig.locations || (localConfig.lat ? [{ lat: localConfig.lat, lon: localConfig.lon, city: localConfig.city, unit: localConfig.unit }] : [])).map((loc: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    background: 'var(--surface2)', borderRadius: 7, fontSize: 13 }}>
                    <span style={{ flex: 1 }}>📍 {loc.city} <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>°{(loc.unit || 'f').toUpperCase()}</span></span>
                    <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)' }}
                      onClick={() => {
                        const locs = localConfig.locations || (localConfig.lat ? [{ lat: localConfig.lat, lon: localConfig.lon, city: localConfig.city, unit: localConfig.unit }] : [])
                        setLocalConfig((c: any) => ({ ...c, locations: locs.filter((_: any, idx: number) => idx !== i), lat: '', lon: '', city: '' }))
                      }}>Remove</button>
                  </div>
                ))}
                <WeatherLocationAdder onAdd={(loc: any) => {
                  const existing = localConfig.locations || (localConfig.lat ? [{ lat: localConfig.lat, lon: localConfig.lon, city: localConfig.city, unit: localConfig.unit }] : [])
                  setLocalConfig((c: any) => ({ ...c, locations: [...existing, loc], lat: '', lon: '', city: '' }))
                }} />
              </div>
            )}

            {/* Sports ticker config — multiple leagues */}
            {ticker.type === 'sports' && (
              <div>
                <label className="label">Leagues</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  {['NFL', 'NBA', 'NHL', 'MLB'].map(league => {
                    const leagues: string[] = localConfig.leagues || [localConfig.league || 'nba']
                    const on = leagues.includes(league.toLowerCase())
                    return (
                      <button key={league} onClick={() => {
                        const cur: string[] = localConfig.leagues || [localConfig.league || 'nba']
                        const next = on ? cur.filter(l => l !== league.toLowerCase()) : [...cur, league.toLowerCase()]
                        setLocalConfig((c: any) => ({ ...c, leagues: next.length ? next : [league.toLowerCase()] }))
                      }} style={{
                        padding: '4px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                        background: on ? 'var(--accent-bg)' : 'var(--surface2)',
                        border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                        color: on ? 'var(--accent2)' : 'var(--text-muted)',
                      }}>{league}</button>
                    )
                  })}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  Select one or more leagues to show on this ticker
                </div>
              </div>
            )}

            {/* RSS ticker config */}
            {ticker.type === 'rss' && (
              <div>
                <label className="label">RSS / Atom feed URL</label>
                <input className="input" value={localConfig.url || ''}
                  onChange={e => setLocalConfig((c: any) => ({ ...c, url: e.target.value }))}
                  placeholder="https://feeds.bbci.co.uk/news/rss.xml" />
              </div>
            )}

            {/* Portico assignment */}
            <div>
              <label className="label">Show on porticos (leave all unselected = show everywhere)</label>
              {porticos.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  No saved porticos yet — ticker shows everywhere. Create porticos in the{' '}
                  <a href="/profile?tab=porticos" style={{ color: 'var(--accent2)' }}>Porticos tab</a> to restrict by view.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {porticos.map(p => {
                      const on = localPorticos.includes(p.id)
                      return (
                        <button key={p.id} onClick={() => setLocalPorticos(prev =>
                          on ? prev.filter(id => id !== p.id) : [...prev, p.id]
                        )} style={{
                          padding: '3px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                          background: on ? 'var(--accent-bg)' : 'var(--surface2)',
                          color: on ? 'var(--accent2)' : 'var(--text-muted)',
                          border: `1px solid ${on ? '#7c6fff30' : 'var(--border)'}`,
                          transition: 'all 0.15s',
                        }}>{p.name}</button>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                    {localPorticos.length === 0 ? 'Showing on all porticos (including Home)' : `Showing on ${localPorticos.length} portico${localPorticos.length !== 1 ? 's' : ''}`}
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={handleSave}>Save</button>
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={onEdit}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Personal Integrations ─────────────────────────────────────────────────────

const INTEGRATION_TYPES = [
  { id: 'authentik',    label: 'Authentik',    desc: 'Identity provider' },
  { id: 'gluetun',      label: 'Gluetun',      desc: 'VPN container' },
  { id: 'kuma',         label: 'Uptime Kuma',  desc: 'Uptime monitoring' },
  { id: 'lidarr',       label: 'Lidarr',       desc: 'Music management' },
  { id: 'opnsense',     label: 'OPNsense',     desc: 'Firewall / router' },
  { id: 'photoprism',   label: 'PhotoPrism',   desc: 'Photo management' },
  { id: 'plex',         label: 'Plex',         desc: 'Media server' },
  { id: 'proxmox',      label: 'Proxmox',      desc: 'Hypervisor' },
  { id: 'radarr',       label: 'Radarr',       desc: 'Movie management' },
  { id: 'sonarr',       label: 'Sonarr',       desc: 'TV show management' },
  { id: 'tautulli',     label: 'Tautulli',     desc: 'Plex analytics' },
  { id: 'transmission', label: 'Transmission', desc: 'Torrent client' },
  { id: 'truenas',      label: 'TrueNAS',      desc: 'NAS management' },
]

function PersonalIntegrationsTab() {
  const userMode = useUserMode()
  const [shared, setShared] = useState<Integration[]>([])
  const [personal, setPersonal] = useState<Integration[]>([])
  const [secrets, setSecrets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [systemCollapsed, setSystemCollapsed] = useState(true)
  const [myCollapsed, setMyCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('sonarr')
  const [newApiUrl, setNewApiUrl] = useState('')
  const [newSkipTls, setNewSkipTls] = useState(false)
  const [newRefreshSecs, setNewRefreshSecs] = useState(60)
  const [editId, setEditId] = useState<string | null>(null)
  const [newUiUrl, setNewUiUrl] = useState('')
  const [newSecretId, setNewSecretId] = useState('')
  const [newSecretName, setNewSecretName] = useState('')
  const [newSecretValue, setNewSecretValue] = useState('')
  const [creating, setCreating] = useState(false)
  const [testResult, setTestResult] = useState<{ok: boolean; error?: string; tlsError?: boolean; skipTlsWorks?: boolean} | null>(null)
  const [testing, setTesting] = useState(false)
  const [showAddSecret, setShowAddSecret] = useState(false)
  const [savingSecret, setSavingSecret] = useState(false)

  const createSecret = async () => {
    if (!newSecretName.trim() || !newSecretValue.trim()) return
    setSavingSecret(true)
    try {
      const res = await secretsApi.create({ name: newSecretName.trim(), value: newSecretValue.trim(), scope: 'personal' })
      setNewSecretId(res.data.id)
      setNewSecretName(''); setNewSecretValue(''); setShowAddSecret(false)
      await load() // re-fetch authoritative list — avoids duplicate from optimistic + fetch
    } finally { setSavingSecret(false) }
  }

  const load = async () => {
    const [shared, personal, sysS] = await Promise.all([
      integrationsApi.list(),
      myIntegrationsApi.list(),
      secretsApi.list(), // already includes user's own + accessible system secrets
    ])
    setShared((shared.data || []).filter((i: Integration) => i.createdBy === 'SYSTEM'))
    setPersonal(personal.data || [])
    setSecrets(sysS.data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const test = async () => {
    if (!newApiUrl) return
    setTesting(true); setTestResult(null)
    try {
      const res = await integrationsApi.test({ type: newType, apiUrl: newApiUrl, secretId: newSecretId || undefined, skipTls: newSkipTls })
      setTestResult(res.data)
    } catch { setTestResult({ ok: false, error: 'Request failed' }) }
    finally { setTesting(false) }
  }

  const create = async () => {
    if (!newName || !newApiUrl) return
    setCreating(true)
    try {
      await integrationsApi.create({ name: newName, type: newType, apiUrl: newApiUrl, uiUrl: newUiUrl, secretId: newSecretId || undefined, skipTls: newSkipTls, refreshSecs: newRefreshSecs, scope: 'personal' })
      setNewName(''); setNewApiUrl(''); setNewUiUrl(''); setNewSecretId(''); setTestResult(null)
      await load()
      setShowForm(false)
    } finally { setCreating(false) }
  }

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return
    await myIntegrationsApi.delete(id); await load()
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  return (
    <div>
      <SectionHelp storageKey="profile_integrations" title="My integrations">
        Personal integrations connect your private services — things only you use that don't
        need to be shared with the whole team. They work identically to system integrations
        but are visible only to you. You can use personal integrations to back personal panels
        from the My Panels tab. Shared integrations configured by your admin also appear here
        for reference but can only be edited from the admin screen.
      </SectionHelp>

      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter integrations..." style={{ fontSize: 13 }} />
      </div>

      {/* System integrations — collapsible read-only */}
      {userMode === 'multi' && shared.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}
            onClick={() => setSystemCollapsed(c => !c)}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{systemCollapsed ? '▶' : '▼'}</span>
            <div className="section-title" style={{ margin: 0 }}>
              System integrations
              <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 6 }}>
                ({shared.length})
              </span>
            </div>
          </div>
          {!systemCollapsed && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {shared.filter(ig => !search || ig.name.toLowerCase().includes(search.toLowerCase())).map(ig => (
              <div key={ig.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
              }}>
                <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'var(--surface2)',
                  color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
                  {INTEGRATION_TYPES.find(t => t.id === ig.type)?.label ?? ig.type}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{ig.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
                  {ig.uiUrl || ig.apiUrl}
                </span>
              </div>
            ))}
          </div>}
        </div>
      )}

      {/* Personal integrations — collapsible */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}
          onClick={() => setMyCollapsed(c => !c)}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{myCollapsed ? '▶' : '▼'}</span>
          <div className="section-title" style={{ margin: 0 }}>
            My integrations
            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 6 }}>
              ({personal.length})
            </span>
          </div>
        </div>
        <button className="btn btn-primary" style={{ fontSize: 12 }}
          onClick={() => setShowForm(f => !f)}>+ Add</button>
      </div>
      {showForm && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1.5 }}>
                <label className="label">Name</label>
                <input className="input" value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. My Sonarr" autoFocus />
              </div>
              <div style={{ flex: 0.7 }}>
                <label className="label">Type</label>
                <select className="input" value={newType} onChange={e => setNewType(e.target.value)} style={{ cursor: 'pointer' }}>
                  {INTEGRATION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="label">API key secret</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select className="input" value={newSecretId}
                    onChange={e => { setNewSecretId(e.target.value); setTestResult(null) }}
                    style={{ cursor: 'pointer', flex: 1 }}>
                    <option value="">— None —</option>
                    {secrets.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button className="btn btn-ghost" style={{ fontSize: 12, flexShrink: 0 }}
                    onClick={() => setShowAddSecret(v => !v)}>
                    {showAddSecret ? 'Cancel' : '+ New'}
                  </button>
                </div>
              </div>
              {showAddSecret && (
                <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label className="label">Name</label>
                      <input className="input" value={newSecretName}
                        onChange={e => setNewSecretName(e.target.value)}
                        placeholder="e.g. Sonarr API Key" autoFocus />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="label">Value</label>
                      <input className="input" type="password" value={newSecretValue}
                        onChange={e => setNewSecretValue(e.target.value)}
                        placeholder="Paste key here" />
                    </div>
                  </div>
                  <button className="btn btn-primary" style={{ fontSize: 12, alignSelf: 'flex-start' }}
                    disabled={savingSecret || !newSecretName || !newSecretValue}
                    onClick={createSecret}>
                    {savingSecret ? <span className="spinner" /> : 'Save & select'}
                  </button>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label className="label">API URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(backend)</span></label>
                <input className="input" value={newApiUrl} onChange={e => { setNewApiUrl(e.target.value); setTestResult(null) }}
                  placeholder="http://sonarr.local:8989" />
              </div>
              <div style={{ flex: 1 }}>
                <label className="label">UI URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(browser, optional)</span></label>
                <input className="input" value={newUiUrl} onChange={e => setNewUiUrl(e.target.value)}
                  placeholder="https://sonarr.yourdomain.com" />
              </div>
            </div>
            {testResult && (
              <div style={{
                padding: '7px 12px', borderRadius: 7, fontSize: 12,
                background: testResult.ok ? '#4ade8018' : '#f8717118',
                border: `1px solid ${testResult.ok ? '#4ade8040' : '#f8717140'}`,
                color: testResult.ok ? 'var(--green)' : 'var(--red)',
              }}>
                {testResult.ok ? '✓ Connection successful' : `✗ ${testResult.error}`}
                {!testResult.ok && testResult.tlsError && testResult.skipTlsWorks && (
                  <div style={{ marginTop: 4, color: 'var(--amber)', fontSize: 11 }}>
                    ⚠ Connection works without certificate verification — enable "Skip TLS" below.
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={newSkipTls} onChange={e => setNewSkipTls(e.target.checked)} />
                Skip TLS <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>(self-signed certs)</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>Refresh every</label>
                <input className="input" type="number" min={15} value={newRefreshSecs}
                  onChange={e => setNewRefreshSecs(Math.max(15, Number(e.target.value)))}
                  style={{ width: 100 }} />
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>s</span>
              </div>
              <div style={{ flex: 1 }} />
              <button className="btn btn-secondary" onClick={test} disabled={testing || !newApiUrl}>
                {testing ? <span className="spinner" /> : 'Test'}
              </button>
              <button className="btn btn-primary" onClick={create} disabled={creating || !newName || !newApiUrl}>
                {creating ? <span className="spinner" /> : 'Create'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setShowForm(false); setTestResult(null) }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {!myCollapsed && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {personal.filter(ig => !search || ig.name.toLowerCase().includes(search.toLowerCase())).map(ig => (
          <div key={ig.id} style={{
            background: 'var(--surface)', border: `1px solid ${editId === ig.id ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 8, overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'var(--surface2)',
                color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
                {INTEGRATION_TYPES.find(t => t.id === ig.type)?.label ?? ig.type}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{ig.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
                {ig.apiUrl}
              </span>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditId(editId === ig.id ? null : ig.id)}>Edit</button>
              <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--red)' }} onClick={() => remove(ig.id, ig.name)}>Delete</button>
            </div>
            {editId === ig.id && (
              <PersonalIntegrationEdit ig={ig} secrets={secrets}
                onSave={async (data) => {
                  // Personal integrations (createdBy !== 'SYSTEM') use the /my/ route
                  // so non-admin users can save without hitting the admin-only route
                  if (ig.createdBy && ig.createdBy !== 'SYSTEM') {
                    await myIntegrationsApi.update(ig.id, data)
                  } else {
                    await integrationsApi.update(ig.id, data)
                  }
                  setEditId(null); await load()
                }}
                onCancel={() => setEditId(null)}
              />
            )}
          </div>
        ))}
        {personal.length === 0 && !showForm && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '12px 0' }}>
            No personal integrations yet.
          </div>
        )}
      </div>}
    </div>
  )
}

function PersonalIntegrationEdit({ ig, secrets, onSave, onCancel }: {
  ig: Integration; secrets: any[]
  onSave: (data: any) => void; onCancel: () => void
}) {
  const [name, setName] = useState(ig.name)
  const [apiUrl, setApiUrl] = useState(ig.apiUrl)
  const [uiUrl, setUiUrl] = useState(ig.uiUrl)
  const [secretId, setSecretId] = useState(ig.secretId || '')
  const [skipTls, setSkipTls] = useState(ig.skipTls || false)
  const [refreshSecs, setRefreshSecs] = useState(ig.refreshSecs || 60)
  const [testResult, setTestResult] = useState<{ok: boolean; error?: string; tlsError?: boolean; skipTlsWorks?: boolean} | null>(null)
  const [testing, setTesting] = useState(false)

  const test = async () => {
    setTesting(true); setTestResult(null)
    try {
      const res = await integrationsApi.test({ type: ig.type, apiUrl, secretId: secretId || undefined, skipTls })
      setTestResult(res.data)
    } catch { setTestResult({ ok: false, error: 'Request failed' }) }
    finally { setTesting(false) }
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1.5 }}>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">API key secret</label>
            <select className="input" value={secretId} onChange={e => { setSecretId(e.target.value); setTestResult(null) }} style={{ cursor: 'pointer' }}>
              <option value="">— None —</option>
              {secrets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="label">API URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(backend)</span></label>
            <input className="input" value={apiUrl} onChange={e => { setApiUrl(e.target.value); setTestResult(null) }} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">UI URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(browser, optional)</span></label>
            <input className="input" value={uiUrl} onChange={e => setUiUrl(e.target.value)} />
          </div>
        </div>
        {testResult && (
          <div style={{
            padding: '7px 12px', borderRadius: 7, fontSize: 12,
            background: testResult.ok ? '#4ade8018' : '#f8717118',
            border: `1px solid ${testResult.ok ? '#4ade8040' : '#f8717140'}`,
            color: testResult.ok ? 'var(--green)' : 'var(--red)',
          }}>
            {testResult.ok ? '✓ Connection successful' : `✗ ${testResult.error}`}
            {!testResult.ok && testResult.tlsError && testResult.skipTlsWorks && (
              <div style={{ marginTop: 4, color: 'var(--amber)', fontSize: 11 }}>
                ⚠ Connection works without certificate verification — enable "Skip TLS" below.
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={skipTls} onChange={e => { setSkipTls(e.target.checked); setTestResult(null) }} />
            Skip TLS <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>(self-signed certs)</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>Refresh every</label>
            <input className="input" type="number" min={15} value={refreshSecs}
              onChange={e => setRefreshSecs(Math.max(15, Number(e.target.value)))}
              style={{ width: 100 }} />
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>s</span>
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={test} disabled={testing}>
            {testing ? <span className="spinner" /> : 'Test'}
          </button>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => onSave({ name, apiUrl, uiUrl, secretId, skipTls, refreshSecs })}>Save</button>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Personal Tags ─────────────────────────────────────────────────────────────

function PersonalGoogleCalendarSection() {
  const [configured, setConfigured] = useState(false)
  const [tokens, setTokens] = useState<any[]>([])

  const load = async () => {
    const res = await googleApi.getConfig()
    setConfigured(res.data.configured)
    if (res.data.configured) {
      const tok = await googleApi.listTokens('personal')
      setTokens(tok.data || [])
    }
  }

  useEffect(() => { load() }, [])

  const handleConnect = async () => {
    const [configRes, userRes] = await Promise.all([googleApi.getConfig(), profileApi.get()])
    window.location.href = googleApi.buildConnectUrl(configRes.data.clientId, 'personal', String(userRes.data.id || ''))
  }

  const handleDisconnect = async (id: string) => {
    if (!confirm('Disconnect this Google account?')) return
    await googleApi.deleteToken(id)
    await load()
  }

  if (!configured) return null

  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>📅 Google Calendar</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
            Connect your Google account to use your calendars in personal panels.
          </div>
        </div>
        <button className="btn btn-ghost" onClick={handleConnect}>+ Connect</button>
      </div>
      {tokens.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '8px 0' }}>
          No accounts connected yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tokens.map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', borderRadius: 8,
              background: 'var(--surface2)', border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 13 }}>📅</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{t.email}</span>
              <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--red)' }}
                onClick={() => handleDisconnect(t.id)}>Disconnect</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const TAG_COLORS = [
  '#6366f1', '#60a5fa', '#34d399', '#f59e0b',
  '#f87171', '#a78bfa', '#fb923c', '#4ade80',
]

function PersonalTagsTab() {
  const userMode = useUserMode()
  const [sharedTags, setSharedTags] = useState<Tag[]>([])
  const [personalTags, setPersonalTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [systemCollapsed, setSystemCollapsed] = useState(true)
  const [myCollapsed, setMyCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(TAG_COLORS[0])
  const [creating, setCreating] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  const load = async () => {
    const [systemRes, myRes] = await Promise.all([tagsApi.list(), myTagsApi.list()])
    setSharedTags((systemRes.data || []).filter((t: Tag) => t.createdBy === 'SYSTEM'))
    setPersonalTags(myRes.data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await myTagsApi.create({ name: newName.trim(), color: newColor })
      setNewName(''); setShowForm(false); await load()
    } finally { setCreating(false) }
  }

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete tag "${name}"?`)) return
    await myTagsApi.delete(id); await load()
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  return (
    <div>
      <SectionHelp storageKey="profile_tags" title="My tags">
        Personal tags are only visible to you — they don't affect other users. Use them to
        add your own filtering layer on top of system tags. For example, you might tag panels
        by project, priority, or context so you can quickly filter to what's relevant right now.
        Personal tags work the same way as system tags: activate them on the dashboard to filter
        which panels are shown.
      </SectionHelp>

      {/* Shared tags — read only display */}
      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter tags..." style={{ fontSize: 13 }} />
      </div>

      {userMode === 'multi' && sharedTags.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}
            onClick={() => setSystemCollapsed(c => !c)}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{systemCollapsed ? '▶' : '▼'}</span>
            <div className="section-title" style={{ margin: 0 }}>
              System tags
              <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 6 }}>
                ({sharedTags.length})
              </span>
            </div>
          </div>
          {!systemCollapsed && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sharedTags.filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase())).map(t => (
              <div key={t.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 10px', borderRadius: 8,
                background: t.color + '18', border: `1px solid ${t.color}40`,
                color: t.color, fontSize: 12,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: t.color }} />
                {t.name}
              </div>
            ))}
          </div>}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}
          onClick={() => setMyCollapsed(c => !c)}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{myCollapsed ? '▶' : '▼'}</span>
          <div className="section-title" style={{ margin: 0 }}>
            My tags
            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 6 }}>
              ({personalTags.length})
            </span>
          </div>
        </div>
        <button className="btn btn-primary" style={{ fontSize: 12 }}
          onClick={() => setShowForm(f => !f)}>+ New tag</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <label className="label">Name</label>
              <input className="input" value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Tag name" autoFocus onKeyDown={e => e.key === 'Enter' && create()} />
            </div>
            <div>
              <label className="label">Color</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {TAG_COLORS.map(c => (
                  <button key={c} onClick={() => setNewColor(c)} style={{
                    width: 22, height: 22, borderRadius: 5, background: c, border: 'none', cursor: 'pointer',
                    outline: newColor === c ? `2px solid ${c}` : 'none', outlineOffset: 2,
                  }} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary" onClick={create} disabled={creating || !newName}>
                {creating ? <span className="spinner" /> : 'Create'}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {!myCollapsed && (
        <>
          {/* Color picker for editing */}
          {editId && (
            <div className="card" style={{ marginBottom: 10, padding: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <label className="label">Name</label>
                  <input className="input" value={editName} onChange={e => setEditName(e.target.value)}
                    style={{ fontSize: 13 }} />
                </div>
                <div>
                  <label className="label">Color</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {TAG_COLORS.map(c => (
                      <button key={c} onClick={() => setEditColor(c)} style={{
                        width: 22, height: 22, borderRadius: 5, background: c, border: 'none', cursor: 'pointer',
                        outline: editColor === c ? `2px solid ${c}` : 'none', outlineOffset: 2,
                      }} />
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={async () => {
                    await myTagsApi.update(editId, { name: editName, color: editColor })
                    setEditId(null); await load()
                  }}>Save</button>
                  <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setEditId(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
          {/* Pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {personalTags.filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase())).map(t => (
              <div key={t.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 4px 3px 10px', borderRadius: 8,
                background: t.color + '18', border: `1px solid ${t.color}40`,
                color: t.color, fontSize: 12, cursor: 'pointer',
                outline: editId === t.id ? `2px solid ${t.color}` : 'none',
              }} onClick={() => { setEditId(t.id); setEditName(t.name); setEditColor(t.color) }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: t.color }} />
                {t.name}
                <button onClick={e => { e.stopPropagation(); remove(t.id, t.name) }} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
                  color: t.color, fontSize: 14, lineHeight: 1, opacity: 0.7,
                }}>×</button>
              </div>
            ))}
            {personalTags.length === 0 && !showForm && (
              <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '4px 0' }}>
                No personal tags yet.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── My Panels ────────────────────────────────────────────────────────────────

const PANEL_TYPES = [
  { id: 'authentik',    label: 'Authentik',    desc: 'Identity provider',              needsIntegration: true  },
  { id: 'checklist',    label: 'Checklist',    desc: 'Todo list with due dates',       needsIntegration: false },
  { id: 'customapi',    label: 'Custom API',   desc: 'Generic JSON API with field mappings', needsIntegration: false },
  { id: 'notes',        label: 'Notes',        desc: 'Multi-note notepad panel',       needsIntegration: false },
  { id: 'rss',          label: 'RSS Feed',     desc: 'Live RSS/Atom feed reader',      needsIntegration: false },
  { id: 'bookmarks',    label: 'Bookmarks',    desc: 'Bookmark tree panel',            needsIntegration: false },
  { id: 'calendar',     label: 'Calendar',     desc: 'Calendar with sources',          needsIntegration: false },
  { id: 'gluetun',      label: 'Gluetun',      desc: 'VPN container',                 needsIntegration: true  },
  { id: 'iframe',       label: 'Web embed',    desc: 'Embed a web page',              needsIntegration: false },
  { id: 'lidarr',       label: 'Lidarr',       desc: 'Music tracking',                needsIntegration: true  },
  { id: 'opnsense',     label: 'OPNsense',     desc: 'Firewall/router',               needsIntegration: true  },
  { id: 'photoprism',   label: 'PhotoPrism',   desc: 'Photo management',              needsIntegration: true  },
  { id: 'plex',         label: 'Plex',         desc: 'Media server',                  needsIntegration: true  },
  { id: 'proxmox',      label: 'Proxmox',      desc: 'Hypervisor',                    needsIntegration: true  },
  { id: 'radarr',       label: 'Radarr',       desc: 'Movie tracking',                needsIntegration: true  },
  { id: 'sonarr',       label: 'Sonarr',       desc: 'TV show tracking',              needsIntegration: true  },
  { id: 'tautulli',     label: 'Tautulli',     desc: 'Plex analytics',                needsIntegration: true  },
  { id: 'custom',       label: 'Text/HTML',    desc: 'Custom HTML or text content',   needsIntegration: false },
  { id: 'transmission', label: 'Transmission', desc: 'BitTorrent client',             needsIntegration: true  },
  { id: 'truenas',      label: 'TrueNAS',      desc: 'NAS management',                needsIntegration: true  },
  { id: 'kuma',         label: 'Uptime Kuma',  desc: 'Status monitoring',             needsIntegration: true  },
]

const HEIGHT_OPTIONS = [
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 3, label: '3x' },
  { value: 4, label: '4x' },
  { value: 5, label: '5x' },
  { value: 6, label: '6x' },
  { value: 7, label: '7x' },
  { value: 8, label: '8x' },
]

function IfaceCapEditor({ initialCaps, onChange }: {
  initialCaps: Record<string,number>
  onChange: (caps: Record<string,number>) => void
}) {
  const [pairs, setPairs] = useState<{dev:string;cap:number}[]>(() =>
    Object.entries(initialCaps).map(([dev, cap]) => ({ dev, cap })))
  const sync = (next: {dev:string;cap:number}[]) => {
    setPairs(next)
    const obj: Record<string,number> = {}
    for (const { dev, cap } of next) { if (dev) obj[dev] = cap }
    onChange(obj)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label className="label">Bandwidth cap per interface</label>
      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
        Device name (e.g. <code>wan</code>, <code>lan</code>) and cap in Mbps. Scales the arc gauges.
      </div>
      {pairs.map((row, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="input" value={row.dev} style={{ fontSize: 12, width: 80 }}
            onChange={e => sync(pairs.map((r,i) => i===idx ? {...r,dev:e.target.value} : r))} />
          <input type="number" className="input" value={row.cap} style={{ fontSize: 12, width: 80 }}
            onChange={e => sync(pairs.map((r,i) => i===idx ? {...r,cap:Number(e.target.value)} : r))} />
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Mbps</span>
          <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)' }}
            onClick={() => sync(pairs.filter((_,i) => i !== idx))}>✕</button>
        </div>
      ))}
      <button className="btn btn-ghost" style={{ fontSize: 12 }}
        onClick={() => sync([...pairs, { dev: '', cap: 1000 }])}>
        + Add interface
      </button>
    </div>
  )
}

function MyPanelsTab() {
  const userMode = useUserMode()
  const [systemPanels, setSystemPanels] = useState<Panel[]>([])
  const [myPanels, setMyPanels] = useState<Panel[]>([])
  const [customAPIPreview, setCustomAPIPreview] = useState<{loading: boolean; json: string; error: string} | null>(null)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [systemCollapsed, setSystemCollapsed] = useState(true)
  const [myCollapsed, setMyCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [expandedPanelId, setExpandedPanelId] = useState<string | null>(null)
  const [myTags, setMyTags] = useState<Tag[]>([])
  const [editTitle, setEditTitle] = useState('')
  const [editHeight, setEditHeight] = useState(2)
  const [savingPanel, setSavingPanel] = useState(false)
  const [editUrl, setEditUrl] = useState('')
  const [editHtml, setEditHtml] = useState('')
  const [editIntegrationId, setEditIntegrationId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState('bookmarks')
  const [newHeight, setNewHeight] = useState(2)
  const [newIntegrationId, setNewIntegrationId] = useState('')
  const [creating, setCreating] = useState(false)

  const load = async () => {
    const [system, mine, allI, t] = await Promise.all([
      panelsApi.list(),
      myPanelsApi.list(),
      integrationsApi.list(), // already includes personal integrations visible to this user
      myTagsApi.list(),
    ])
    setSystemPanels((system.data || []).filter((p: Panel) => p.createdBy === 'SYSTEM'))
    setMyPanels(mine.data || [])
    setIntegrations(allI.data || [])
    setMyTags(t.data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const configForType = (integrationId: string, height: number) => {
    const base: any = { height }
    if (integrationId) base.integrationId = integrationId
    return JSON.stringify(base)
  }

  const create = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      await myPanelsApi.create({
        title: newTitle.trim(),
        type: newType,
        config: configForType(newIntegrationId, newHeight),
      })
      setNewTitle(''); setNewType('bookmarks'); setNewHeight(2); setNewIntegrationId('')
      await load()
      setShowForm(false)
    } finally { setCreating(false) }
  }

  const remove = async (id: string, title: string) => {
    if (!confirm(`Delete panel "${title}"?`)) return
    await myPanelsApi.delete(id); await load()
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  const needsIntegration = ['sonarr', 'radarr', 'lidarr', 'plex', 'tautulli', 'truenas', 'proxmox', 'kuma', 'gluetun', 'opnsense', 'transmission', 'photoprism', 'authentik'].includes(newType)
  const compatibleIntegrations = integrations.filter(i =>
    newType === 'calendar' ? true : i.type === newType
  )

  return (
    <div>
      {/* Search only at top */}
      <SectionHelp storageKey="profile_mypanels" title="My panels">
        Personal panels are visible only to you and don't appear in the system panel list.
        Use them for services or integrations that are just for you — personal Sonarr, a
        private calendar, or anything else you don't want to share. System panels (shared
        by your admin) are shown here for reference but can't be edited from this screen.
      </SectionHelp>
      <div style={{ marginBottom: 16 }}>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter panels..." style={{ fontSize: 13 }} />
      </div>

      {/* System panels — collapsible read-only */}
      {userMode === 'multi' && systemPanels.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}
            onClick={() => setSystemCollapsed(c => !c)}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{systemCollapsed ? '▶' : '▼'}</span>
            <div className="section-title" style={{ margin: 0 }}>
              System panels
              <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 6 }}>
                ({systemPanels.length})
              </span>
            </div>
          </div>
          {!systemCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {systemPanels.filter(p => !search || p.title.toLowerCase().includes(search.toLowerCase())).map(p => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                }}>
                  <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4,
                    background: 'var(--surface2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
                    {PANEL_TYPES.find(t => t.id === p.type)?.label ?? p.type}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{p.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* My panels — collapsible with Add button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}
          onClick={() => setMyCollapsed(c => !c)}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{myCollapsed ? '▶' : '▼'}</span>
          <div className="section-title" style={{ margin: 0 }}>
            My panels
            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 6 }}>
              ({myPanels.length})
            </span>
          </div>
        </div>
        <button className="btn btn-primary" style={{ fontSize: 12 }}
          onClick={() => setShowForm(f => !f)}>+ New panel</button>
      </div>

      {/* New panel form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label className="label">Title</label>
                <input className="input" value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  placeholder="My Sonarr" autoFocus />
              </div>
              <div style={{ flex: 0.5 }}>
                <label className="label">Type</label>
                <select className="input" value={newType}
                  onChange={e => { setNewType(e.target.value); setNewIntegrationId('') }}
                  style={{ cursor: 'pointer' }}>
                  {PANEL_TYPES.map(t => {
                    const hasInt = !t.needsIntegration || integrations.some((i: any) => i.type === t.id)
                    return <option key={t.id} value={t.id}>{t.label}{!hasInt ? ' ⚠' : ''}</option>
                  })}
                </select>
                {(() => {
                  const t = PANEL_TYPES.find(p => p.id === newType)
                  if (!t?.needsIntegration) return null
                  const hasInt = integrations.some((i: any) => i.type === newType)
                  if (hasInt) return <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>✓ integration available</div>
                  return <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4 }}>
                    ⚠ No {newType} integration. <a href="/profile?tab=integrations" style={{ color: 'var(--accent2)' }}>Add one →</a>
                  </div>
                })()}
              </div>
              <div style={{ flex: 0.4 }}>
                <label className="label">Height</label>
                <select className="input" value={newHeight}
                  onChange={e => setNewHeight(Number(e.target.value))}
                  style={{ cursor: 'pointer' }}>
                  {HEIGHT_OPTIONS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                </select>
              </div>
            </div>
            {needsIntegration && (
              <div>
                <label className="label">Integration</label>
                <select className="input" value={newIntegrationId}
                  onChange={e => setNewIntegrationId(e.target.value)}
                  style={{ cursor: 'pointer' }}>
                  <option value="">— Select integration —</option>
                  {compatibleIntegrations.map(i => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
                {compatibleIntegrations.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                    No {newType} integrations found. Add one in My Integrations first.
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={create}
                disabled={creating || !newTitle}>
                {creating ? <span className="spinner" /> : 'Create'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {!myCollapsed && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {myPanels.filter(p => !search || p.title.toLowerCase().includes(search.toLowerCase())).map(p => {
          let cfg: any = {}
          try { cfg = JSON.parse(p.config || '{}') } catch {}
          const expanded = expandedPanelId === p.id

          return (
            <div key={p.id} style={{
              background: 'var(--surface)',
              border: `1px solid ${expanded ? 'var(--border2)' : 'var(--border)'}`,
              borderRadius: 8, overflow: 'hidden',
            }}>
              {/* Row header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
                onClick={() => {
                  if (!expanded) {
                    setEditTitle(p.title)
                    setEditHeight(cfg.height ?? 2)
                    setEditUrl(cfg.url || '')
                    setEditHtml(cfg.html || '')
                    setEditIntegrationId(cfg.integrationId || '')
                  }
                  setExpandedPanelId(expanded ? null : p.id)
                }}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{expanded ? '▼' : '▶'}</span>
                <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4,
                  background: 'var(--surface2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
                  {PANEL_TYPES.find(t => t.id === p.type)?.label ?? p.type}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{p.title}</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
                  {cfg.height ?? 2}x
                </span>
                <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6 }}>

                  <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--red)' }}
                    onClick={() => remove(p.id, p.title)}>Delete</button>
                </div>
              </div>

              {/* Expanded edit area */}
              {expanded && (
                <div style={{ borderTop: '1px solid var(--border)', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Rename + resize */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label className="label">Title</label>
                      <input className="input" value={editTitle} onChange={e => setEditTitle(e.target.value)}
                        style={{ fontSize: 13 }} />
                    </div>
                    <div style={{ flex: 0.4 }}>
                      <label className="label">Height</label>
                      <select className="input" value={editHeight}
                        onChange={e => setEditHeight(Number(e.target.value))}
                        style={{ cursor: 'pointer' }}>
                        <option value={1}>1x</option>
                        <option value={2}>2x</option>
                        <option value={3}>3x</option>
                        <option value={4}>4x</option>
                        <option value={5}>5x</option>
                        <option value={6}>6x</option>
                        <option value={7}>7x</option>
                        <option value={8}>8x</option>
                      </select>
                    </div>
                  </div>

                  {/* Configure for iframe/custom */}
                  {p.type === 'iframe' && (
                    <div>
                      <label className="label">Embed URL</label>
                      <input className="input" style={{ fontSize: 13 }}
                        value={editUrl} onChange={e => setEditUrl(e.target.value)}
                        placeholder="https://example.com" />
                    </div>
                  )}
                  {p.type === 'custom' && (
                    <div>
                      <label className="label">HTML content</label>
                      <textarea className="input" style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', minHeight: 80, resize: 'vertical' }}
                        value={editHtml} onChange={e => setEditHtml(e.target.value)}
                        placeholder="<div>Your custom HTML here</div>" />
                    </div>
                  )}
                  {/* Integration picker for sonarr/radarr/etc */}
                  {['sonarr','radarr','lidarr','plex','tautulli','truenas','proxmox','kuma','gluetun','opnsense','transmission','photoprism','authentik'].includes(p.type) && (
                    <div>
                      <label className="label">Integration</label>
                      <select className="input" style={{ cursor: 'pointer' }}
                        value={editIntegrationId}
                        onChange={e => setEditIntegrationId(e.target.value)}>
                        <option value="">— Select integration —</option>
                        {integrations.filter(i => i.type === p.type).map(i => (
                          <option key={i.id} value={i.id}>{i.name}</option>
                        ))}
                      </select>
                      {integrations.filter(i => i.type === p.type).length === 0 && (
                        <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4 }}>
                          No {p.type} integrations found. Add one in My Integrations first.
                        </div>
                      )}
                    </div>
                  )}
                  {['radarr','sonarr','plex'].includes(p.type) && (() => {
                    const cfg = (() => { try { return JSON.parse(p.config || '{}') } catch { return {} } })()
                    return (
                      <div>
                        <label className="label">Allowed ratings <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional, comma separated)</span></label>
                        <input className="input" style={{ fontSize: 12 }}
                          defaultValue={cfg.allowedRatings || ''}
                          onChange={e => { cfg.allowedRatings = e.target.value }}
                          placeholder="e.g. G, PG, PG-13 — blank = show all" />
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                          Unrated / NR content is excluded when a filter is active.
                        </div>
                      </div>
                    )
                  })()}
                  {/* OPNsense max link speed */}
                  {p.type === 'customapi' && (() => {
                    const cfg = (() => { try { return JSON.parse(p.config || '{}') } catch { return {} } })()
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                        <label className="label">API URL</label>
                        <input className="input" type="url" style={{ fontSize: 12 }}
                          defaultValue={cfg.url || ''}
                          onChange={e => { cfg.url = e.target.value }}
                          placeholder="http://host:port/api/stats" />
                        <label className="label">Panel link URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span></label>
                        <input className="input" type="url" style={{ fontSize: 12 }}
                          defaultValue={cfg.uiUrl || ''}
                          onChange={e => { cfg.uiUrl = e.target.value }}
                          placeholder="http://host:port/dashboard" />
                        <label className="label">Bearer token (optional)</label>
                        <input className="input" style={{ fontSize: 12 }}
                          defaultValue={cfg.apiKey || ''}
                          onChange={e => { cfg.apiKey = e.target.value }}
                          placeholder="Leave blank if no auth required" />
                        <label className="label">Field mappings</label>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>
                          One per line: <code>path | Label</code> or <code>path | Label | format</code>
                        </div>
                        <textarea className="input" style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', minHeight: 60, resize: 'vertical' }}
                          defaultValue={(cfg.mappings || []).map((m: any) =>
                            m.format ? `${m.path} | ${m.label} | ${m.format}` : `${m.path} | ${m.label}`).join('\n')}
                          onChange={e => { cfg.mappings = e.target.value.split('\n')
                            .map((l: string) => l.trim()).filter((l: string) => l.includes('|'))
                            .map((l: string) => { const p = l.split('|').map((s: string) => s.trim()); return { path: p[0], label: p[1]||'', format: p[2]||'' } }) }} />
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button className="btn btn-secondary" style={{ fontSize: 11 }}
                            disabled={customAPIPreview?.loading}
                            onClick={async () => {
                              if (!cfg.url) return
                              setCustomAPIPreview({ loading: true, json: '', error: '' })
                              try {
                                const res = await fetch('/api/customapi/preview', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${localStorage.getItem('stoa_token')}` },
                                  body: JSON.stringify({ url: cfg.url, apiKey: cfg.apiKey })
                                })
                                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                                setCustomAPIPreview({ loading: false, json: JSON.stringify(await res.json(), null, 2), error: '' })
                              } catch (e: any) {
                                setCustomAPIPreview({ loading: false, json: '', error: e.message })
                              }
                            }}>
                            {customAPIPreview?.loading ? <span className="spinner" /> : 'Test & Preview'}
                          </button>
                        </div>
                        {customAPIPreview && !customAPIPreview.loading && (
                          customAPIPreview.error
                            ? <div style={{ fontSize: 12, color: 'var(--red)' }}>{customAPIPreview.error}</div>
                            : <textarea readOnly value={customAPIPreview.json}
                                style={{ width: '100%', minHeight: 120, fontSize: 11,
                                  fontFamily: 'DM Mono, monospace', background: 'var(--surface)',
                                  border: '1px solid var(--border)', borderRadius: 6, padding: 8,
                                  color: 'var(--text-muted)', resize: 'vertical', boxSizing: 'border-box' }} />
                        )}
                      </div>
                    )
                  })()}

                  {p.type === 'rss' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label className="label">Feed URL</label>
                      <input className="input" type="url" style={{ fontSize: 12 }}
                        defaultValue={cfg.feedUrl || ''}
                        onChange={e => { cfg.feedUrl = e.target.value }}
                        placeholder="https://example.com/feed.xml" />
                      <label className="label">Panel link URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span></label>
                      <input className="input" type="url" style={{ fontSize: 12 }}
                        defaultValue={cfg.uiUrl || ''}
                        onChange={e => { cfg.uiUrl = e.target.value }}
                        placeholder="https://freshrss.example.com" />
                    </div>
                  )}
                  {p.type === 'opnsense' && (
                    <IfaceCapEditor initialCaps={cfg.ifaceCaps || {}} onChange={caps => {
                      cfg.ifaceCaps = caps
                      delete cfg.maxMbps
                    }} />
                  )}

                  {/* Calendar sources */}
                  {p.type === 'calendar' && (() => {
                    const existingSources: any[] = (() => { try { return JSON.parse(p.config || '{}').sources || [] } catch { return [] } })()
                    const calIntegrations = integrations.filter((i: any) => ['sonarr','radarr','lidarr'].includes(i.type))
                    return (
                      <div>
                        <label className="label">Calendar sources</label>
                        {existingSources.map((src: any, si: number) => {
                          const ig = integrations.find((i: any) => i.id === src.integrationId)
                          return (
                            <div key={si} style={{
                              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                              background: 'var(--surface2)', borderRadius: 7, marginBottom: 6, fontSize: 13,
                            }}>
                              <span style={{ flex: 1 }}>
                                {src.type === 'weather'
                                  ? <span>🌤 {src.city || `${src.lat}, ${src.lon}`}</span>
                                  : src.type === 'google' ? (src.label || src.integrationId) : src.type === 'checklist' ? <>☑ {src.label || 'Checklist'}</> : (ig?.name ?? src.integrationId)
                                }
                                {src.daysAhead && <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>{src.daysAhead}d ahead</span>}
                              </span>
                              <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)' }}
                                onClick={async () => {
                                  const newSources = existingSources.filter((_: any, idx: number) => idx !== si)
                                  const cfg = (() => { try { return JSON.parse(p.config || '{}') } catch { return {} } })()
                                  const newConfig = JSON.stringify({ ...cfg, sources: newSources })
                                  const isSystem = !p.createdBy || p.createdBy === 'SYSTEM'
                                  if (isSystem) await panelsApi.update(p.id, { title: p.title, config: newConfig })
                                  else await myPanelsApi.update(p.id, { title: p.title, config: newConfig })
                                  await load()
                                }}>Remove</button>
                            </div>
                          )
                        })}
                        <UnifiedPersonalCalendarSourceAdder
                          panelId={p.id} panelTitle={p.title} panelConfig={p.config}
                          isSystem={!p.createdBy || p.createdBy === 'SYSTEM'}
                          integrations={calIntegrations}
                          onAdded={load}
                        />
                      </div>
                    )
                  })()}

                  {/* Tag assignment */}
                  {myTags.length > 0 && (
                    <div>
                      <label className="label">Tags</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        {myTags.map(t => {
                          const hasTag = p.tags?.some((pt: any) => pt.id === t.id)
                          return (
                            <button key={t.id} onClick={async () => {
                              if (hasTag) await panelsApi.removeTag(p.id, t.id)
                              else await panelsApi.addTag(p.id, t.id)
                              await load()
                            }} style={{
                              padding: '2px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12,
                              background: hasTag ? t.color + '20' : 'transparent',
                              border: `1px solid ${hasTag ? t.color + '60' : 'var(--border)'}`,
                              color: hasTag ? t.color : 'var(--text-dim)',
                            }}>{t.name}</button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Save */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" style={{ fontSize: 12 }}
                      disabled={savingPanel}
                      onClick={async () => {
                        setSavingPanel(true)
                        try {
                          const newCfg = { ...cfg, height: editHeight }
                          if (p.type === 'iframe') newCfg.url = editUrl
                          if (p.type === 'custom') newCfg.html = editHtml
                          if (['sonarr','radarr','lidarr','plex','tautulli','truenas','proxmox','kuma','gluetun','opnsense','transmission','photoprism','authentik'].includes(p.type)) newCfg.integrationId = editIntegrationId
                          await myPanelsApi.update(p.id, { title: editTitle, config: JSON.stringify(newCfg) })
                          setExpandedPanelId(null)
                          await load()
                        } finally { setSavingPanel(false) }
                      }}>
                      {savingPanel ? <span className="spinner" /> : 'Save'}
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 12 }}
                      onClick={() => setExpandedPanelId(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {myPanels.filter(p => !search || p.title.toLowerCase().includes(search.toLowerCase())).length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '12px 0' }}>
            {search ? 'No panels match your search.' : 'No personal panels yet.'}
          </div>
        )}
      </div>}


    </div>
  )
}

function UnifiedPersonalCalendarSourceAdder({ panelId, panelTitle, panelConfig, isSystem, integrations, onAdded }: {
  panelId: string; panelTitle: string; panelConfig: string; isSystem: boolean
  integrations: any[]; onAdded: () => void
}) {
  const [sourceKind, setSourceKind] = useState<'integration'|'google'|'weather'|'checklist'>('integration')
  const [intId, setIntId] = useState('')
  const [googleTokenId, setGoogleTokenId] = useState('')
  const [googleCalendarId, setGoogleCalendarId] = useState('primary')
  const [googleCalendars, setGoogleCalendars] = useState<any[]>([])
  const [googleTokens, setGoogleTokens] = useState<any[]>([])
  const [city, setCity] = useState('')
  const [unit, setUnit] = useState<'f'|'c'>('f')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [adding, setAdding] = useState(false)
  const [checklistPanels, setChecklistPanels] = useState<Panel[]>([])
  const [checklistPanelId, setChecklistPanelId] = useState('')

  useEffect(() => {
    googleApi.getConfig().then((res: any) => {
      if (res.data.configured) {
        googleApi.listTokens(isSystem ? 'system' : 'personal').then((r: any) => setGoogleTokens(r.data || []))
      }
    }).catch(() => {})
    // Load checklist panels — personal only for personal calendar
    myPanelsApi.list().then((r: any) =>
      setChecklistPanels((r.data || []).filter((p: any) => p.type === 'checklist'))
    ).catch(() => {})
  }, [isSystem])

  useEffect(() => {
    if (googleTokenId) {
      googleApi.listCalendars(googleTokenId).then((r: any) => {
        setGoogleCalendars(r.data || [])
        setGoogleCalendarId('primary')
      })
    }
  }, [googleTokenId])

  const search = async () => {
    if (!city.trim()) return
    setSearching(true); setSearchResults([])
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en&format=json`)
      const data = await res.json()
      setSearchResults(data.results || [])
    } catch { setSearchResults([]) }
    finally { setSearching(false) }
  }

  const add = async (weatherResult?: any) => {
    setAdding(true)
    try {
      const cfg = (() => { try { return JSON.parse(panelConfig || '{}') } catch { return {} } })()
      let newSource: any
      if (sourceKind === 'weather' && weatherResult) {
        const label = `${weatherResult.name}, ${weatherResult.admin1 || weatherResult.country}`
        newSource = { type: 'weather', lat: String(weatherResult.latitude), lon: String(weatherResult.longitude), city: label, unit }
      } else if (sourceKind === 'google') {
        if (!googleTokenId) return
        const tok = googleTokens.find((t: any) => t.id === googleTokenId)
        newSource = { type: 'google', integrationId: googleTokenId, calendarId: googleCalendarId, daysAhead: 14, label: tok?.email || googleTokenId }
      } else if (sourceKind === 'checklist') {
        if (!checklistPanelId) return
        const cl = checklistPanels.find((p: any) => p.id === checklistPanelId)
        newSource = { type: 'checklist', panelId: checklistPanelId, label: cl?.title || 'Checklist' }
      } else {
        if (!intId) return
        const ig = integrations.find((i: any) => i.id === intId)
        newSource = { type: ig?.type, integrationId: intId, daysAhead: 14, label: ig?.name || ig?.type }
      }
      const sources = [...(cfg.sources || []), newSource]
      const updater = isSystem ? panelsApi : myPanelsApi
      await updater.update(panelId, { title: panelTitle, config: JSON.stringify({ ...cfg, sources }) })
      setIntId(''); setGoogleTokenId(''); setCity(''); setSearchResults([]); setChecklistPanelId('')
      onAdded()
    } finally { setAdding(false) }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <select className="input" value={sourceKind}
          onChange={e => { setSourceKind(e.target.value as any); setIntId(''); setGoogleTokenId(''); setCity(''); setSearchResults([]); setChecklistPanelId('') }}
          style={{ cursor: 'pointer', width: 160, fontSize: 12 }}>
          <option value="integration">Stoa integration</option>
          {googleTokens.length > 0 && <option value="google">Google Calendar</option>}
          <option value="weather">Weather</option>
          {checklistPanels.length > 0 && <option value="checklist">Checklist</option>}
        </select>

        {sourceKind === 'integration' && (
          <>
            <select className="input" value={intId} onChange={e => setIntId(e.target.value)}
              style={{ cursor: 'pointer', flex: 1, fontSize: 12 }}>
              <option value="">— Select integration —</option>
              {integrations.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <button className="btn btn-secondary" style={{ fontSize: 12 }}
              onClick={() => add()} disabled={adding || !intId}>
              {adding ? <span className="spinner" /> : 'Add'}
            </button>
          </>
        )}

        {sourceKind === 'checklist' && (
          <>
            <select className="input" value={checklistPanelId} onChange={e => setChecklistPanelId(e.target.value)}
              style={{ cursor: 'pointer', flex: 1, fontSize: 12 }}>
              <option value="">— Select checklist panel —</option>
              {checklistPanels.map((p: Panel) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <button className="btn btn-secondary" style={{ fontSize: 12 }}
              onClick={() => add()} disabled={adding || !checklistPanelId}>
              {adding ? <span className="spinner" /> : 'Add'}
            </button>
          </>
        )}

        {sourceKind === 'google' && (
          <>
            <select className="input" value={googleTokenId} onChange={e => setGoogleTokenId(e.target.value)}
              style={{ cursor: 'pointer', flex: 1, fontSize: 12 }}>
              <option value="">— Select account —</option>
              {googleTokens.map((t: any) => <option key={t.id} value={t.id}>{t.email}</option>)}
            </select>
            {googleCalendars.length > 0 && (
              <select className="input" value={googleCalendarId} onChange={e => setGoogleCalendarId(e.target.value)}
                style={{ cursor: 'pointer', flex: 1, fontSize: 12 }}>
                {googleCalendars.map((c: any) => <option key={c.id} value={c.id}>{c.summary}</option>)}
              </select>
            )}
            <button className="btn btn-secondary" style={{ fontSize: 12 }}
              onClick={() => add()} disabled={adding || !googleTokenId}>
              {adding ? <span className="spinner" /> : 'Add'}
            </button>
          </>
        )}

        {sourceKind === 'weather' && (
          <>
            <input className="input" value={city} onChange={e => setCity(e.target.value)}
              placeholder="City name..." style={{ flex: 1, fontSize: 12 }}
              onKeyDown={e => e.key === 'Enter' && search()} />
            <select className="input" value={unit} onChange={e => setUnit(e.target.value as 'f'|'c')}
              style={{ width: 65, fontSize: 12, cursor: 'pointer' }}>
              <option value="f">°F</option>
              <option value="c">°C</option>
            </select>
            <button className="btn btn-secondary" style={{ fontSize: 12 }}
              onClick={search} disabled={searching || !city.trim()}>
              {searching ? <span className="spinner" /> : 'Search'}
            </button>
          </>
        )}
      </div>

      {sourceKind === 'weather' && searchResults.length > 0 && (
        <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {searchResults.map((r: any, i: number) => (
            <button key={i} onClick={() => add(r)} disabled={adding}
              style={{ width: '100%', padding: '8px 12px', background: 'var(--surface2)',
                border: 'none', borderBottom: i < searchResults.length-1 ? '1px solid var(--border)' : 'none',
                textAlign: 'left', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
              {r.name}, {r.admin1 || ''} <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{r.country}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
