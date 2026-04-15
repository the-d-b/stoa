import { useEffect, useState } from 'react'
import { configApi, oauthTestApi, googleApi, OAuthConfig } from '../../api'

export default function OAuthConfigPanel() {
  const [config, setConfig] = useState<OAuthConfig>({ clientId: '', clientSecret: '', issuerUrl: '', redirectUrl: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    configApi.getOAuth()
      .then(res => setConfig({ ...res.data, clientSecret: '' }))
      .finally(() => setLoading(false))
  }, [])

  const update = (k: keyof OAuthConfig, v: string) => setConfig(c => ({ ...c, [k]: v }))

  const handleSave = async () => {
    setSaving(true); setError(''); setTestResult(null)
    try {
      await configApi.saveOAuth(config)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch { setError('Failed to save') }
    finally { setSaving(false) }
  }

  const handleTest = async () => {
    setTesting(true); setTestResult(null)
    try {
      const res = await oauthTestApi.test(config.issuerUrl)
      if (res.data.ok) {
        setTestResult({ ok: true, message: `Connected — issuer: ${res.data.issuer}` })
      } else {
        setTestResult({ ok: false, message: res.data.error || 'Connection failed' })
      }
    } catch {
      setTestResult({ ok: false, message: 'Request failed — check the issuer URL' })
    } finally {
      setTesting(false)
    }
  }

  if (loading) return <Loading />

  return (
    <div style={{ maxWidth: 560 }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0, marginBottom: 28, lineHeight: 1.7 }}>
        Configure an OIDC provider (Authentik, Keycloak, etc.) for single sign-on.
        The redirect URL must be registered in your OAuth application.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Field label="Issuer URL" hint="e.g. https://authentik.example.com/application/o/stoa/">
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" value={config.issuerUrl}
              onChange={e => { update('issuerUrl', e.target.value); setTestResult(null) }}
              placeholder="https://authentik.example.com/application/o/stoa/" />
            <button
              className="btn btn-secondary"
              style={{ flexShrink: 0, fontSize: 12 }}
              onClick={handleTest}
              disabled={testing || !config.issuerUrl}
            >
              {testing ? <span className="spinner" /> : 'Test'}
            </button>
          </div>
          {testResult && (
            <div style={{
              marginTop: 8, padding: '6px 10px', borderRadius: 6, fontSize: 12,
              background: testResult.ok ? '#4ade8012' : '#f8717112',
              border: `1px solid ${testResult.ok ? '#4ade8030' : '#f8717130'}`,
              color: testResult.ok ? 'var(--green)' : 'var(--red)',
            }}>
              {testResult.ok ? '✓ ' : '✕ '}{testResult.message}
            </div>
          )}
        </Field>

        <Field label="Client ID">
          <input className="input" value={config.clientId}
            onChange={e => update('clientId', e.target.value)}
            placeholder="your-client-id" />
        </Field>

        <Field label="Client Secret" hint="Leave blank to keep the existing secret">
          <input type="password" className="input" value={config.clientSecret || ''}
            onChange={e => update('clientSecret', e.target.value)}
            placeholder="••••••••••••" />
        </Field>

        <Field label="Redirect URL" hint="Register this exact URL in your OAuth provider">
          <input className="input" value={config.redirectUrl}
            onChange={e => update('redirectUrl', e.target.value)}
            placeholder="https://stoa.example.com/api/auth/oauth/callback" />
        </Field>
      </div>

      {error && <ErrorBox message={error} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 28 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner" /> : 'Save changes'}
        </button>
        {saved && (
          <span style={{ fontSize: 13, color: 'var(--green)' }}>✓ Saved</span>
        )}
      </div>
    </div>
  )
}

export function GoogleCalendarConfigPanel() {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [configured, setConfigured] = useState(false)
  const [tokens, setTokens] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    googleApi.getConfig().then(res => {
      setClientId(res.data.clientId || '')
      setConfigured(res.data.configured)
    })
    googleApi.listTokens('system').then(res => setTokens(res.data || []))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await googleApi.saveConfig({ clientId, clientSecret })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
      const res = await googleApi.getConfig()
      setConfigured(res.data.configured)
    } finally { setSaving(false) }
  }

  const handleConnect = () => {
    window.location.href = googleApi.connectUrl('system')
  }

  const handleDisconnect = async (id: string) => {
    await googleApi.deleteToken(id)
    const res = await googleApi.listTokens('system')
    setTokens(res.data || [])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
        Configure Google Calendar OAuth to allow Stoa to read Google Calendar events.
        You need a Google Cloud project with the Calendar API enabled.
      </div>
      <div>
        <label className="label">Google OAuth Client ID</label>
        <input className="input" value={clientId} onChange={e => setClientId(e.target.value)}
          placeholder="your-client-id.apps.googleusercontent.com" />
      </div>
      <div>
        <label className="label">Google OAuth Client Secret</label>
        <input className="input" type="password" value={clientSecret}
          onChange={e => setClientSecret(e.target.value)}
          placeholder={configured ? '••••••••••••• (leave blank to keep current)' : 'your-client-secret'} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner" /> : saved ? '✓ Saved' : 'Save credentials'}
        </button>
        {configured && (
          <button className="btn btn-ghost" onClick={handleConnect}>
            + Connect Google account
          </button>
        )}
      </div>
      {tokens.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8,
            textTransform: 'uppercase', letterSpacing: '0.05em' }}>Connected accounts</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tokens.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 8, background: 'var(--surface2)',
                border: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ flex: 1 }}>{t.email}</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>system</span>
                <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--red)' }}
                  onClick={() => handleDisconnect(t.id)}>Disconnect</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 5, fontFamily: 'DM Mono, monospace' }}>{hint}</div>}
    </div>
  )
}

function Loading() { return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div> }
function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{
      background: '#f8717110', border: '1px solid #f8717130', color: 'var(--red)',
      borderRadius: 8, padding: '8px 12px', fontSize: 13, marginTop: 16,
    }}>{message}</div>
  )
}
