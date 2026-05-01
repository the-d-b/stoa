import { useEffect, useState } from 'react'
import { mailConfigApi, MailConfig } from '../../api'
import SectionHelp from './SectionHelp'

function MailField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{hint}</div>}
    </div>
  )
}

export default function MailConfigPanel() {
  const [cfg, setCfg] = useState<MailConfig>({
    host: '', port: '587', username: '', password: '', from: '', tlsMode: 'starttls'
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    mailConfigApi.get()
      .then(m => {
        setCfg(m.data)
      })
      .catch(e => {
        setError('Load failed: ' + (e.response?.data?.error || e.message))
      })
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true); setError(''); setSaved(false)
    try {
      await mailConfigApi.save(cfg)
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e.response?.data?.error || `Failed to save (${e.response?.status ?? e.message})`)
    } finally { setSaving(false) }
  }

  const test = async () => {
    if (!testEmail.trim()) return
    setTesting(true); setTestResult(null)
    try {
      await mailConfigApi.test(testEmail.trim(), cfg)
      setTestResult({ ok: true, msg: `Test email sent to ${testEmail}` })
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.response?.data?.error || `Failed (${e.response?.status ?? e.message})` })
    } finally { setTesting(false) }
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>

  return (
    <div style={{ maxWidth: 560 }}>
      {/* ── Mail server ─────────────────────────────────────────────────────── */}
      <SectionHelp storageKey="mail_config" title="About mail configuration">
        Stoa uses SMTP to send password reset emails. Configure your mail server here.
        All fields are required for password reset to work. Use the test button to verify
        your settings before saving. The password is stored encrypted and never shown after saving.
      </SectionHelp>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
          <MailField label="SMTP host" hint="e.g. smtp.gmail.com or mail.example.com">
            <input className="input" value={cfg.host}
              onChange={e => setCfg(c => ({ ...c, host: e.target.value }))}
              placeholder="smtp.example.com" />
          </MailField>
          <MailField label="Port">
            <input className="input" value={cfg.port}
              onChange={e => setCfg(c => ({ ...c, port: e.target.value }))}
              placeholder="587" />
          </MailField>
        </div>

        <MailField label="TLS mode">
          <select className="input" value={cfg.tlsMode}
            onChange={e => setCfg(c => ({ ...c, tlsMode: e.target.value as MailConfig['tlsMode'] }))}
            style={{ cursor: 'pointer' }}>
            <option value="starttls">STARTTLS (port 587 — recommended)</option>
            <option value="tls">TLS (port 465)</option>
            <option value="plain">Plain (port 25 — no encryption)</option>
          </select>
        </MailField>

        <MailField label="Username" hint="Usually your full email address">
          <input className="input" value={cfg.username}
            onChange={e => setCfg(c => ({ ...c, username: e.target.value }))}
            placeholder="user@example.com" autoComplete="off" />
        </MailField>

        <MailField label="Password" hint="Leave blank to keep existing password">
          <input className="input" type="password" value={cfg.password}
            onChange={e => setCfg(c => ({ ...c, password: e.target.value }))}
            placeholder="••••••••" autoComplete="new-password" />
        </MailField>

        <MailField label="From address" hint='Shown as sender — e.g. "Stoa <stoa@example.com>"'>
          <input className="input" value={cfg.from}
            onChange={e => setCfg(c => ({ ...c, from: e.target.value }))}
            placeholder="stoa@example.com" />
        </MailField>
      </div>

      {error && (
        <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 12,
          padding: '6px 10px', background: '#f8717112', borderRadius: 6,
          border: '1px solid #f8717130' }}>{error}</div>
      )}

      {/* Test + Save row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <input className="input" value={testEmail}
          onChange={e => setTestEmail(e.target.value)}
          placeholder="Send test to..." style={{ flex: 1, minWidth: 160 }} />
        <button className="btn btn-secondary" onClick={test}
          disabled={testing || !testEmail.trim() || !cfg.host}>
          {testing ? <span className="spinner" /> : 'Test'}
        </button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <span className="spinner" /> : saved ? '✓ Saved' : 'Save'}
        </button>
      </div>

      {testResult && (
        <div style={{ fontSize: 13, marginBottom: 16, padding: '6px 10px', borderRadius: 6,
          background: testResult.ok ? '#4ade8012' : '#f8717112',
          border: `1px solid ${testResult.ok ? '#4ade8030' : '#f8717130'}`,
          color: testResult.ok ? 'var(--green)' : 'var(--red)' }}>
          {testResult.ok ? '✓ ' : '✕ '}{testResult.msg}
        </div>
      )}

    </div>
  )
}
