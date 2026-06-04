import { useEffect, useState } from 'react'
import { attachmentConfigApi } from '../../api'

export default function SettingsPanel() {
  const [loading, setLoading] = useState(true)
  const [maxMB, setMaxMB] = useState(10)
  const [maxMBInput, setMaxMBInput] = useState('10')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    attachmentConfigApi.get().then(r => {
      const mb = r.data?.maxMB ?? 10
      setMaxMB(mb); setMaxMBInput(String(mb))
      setLoading(false)
    })
  }, [])

  const save = async () => {
    const val = parseInt(maxMBInput, 10)
    if (isNaN(val) || val < 1 || val > 500) return
    setSaving(true); setSaved(false)
    await attachmentConfigApi.save(val)
    setMaxMB(val)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="section-title" style={{ marginBottom: 12 }}>Chat Attachments</div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 16 }}>
        Maximum file size for chat attachments (uploads and URL-fetched images). Applies per file.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input className="input" type="number" min={1} max={500} value={maxMBInput}
          onChange={e => setMaxMBInput(e.target.value)}
          style={{ width: 80, fontSize: 13 }} />
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>MB (1–500)</span>
        <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}
          onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Saved</span>}
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-dim)' }}>
        Current limit: {maxMB} MB
      </div>
    </div>
  )
}
