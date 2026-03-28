import { useState } from 'react'
import { authApi, SetupRequest } from '../api'
import { useAuth } from '../context/AuthContext'
import { StoaLogo } from '../App'

interface Props { onComplete: () => void }
type Step = 'welcome' | 'admin' | 'app' | 'done'

const STEPS: Step[] = ['welcome', 'admin', 'app', 'done']

export default function SetupPage({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome')
  const [form, setForm] = useState<SetupRequest>({
    adminUsername: '',
    adminPassword: '',
    appUrl: window.location.origin,
  })
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()

  const update = (k: keyof SetupRequest, v: string) => setForm(f => ({ ...f, [k]: v }))
  const stepIndex = STEPS.indexOf(step)

  const validateAdmin = () => {
    if (!form.adminUsername) return 'Username is required'
    if (!form.adminPassword) return 'Password is required'
    if (form.adminPassword.length < 8) return 'Password must be at least 8 characters'
    if (form.adminPassword !== confirmPassword) return 'Passwords do not match'
    return ''
  }

  const handleFinish = async () => {
    setError('')
    setLoading(true)
    try {
      await authApi.setupInit(form)
      const res = await authApi.login(form.adminUsername, form.adminPassword)
      login(res.data.token, res.data.user)
      setStep('done')
      setTimeout(onComplete, 1200)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Setup failed — check the logs')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      backgroundImage: 'radial-gradient(ellipse 60% 40% at 50% 0%, #7c6fff14, transparent)',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* Header */}
        <div className="fade-up" style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <StoaLogo size={32} />
            <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>stoa</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>first-run setup</div>
        </div>

        {/* Step dots */}
        <div className="fade-up-1" style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 28 }}>
          {(['welcome', 'admin', 'app'] as Step[]).map((s, i) => (
            <div key={s} style={{
              width: step === s ? 20 : 6, height: 6, borderRadius: 3,
              background: stepIndex > i ? 'var(--accent)' : step === s ? 'var(--accent)' : 'var(--surface2)',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>

        <div className="card fade-up-2" style={{ padding: 32 }}>

          {/* ── Welcome ── */}
          {step === 'welcome' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10, marginTop: 0 }}>Welcome</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 28, lineHeight: 1.7 }}>
                This wizard runs once to create your admin account and configure the basics.
                Everything can be changed later from the admin panel.
              </p>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setStep('admin')}>
                Get started →
              </button>
            </div>
          )}

          {/* ── Admin account ── */}
          {step === 'admin' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, marginTop: 0 }}>Admin account</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
                This local account is your permanent fallback — it works even when OAuth is misconfigured.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
                <div>
                  <label className="label">Username</label>
                  <input className="input" value={form.adminUsername} onChange={e => update('adminUsername', e.target.value)} placeholder="admin" autoFocus />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input type="password" className="input" value={form.adminPassword} onChange={e => update('adminPassword', e.target.value)} placeholder="min 8 characters" />
                </div>
                <div>
                  <label className="label">Confirm password</label>
                  <input type="password" className="input" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="confirm password" />
                </div>
              </div>
              {error && <ErrorBox message={error} />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setError(''); setStep('welcome') }}>Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => {
                  const e = validateAdmin()
                  if (e) { setError(e); return }
                  setError(''); setStep('app')
                }}>Next →</button>
              </div>
            </div>
          )}

          {/* ── App settings ── */}
          {step === 'app' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, marginTop: 0 }}>App settings</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
                The URL Stoa is reachable at — used to build OAuth callback URLs.
              </p>
              <div style={{ marginBottom: 24 }}>
                <label className="label">App URL</label>
                <input className="input" value={form.appUrl} onChange={e => update('appUrl', e.target.value)} placeholder="https://stoa.yourdomain.home" />
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6, fontFamily: 'DM Mono, monospace' }}>
                  callback → {form.appUrl}/api/auth/oauth/callback
                </div>
              </div>
              {error && <ErrorBox message={error} />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setError(''); setStep('admin') }}>Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleFinish} disabled={loading}>
                  {loading ? <span className="spinner" /> : 'Finish setup'}
                </button>
              </div>
            </div>
          )}

          {/* ── Done ── */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>Setup complete</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>Signing you in...</p>
            </div>
          )}
        </div>

        <div className="fade-up-3" style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-dim)' }}>
          OAuth can be configured after setup from the admin panel
        </div>
      </div>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{
      background: '#f8717110', border: '1px solid #f8717130',
      color: 'var(--red)', borderRadius: 8, padding: '8px 12px',
      fontSize: 13, marginBottom: 16,
    }}>
      {message}
    </div>
  )
}
