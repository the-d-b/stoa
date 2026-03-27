import { useEffect, useState } from 'react'
import { configApi, OAuthConfig } from '../../api'

export default function OAuthConfigPanel() {
  const [config, setConfig] = useState<OAuthConfig>({
    clientId: '',
    clientSecret: '',
    issuerUrl: '',
    redirectUrl: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    configApi.getOAuth()
      .then((res) => setConfig({ ...res.data, clientSecret: '' }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await configApi.saveOAuth(config)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Failed to save OAuth config')
    } finally {
      setSaving(false)
    }
  }

  const update = (k: keyof OAuthConfig, v: string) =>
    setConfig((c) => ({ ...c, [k]: v }))

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>

  return (
    <div className="max-w-xl">
      <p className="text-sm text-gray-500 mb-6">
        Configure Authentik (or any OIDC provider) for single sign-on.
        The redirect URL below must be registered in your OAuth application.
      </p>

      <div className="space-y-4">
        <div>
          <label className="label">Issuer URL</label>
          <input
            className="input"
            value={config.issuerUrl}
            onChange={(e) => update('issuerUrl', e.target.value)}
            placeholder="https://authentik.yourdomain.home/application/o/stoa"
          />
          <p className="text-xs text-gray-600 mt-1">
            Found in your Authentik application's OpenID configuration URL.
          </p>
        </div>

        <div>
          <label className="label">Client ID</label>
          <input
            className="input"
            value={config.clientId}
            onChange={(e) => update('clientId', e.target.value)}
            placeholder="your-client-id"
          />
        </div>

        <div>
          <label className="label">Client Secret</label>
          <input
            type="password"
            className="input"
            value={config.clientSecret || ''}
            onChange={(e) => update('clientSecret', e.target.value)}
            placeholder="leave blank to keep existing secret"
          />
        </div>

        <div>
          <label className="label">Redirect URL</label>
          <input
            className="input"
            value={config.redirectUrl}
            onChange={(e) => update('redirectUrl', e.target.value)}
            placeholder="https://stoa.yourdomain.home/api/auth/oauth/callback"
          />
          <p className="text-xs text-gray-600 mt-1">
            Register this exact URL in your OAuth provider application.
          </p>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

      <div className="flex items-center gap-3 mt-6">
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {saved && <span className="text-sm text-green-400">✓ Saved</span>}
      </div>
    </div>
  )
}
