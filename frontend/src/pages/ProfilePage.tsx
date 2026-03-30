import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { StoaLogo } from '../App'
import { panelsApi, myPanelsApi, myBookmarksApi, Panel } from '../api'
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

  // Allow ?tab=bookmarks in URL
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const t = params.get('tab') as Tab
    if (t && ['overview', 'bookmarks', 'panels'].includes(t)) setTab(t)
  }, [location.search])

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '○' },
    { id: 'bookmarks', label: 'My Bookmarks', icon: '↗' },
    { id: 'panels', label: 'Panel Order', icon: '▤' },
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
      <nav style={{
        display: 'flex', gap: 4, marginBottom: 28,
        borderBottom: '1px solid var(--border)',
      }}>
        {tabs.map(t => {
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => { setTab(t.id); navigate(`/profile?tab=${t.id}`, { replace: true }) }} style={{
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

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab />}
      {tab === 'bookmarks' && <BookmarksTab />}
      {tab === 'panels' && <PanelsOrderTab />}
    </div>
  )
}

// ── Overview ──────────────────────────────────────────────────────────────────

function OverviewTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[
        { title: 'Theme', desc: 'Use the color wheel in the bottom corner to change your theme', done: true },
        { title: 'Email address', desc: 'Update your email address', done: false },
        { title: 'Profile picture', desc: 'Upload a custom avatar', done: false },
        { title: 'Date & time format', desc: 'Customize how dates and times are displayed', done: false },
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
          <span style={{ fontSize: 11, color: item.done ? 'var(--green)' : 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
            {item.done ? '✓ available' : 'coming soon'}
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
  // Reuse BookmarksPanel but with personal API
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0, marginBottom: 20, lineHeight: 1.7 }}>
        Your personal bookmarks — only visible to you. Create a personal panel from the Panel Order tab to display them on your dashboard.
      </p>
      <BookmarksPanel personalMode apiOverride={myBookmarksApi} />
    </div>
  )
}

// ── Panel Order ───────────────────────────────────────────────────────────────

function PanelsOrderTab() {
  const [panels, setPanels] = useState<Panel[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  useEffect(() => {
    panelsApi.list().then(r => {
      const sorted = (r.data || []).sort((a: Panel, b: Panel) => a.position - b.position)
      setPanels(sorted)
    }).finally(() => setLoading(false))
  }, [])

  const handleDragStart = (index: number) => setDragging(index)
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOver(index)
  }
  const handleDrop = (index: number) => {
    if (dragging === null || dragging === index) { setDragging(null); setDragOver(null); return }
    const newPanels = [...panels]
    const [moved] = newPanels.splice(dragging, 1)
    newPanels.splice(index, 0, moved)
    setPanels(newPanels)
    setDragging(null)
    setDragOver(null)
  }

  const saveOrder = async () => {
    setSaving(true)
    try {
      const order = panels.map((p, i) => ({ panelId: p.id, position: i }))
      await panelsApi.updateOrder(null, order)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const moveUp = (index: number) => {
    if (index === 0) return
    const newPanels = [...panels]
    ;[newPanels[index - 1], newPanels[index]] = [newPanels[index], newPanels[index - 1]]
    setPanels(newPanels)
  }

  const moveDown = (index: number) => {
    if (index === panels.length - 1) return
    const newPanels = [...panels]
    ;[newPanels[index], newPanels[index + 1]] = [newPanels[index + 1], newPanels[index]]
    setPanels(newPanels)
  }

  const addPersonalPanel = async () => {
    const title = prompt('Panel title:')
    if (!title?.trim()) return
    await myPanelsApi.create({ type: 'bookmarks', title: title.trim(), config: '{}' })
    const res = await panelsApi.list()
    const sorted = (res.data || []).sort((a: Panel, b: Panel) => a.position - b.position)
    setPanels(sorted)
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.7, maxWidth: 460 }}>
          Drag to reorder panels on your Home wall, or use the arrows. Changes apply to your view only.
        </p>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 16 }}>
          <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={addPersonalPanel}>
            + Personal panel
          </button>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={saveOrder} disabled={saving}>
            {saving ? <span className="spinner" /> : saved ? '✓ Saved' : 'Save order'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {panels.map((panel, index) => (
          <div
            key={panel.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={e => handleDragOver(e, index)}
            onDrop={() => handleDrop(index)}
            onDragEnd={() => { setDragging(null); setDragOver(null) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 8,
              background: dragOver === index ? 'var(--accent-bg)' : 'var(--surface)',
              border: `1px solid ${dragOver === index ? 'var(--accent)' : 'var(--border)'}`,
              cursor: 'grab', transition: 'all 0.1s',
              opacity: dragging === index ? 0.4 : 1,
            }}
          >
            <span style={{ color: 'var(--text-dim)', fontSize: 14, cursor: 'grab', userSelect: 'none' }}>⠿</span>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{panel.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1, fontFamily: 'DM Mono, monospace' }}>
                {panel.scope === 'personal' ? 'personal' : 'shared'} · {panel.type}
              </div>
            </div>

            {/* Tag dots */}
            <div style={{ display: 'flex', gap: 3 }}>
              {(panel.tags || []).map(t => (
                <span key={t.id} style={{ width: 6, height: 6, borderRadius: '50%', background: t.color }} title={t.name} />
              ))}
            </div>

            {/* Arrow controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <button onClick={() => moveUp(index)} disabled={index === 0} style={{
                background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer',
                color: index === 0 ? 'var(--text-dim)' : 'var(--text-muted)', fontSize: 10, padding: '0 4px',
                opacity: index === 0 ? 0.3 : 0.7, lineHeight: 1,
              }}>▲</button>
              <button onClick={() => moveDown(index)} disabled={index === panels.length - 1} style={{
                background: 'none', border: 'none', cursor: index === panels.length - 1 ? 'default' : 'pointer',
                color: index === panels.length - 1 ? 'var(--text-dim)' : 'var(--text-muted)', fontSize: 10, padding: '0 4px',
                opacity: index === panels.length - 1 ? 0.3 : 0.7, lineHeight: 1,
              }}>▼</button>
            </div>

            {/* Delete personal panels */}
            {panel.scope === 'personal' && (
              <button onClick={async () => {
                if (!confirm(`Delete "${panel.title}"?`)) return
                await myPanelsApi.delete(panel.id)
                const res = await panelsApi.list()
                setPanels((res.data || []).sort((a: Panel, b: Panel) => a.position - b.position))
              }} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--red)', fontSize: 11, opacity: 0.5, padding: '0 4px',
              }}
                onMouseOver={e => e.currentTarget.style.opacity = '1'}
                onMouseOut={e => e.currentTarget.style.opacity = '0.5'}
              >✕</button>
            )}
          </div>
        ))}
        {panels.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '24px 0' }}>No panels yet.</div>}
      </div>
    </div>
  )
}
