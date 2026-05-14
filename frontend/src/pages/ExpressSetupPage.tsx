import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { expressSetupApi } from '../api'

// ── Service definitions ────────────────────────────────────────────────────────

interface ServiceDef {
  type: string
  label: string
  keyLabel: string   // label for the API key field, empty if no key
  needsKey: boolean
  needsUrl: boolean
  createPanel: boolean
  note?: string
  urlPlaceholder: string
}

const SERVICES: ServiceDef[] = [
  { type: 'sonarr',   label: 'Sonarr',       keyLabel: 'API Key', needsKey: true,  needsUrl: true,  createPanel: true,  urlPlaceholder: 'http://192.168.1.x:8989' },
  { type: 'radarr',   label: 'Radarr',       keyLabel: 'API Key', needsKey: true,  needsUrl: true,  createPanel: true,  urlPlaceholder: 'http://192.168.1.x:7878' },
  { type: 'lidarr',   label: 'Lidarr',       keyLabel: 'API Key', needsKey: true,  needsUrl: true,  createPanel: true,  urlPlaceholder: 'http://192.168.1.x:8686' },
  { type: 'readarr',  label: 'Readarr',      keyLabel: 'API Key', needsKey: true,  needsUrl: true,  createPanel: true,  urlPlaceholder: 'http://192.168.1.x:8787' },
  { type: 'plex',     label: 'Plex',         keyLabel: 'Token',   needsKey: true,  needsUrl: true,  createPanel: true,  urlPlaceholder: 'http://192.168.1.x:32400' },
  { type: 'tautulli', label: 'Tautulli',     keyLabel: 'API Key', needsKey: true,  needsUrl: true,  createPanel: true,  urlPlaceholder: 'http://192.168.1.x:8181' },
  { type: 'kuma',     label: 'Uptime Kuma',  keyLabel: '',        needsKey: false, needsUrl: true,  createPanel: true,  urlPlaceholder: 'http://192.168.1.x:3001' },
  { type: 'gemini',   label: 'Gemini',       keyLabel: 'API Key', needsKey: true,  needsUrl: false, createPanel: false, urlPlaceholder: '', note: 'AI Chat only — no panel created' },
]

// ── Component ─────────────────────────────────────────────────────────────────

type Step = 'keys' | 'urls' | 'height' | 'done'

interface ServiceValues {
  apiKey: string
  apiUrl: string
}

export default function ExpressSetupPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('keys')
  const [existingTypes, setExistingTypes] = useState<string[]>([])
  const [values, setValues] = useState<Record<string, ServiceValues>>(
    Object.fromEntries(SERVICES.map(s => [s.type, { apiKey: '', apiUrl: '' }]))
  )
  const [panelHeight, setPanelHeight] = useState(3)
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<{ type: string; created: boolean; skipped: boolean; error?: string }[]>([])
  const [globalError, setGlobalError] = useState('')

  useEffect(() => {
    expressSetupApi.status()
      .then(res => setExistingTypes(res.data.existingTypes))
      .catch(() => {})
  }, [])

  const set = (type: string, field: 'apiKey' | 'apiUrl', val: string) => {
    setValues(v => ({ ...v, [type]: { ...v[type], [field]: val } }))
  }

  // Services shown on step 2: those with a key entered on step 1 + always Kuma
  const urlServices = SERVICES.filter(s =>
    s.needsUrl && (s.type === 'kuma' || (!s.needsKey) || values[s.type]?.apiKey.trim())
  )

  // Services that will actually be created (key filled + url filled + not existing)
  const toCreate = SERVICES.filter(s => {
    if (existingTypes.includes(s.type)) return false
    if (s.needsKey && !values[s.type]?.apiKey.trim()) return false
    if (s.needsUrl && !values[s.type]?.apiUrl.trim()) return false
    return true
  })

  const handleSubmit = async () => {
    setSubmitting(true)
    setGlobalError('')
    try {
      const services: Record<string, { apiKey?: string; apiUrl?: string }> = {}
      SERVICES.forEach(s => {
        const v = values[s.type]
        if ((s.needsKey && v.apiKey.trim()) || (s.needsUrl && v.apiUrl.trim())) {
          services[s.type] = {
            ...(s.needsKey ? { apiKey: v.apiKey.trim() } : {}),
            ...(s.needsUrl ? { apiUrl: v.apiUrl.trim() } : {}),
          }
        }
      })
      const res = await expressSetupApi.run({ panelHeight, services })
      setResults(res.data.results)
      setStep('done')
    } catch (e: any) {
      setGlobalError(e.response?.data?.error || 'Setup failed')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Step dots ────────────────────────────────────────────────────────────────

  const STEPS: Step[] = ['keys', 'urls', 'height']
  const stepIdx = STEPS.indexOf(step)

  // ── Layout ───────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '40px 24px',
      backgroundImage: 'radial-gradient(ellipse 60% 30% at 50% 0%, var(--accent-bg), transparent)',
    }}>
      <div style={{ width: '100%', maxWidth: 560 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>Express Setup</span>
            {step !== 'done' && (
              <button
                onClick={() => navigate('/')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}
              >
                Skip →
              </button>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Bulk-configure integrations and panels in minutes
          </div>
        </div>

        {/* Step indicator */}
        {step !== 'done' && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
            {STEPS.map((s, i) => (
              <div key={s} style={{
                height: 4, borderRadius: 2, transition: 'all 0.3s',
                flex: stepIdx === i ? 2 : 1,
                background: i <= stepIdx ? 'var(--accent)' : 'var(--surface2)',
              }} />
            ))}
          </div>
        )}

        {/* ── Step 1: API Keys ─────────────────────────────────────────────── */}
        {step === 'keys' && (
          <div className="card" style={{ padding: 24 }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Step 1 — API Keys</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Paste your API keys below. Leave blank for services you don't use.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {SERVICES.filter(s => s.needsKey).map(svc => {
                const already = existingTypes.includes(svc.type)
                return (
                  <div key={svc.type}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <label style={{ fontSize: 13, fontWeight: 500, color: already ? 'var(--text-dim)' : 'var(--text)' }}>
                        {svc.label} {svc.keyLabel}
                      </label>
                      {already && (
                        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                          already configured
                        </span>
                      )}
                      {svc.note && !already && (
                        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{svc.note}</span>
                      )}
                    </div>
                    <input
                      className="input"
                      type="password"
                      placeholder={already ? '(skipped)' : `${svc.label} ${svc.keyLabel}`}
                      value={values[svc.type].apiKey}
                      onChange={e => set(svc.type, 'apiKey', e.target.value)}
                      disabled={already}
                      style={{ width: '100%', opacity: already ? 0.45 : 1, fontFamily: 'DM Mono, monospace', fontSize: 12 }}
                    />
                  </div>
                )
              })}
            </div>

            <div style={{ marginTop: 24 }}>
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => setStep('urls')}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Service URLs ─────────────────────────────────────────── */}
        {step === 'urls' && (
          <div className="card" style={{ padding: 24 }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Step 2 — Service URLs</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Enter the internal API URL for each service (e.g. <code>http://192.168.1.x:port</code>).
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {urlServices.map(svc => {
                const already = existingTypes.includes(svc.type)
                return (
                  <div key={svc.type}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <label style={{ fontSize: 13, fontWeight: 500, color: already ? 'var(--text-dim)' : 'var(--text)' }}>
                        {svc.label}
                      </label>
                      {already && (
                        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                          already configured
                        </span>
                      )}
                    </div>
                    <input
                      className="input"
                      type="url"
                      placeholder={already ? '(skipped)' : svc.urlPlaceholder}
                      value={values[svc.type].apiUrl}
                      onChange={e => set(svc.type, 'apiUrl', e.target.value)}
                      disabled={already}
                      style={{ width: '100%', opacity: already ? 0.45 : 1 }}
                    />
                  </div>
                )
              })}

              {urlServices.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
                  No services selected. You can go back to enter API keys, or continue to create Kuma panels.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep('keys')}>
                ← Back
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep('height')}>
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Panel Height + Confirm ──────────────────────────────── */}
        {step === 'height' && (
          <div className="card" style={{ padding: 24 }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Step 3 — Panel Height</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Choose the default height for the panels that will be created.
              </div>
            </div>

            {/* Height selector */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
              {[1, 2, 3, 4, 5, 6].map(h => (
                <button
                  key={h}
                  onClick={() => setPanelHeight(h)}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 500,
                    border: `2px solid ${panelHeight === h ? 'var(--accent)' : 'var(--border)'}`,
                    background: panelHeight === h ? 'var(--accent-bg)' : 'var(--surface)',
                    color: panelHeight === h ? 'var(--accent2)' : 'var(--text-muted)',
                    cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  {h}
                </button>
              ))}
            </div>

            {/* Summary of what will be created */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                Will create
              </div>
              {toCreate.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {toCreate.map(svc => (
                    <div key={svc.type} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', borderRadius: 7,
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      fontSize: 13,
                    }}>
                      <span style={{ fontWeight: 500 }}>{svc.label}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {svc.needsKey && (
                          <span style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--surface)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                            secret
                          </span>
                        )}
                        {svc.needsUrl && (
                          <span style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--surface)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                            integration
                          </span>
                        )}
                        {svc.createPanel && (
                          <span style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--surface)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                            panel
                          </span>
                        )}
                        {!svc.needsUrl && !svc.createPanel && (
                          <span style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--surface)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                            secret only
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Nothing to create. Go back to enter API keys or URLs.
                </div>
              )}
            </div>

            {globalError && (
              <div style={{ fontSize: 13, padding: '8px 12px', borderRadius: 6, marginBottom: 14,
                background: '#f8717112', border: '1px solid #f8717130', color: 'var(--red)' }}>
                {globalError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep('urls')}>
                ← Back
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={submitting || toCreate.length === 0}
                onClick={handleSubmit}
              >
                {submitting ? <><span className="spinner" style={{ marginRight: 6 }} />Creating…</> : 'Create'}
              </button>
            </div>
          </div>
        )}

        {/* ── Done ─────────────────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="card" style={{ padding: 28 }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Express setup complete</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Your panels are ready. Go to the dashboard to start using them.
              </div>
            </div>

            {results.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
                {results.map(r => {
                  const svc = SERVICES.find(s => s.type === r.type)
                  return (
                    <div key={r.type} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', borderRadius: 7,
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      fontSize: 13,
                    }}>
                      <span style={{ fontWeight: 500 }}>{svc?.label ?? r.type}</span>
                      {r.created && <span style={{ color: 'var(--green)', fontSize: 12 }}>✓ created</span>}
                      {r.skipped && <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>skipped (exists)</span>}
                      {r.error && <span style={{ color: 'var(--red)', fontSize: 12 }}>✕ {r.error}</span>}
                    </div>
                  )
                })}
              </div>
            )}

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/')}>
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
