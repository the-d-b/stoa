import { useEffect, useState } from 'react'
import { googleApi } from '../../api'

// ── Admin: Google Calendar Config ─────────────────────────────────────────────
// One panel for credentials (client ID/secret), separate panel for connected accounts.

export default function GoogleCalendarConfigPanel() {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [configured, setConfigured] = useState(false)
  const [tokens, setTokens] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = async () => {
    const res = await googleApi.getConfig()
    setClientId(res.data.clientId || '')
    setConfigured(res.data.configured)
    const tok = await googleApi.listTokens('system')
    setTokens(tok.data || [])
  }

  useEffect(() => { load() }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await googleApi.saveConfig({ clientId, clientSecret })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      await load()
    } finally { setSaving(false) }
  }

  const handleConnect = async () => {
    const res = await googleApi.getConfig()
    window.location.href = googleApi.buildConnectUrl(res.data.clientId, 'system', 'system')
  }

  const handleDisconnect = async (id: string) => {
    if (!confirm('Disconnect this Google account?')) return
    await googleApi.deleteToken(id)
    await load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 600 }}>

      {/* ── App credentials ──────────────────────────────────────────────── */}
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Google Cloud credentials</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
          From your Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID.
          Configure once — shared across all connected accounts.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label className="label">Client ID</label>
            <input className="input" value={clientId}
              onChange={e => setClientId(e.target.value)}
              placeholder="your-client-id.apps.googleusercontent.com" />
          </div>
          <div>
            <label className="label">Client Secret</label>
            <input className="input" type="password" value={clientSecret}
              onChange={e => setClientSecret(e.target.value)}
              placeholder={configured ? '••••••• (leave blank to keep current)' : 'your-client-secret'} />
          </div>
          <div>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner" /> : saved ? '✓ Saved' : 'Save credentials'}
            </button>
          </div>
        </div>
      </div>

      {/* ── System-connected accounts ─────────────────────────────────────── */}
      {configured && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>System-connected accounts</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                These calendars are available as sources for system calendar panels.
              </div>
            </div>
            <button className="btn btn-ghost" onClick={handleConnect}>
              + Connect account
            </button>
          </div>
          {tokens.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '12px 0' }}>
              No accounts connected yet. Click "+ Connect account" to link a Google account.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tokens.map(t => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 8,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: 13 }}>📅</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{t.email}</span>
                  <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--red)' }}
                    onClick={() => handleDisconnect(t.id)}>Disconnect</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
