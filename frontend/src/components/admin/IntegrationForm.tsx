/**
 * IntegrationForm — unified create + edit form for integrations.
 * Used by system settings (scope='system') and personal profile (scope='personal').
 *
 * Create mode: integration prop is undefined.
 * Edit mode:   integration prop provided, type is locked.
 */
import { useState, useEffect } from 'react'
import { integrationsApi, myIntegrationsApi, secretsApi, weatherApi, steamApi, Integration } from '../../api'
import SportsConfigUI from './SportsConfigUI'
import StocksConfigUI from './StocksConfigUI'
import CryptoConfigUI from './CryptoConfigUI'

export const INTEGRATION_TYPES = [
  { id: 'authentik',    label: 'Authentik',    desc: 'Identity provider' },
  { id: 'crypto',       label: 'Crypto',       desc: 'Cryptocurrency prices with sparklines (CoinGecko — add Demo API key secret for higher rate limits)' },
  { id: 'gluetun',      label: 'Gluetun',      desc: 'VPN container' },
  { id: 'homeassistant', label: 'Home Assistant', desc: 'Smart home platform' },
  { id: 'jellyfin',     label: 'Jellyfin',     desc: 'Media server' },
  { id: 'kuma',         label: 'Uptime Kuma',  desc: 'Status monitoring' },
  { id: 'lidarr',       label: 'Lidarr',       desc: 'Music management' },
  { id: 'opnsense',     label: 'OPNsense',     desc: 'Firewall/router' },
  { id: 'overseerr',    label: 'Overseerr / Jellyseerr', desc: 'Media request management' },
  { id: 'photoprism',   label: 'PhotoPrism',   desc: 'Photo management' },
  { id: 'plex',         label: 'Plex',         desc: 'Media server' },
  { id: 'proxmox',      label: 'Proxmox',      desc: 'Hypervisor' },
  { id: 'radarr',       label: 'Radarr',       desc: 'Movie management' },
  { id: 'readarr',      label: 'Readarr',      desc: 'Book & audiobook management' },
  { id: 'rss',          label: 'RSS Feed',     desc: 'RSS or Atom feed reader' },
  { id: 'sonarr',       label: 'Sonarr',       desc: 'TV show management' },
  { id: 'sports',       label: 'Sports',       desc: 'NHL, NFL, NBA, MLB scores, standings & schedule (ESPN, no key required)' },
  { id: 'steam',        label: 'Steam',        desc: 'Steam library, activity & store' },
  { id: 'stocks',       label: 'Stocks',       desc: 'US stock quotes with sparklines (Yahoo Finance, no API key)' },
  { id: 'tautulli',     label: 'Tautulli',     desc: 'Plex analytics' },
  { id: 'transmission', label: 'Transmission', desc: 'BitTorrent client' },
  { id: 'truenas',      label: 'TrueNAS',      desc: 'NAS management' },
  { id: 'weather',      label: 'Weather',      desc: 'Current conditions & forecast (Open-Meteo, no key required)' },
]

const NO_TEST_TYPES = ['weather', 'steam', 'rss', 'sports', 'stocks', 'crypto']
const NO_URL_REQUIRED = ['weather', 'steam', 'rss', 'sports', 'stocks', 'crypto']

interface Props {
  scope: 'system' | 'personal'
  secrets: any[]
  integration?: Integration          // undefined = create, provided = edit
  onSaved: () => void
  onCancel: () => void
  onDeleted?: () => void             // edit mode only
  onSecretsChanged: (s: any[]) => void
  children?: React.ReactNode         // group assignment slot (system scope, edit mode)
}

export default function IntegrationForm({
  scope, secrets, integration,
  onSaved, onCancel, onDeleted, onSecretsChanged, children,
}: Props) {
  const isEdit = !!integration
  const secretScope = scope === 'system' ? 'shared' : 'personal'

  // ── Core fields ────────────────────────────────────────────────────────────
  const [name, setName] = useState(integration?.name ?? '')
  const [type, setType] = useState(integration?.type ?? 'sonarr')
  const [apiUrl, setApiUrl] = useState(integration?.apiUrl ?? '')
  const [uiUrl, setUiUrl] = useState(integration?.uiUrl ?? '')
  const [secretId, setSecretId] = useState(integration?.secretId ?? '')
  const [skipTls, setSkipTls] = useState(integration?.skipTls ?? false)
  const [refreshSecs, setRefreshSecs] = useState(integration?.refreshSecs ?? 60)

  // ── Form state ─────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // ── Inline secret creation ─────────────────────────────────────────────────
  const [showNewSecret, setShowNewSecret] = useState(false)
  const [newSecretName, setNewSecretName] = useState('')
  const [newSecretValue, setNewSecretValue] = useState('')
  const [savingSecret, setSavingSecret] = useState(false)

  // ── Weather geocoder ───────────────────────────────────────────────────────
  const [geoQuery, setGeoQuery] = useState('')
  const [geoResults, setGeoResults] = useState<any[]>([])
  const [geoSearching, setGeoSearching] = useState(false)

  // ── Steam vanity resolver ──────────────────────────────────────────────────
  const [steamVanity, setSteamVanity] = useState('')
  const [steamResolving, setSteamResolving] = useState(false)

  // ── Test connection ────────────────────────────────────────────────────────
  const [testResult, setTestResult] = useState<{
    ok: boolean; error?: string; tlsError?: boolean; skipTlsWorks?: boolean
  } | null>(null)
  const [testing, setTesting] = useState(false)

  // Re-init when switching to a different integration in edit mode
  useEffect(() => {
    if (!integration) return
    setName(integration.name)
    setType(integration.type)
    setApiUrl(integration.apiUrl)
    setUiUrl(integration.uiUrl ?? '')
    setSecretId(integration.secretId ?? '')
    setSkipTls(integration.skipTls ?? false)
    setRefreshSecs(integration.refreshSecs ?? 60)
    setTestResult(null)
    setGeoQuery(''); setGeoResults([])
    setSteamVanity('')
  }, [integration?.id])

  const handleTypeChange = (t: string) => {
    setType(t); setApiUrl(''); setTestResult(null)
    setGeoQuery(''); setGeoResults([])
    setSteamVanity('')
  }

  const saveNewSecret = async () => {
    if (!newSecretName.trim() || !newSecretValue.trim()) return
    setSavingSecret(true)
    try {
      const res = await secretsApi.create({
        name: newSecretName.trim(), value: newSecretValue.trim(), scope: secretScope
      })
      const newSec = { id: res.data.id, name: newSecretName.trim() }
      onSecretsChanged([...secrets, newSec])
      setSecretId(newSec.id)
      setNewSecretName(''); setNewSecretValue(''); setShowNewSecret(false)
    } finally { setSavingSecret(false) }
  }

  const searchGeo = async () => {
    if (!geoQuery.trim()) return
    setGeoSearching(true)
    try { const r = await weatherApi.geocode(geoQuery); setGeoResults(r.data || []) }
    finally { setGeoSearching(false) }
  }

  const selectGeo = (r: any) => {
    const city = [r.name, r.admin1, r.country].filter(Boolean).join(', ')
    setApiUrl(`${r.latitude}|${r.longitude}|${city}|f`)
    setGeoResults([]); setGeoQuery('')
  }

  const resolveVanity = async () => {
    if (!steamVanity.trim() || !secretId) return
    setSteamResolving(true)
    try {
      const sec = secrets.find(s => s.id === secretId)
      if (!sec) { alert('Select API key first'); return }
      const r = await steamApi.resolveVanity(steamVanity, sec.value || secretId)
      setApiUrl(r.data.steamId); setSteamVanity('')
    } catch { alert('Could not resolve vanity URL — check API key and username') }
    finally { setSteamResolving(false) }
  }

  const test = async () => {
    setTesting(true); setTestResult(null)
    try {
      const res = await integrationsApi.test({
        type, apiUrl, secretId: secretId || undefined, skipTls
      })
      setTestResult(res.data)
    } catch { setTestResult({ ok: false, error: 'Request failed' }) }
    finally { setTesting(false) }
  }

  const save = async () => {
    if (!name.trim() || (!NO_URL_REQUIRED.includes(type) && !apiUrl)) return
    setSaving(true)
    try {
      if (isEdit && integration) {
        // Personal integrations use myIntegrationsApi, system integrations use integrationsApi
        const api = (integration.createdBy && integration.createdBy !== 'SYSTEM')
          ? myIntegrationsApi : integrationsApi
        await api.update(integration.id, {
          name: name.trim(), apiUrl, uiUrl,
          secretId: secretId || undefined, skipTls, refreshSecs,
        })
      } else {
        await integrationsApi.create({
          name: name.trim(), type, apiUrl, uiUrl,
          secretId: secretId || undefined,
          skipTls, refreshSecs,
          ...(scope === 'personal' ? { scope: 'personal' } : {}),
        })
      }
      onSaved()
    } finally { setSaving(false) }
  }

  const deleteIntegration = async () => {
    if (!integration || !confirm(`Delete integration "${integration.name}"?`)) return
    setDeleting(true)
    try {
      const api = (integration.createdBy && integration.createdBy !== 'SYSTEM')
        ? myIntegrationsApi : integrationsApi
      await api.delete(integration.id)
      onDeleted?.()
    } finally { setDeleting(false) }
  }

  const activeType = isEdit ? integration!.type : type
  const typeDef = INTEGRATION_TYPES.find(t => t.id === activeType)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Row 1: Name, Type, Secret */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 2, minWidth: 160 }}>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. My Sonarr" autoFocus={!isEdit} />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label className="label">Type</label>
          {isEdit ? (
            <div style={{ padding: '6px 10px', borderRadius: 6, fontSize: 13,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              color: 'var(--text-muted)' }}>
              {typeDef?.label ?? activeType}
            </div>
          ) : (
            <select className="input" value={type}
              onChange={e => handleTypeChange(e.target.value)} style={{ cursor: 'pointer' }}>
              {INTEGRATION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label className="label">API key secret</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select className="input" value={secretId}
              onChange={e => { setSecretId(e.target.value); setTestResult(null) }}
              style={{ cursor: 'pointer', flex: 1 }}>
              <option value="">— None —</option>
              {secrets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="btn btn-ghost" style={{ fontSize: 12, flexShrink: 0 }}
              onClick={() => setShowNewSecret(v => !v)}>
              {showNewSecret ? 'Cancel' : '+ New'}
            </button>
          </div>
        </div>
      </div>

      {/* Inline secret creation */}
      {showNewSecret && (
        <div style={{ padding: '10px 12px', borderRadius: 8,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label className="label">Name</label>
              <input className="input" value={newSecretName}
                onChange={e => setNewSecretName(e.target.value)}
                placeholder="e.g. Sonarr API Key" autoFocus />
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Value</label>
              <input className="input" type="password" value={newSecretValue}
                onChange={e => setNewSecretValue(e.target.value)}
                placeholder="Paste key here" />
            </div>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 12, alignSelf: 'flex-start' }}
            disabled={savingSecret || !newSecretName || !newSecretValue}
            onClick={saveNewSecret}>
            {savingSecret ? <span className="spinner" /> : 'Save & select'}
          </button>
        </div>
      )}

      {/* URL config — varies by type */}
      {activeType === 'weather' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="label">Location</label>
          {apiUrl && (
            <div style={{ fontSize: 12, color: 'var(--accent2)' }}>
              📍 {apiUrl.includes('|') ? apiUrl.split('|').slice(2, 4).join(', ') : apiUrl.split(',').slice(2).join(',')}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="input" value={geoQuery}
              onChange={e => setGeoQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchGeo()}
              placeholder={isEdit ? 'Search city to change location...' : 'Search city or region...'}
              style={{ flex: 1 }} />
            <button className="btn btn-ghost" style={{ fontSize: 12 }}
              onClick={searchGeo} disabled={geoSearching}>
              {geoSearching ? '...' : 'Search'}
            </button>
          </div>
          {geoResults.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              {geoResults.map((r, i) => (
                <button key={i} onClick={() => selectGeo(r)}
                  style={{ display: 'block', width: '100%', textAlign: 'left',
                    padding: '7px 12px', fontSize: 12, background: 'none', border: 'none',
                    borderBottom: i < geoResults.length-1 ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer', color: 'var(--text)' }}>
                  {[r.name, r.admin1, r.country].filter(Boolean).join(', ')}
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 8 }}>
                    {r.latitude.toFixed(3)}, {r.longitude.toFixed(3)}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label className="label" style={{ marginBottom: 0 }}>Unit:</label>
            <select className="input" style={{ maxWidth: 160, cursor: 'pointer' }}
              value={(apiUrl.includes('|') ? apiUrl.split('|')[3] : apiUrl.split(',')[3]) || 'f'}
              onChange={e => {
                const sep = apiUrl.includes('|') ? '|' : ','
                const parts = apiUrl.split(sep)
                while (parts.length < 4) parts.push('')
                parts[3] = e.target.value
                setApiUrl(parts.join(sep))
              }}>
              <option value="f">Fahrenheit (°F)</option>
              <option value="c">Celsius (°C)</option>
            </select>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            No API key required. Data from Open-Meteo (open source, free).
          </div>
        </div>
      ) : activeType === 'steam' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="label">
            Steam ID <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(17-digit number)</span>
          </label>
          <input className="input" value={apiUrl}
            onChange={e => setApiUrl(e.target.value)}
            placeholder="76561198000000000" />
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="input" value={steamVanity}
              onChange={e => setSteamVanity(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && resolveVanity()}
              placeholder="Or enter profile vanity name to resolve..." style={{ flex: 1 }} />
            <button className="btn btn-ghost" style={{ fontSize: 12 }}
              onClick={resolveVanity} disabled={steamResolving || !secretId}>
              {steamResolving ? '...' : 'Resolve'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            API key required above. Find your Steam ID at steamid.io
          </div>
        </div>
      ) : activeType === 'rss' ? (
        <div>
          <label className="label">Feed URL</label>
          <input className="input" value={apiUrl}
            onChange={e => { setApiUrl(e.target.value); setTestResult(null) }}
            placeholder="https://example.com/feed.xml" />
        </div>
      ) : activeType === 'stocks' ? (
        <StocksConfigUI apiUrl={apiUrl} onChange={setApiUrl} />
      ) : activeType === 'crypto' ? (
        <CryptoConfigUI apiUrl={apiUrl} onChange={setApiUrl} />
      ) : activeType === 'sports' ? (
        <SportsConfigUI apiUrl={apiUrl} onChange={setApiUrl} />
      ) : (
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="label">
              API URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(backend)</span>
            </label>
            <input className="input" value={apiUrl}
              onChange={e => { setApiUrl(e.target.value); setTestResult(null) }}
              placeholder="http://sonarr.local:8989" />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">
              UI URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(browser, optional)</span>
            </label>
            <input className="input" value={uiUrl}
              onChange={e => setUiUrl(e.target.value)}
              placeholder="https://sonarr.yourdomain.com" />
          </div>
        </div>
      )}

      {/* Test result */}
      {testResult && (
        <div style={{
          padding: '8px 12px', borderRadius: 7, fontSize: 12,
          background: testResult.ok ? '#4ade8018' : '#f8717118',
          border: `1px solid ${testResult.ok ? '#4ade8040' : '#f8717140'}`,
          color: testResult.ok ? 'var(--green)' : 'var(--red)',
        }}>
          {testResult.ok ? '✓ Connection successful' : `✗ ${testResult.error}`}
          {!testResult.ok && testResult.tlsError && testResult.skipTlsWorks && (
            <div style={{ marginTop: 4, color: 'var(--amber)', fontSize: 11 }}>
              ⚠ Connection works without certificate verification — enable "Skip TLS" below.
            </div>
          )}
        </div>
      )}

      {/* Options row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
          color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={skipTls} onChange={e => setSkipTls(e.target.checked)} />
          Skip TLS <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>(self-signed certs)</span>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>Refresh every</label>
          <input className="input" type="number" min={15} value={refreshSecs}
            onChange={e => setRefreshSecs(Math.max(15, Number(e.target.value)))}
            style={{ width: 90 }} />
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>s</span>
        </div>
      </div>

      {/* Group assignment slot — system scope, edit mode */}
      {children}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {!NO_TEST_TYPES.includes(activeType) && (
          <button className="btn btn-secondary" onClick={test}
            disabled={testing || !apiUrl}>
            {testing ? <span className="spinner" /> : 'Test'}
          </button>
        )}
        <button className="btn btn-primary" onClick={save}
          disabled={saving || !name.trim() || (!NO_URL_REQUIRED.includes(activeType) && !apiUrl)}>
          {saving ? <span className="spinner" /> : isEdit ? 'Save' : 'Create'}
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        {isEdit && onDeleted && (
          <button className="btn btn-danger" style={{ marginLeft: 'auto' }}
            disabled={deleting} onClick={deleteIntegration}>
            {deleting ? <span className="spinner" /> : 'Delete'}
          </button>
        )}
      </div>
    </div>
  )
}
