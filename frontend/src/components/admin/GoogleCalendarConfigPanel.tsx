import { useEffect, useState } from 'react'
import SectionHelp from './SectionHelp'
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

  const handleRefreshChange = async (id: string, secs: number) => {
    setTokens(prev => prev.map(t => t.id === id ? { ...t, refreshSecs: secs } : t))
    await googleApi.setTokenRefreshSecs(id, secs)
  }

  const handleDaysAheadChange = async (id: string, days: number) => {
    setTokens(prev => prev.map(t => t.id === id ? { ...t, daysAhead: days } : t))
    await googleApi.setTokenDaysAhead(id, days)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 600 }}>

      <SectionHelp storageKey="google_cal_config" title="About Google Calendar">
        Google Calendar integration lets you display calendar events as a panel on your dashboard —
        upcoming meetings, reminders, and appointments shown alongside your other services.
        <br /><br />
        <strong>Setup is two steps:</strong> First, enter your Google Cloud OAuth credentials here (one-time setup,
        shared across all accounts). Then connect one or more Google accounts — each account can expose
        multiple calendars which you can add as panel sources from the Panels admin screen.
        <br /><br />
        <strong>To get credentials:</strong> Go to Google Cloud Console → APIs &amp; Services → Credentials →
        Create OAuth 2.0 Client ID. Set the application type to "Web application" and add your Stoa URL +
        <code>/api/auth/google/callback</code> as an authorized redirect URI. Enable the Google Calendar API
        in the APIs &amp; Services library.
        <br /><br />
        <strong>Your Stoa URL must be a real, publicly-resolvable domain</strong> — Google rejects
        non-ICANN TLDs like <code>.home</code>, <code>.local</code>, or <code>.lan</code> as an OAuth
        redirect host outright ("doesn't comply with Google's OAuth 2.0 policy"), even though nothing
        needs to be internet-reachable at connect time beyond the redirect itself. If your dashboard
        normally lives at a <code>.home</code>-style address, point a real domain you own at it (even
        just for this callback) before connecting Google Calendar.
      </SectionHelp>

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
                  <select className="input" value={t.refreshSecs ?? 1800}
                    onChange={e => handleRefreshChange(t.id, Number(e.target.value))}
                    title="How often Stoa refreshes this account's calendar events in the background"
                    style={{ cursor: 'pointer', fontSize: 11, padding: '3px 6px', width: 'auto' }}>
                    <option value={900}>Every 15 min</option>
                    <option value={1800}>Every 30 min</option>
                    <option value={3600}>Every hour</option>
                    <option value={10800}>Every 3 hours</option>
                    <option value={21600}>Every 6 hours</option>
                  </select>
                  <select className="input" value={t.daysAhead ?? 30}
                    onChange={e => handleDaysAheadChange(t.id, Number(e.target.value))}
                    title="How many days ahead this account's calendar events are fetched and cached. Calendar panels using this account can only display up to this many days."
                    style={{ cursor: 'pointer', fontSize: 11, padding: '3px 6px', width: 'auto' }}>
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                    <option value={60}>60 days</option>
                    <option value={90}>90 days</option>
                  </select>
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
