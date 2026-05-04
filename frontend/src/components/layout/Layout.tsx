import { useState, useEffect, useRef } from 'react'
import { glyphsApi, tickersApi, Glyph } from '../../api'
import GlyphZone from '../glyphs/GlyphZone'
import TickerStrip from '../tickers/TickerStrip'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

import { StoaLogo } from '../../App'
import { APP_VERSION } from '../../version'
import { useSSEStatus, useChatSSE } from '../../hooks/useSSE'
import ChatPanel from './ChatPanel'
import { useUserMode, useAutoLogin, useUserModeLoaded } from '../../context/UserModeContext'

export default function Layout() {
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const { avatarUrl, setAvatarUrl } = useAuth()
  const [glyphs, setGlyphs] = useState<Glyph[]>([])
  const [tickers, setTickers] = useState<any[]>([])
  const [activePorticoId, setActivePorticoId] = useState(() => sessionStorage.getItem('active_portico') || 'home')
  const [chatOpen, setChatOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const sseStatus = useSSEStatus()
  const chatOpenRef = useRef(false)
  chatOpenRef.current = chatOpen

  // Request notification permission on mount (silently — no prompt if already decided)
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Reset title and unread count when chat opens
  useEffect(() => {
    if (chatOpen) {
      setUnreadCount(0)
      document.title = 'Stoa'
    }
  }, [chatOpen])

  // Increment unread, update title, fire notification when message arrives and panel is closed
  useChatSSE((msg: any) => {
    if (chatOpenRef.current) return // panel is open — user already sees it
    setUnreadCount(c => {
      const next = c + 1
      document.title = `(${next}) Stoa`
      return next
    })
    // Web Notification — only if tab is not focused
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      const sender = msg?.username || msg?.user || 'Someone'
      const text = msg?.text || msg?.message || 'New message'
      const n = new Notification(`Stoa — ${sender}`, {
        body: text.length > 80 ? text.slice(0, 80) + '…' : text,
        icon: '/favicon.ico',
        tag: 'stoa-chat', // replaces previous notification instead of stacking
      })
      n.onclick = () => { window.focus(); n.close() }
    }
  })

  const location = useLocation()

  useEffect(() => {
    if (!user) return
    // avatarUrl comes from AuthContext — no separate fetch needed
  }, [user?.id])

  // Reload glyphs on every route change so navigating from /profile -> / shows updates immediately
  useEffect(() => {
    if (!user) return
    const loadGlyphs = () => {
      tickersApi.list().then(r => setTickers(r.data || [])).catch(() => {})
      glyphsApi.list().then(r => {
        setGlyphs(r.data || [])
      }).catch(() => {})
    }
    loadGlyphs()
    window.addEventListener('focus', loadGlyphs)
    return () => window.removeEventListener('focus', loadGlyphs)
  }, [user?.id, location.pathname])
  // Listen for portico-change events dispatched by DashboardPage
  // This is more reliable than polling sessionStorage since it fires immediately on switch
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail || 'home'
      setActivePorticoId(id)
    }
    window.addEventListener('portico-change', handler)
    return () => window.removeEventListener('portico-change', handler)
  }, [])

  const onAdmin = location.pathname.startsWith('/admin')
  const userMode = useUserMode()
  const autoLogin = useAutoLogin()
  const modeLoaded = useUserModeLoaded()

  return (
    <>
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        position: 'sticky', top: 0, zIndex: 50,
        backdropFilter: 'blur(12px)',
      }}>
        <div className="header-inner" style={{
          maxWidth: 1100, margin: '0 auto', padding: '0 24px',
          height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* Logo */}
          <Link to="/" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            textDecoration: 'none', color: 'var(--text)',
          }}>
            <StoaLogo size={24} />
            <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.01em' }}>stoa</span>
          </Link>

          {/* Header glyphs left */}
          <GlyphZone glyphs={glyphs} zone="header-left" activePorticoId={activePorticoId} />

          {/* Header glyphs right */}
          <GlyphZone glyphs={glyphs} zone="header-right" activePorticoId={activePorticoId} />

          {/* Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => navigate('/profile')}
              title="Profile"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 8, border: 'none',
                background: 'var(--accent-bg)', color: 'var(--accent2)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                marginRight: 4, transition: 'all 0.15s',
                flexShrink: 0,
              }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--accent)'}
              onMouseOut={e => e.currentTarget.style.background = 'var(--accent-bg)'}
            >
              {avatarUrl
                ? <img src={avatarUrl} style={{ width: 28, height: 28, borderRadius: 7, objectFit: 'cover' }}
                    onError={() => setAvatarUrl('')} />
                : (user?.username?.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || '?')
              }
            </button>

            {isAdmin && modeLoaded && userMode === 'multi' && (
              <Link
                to="/admin"
                title="Admin"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, borderRadius: 8,
                  color: onAdmin ? 'var(--accent2)' : 'var(--text-muted)',
                  background: onAdmin ? 'var(--accent-bg)' : 'transparent',
                  transition: 'all 0.15s', textDecoration: 'none',
                }}
                onMouseOver={e => { if (!onAdmin) e.currentTarget.style.background = 'var(--surface2)' }}
                onMouseOut={e => { if (!onAdmin) e.currentTarget.style.background = 'transparent' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </Link>
            )}

            <Link
              to="/help"
              title="Help"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 8,
                color: 'var(--text-dim)', background: 'transparent',
                transition: 'all 0.15s', textDecoration: 'none',
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)' }}
              onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-dim)' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </Link>

            {modeLoaded && !autoLogin && <button
              onClick={logout}
              title="Sign out"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 8, border: 'none',
                background: 'transparent', color: 'var(--text-muted)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)' }}
              onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>}
          </div>
        </div>
        {/* Header ticker strip — inside sticky header, sticks with it */}
        <TickerStrip tickers={tickers} zone="header" activePorticoId={activePorticoId} />
      </header>

      {/* Main */}
      <main className="main-content" style={{ flex: 1, margin: '0 auto', width: '100%', padding: '32px 24px', boxSizing: 'border-box' }}>
        <Outlet />
      </main>

      {/* Footer + ticker — sticky unit at bottom of viewport */}
      <div style={{ position: 'sticky', bottom: 0, zIndex: 40 }}>
        <TickerStrip tickers={tickers} zone="footer" activePorticoId={activePorticoId} />
        <footer style={{
          borderTop: '1px solid var(--border)', padding: '8px 24px',
          background: 'var(--surface)',
          backdropFilter: 'blur(12px)',
        }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
        }}>
          {/* Left: version + footer-left glyphs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace',
              opacity: 0.5 }}>v{APP_VERSION}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GlyphZone glyphs={glyphs} zone="footer-left" activePorticoId={activePorticoId} />
              <span title={`SSE: ${sseStatus}`} style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: sseStatus === 'connected' ? 'var(--green)'
                  : sseStatus === 'reconnecting' ? 'var(--amber)'
                  : 'var(--red)',
                boxShadow: sseStatus === 'connected' ? '0 0 4px var(--green)' : 'none',
                transition: 'background 0.3s',
              }} />
            </div>
          </div>
          {/* Center */}
          <GlyphZone glyphs={glyphs} zone="footer-center" activePorticoId={activePorticoId} />
          {/* Right: footer-right glyphs then chat icon at far right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GlyphZone glyphs={glyphs} zone="footer-right" activePorticoId={activePorticoId} />
            <button onClick={() => { setChatOpen(v => !v); setUnreadCount(0); document.title = 'Stoa' }}
              title={unreadCount > 0 ? `Chat (${unreadCount} unread)` : 'Chat'}
              style={{
                width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)',
                background: chatOpen ? 'var(--accent-bg)' : 'var(--surface)',
                color: chatOpen ? 'var(--accent2)' : 'var(--text-dim)',
                cursor: 'pointer', fontSize: 15, display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                position: 'relative',
              }}>
              💬
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  minWidth: 16, height: 16, borderRadius: 8,
                  background: 'var(--red)', color: 'white',
                  fontSize: 10, fontWeight: 700, lineHeight: '16px',
                  textAlign: 'center', padding: '0 3px',
                  boxSizing: 'border-box', pointerEvents: 'none',
                }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
        </footer>
      </div>
    </div>
    <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)}
      currentUserId={user?.id || ''} singleUser={userMode === 'single'} />
    </>
  )
}
