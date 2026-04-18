import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../api'
import { StoaLogo } from '../App'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) setError('Invalid or missing reset token.')
  }, [token])

  const handleSubmit = async () => {
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSaving(true); setError('')
    try {
      await authApi.resetConfirm(token, password)
      setDone(true)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Reset failed — the link may have expired.')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
      <div className="card" style={{ width: '100%', maxWidth: 380, padding: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <StoaLogo size={32} />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 600, textAlign: 'center',
          margin: '0 0 24px 0' }}>Set new password</h2>

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 14, color: 'var(--green)', marginBottom: 20 }}>
              Password updated successfully.
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }}
              onClick={() => navigate('/login')}>
              Sign in
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="password" className="input" placeholder="New password"
              value={password} onChange={e => { setPassword(e.target.value); setError('') }}
              autoFocus onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            <input type="password" className="input" placeholder="Confirm password"
              value={confirm} onChange={e => { setConfirm(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            {error && (
              <div style={{ fontSize: 13, color: 'var(--red)', padding: '6px 10px',
                background: '#f8717112', borderRadius: 6, border: '1px solid #f8717130' }}>
                {error}
              </div>
            )}
            <button className="btn btn-primary" onClick={handleSubmit}
              disabled={saving || !token}>
              {saving ? <span className="spinner" /> : 'Set password'}
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/login')}
              style={{ fontSize: 12 }}>
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
