import { useEffect, useState } from 'react'
import { configApi, OAuthConfig } from '../../api'

export default function OAuthConfigPanel() {
  const [config, setConfig] = useState<OAuthConfig>({ clientId: '', clientSecret: '', issuerUrl: '', redirectUrl: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    configApi.getOAuth()
      .then(res => setConfig({ ...res.data, clientSecret: '' }))
      .finally(() => setLoading(false))
  }, [])

  const update = (k: keyof OAuthConfig, v: string) => setConfig(c => ({ ...c, [k]: v }))

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      await configApi.saveOAuth(config)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch { setError('Failed to save') }
    finally { setSaving(false) }
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
          <input className="input" value={config.issuerUrl} onChange={e => update('issuerUrl', e.target.value)}
            placeholder="https://authentik.example.com/application/o/stoa/" />
        </Field>
        <Field label="Client ID">
          <input className="input" value={config.clientId} onChange={e => update('clientId', e.target.value)}
            placeholder="your-client-id" />
        </Field>
        <Field label="Client Secret" hint="Leave blank to keep the existing secret">
          <input type="password" className="input" value={config.clientSecret || ''}
            onChange={e => update('clientSecret', e.target.value)} placeholder="••••••••••••" />
        </Field>
        <Field label="Redirect URL" hint="Register this exact URL in your OAuth provider">
          <input className="input" value={config.redirectUrl} onChange={e => update('redirectUrl', e.target.value)}
            placeholder="https://stoa.example.com/api/auth/oauth/callback" />
        </Field>
      </div>

      {error && <ErrorBox message={error} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 28 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner" /> : 'Save changes'}
        </button>
        {saved && (
          <span style={{ fontSize: 13, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
            ✓ Saved
          </span>
        )}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string, hint?: string, children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 5, fontFamily: 'DM Mono, monospace' }}>{hint}</div>}
    </div>
  )
}

function Loading() {
  return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{
      background: '#f8717110', border: '1px solid #f8717130', color: 'var(--red)',
      borderRadius: 8, padding: '8px 12px', fontSize: 13, marginTop: 16,
    }}>{message}</div>
  )
}
