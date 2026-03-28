import { useState } from 'react'
import { authApi } from '../api'
import { useAuth } from '../context/AuthContext'
import { StoaLogo } from '../App'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.login(username, password)
      login(res.data.token, res.data.user)
    } catch {
      setError('Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -20%, #7c6fff18, transparent)',
    }}>
      <div className="fade-up" style={{ width: '100%', maxWidth: 380 }}>

        {/* Logo block */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <StoaLogo size={36} />
            <span style={{ fontSize: 26, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              stoa
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>your self-hosted dashboard</div>
        </div>

        <div className="card fade-up-1" style={{ padding: 28 }}>
          {/* SSO button */}
          <a
            href={authApi.oauthLoginUrl()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, width: '100%', background: 'var(--accent)',
              color: 'white', fontWeight: 500, padding: '10px 16px',
              borderRadius: 8, textDecoration: 'none', fontSize: 14,
              transition: 'all 0.15s',
            }}
            onMouseOver={e => (e.currentTarget.style.background = 'var(--accent2)')}
            onMouseOut={e => (e.currentTarget.style.background = 'var(--accent)')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" /><path d="M6 20v-2a6 6 0 0 1 12 0v2" />
            </svg>
            Continue with SSO
          </a>

          <div className="divider fade-up-2" style={{ margin: '20px 0' }}>or</div>

          {/* Local login */}
          <form onSubmit={handleLocalLogin} className="fade-up-2">
            <div style={{ marginBottom: 14 }}>
              <label className="label">Username</label>
              <input
                className="input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                autoFocus
                autoComplete="username"
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div style={{
                background: '#f8717110', border: '1px solid #f8717130',
                color: 'var(--red)', borderRadius: 8, padding: '8px 12px',
                fontSize: 13, marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-secondary" style={{ width: '100%' }} disabled={loading}>
              {loading ? <span className="spinner" /> : 'Sign in with local account'}
            </button>
          </form>
        </div>

        <div className="fade-up-3" style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--text-dim)' }}>
          stoa v0.0.1
        </div>
      </div>
    </div>
  )
}
