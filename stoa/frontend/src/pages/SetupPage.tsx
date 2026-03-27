import { useState } from 'react'
import { authApi, SetupRequest } from '../api'
import { useAuth } from '../context/AuthContext'
import { StoaLogo } from '../App'

interface Props {
  onComplete: () => void
}

type Step = 'welcome' | 'admin' | 'app' | 'done'

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

  const update = (k: keyof SetupRequest, v: string) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    setError('')
    if (form.adminPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (form.adminPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      await authApi.setupInit(form)
      // Auto-login after setup
      const res = await authApi.login(form.adminUsername, form.adminPassword)
      login(res.data.token, res.data.user)
      setStep('done')
      setTimeout(onComplete, 1500)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <StoaLogo size={48} />
          <h1 className="mt-3 text-2xl font-semibold text-gray-100">stoa</h1>
          <p className="text-sm text-gray-500 mt-1">first-run setup</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {(['welcome', 'admin', 'app'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full transition-colors ${
                step === s ? 'bg-stoa-500' :
                stepIndex(step) > i ? 'bg-stoa-700' : 'bg-gray-700'
              }`} />
            </div>
          ))}
        </div>

        <div className="card">
          {step === 'welcome' && (
            <div>
              <h2 className="text-lg font-semibold text-gray-100 mb-2">Welcome to Stoa</h2>
              <p className="text-sm text-gray-400 mb-6">
                Let's get you set up. This wizard runs once to create your admin account
                and configure the basics. You can change everything later from the admin panel.
              </p>
              <button className="btn-primary w-full" onClick={() => setStep('admin')}>
                Get started →
              </button>
            </div>
          )}

          {step === 'admin' && (
            <div>
              <h2 className="text-lg font-semibold text-gray-100 mb-1">Admin account</h2>
              <p className="text-sm text-gray-500 mb-6">
                This local account is your permanent fallback — it always works even if OAuth is misconfigured.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="label">Username</label>
                  <input
                    className="input"
                    value={form.adminUsername}
                    onChange={(e) => update('adminUsername', e.target.value)}
                    placeholder="admin"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input
                    type="password"
                    className="input"
                    value={form.adminPassword}
                    onChange={(e) => update('adminPassword', e.target.value)}
                    placeholder="min 8 characters"
                  />
                </div>
                <div>
                  <label className="label">Confirm password</label>
                  <input
                    type="password"
                    className="input"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="confirm password"
                  />
                </div>
              </div>

              {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

              <div className="flex gap-3 mt-6">
                <button className="btn-secondary flex-1" onClick={() => setStep('welcome')}>
                  Back
                </button>
                <button
                  className="btn-primary flex-1"
                  onClick={() => {
                    if (!form.adminUsername || !form.adminPassword) {
                      setError('Username and password are required')
                      return
                    }
                    if (form.adminPassword !== confirmPassword) {
                      setError('Passwords do not match')
                      return
                    }
                    if (form.adminPassword.length < 8) {
                      setError('Password must be at least 8 characters')
                      return
                    }
                    setError('')
                    setStep('app')
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {step === 'app' && (
            <div>
              <h2 className="text-lg font-semibold text-gray-100 mb-1">App settings</h2>
              <p className="text-sm text-gray-500 mb-6">
                The URL Stoa is reachable at. Used to build OAuth callback URLs.
              </p>

              <div>
                <label className="label">App URL</label>
                <input
                  className="input"
                  value={form.appUrl}
                  onChange={(e) => update('appUrl', e.target.value)}
                  placeholder="https://stoa.yourdomain.home"
                />
                <p className="text-xs text-gray-600 mt-1">
                  OAuth redirect will be: {form.appUrl}/api/auth/oauth/callback
                </p>
              </div>

              {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

              <div className="flex gap-3 mt-6">
                <button className="btn-secondary flex-1" onClick={() => setStep('admin')}>
                  Back
                </button>
                <button
                  className="btn-primary flex-1"
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  {loading ? 'Setting up...' : 'Finish setup'}
                </button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">✓</div>
              <h2 className="text-lg font-semibold text-gray-100 mb-1">Setup complete</h2>
              <p className="text-sm text-gray-500">Signing you in...</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-700 mt-6">
          OAuth can be configured after setup from the admin panel.
        </p>
      </div>
    </div>
  )
}

function stepIndex(step: Step): number {
  return ['welcome', 'admin', 'app', 'done'].indexOf(step)
}
