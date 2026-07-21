import { useEffect, useRef, useState } from 'react'
import { attachmentConfigApi, appIconApi, nvdConfigApi } from '../../api'

export default function SettingsPanel() {
  const [loading, setLoading] = useState(true)
  const [maxMB, setMaxMB] = useState(10)
  const [maxMBInput, setMaxMBInput] = useState('10')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [nvdConfigured, setNvdConfigured] = useState(false)
  const [nvdKeyInput, setNvdKeyInput] = useState('')
  const [nvdSaving, setNvdSaving] = useState(false)
  const [nvdSaved, setNvdSaved] = useState(false)

  const [iconUrl, setIconUrl] = useState<string | null>(null)
  const [uploadingIcon, setUploadingIcon] = useState(false)
  const [iconError, setIconError] = useState('')
  const [iconSaved, setIconSaved] = useState(false)
  const iconInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      attachmentConfigApi.get(),
      appIconApi.get(),
      nvdConfigApi.get(),
    ]).then(([attachR, iconR, nvdR]) => {
      const mb = attachR.data?.maxMB ?? 10
      setMaxMB(mb); setMaxMBInput(String(mb))
      setIconUrl(iconR.data?.url ?? null)
      setNvdConfigured(nvdR.data?.configured ?? false)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const saveNvdKey = async () => {
    setNvdSaving(true); setNvdSaved(false)
    try {
      await nvdConfigApi.save(nvdKeyInput.trim())
      setNvdConfigured(nvdKeyInput.trim() !== '')
      setNvdKeyInput('')
      setNvdSaved(true)
      setTimeout(() => setNvdSaved(false), 2000)
    } finally { setNvdSaving(false) }
  }

  const save = async () => {
    const val = parseInt(maxMBInput, 10)
    if (isNaN(val) || val < 1 || val > 500) return
    setSaving(true); setSaved(false)
    await attachmentConfigApi.save(val)
    setMaxMB(val)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setIconError('Image must be under 2 MB'); return }
    setIconError(''); setUploadingIcon(true)
    try {
      const res = await appIconApi.upload(file)
      const freshUrl = res.data.url + '?t=' + Date.now()
      setIconUrl(freshUrl)
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      if (link) link.href = freshUrl
      setIconSaved(true)
      setTimeout(() => setIconSaved(false), 2000)
    } catch { setIconError('Upload failed') }
    finally { setUploadingIcon(false); if (iconInputRef.current) iconInputRef.current.value = '' }
  }

  const resetIcon = async () => {
    await appIconApi.remove()
    setIconUrl(null)
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (link) link.href = '/favicon.svg'
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>

  return (
    <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* App Icon */}
      <div>
        <div className="section-title" style={{ marginBottom: 12 }}>App Icon</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 16 }}>
          Replace the default Stoa icon shown in browser tabs and bookmarks. Applies to all users.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0 }}>
            {iconUrl
              ? <img src={iconUrl} style={{ width: 40, height: 40, objectFit: 'contain' }}
                  onError={() => setIconUrl(null)} />
              : <span style={{ fontSize: 22 }}>🦉</span>
            }
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                cursor: 'pointer', padding: '6px 14px', borderRadius: 8, fontSize: 12,
                background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
              }}>
                {uploadingIcon ? <span className="spinner" /> : 'Upload icon'}
                <input ref={iconInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={handleIconChange} />
              </label>
              {iconUrl && (
                <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={resetIcon}>
                  Reset to default
                </button>
              )}
              {iconSaved && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Updated</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>PNG, JPG, SVG, WebP · max 2 MB</div>
            {iconError && <div style={{ fontSize: 12, color: 'var(--red)' }}>{iconError}</div>}
          </div>
        </div>
      </div>

      {/* Chat Attachments */}
      <div>
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

      {/* NVD API Key — Security Posture panel */}
      <div>
        <div className="section-title" style={{ marginBottom: 12 }}>NVD API Key</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 16 }}>
          Optional. Used by the Security Posture panel to look up known CVEs from the National
          Vulnerability Database. Works without a key (5 requests/30s), but a free key
          (<a href="https://nvd.nist.gov/developers/request-an-api-key" target="_blank" rel="noopener noreferrer">
            request one here</a>) raises the limit to 50/30s — helpful headroom if you're tracking
          many products.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input className="input" type="password" value={nvdKeyInput}
            onChange={e => setNvdKeyInput(e.target.value)}
            placeholder={nvdConfigured ? '••••••••••••••• (leave blank to keep current)' : 'Paste NVD API key'}
            style={{ flex: 1, maxWidth: 320, fontSize: 13 }} />
          <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}
            onClick={saveNvdKey} disabled={nvdSaving}>
            {nvdSaving ? 'Saving…' : 'Save'}
          </button>
          {nvdSaved && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Saved</span>}
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-dim)' }}>
          {nvdConfigured ? 'A key is currently configured.' : 'No key configured — using the unauthenticated rate limit.'}
        </div>
      </div>

    </div>
  )
}
