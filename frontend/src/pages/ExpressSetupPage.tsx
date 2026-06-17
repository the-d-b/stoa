import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { expressSetupApi } from '../api'
import { INTEGRATION_TYPES } from '../components/admin/IntegrationForm'
import TypeCardPicker from '../components/admin/TypeCardPicker'

// ── Excluded types (no meaningful express-setup config) ───────────────────────
const EXCLUDE_FROM_EXPRESS = new Set([
  'weather', 'sports', 'stocks', 'crypto',  // no credentials at all
  'spotify', 'twitch', 'strava',             // require OAuth flow
])

// ── Types that create no panel (secret/integration only) ─────────────────────
const NO_PANEL_TYPES = new Set(['gemini'])

// ── Types that need no API key ────────────────────────────────────────────────
const NO_KEY_TYPES = new Set(['kuma', 'scrutiny', 'rss'])

// ── Types where API key is optional (leave blank = OK) ───────────────────────
const OPTIONAL_KEY_TYPES = new Set(['frigate', 'maintainerr', 'tdarr', 'pihole', 'prometheus'])

// ── Types that need no URL ────────────────────────────────────────────────────
const NO_URL_TYPES = new Set([
  'gemini',                                          // AI chat only — key stored, no integration URL
  'steam', 'lastfm', 'duolingo', 'github', 'trakt',
  'tailscale', 'nextdns', 'cloudflare',
])

// ── Secret field label overrides (default: "API Key") ────────────────────────
const SECRET_LABEL: Record<string, string> = {
  plex:           'Token',
  homeassistant:  'Long-Lived Token',
  proxmox:        'API Token',
  grafana:        'Service Account Token',
  fireflyiii:     'Access Token',
  ghostfolio:     'Security Token',
  paperless:      'API Token',
  monica:         'Bearer Token',
  authentik:      'API Token',
  netbird:        'Access Token',
  tailscale:      'API Token',
  github:         'Access Token',
  komga:          'user:password',
  navidrome:      'user:password',
  omv:            'user:password',
  synology:       'user:password',
  qnap:           'user:password',
  openwrt:        'user:password',
  omada:          'user:password',
  traefik:        'user:password',
  nginxpm:        'email:password',
  adguard:        'user:password',
  transmission:   'user:password',
  qbittorrent:    'user:password',
  rutorrent:      'user:password',
  nzbget:         'user:password',
  blueiris:       'user:password',
  audiobookshelf: 'user:password or Key',
  docspell:       'account:password',
  homebox:        'email:password',
  fittrackee:     'email:password',
  duolingo:       'user:password',
  deluge:         'Password',
  wgeasy:         'Password',
  lastfm:         'user:apiKey',
  trakt:          'clientId:username',
  coinbase:       'apiKey:apiSecret',
  cloudflare:     'API Token',
  opnsense:       'key:secret',
  kavita:         'Auth Key',
  romm:           'user:password',
  pterodactyl:    'Client API Key',
  mealie:         'API Token',
  tandoor:        'API Token',
}

// ── URL placeholder hints ─────────────────────────────────────────────────────
const URL_PLACEHOLDER: Record<string, string> = {
  sonarr:         'http://192.168.1.x:8989',
  radarr:         'http://192.168.1.x:7878',
  lidarr:         'http://192.168.1.x:8686',
  readarr:        'http://192.168.1.x:8787',
  plex:           'http://192.168.1.x:32400',
  tautulli:       'http://192.168.1.x:8181',
  kuma:           'http://192.168.1.x:3001',
  jellyfin:       'http://192.168.1.x:8096',
  emby:           'http://192.168.1.x:8096',
  jellystat:      'http://192.168.1.x:3000',
  bazarr:         'http://192.168.1.x:6767',
  prowlarr:       'http://192.168.1.x:9696',
  autobrr:        'http://192.168.1.x:7474',
  overseerr:      'http://192.168.1.x:5055',
  tdarr:          'http://192.168.1.x:8265',
  maintainerr:    'http://192.168.1.x:6246',
  immich:         'http://192.168.1.x:2283',
  photoprism:     'http://192.168.1.x:2342',
  kavita:         'http://192.168.1.x:5000',
  komga:          'http://192.168.1.x:25600',
  audiobookshelf: 'http://192.168.1.x:13378',
  navidrome:      'http://192.168.1.x:4533',
  truenas:        'http://192.168.1.x',
  unraid:         'http://192.168.1.x',
  omv:            'http://192.168.1.x',
  synology:       'http://192.168.1.x:5000',
  qnap:           'http://192.168.1.x:8080',
  proxmox:        'https://192.168.1.x:8006',
  nextcloud:      'https://cloud.example.com',
  scrutiny:       'http://192.168.1.x:8080',
  opnsense:       'https://192.168.1.x',
  pfsense:        'https://192.168.1.x',
  openwrt:        'http://192.168.1.x',
  omada:          'http://192.168.1.x:8043',
  unifi:          'https://192.168.1.x',
  traefik:        'http://192.168.1.x:8080',
  nginxpm:        'http://192.168.1.x:81',
  pihole:         'http://192.168.1.x',
  adguard:        'http://192.168.1.x:3000',
  gluetun:        'http://192.168.1.x:8000',
  wgeasy:         'http://192.168.1.x:51821',
  netbird:        'https://api.netbird.io',
  authentik:      'https://auth.example.com',
  prometheus:     'http://192.168.1.x:9090',
  grafana:        'http://192.168.1.x:3000',
  transmission:   'http://192.168.1.x:9091',
  qbittorrent:    'http://192.168.1.x:8080',
  deluge:         'http://192.168.1.x:8112',
  rutorrent:      'http://192.168.1.x:PORT',
  sabnzbd:        'http://192.168.1.x:8080',
  nzbget:         'http://192.168.1.x:6789',
  homeassistant:  'http://192.168.1.x:8123',
  frigate:        'http://192.168.1.x:8971',
  blueiris:       'http://192.168.1.x:81',
  lubelogger:     'http://192.168.1.x:8080',
  romm:           'http://192.168.1.x:8080',
  pterodactyl:    'http://192.168.1.x',
  fireflyiii:     'http://192.168.1.x:8080',
  actualbudget:   'http://192.168.1.x:5007',
  ghostfolio:     'http://192.168.1.x:3333',
  paperless:      'http://192.168.1.x:8000',
  docspell:       'http://192.168.1.x:7880',
  monica:         'http://192.168.1.x:8080',
  homebox:        'http://192.168.1.x:7745',
  wger:           'http://192.168.1.x:80',
  fittrackee:     'http://192.168.1.x:5000',
  mealie:         'http://192.168.1.x:9000',
  grocy:          'http://192.168.1.x:80',
  tandoor:        'http://192.168.1.x:8080',
  steam:          'https://api.steampowered.com',
  rss:            'https://example.com/feed.xml',
}

// ── Types shown in the picker ─────────────────────────────────────────────────
const EXPRESS_TYPES = INTEGRATION_TYPES.filter(t => !EXCLUDE_FROM_EXPRESS.has(t.id))

function getSecretLabel(type: string): string {
  return SECRET_LABEL[type] ?? 'API Key'
}

function getUrlPlaceholder(type: string): string {
  return URL_PLACEHOLDER[type] ?? 'http://192.168.1.x:PORT'
}

function needsKey(type: string): boolean {
  return !NO_KEY_TYPES.has(type)
}

function keyIsOptional(type: string): boolean {
  return OPTIONAL_KEY_TYPES.has(type)
}

function needsUrl(type: string): boolean {
  return !NO_URL_TYPES.has(type)
}

function labelFor(type: string): string {
  return INTEGRATION_TYPES.find(t => t.id === type)?.label ?? type
}

// ── Component ─────────────────────────────────────────────────────────────────

type Step = 'select' | 'keys' | 'urls' | 'done'

interface ServiceValues {
  apiKey: string
  apiUrl: string
}

export default function ExpressSetupPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('select')
  const [existingTypes, setExistingTypes] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [values, setValues] = useState<Record<string, ServiceValues>>({})
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
    setValues(v => ({ ...v, [type]: { ...(v[type] ?? { apiKey: '', apiUrl: '' }), [field]: val } }))
  }

  const getVal = (type: string): ServiceValues =>
    values[type] ?? { apiKey: '', apiUrl: '' }

  const keyServices = selectedTypes.filter(needsKey)
  const urlServices = selectedTypes.filter(needsUrl)

  const toCreate = selectedTypes.filter(type => {
    if (existingTypes.includes(type)) return false
    const v = getVal(type)
    if (needsKey(type) && !keyIsOptional(type) && !v.apiKey.trim()) return false
    if (needsUrl(type) && !v.apiUrl.trim()) return false
    return true
  })

  const handleSubmit = async () => {
    setSubmitting(true)
    setGlobalError('')
    try {
      const services = selectedTypes.map(type => {
        const v = getVal(type)
        const label = labelFor(type)
        return {
          type,
          label,
          secretName: `${label} ${getSecretLabel(type)}`,
          apiKey: v.apiKey.trim(),
          apiUrl: v.apiUrl.trim(),
          needsKey: needsKey(type) && !keyIsOptional(type),
          needsUrl: needsUrl(type),
          createPanel: !NO_PANEL_TYPES.has(type),
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

  // ── Step indicator ────────────────────────────────────────────────────────────

  const STEPS: Step[] = ['select', 'keys', 'urls']
  const stepIdx = STEPS.indexOf(step)

  // ── Layout ───────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '40px 24px',
      backgroundImage: 'radial-gradient(ellipse 60% 30% at 50% 0%, var(--accent-bg), transparent)',
    }}>
      <div style={{ width: '100%', maxWidth: 640 }}>

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

        {/* ── Step 1: Select integrations ──────────────────────────────────── */}
        {step === 'select' && (
          <div className="card" style={{ padding: 24 }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Step 1 — Select Integrations</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Choose the integrations you want to set up. You'll enter credentials and URLs on the next steps.
              </div>
            </div>

            <TypeCardPicker
              types={EXPRESS_TYPES}
              values={selectedTypes}
              onChangeMulti={setSelectedTypes}
            />

            {selectedTypes.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-dim)' }}>
                {selectedTypes.length} selected
              </div>
            )}

            <div style={{ marginTop: 20 }}>
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={selectedTypes.length === 0}
                onClick={() => setStep('keys')}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Secrets ───────────────────────────────────────────────── */}
        {step === 'keys' && (
          <div className="card" style={{ padding: 24 }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Step 2 — Secrets</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Paste API keys and credentials. Leave blank to skip a service for now.
              </div>
            </div>

            {keyServices.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {keyServices.map(type => {
                  const already = existingTypes.includes(type)
                  const optional = keyIsOptional(type)
                  const label = labelFor(type)
                  const secretLabel = getSecretLabel(type)
                  return (
                    <div key={type}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <label style={{ fontSize: 13, fontWeight: 500, color: already ? 'var(--text-dim)' : 'var(--text)' }}>
                          {label} — {secretLabel}
                        </label>
                        {already && (
                          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>already configured</span>
                        )}
                        {!already && optional && (
                          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>optional</span>
                        )}
                      </div>
                      <input
                        className="input"
                        type="password"
                        placeholder={already ? '(skipped)' : secretLabel}
                        value={getVal(type).apiKey}
                        onChange={e => set(type, 'apiKey', e.target.value)}
                        disabled={already}
                        style={{ width: '100%', opacity: already ? 0.45 : 1, fontFamily: 'DM Mono, monospace', fontSize: 12 }}
                      />
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0', textAlign: 'center' }}>
                No credentials needed for the selected integrations.
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep('select')}>
                ← Back
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep('urls')}>
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: URLs + height + confirm ──────────────────────────────── */}
        {step === 'urls' && (
          <div className="card" style={{ padding: 24 }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Step 3 — URLs</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Enter the URL for each service (e.g. <code>http://192.168.1.x:port</code>). Used for both API calls and the panel link.
              </div>
            </div>

            {urlServices.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                {urlServices.map(type => {
                  const already = existingTypes.includes(type)
                  return (
                    <div key={type}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <label style={{ fontSize: 13, fontWeight: 500, color: already ? 'var(--text-dim)' : 'var(--text)' }}>
                          {labelFor(type)}
                        </label>
                        {already && (
                          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>already configured</span>
                        )}
                      </div>
                      <input
                        className="input"
                        type="url"
                        placeholder={already ? '(skipped)' : getUrlPlaceholder(type)}
                        value={getVal(type).apiUrl}
                        onChange={e => set(type, 'apiUrl', e.target.value)}
                        disabled={already}
                        style={{ width: '100%', opacity: already ? 0.45 : 1 }}
                      />
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0', textAlign: 'center', marginBottom: 24 }}>
                No URLs needed for the selected integrations.
              </div>
            )}

            {/* Panel height */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                Panel height
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3, 4, 5, 6].map(h => (
                  <button
                    key={h}
                    onClick={() => setPanelHeight(h)}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 7, fontSize: 13, fontWeight: 500,
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
            </div>

            {/* Summary of what will be created */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                Will create
              </div>
              {toCreate.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {toCreate.map(type => (
                    <div key={type} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '7px 12px', borderRadius: 7,
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      fontSize: 13,
                    }}>
                      <span style={{ fontWeight: 500 }}>{labelFor(type)}</span>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {needsKey(type) && (
                          <span style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--surface)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                            secret
                          </span>
                        )}
                        {needsUrl(type) && (
                          <span style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--surface)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                            integration
                          </span>
                        )}
                        {!NO_PANEL_TYPES.has(type) && (
                          <span style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--surface)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                            panel
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Nothing to create. Go back to enter credentials or URLs.
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
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep('keys')}>
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

        {/* ── Done ──────────────────────────────────────────────────────────── */}
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
                {results.map(r => (
                  <div key={r.type} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderRadius: 7,
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                    fontSize: 13,
                  }}>
                    <span style={{ fontWeight: 500 }}>{labelFor(r.type)}</span>
                    {r.created && <span style={{ color: 'var(--green)', fontSize: 12 }}>✓ created</span>}
                    {r.skipped && <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>skipped (exists)</span>}
                    {r.error && <span style={{ color: 'var(--red)', fontSize: 12 }}>✕ {r.error}</span>}
                  </div>
                ))}
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
