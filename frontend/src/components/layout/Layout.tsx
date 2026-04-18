import { useState, useEffect } from 'react'
import { glyphsApi, tickersApi, Glyph } from '../../api'
import GlyphZone from '../glyphs/GlyphZone'
import TickerStrip from '../tickers/TickerStrip'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { profileApi } from '../../api'
import { StoaLogo } from '../../App'
import { APP_VERSION } from '../../version'
import { useUserMode, useAutoLogin, useUserModeLoaded } from '../../context/UserModeContext'

export default function Layout() {
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [avatarUrl, setAvatarUrl] = useState('')
  const [glyphs, setGlyphs] = useState<Glyph[]>([])
  const [tickers, setTickers] = useState<any[]>([])
  const [activePorticoId, setActivePorticoId] = useState(() => sessionStorage.getItem('active_portico') || 'home')

  const location = useLocation()

  useEffect(() => {
    if (!user) return
    profileApi.get().then((r: any) => setAvatarUrl(r.data.avatarUrl || '')).catch(() => {})
  }, [user?.id])

  // Reload glyphs on every route change so navigating from /profile -> / shows updates immediately
  useEffect(() => {
    if (!user) return
    const loadGlyphs = () => {
      tickersApi.list().then(r => setTickers(r.data || [])).catch(() => {})
      glyphsApi.list().then(r => {
        console.log('[Layout] glyphs loaded:', r.data?.length)
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
          <GlyphZone glyphs={glyphs} zone="header-left" />

          {/* Header glyphs right */}
          <GlyphZone glyphs={glyphs} zone="header-right" />

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
      <main className="main-content" style={{ flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', padding: '32px 24px' }}>
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
          <GlyphZone glyphs={glyphs} zone="footer-left" />
          <GlyphZone glyphs={glyphs} zone="footer-center" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <GlyphZone glyphs={glyphs} zone="footer-right" />
            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>stoa {APP_VERSION}</span>
          </div>
        </div>
        </footer>
      </div>
    </div>
  )
}
