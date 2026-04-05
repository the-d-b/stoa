import { useEffect, useState } from 'react'
import { configApi } from '../../api'

export default function SettingsPanel() {
  const [mode, setMode] = useState<'single' | 'multi'>('multi')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    configApi.getMode().then(res => {
      if (res.data?.mode === 'single') setMode('single')
      setLoading(false)
    })
  }, [])

  const save = async (newMode: 'single' | 'multi') => {
    setSaving(true); setSaved(false)
    await configApi.setMode(newMode)
    setMode(newMode)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="section-title" style={{ marginBottom: 16 }}>User Mode</div>

      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 20 }}>
        In <strong>single-user mode</strong>, Stoa hides the admin settings page, system sections in your profile,
        and multi-user features. Everything is personal. In <strong>multi-user mode</strong>, full admin controls,
        group sharing, and system resources are visible.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(['single', 'multi'] as const).map(m => (
          <div key={m} onClick={() => save(m)} style={{
            display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px',
            borderRadius: 10, cursor: 'pointer',
            border: `2px solid ${mode === m ? 'var(--accent)' : 'var(--border)'}`,
            background: mode === m ? 'var(--accent-bg)' : 'var(--surface)',
            transition: 'all 0.15s',
          }}>
            <div style={{
              width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 1,
              border: `2px solid ${mode === m ? 'var(--accent2)' : 'var(--border2)'}`,
              background: mode === m ? 'var(--accent2)' : 'transparent',
            }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3 }}>
                {m === 'single' ? 'Single user' : 'Multi user'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {m === 'single'
                  ? 'Just you. No admin settings page, no system sections, no group sharing.'
                  : 'Multiple users. Full admin controls, group sharing, system panels, secrets, integrations and tags.'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {saving && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-dim)' }}>Saving…</div>}
      {saved && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--green)' }}>✓ Saved. Reload the page to apply changes.</div>}
    </div>
  )
}
