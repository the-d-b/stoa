import { useEffect, useState } from 'react'
import { configApi, oauthTestApi, OAuthConfig } from '../../api'

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

        <Field label="Redirect URL" hint="The full callback URL to register in your OAuth provider. Set this to your Stoa domain + /api/auth/oauth/callback">
          <input className="input" value={config.redirectUrl}
            onChange={e => update('redirectUrl', e.target.value)}
            placeholder={window.location.origin + '/api/auth/oauth/callback'} />
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
