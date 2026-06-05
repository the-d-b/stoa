/**
 * PanelForm — unified create + edit form for panels.
 * Used by system settings (scope='system') and personal profile (scope='personal').
 *
 * Create mode: panel prop is undefined. Shows type selector, empty fields.
 * Edit mode:   panel prop is provided. Type is locked, fields pre-populated.
 */
import { useState, useEffect } from 'react'
import { panelsApi, myPanelsApi, integrationsApi, secretsApi, weatherApi, Integration, Panel, Tag } from '../../api'
import TypeCardPicker from './TypeCardPicker'
import SportsConfigUI from './SportsConfigUI'
import StocksConfigUI from './StocksConfigUI'
import CryptoConfigUI from './CryptoConfigUI'

// ── Authoritative panel type list ─────────────────────────────────────────────
export const PANEL_TYPES: {
  id: string; label: string; desc: string; needsIntegration: boolean; category: string
}[] = [
  // Media
  { id: 'sonarr',       label: 'Sonarr',       desc: 'TV show tracking',                              needsIntegration: true,  category: 'Media' },
  { id: 'radarr',       label: 'Radarr',       desc: 'Movie tracking',                                needsIntegration: true,  category: 'Media' },
  { id: 'lidarr',       label: 'Lidarr',       desc: 'Music tracking',                                needsIntegration: true,  category: 'Media' },
  { id: 'readarr',      label: 'Readarr',      desc: 'Book & audiobook tracking',                     needsIntegration: true,  category: 'Media' },
  { id: 'plex',         label: 'Plex',         desc: 'Media server',                                  needsIntegration: true,  category: 'Media' },
  { id: 'jellyfin',     label: 'Jellyfin',     desc: 'Media server',                                  needsIntegration: true,  category: 'Media' },
  { id: 'emby',         label: 'Emby',         desc: 'Media server',                                  needsIntegration: true,  category: 'Media' },
  { id: 'tautulli',     label: 'Tautulli',     desc: 'Plex analytics',                                needsIntegration: true,  category: 'Media' },
  { id: 'jellystat',    label: 'Jellystat',    desc: 'Jellyfin analytics',                             needsIntegration: true,  category: 'Media' },
  { id: 'tracearr',     label: 'Tracearr',     desc: 'Cross-platform media analytics & security',      needsIntegration: true,  category: 'Media' },
  { id: 'immich',       label: 'Immich',       desc: 'Photo library stats & preview carousel',          needsIntegration: true,  category: 'Media' },
  { id: 'kavita',       label: 'Kavita',       desc: 'Manga & comic library stats and recent series',   needsIntegration: true,  category: 'Media' },
  { id: 'komga',        label: 'Komga',        desc: 'Comic & manga server stats and recent series',     needsIntegration: true,  category: 'Media' },
  { id: 'lychee',       label: 'Lychee',       desc: 'Photo gallery stats and carousel',                 needsIntegration: true,  category: 'Media' },
  { id: 'audiobookshelf', label: 'Audiobookshelf', desc: 'Audiobook/podcast player with in-progress queue', needsIntegration: true, category: 'Media' },
  { id: 'navidrome',     label: 'Navidrome',     desc: 'Music server with playlist player',               needsIntegration: true, category: 'Media' },
  { id: 'overseerr',    label: 'Overseerr / Jellyseerr', desc: 'Request queue & stats',               needsIntegration: true,  category: 'Media' },
  { id: 'photoprism',   label: 'PhotoPrism',   desc: 'Photo management',                              needsIntegration: true,  category: 'Media' },
  // Infrastructure
  { id: 'truenas',      label: 'TrueNAS',      desc: 'NAS management',                                needsIntegration: true,  category: 'Infrastructure' },
  { id: 'unraid',       label: 'Unraid',       desc: 'NAS & storage server',                          needsIntegration: true,  category: 'Infrastructure' },
  { id: 'omv',          label: 'OpenMediaVault', desc: 'NAS & storage server',                        needsIntegration: true,  category: 'Infrastructure' },
  { id: 'synology',     label: 'Synology',     desc: 'Synology DSM NAS',                              needsIntegration: true,  category: 'Infrastructure' },
  { id: 'qnap',         label: 'QNAP',         desc: 'QNAP QTS NAS',                                  needsIntegration: true,  category: 'Infrastructure' },
  { id: 'proxmox',      label: 'Proxmox',      desc: 'Hypervisor',                                    needsIntegration: true,  category: 'Infrastructure' },
  { id: 'opnsense',     label: 'OPNsense',     desc: 'Firewall/router stats',                         needsIntegration: true,  category: 'Infrastructure' },
  { id: 'pfsense',      label: 'pfSense',      desc: 'Firewall/router stats (pfSense-pkg-API)',        needsIntegration: true,  category: 'Infrastructure' },
  { id: 'openwrt',      label: 'OpenWrt',      desc: 'Router stats, interface traffic & WiFi clients', needsIntegration: true,  category: 'Infrastructure' },
  { id: 'omada',        label: 'Omada SDN',    desc: 'TP-Link Omada controller — device status, client counts, alerts',          needsIntegration: true,  category: 'Infrastructure' },
  { id: 'unifi',        label: 'UniFi',        desc: 'Ubiquiti UniFi controller — devices, clients, WAN, real-time events',         needsIntegration: true,  category: 'Infrastructure' },
  { id: 'traefik',      label: 'Traefik',      desc: 'Reverse proxy — routes, backend health, providers',                           needsIntegration: true,  category: 'Infrastructure' },
  { id: 'kuma',         label: 'Uptime Kuma',  desc: 'Status monitoring',                             needsIntegration: true,  category: 'Infrastructure' },
  { id: 'gluetun',      label: 'Gluetun',      desc: 'VPN container',                                 needsIntegration: true,  category: 'Infrastructure' },
  { id: 'authentik',    label: 'Authentik',    desc: 'Identity provider',                             needsIntegration: true,  category: 'Infrastructure' },
  { id: 'homeassistant', label: 'Home Assistant', desc: 'Smart home entity states',                   needsIntegration: true,  category: 'Infrastructure' },
  { id: 'transmission', label: 'Transmission', desc: 'BitTorrent client',                             needsIntegration: true,  category: 'Infrastructure' },
  { id: 'qbittorrent', label: 'qBittorrent',  desc: 'BitTorrent client',                             needsIntegration: true,  category: 'Infrastructure' },
  { id: 'deluge',      label: 'Deluge',       desc: 'BitTorrent client',                             needsIntegration: true,  category: 'Infrastructure' },
  { id: 'rutorrent',   label: 'ruTorrent',    desc: 'rTorrent/ruTorrent BitTorrent client',          needsIntegration: true,  category: 'Infrastructure' },
  // Gaming
  { id: 'steam',        label: 'Steam',        desc: 'Steam library, activity & store',               needsIntegration: true,  category: 'Gaming' },
  // Finance
  { id: 'stocks',       label: 'Stocks & Crypto', desc: 'Stock quotes and crypto prices with sparklines', needsIntegration: true, category: 'Finance' },
  // Content
  { id: 'rss',          label: 'RSS Feed',     desc: 'Live RSS/Atom feed reader',                     needsIntegration: true,  category: 'Content' },
  { id: 'weather',      label: 'Weather',      desc: 'Current conditions & forecast',                 needsIntegration: true,  category: 'Content' },
  { id: 'sports',       label: 'Sports',       desc: 'NHL/NFL/NBA/MLB scores, standings & schedule',  needsIntegration: true,  category: 'Content' },
  // Productivity
  { id: 'notes',        label: 'Notes',        desc: 'Multi-note notepad panel',                      needsIntegration: false, category: 'Productivity' },
  { id: 'checklist',    label: 'Checklist',    desc: 'Todo list with due dates',                      needsIntegration: false, category: 'Productivity' },
  { id: 'bookmarks',    label: 'Bookmarks',    desc: 'Bookmark tree panel',                           needsIntegration: false, category: 'Productivity' },
  { id: 'calendar',     label: 'Calendar',     desc: 'Calendar with sources',                         needsIntegration: false, category: 'Productivity' },
  { id: 'search',       label: 'Search',       desc: 'External search engine panel',                  needsIntegration: false, category: 'Productivity' },
  // Custom
  { id: 'customapi',    label: 'Custom API',   desc: 'Generic JSON API with field mappings',          needsIntegration: false, category: 'Custom' },
  { id: 'custom',       label: 'Text/HTML',    desc: 'Custom HTML or text content',                   needsIntegration: false, category: 'Custom' },
  { id: 'iframe',       label: 'Web embed',    desc: 'Embed a web page',                              needsIntegration: false, category: 'Custom' },
]

const INLINE_NO_URL  = ['sports', 'stocks', 'crypto', 'weather']
const INLINE_NO_TEST = ['weather', 'steam', 'rss', 'sports', 'stocks', 'crypto']

const SEARCH_ENGINE_LIST = [
  { id: 'ddg', label: 'DuckDuckGo' }, { id: 'google', label: 'Google' },
  { id: 'bing', label: 'Bing' }, { id: 'brave', label: 'Brave' },
  { id: 'yahoo', label: 'Yahoo' }, { id: 'searxng', label: 'SearXNG' },
]

const HEIGHT_OPTIONS = [1,2,3,4,5,6,7,8]
const RATINGS_TYPES = ['radarr', 'sonarr', 'plex']
const INTEGRATION_TYPES = [
  'sonarr','radarr','readarr','lidarr','plex','jellyfin','emby','homeassistant','tautulli','jellystat','tracearr','immich','kavita','komga','lychee','audiobookshelf','navidrome','truenas','unraid','omv','synology','qnap','proxmox',
  'kuma','gluetun','opnsense','pfsense','openwrt','transmission','qbittorrent','deluge','rutorrent','photoprism','authentik','overseerr',
  'weather','steam','rss','sports','stocks','crypto',
]

function IfaceCapEditor({ initialCaps, onChange }: {
  initialCaps: Record<string,number>
  onChange: (caps: Record<string,number>) => void
}) {
  const [pairs, setPairs] = useState<{dev:string;cap:number}[]>(() =>
    Object.entries(initialCaps).map(([dev, cap]) => ({ dev, cap })))
  const sync = (next: {dev:string;cap:number}[]) => {
    setPairs(next)
    const obj: Record<string,number> = {}
    for (const { dev, cap } of next) { if (dev) obj[dev] = cap }
    onChange(obj)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label className="label">Bandwidth cap per interface</label>
      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
        Device name (e.g. <code>wan</code>, <code>lan</code>) and cap in Mbps. Scales the arc gauges.
      </div>
      {pairs.map((row, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="input" value={row.dev} style={{ fontSize: 12, width: 80 }}
            onChange={e => sync(pairs.map((r,i) => i===idx ? {...r,dev:e.target.value} : r))} />
          <input type="number" className="input" value={row.cap} style={{ fontSize: 12, width: 80 }}
            onChange={e => sync(pairs.map((r,i) => i===idx ? {...r,cap:Number(e.target.value)} : r))} />
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Mbps</span>
          <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)' }}
            onClick={() => sync(pairs.filter((_,i) => i !== idx))}>✕</button>
        </div>
      ))}
      <button className="btn btn-ghost" style={{ fontSize: 12 }}
        onClick={() => sync([...pairs, { dev: '', cap: 1000 }])}>
        + Add interface
      </button>
    </div>
  )
}

function parseCfg(config?: string): any {
  try { return JSON.parse(config || '{}') } catch { return {} }
}

function mappingsToText(mappings: any[]): string {
  return (mappings || []).map((m: any) =>
    m.format ? `${m.path} | ${m.label} | ${m.format}` : `${m.path} | ${m.label}`
  ).join('\n')
}

function textToMappings(text: string): any[] {
  return text.split('\n')
    .map(l => l.trim()).filter(l => l.includes('|'))
    .map(l => { const p = l.split('|').map(s => s.trim()); return { path: p[0], label: p[1]||'', format: p[2]||'' } })
}

interface Props {
  scope: 'system' | 'personal'
  integrations: Integration[]
  tags?: Tag[]
  panel?: Panel                    // undefined = create, provided = edit
  bookmarkRoots?: { id: string; label: string }[]
  onSaved: () => void
  onCancel: () => void
  onDeleted?: () => void
  onTagChanged?: () => void        // reload without collapsing — for tag toggles in edit mode
  children?: React.ReactNode       // calendar sources slot — only used in edit mode
}

export default function PanelForm({
  scope, integrations, tags = [], panel,
  bookmarkRoots = [], onSaved, onCancel, onDeleted, onTagChanged, children,
}: Props) {
  const isEdit = !!panel
  const cfg = parseCfg(panel?.config)

  // ── Core fields ───────────────────────────────────────────────────────────
  const [title, setTitle] = useState(panel?.title ?? '')
  const [type, setType] = useState(panel?.type ?? 'bookmarks')
  const [height, setHeight] = useState<number>(cfg.height ?? 2)

  // ── Integration types ──────────────────────────────────────────────────────
  const [integrationId, setIntegrationId] = useState(cfg.integrationId ?? '')
  const [allowedRatings, setAllowedRatings] = useState(cfg.allowedRatings ?? '')

  // ── Home Assistant entity filter ───────────────────────────────────────────
  const [haEntityIds, setHaEntityIds] = useState(cfg.entityIds ?? '')
  const [haDomains, setHaDomains] = useState(cfg.domains ?? '')

  // ── Bookmarks ──────────────────────────────────────────────────────────────
  const [bookmarkRootId, setBookmarkRootId] = useState(cfg.rootNodeId ?? '')

  // ── iframe ─────────────────────────────────────────────────────────────────
  const [iframeUrl, setIframeUrl] = useState(cfg.url ?? '')

  // ── custom HTML ────────────────────────────────────────────────────────────
  const [customHtml, setCustomHtml] = useState(cfg.html ?? '')

  // ── search engines ─────────────────────────────────────────────────────────
  const [searchEngines, setSearchEngines] = useState<string[]>(
    cfg.engines?.length ? cfg.engines : ['ddg', 'google']
  )
  const [searxngUrl, setSearxngUrl] = useState(cfg.searxngUrl ?? '')
  const [defaultEngine, setDefaultEngine] = useState(cfg.defaultEngine ?? 'ddg')

  // ── custom API ─────────────────────────────────────────────────────────────
  const [apiUrl, setApiUrl] = useState(cfg.url ?? '')
  const [apiUiUrl, setApiUiUrl] = useState(cfg.uiUrl ?? '')
  const [apiKey, setApiKey] = useState(cfg.apiKey ?? '')
  const [apiMappings, setApiMappings] = useState(mappingsToText(cfg.mappings))
  const [apiRefreshSecs, setApiRefreshSecs] = useState(cfg.refreshSecs ?? 600)
  const [apiPreview, setApiPreview] = useState<{loading:boolean;json:string;error:string}|null>(null)
  const [ifaceCaps, setIfaceCaps] = useState<Record<string,number>>(cfg.ifaceCaps || {})

  // ── form state ─────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // ── local integrations copy (appended when user creates inline) ─────────────
  const [localIntegrations, setLocalIntegrations] = useState<Integration[]>(integrations)
  useEffect(() => setLocalIntegrations(integrations), [integrations])

  // ── inline integration creator ─────────────────────────────────────────────
  const [showInlineCreate, setShowInlineCreate] = useState(false)
  const [inlineName, setInlineName] = useState('')
  const [inlineUrl, setInlineUrl] = useState('')
  const [inlineUiUrl, setInlineUiUrl] = useState('')
  const [inlineSecretId, setInlineSecretId] = useState('')
  const [inlineSecrets, setInlineSecrets] = useState<any[]>([])
  const [inlineShowNewSecret, setInlineShowNewSecret] = useState(false)
  const [inlineNewSecretName, setInlineNewSecretName] = useState('')
  const [inlineNewSecretValue, setInlineNewSecretValue] = useState('')
  const [inlineSavingSecret, setInlineSavingSecret] = useState(false)
  const [inlineTesting, setInlineTesting] = useState(false)
  const [inlineTestResult, setInlineTestResult] = useState<{ok:boolean;error?:string}|null>(null)
  const [inlineCreating, setInlineCreating] = useState(false)
  const [inlineGeoQuery, setInlineGeoQuery] = useState('')
  const [inlineGeoResults, setInlineGeoResults] = useState<any[]>([])
  const [inlineGeoSearching, setInlineGeoSearching] = useState(false)

  // Re-init when switching to a different panel in edit mode
  useEffect(() => {
    if (!panel) return
    const c = parseCfg(panel.config)
    setTitle(panel.title)
    setType(panel.type)
    setHeight(c.height ?? 2)
    setIntegrationId(c.integrationId ?? '')
    setAllowedRatings(c.allowedRatings ?? '')
    setHaEntityIds(c.entityIds ?? '')
    setHaDomains(c.domains ?? '')
    setBookmarkRootId(c.rootNodeId ?? '')
    setIframeUrl(c.url ?? '')
    setCustomHtml(c.html ?? '')
    setSearchEngines(c.engines?.length ? c.engines : ['ddg', 'google'])
    setSearxngUrl(c.searxngUrl ?? '')
    setDefaultEngine(c.defaultEngine ?? 'ddg')
    setApiUrl(c.url ?? '')
    setApiUiUrl(c.uiUrl ?? '')
    setApiKey(c.apiKey ?? '')
    setApiMappings(mappingsToText(c.mappings))
    setApiRefreshSecs(c.refreshSecs ?? 600)
    setApiPreview(null)
    setIfaceCaps(c.ifaceCaps || {})
  }, [panel?.id])

  const handleTypeChange = (t: string) => {
    setType(t); setIntegrationId(''); setAllowedRatings('')
    setHaEntityIds(''); setHaDomains('')
    setShowInlineCreate(false)
    setInlineName(''); setInlineUrl(''); setInlineSecretId('')
    setInlineTestResult(null); setInlineGeoQuery(''); setInlineGeoResults([])
  }

  const openInlineCreate = async (label: string) => {
    setInlineName(`My ${label}`)
    setInlineUrl(''); setInlineUiUrl(''); setInlineSecretId(''); setInlineTestResult(null)
    setInlineGeoQuery(''); setInlineGeoResults([])
    setInlineShowNewSecret(false)
    setShowInlineCreate(true)
    const r = await secretsApi.list()
    setInlineSecrets(r.data || [])
  }

  const inlineSaveSecret = async () => {
    if (!inlineNewSecretName.trim() || !inlineNewSecretValue.trim()) return
    setInlineSavingSecret(true)
    try {
      const r = await secretsApi.create({
        name: inlineNewSecretName.trim(),
        value: inlineNewSecretValue.trim(),
        scope: scope === 'system' ? 'shared' : 'personal',
      })
      const s = { id: r.data.id, name: inlineNewSecretName.trim() }
      setInlineSecrets(prev => [...prev, s])
      setInlineSecretId(s.id)
      setInlineNewSecretName(''); setInlineNewSecretValue('')
      setInlineShowNewSecret(false)
    } finally { setInlineSavingSecret(false) }
  }

  const inlineTest = async () => {
    setInlineTesting(true); setInlineTestResult(null)
    try {
      const res = await integrationsApi.test({
        type, apiUrl: inlineUrl,
        secretId: inlineSecretId || undefined, skipTls: false,
      })
      setInlineTestResult(res.data)
    } catch { setInlineTestResult({ ok: false, error: 'Request failed' }) }
    finally { setInlineTesting(false) }
  }

  const inlineCreate = async () => {
    if (!inlineName.trim()) return
    setInlineCreating(true)
    try {
      const res = await integrationsApi.create({
        name: inlineName.trim(), type,
        apiUrl: inlineUrl, uiUrl: inlineUiUrl || undefined,
        secretId: inlineSecretId || undefined,
        skipTls: false, refreshSecs: 60,
        ...(scope === 'personal' ? { scope: 'personal' } : {}),
      })
      const newInteg = {
        id: res.data.id, name: inlineName.trim(), type,
        apiUrl: inlineUrl, uiUrl: inlineUiUrl || '',
        secretId: inlineSecretId || undefined,
        skipTls: false, refreshSecs: 60,
      } as Integration
      setLocalIntegrations(prev => [...prev, newInteg])
      setIntegrationId(newInteg.id)
      setShowInlineCreate(false)
    } finally { setInlineCreating(false) }
  }

  const inlineSearchGeo = async () => {
    if (!inlineGeoQuery.trim()) return
    setInlineGeoSearching(true)
    try { const r = await weatherApi.geocode(inlineGeoQuery); setInlineGeoResults(r.data || []) }
    finally { setInlineGeoSearching(false) }
  }

  const inlineSelectGeo = (r: any) => {
    const city = [r.name, r.admin1, r.country].filter(Boolean).join(', ')
    setInlineUrl(`${r.latitude}|${r.longitude}|${city}|f`)
    setInlineGeoResults([]); setInlineGeoQuery('')
  }

  const buildConfig = (): string => {
    const base: any = { height }
    if (type === 'iframe') {
      base.url = iframeUrl
    } else if (type === 'custom') {
      base.html = customHtml
    } else if (type === 'search') {
      base.engines = searchEngines
      base.defaultEngine = defaultEngine
      if (searchEngines.includes('searxng') && searxngUrl) base.searxngUrl = searxngUrl
    } else if (type === 'customapi') {
      base.url = apiUrl
      base.uiUrl = apiUiUrl
      base.apiKey = apiKey
      base.mappings = textToMappings(apiMappings)
      base.refreshSecs = apiRefreshSecs
    } else if (type === 'calendar') {
      return JSON.stringify({ ...cfg, height, sources: cfg.sources || [] })
    } else if (type === 'bookmarks') {
      if (bookmarkRootId) base.rootNodeId = bookmarkRootId
    } else if (INTEGRATION_TYPES.includes(type)) {
      if (integrationId) base.integrationId = integrationId
      base.refreshSecs = cfg.refreshSecs || (type === 'homeassistant' ? 60 : 300)
      if (type === 'opnsense') {
        base.maxMbps = cfg.maxMbps || 1000
        if (Object.keys(ifaceCaps).length > 0) base.ifaceCaps = ifaceCaps
      }
      if (type === 'homeassistant') {
        if (haEntityIds.trim()) base.entityIds = haEntityIds.trim()
        if (haDomains.trim()) base.domains = haDomains.trim()
      }
      if (RATINGS_TYPES.includes(type) && allowedRatings.trim()) {
        base.allowedRatings = allowedRatings.trim()
      }
    }
    return JSON.stringify(base)
  }

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      const api = scope === 'system' ? panelsApi : myPanelsApi
      if (isEdit && panel) {
        await api.update(panel.id, { title: title.trim(), config: buildConfig() })
      } else {
        await api.create({ type, title: title.trim(), config: buildConfig() })
      }
      onSaved()
    } finally { setSaving(false) }
  }

  const deletePanel = async () => {
    if (!panel || !confirm(`Delete panel "${panel.title}"?`)) return
    setDeleting(true)
    try {
      const api = scope === 'system' ? panelsApi : myPanelsApi
      await api.delete(panel.id)
      onDeleted?.()
    } finally { setDeleting(false) }
  }

  const typeDef = PANEL_TYPES.find(t => t.id === type)
  const needsIntegration = INTEGRATION_TYPES.includes(type)
  const compatibleIntegrations = localIntegrations.filter(i =>
    i.type === type || (type === 'stocks' && i.type === 'crypto'))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Type picker — create mode only, shown first so type drives the rest of the form */}
      {!isEdit && (
        <div>
          <label className="label" style={{ display: 'block', marginBottom: 8 }}>Panel type</label>
          <TypeCardPicker
            types={PANEL_TYPES.map(t => ({
              ...t,
              warn: t.needsIntegration && !integrations.some(i => i.type === t.id),
            }))}
            value={type}
            onChange={handleTypeChange}
          />
        </div>
      )}

      {/* Row 1: Title, Height, (edit: locked type) */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 160 }}>
          <label className="label">Panel title</label>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. My Sonarr" autoFocus={!isEdit} />
        </div>
        {isEdit && (
          <div style={{ flex: 1, minWidth: 140 }}>
            <label className="label">Panel type</label>
            <div style={{ padding: '6px 10px', borderRadius: 6, fontSize: 13,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              color: 'var(--text-muted)' }}>
              {typeDef?.label ?? type}
            </div>
          </div>
        )}
        <div>
          <label className="label">Height</label>
          <select className="input" value={height}
            onChange={e => setHeight(Number(e.target.value))} style={{ cursor: 'pointer' }}>
            {HEIGHT_OPTIONS.map(h => <option key={h} value={h}>{h}x</option>)}
          </select>
        </div>
      </div>

      {/* Integration selector + inline creator */}
      {needsIntegration && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label className="label" style={{ marginBottom: 0 }}>Integration</label>
            {!showInlineCreate && (
              <button className="btn btn-ghost" style={{ fontSize: 12 }}
                onClick={() => openInlineCreate(typeDef?.label ?? type)}>
                + New
              </button>
            )}
          </div>

          {compatibleIntegrations.length === 0 && !showInlineCreate && (
            <div style={{ fontSize: 12, color: 'var(--amber)' }}>
              ⚠ No {typeDef?.label ?? type} integration yet —{' '}
              <button type="button" onClick={() => openInlineCreate(typeDef?.label ?? type)}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--accent2)', fontSize: 12, padding: 0 }}>
                create one now
              </button>
            </div>
          )}

          {compatibleIntegrations.length > 0 && (
            <select className="input" value={integrationId}
              onChange={e => setIntegrationId(e.target.value)} style={{ cursor: 'pointer' }}>
              <option value="">— Select integration —</option>
              {compatibleIntegrations.map(i => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          )}

          {/* Inline integration creator */}
          {showInlineCreate && (
            <div style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                New {typeDef?.label ?? type} integration
              </div>

              {/* Name */}
              <div>
                <label className="label">Name</label>
                <input className="input" value={inlineName} autoFocus
                  onChange={e => setInlineName(e.target.value)}
                  placeholder={`My ${typeDef?.label ?? type}`} />
              </div>

              {/* URL — standard types */}
              {!INLINE_NO_URL.includes(type) && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label className="label">API URL</label>
                    <input className="input" value={inlineUrl}
                      onChange={e => { setInlineUrl(e.target.value); setInlineTestResult(null) }}
                      placeholder="http://host:port" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="label">
                      UI URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span>
                    </label>
                    <input className="input" value={inlineUiUrl}
                      onChange={e => setInlineUiUrl(e.target.value)}
                      placeholder="https://host.yourdomain.com" />
                  </div>
                </div>
              )}

              {/* Weather geocoder */}
              {type === 'weather' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="label">Location</label>
                  {inlineUrl && (
                    <div style={{ fontSize: 12, color: 'var(--accent2)' }}>
                      📍 {inlineUrl.split('|').slice(2, 3).join('')}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="input" value={inlineGeoQuery}
                      onChange={e => setInlineGeoQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && inlineSearchGeo()}
                      placeholder="Search city..." style={{ flex: 1 }} />
                    <button className="btn btn-ghost" style={{ fontSize: 12 }}
                      onClick={inlineSearchGeo} disabled={inlineGeoSearching}>
                      {inlineGeoSearching ? '...' : 'Search'}
                    </button>
                  </div>
                  {inlineGeoResults.length > 0 && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                      {inlineGeoResults.map((r, i) => (
                        <button key={i} type="button" onClick={() => inlineSelectGeo(r)}
                          style={{ display: 'block', width: '100%', textAlign: 'left',
                            padding: '7px 12px', fontSize: 12, background: 'none', border: 'none',
                            borderBottom: i < inlineGeoResults.length - 1 ? '1px solid var(--border)' : 'none',
                            cursor: 'pointer', color: 'var(--text)' }}>
                          {[r.name, r.admin1, r.country].filter(Boolean).join(', ')}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Sports / Stocks / Crypto config UIs */}
              {type === 'sports'  && <SportsConfigUI  apiUrl={inlineUrl} onChange={setInlineUrl} />}
              {type === 'stocks'  && <StocksConfigUI  apiUrl={inlineUrl} onChange={setInlineUrl} />}
              {type === 'crypto'  && <CryptoConfigUI  apiUrl={inlineUrl} onChange={setInlineUrl} />}

              {/* Credential hint for username:password types */}
              {(type === 'omv' || type === 'synology' || type === 'qnap' || type === 'photoprism' || type === 'qbittorrent' || type === 'rutorrent') && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  API key secret should contain <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>username:password</code>.
                </div>
              )}
              {/* Deluge uses a password only — no username */}
              {type === 'deluge' && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  API key secret should contain just the Deluge Web UI <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>password</code> (no username).
                </div>
              )}

              {/* Secret */}
              <div>
                <label className="label">API key secret <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span></label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select className="input" value={inlineSecretId}
                    onChange={e => setInlineSecretId(e.target.value)}
                    style={{ cursor: 'pointer', flex: 1 }}>
                    <option value="">— None —</option>
                    {inlineSecrets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button className="btn btn-ghost" style={{ fontSize: 12 }}
                    onClick={() => setInlineShowNewSecret(v => !v)}>
                    {inlineShowNewSecret ? 'Cancel' : '+ New'}
                  </button>
                </div>
                {inlineShowNewSecret && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8,
                    padding: '10px 12px', borderRadius: 7, background: 'var(--surface2)',
                    border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <label className="label">Name</label>
                        <input className="input" value={inlineNewSecretName}
                          onChange={e => setInlineNewSecretName(e.target.value)}
                          placeholder="e.g. Sonarr API Key" autoFocus />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="label">Value</label>
                        <input className="input" type="password" value={inlineNewSecretValue}
                          onChange={e => setInlineNewSecretValue(e.target.value)}
                          placeholder="Paste key here" />
                      </div>
                    </div>
                    <button className="btn btn-primary" style={{ fontSize: 12, alignSelf: 'flex-start' }}
                      disabled={inlineSavingSecret || !inlineNewSecretName || !inlineNewSecretValue}
                      onClick={inlineSaveSecret}>
                      {inlineSavingSecret ? <span className="spinner" /> : 'Save & select'}
                    </button>
                  </div>
                )}
              </div>

              {/* Test result */}
              {inlineTestResult && (
                <div style={{ padding: '7px 10px', borderRadius: 6, fontSize: 12,
                  background: inlineTestResult.ok ? '#4ade8018' : '#f8717118',
                  border: `1px solid ${inlineTestResult.ok ? '#4ade8040' : '#f8717140'}`,
                  color: inlineTestResult.ok ? 'var(--green)' : 'var(--red)' }}>
                  {inlineTestResult.ok ? '✓ Connection successful' : `✗ ${inlineTestResult.error}`}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                {!INLINE_NO_TEST.includes(type) && (
                  <button className="btn btn-secondary" style={{ fontSize: 12 }}
                    onClick={inlineTest} disabled={inlineTesting || !inlineUrl}>
                    {inlineTesting ? <span className="spinner" /> : 'Test'}
                  </button>
                )}
                <button className="btn btn-primary" style={{ fontSize: 12 }}
                  onClick={inlineCreate}
                  disabled={inlineCreating || !inlineName.trim()}>
                  {inlineCreating ? <span className="spinner" /> : 'Create & select'}
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 12 }}
                  onClick={() => setShowInlineCreate(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Allowed ratings */}
      {RATINGS_TYPES.includes(type) && (
        <div>
          <label className="label">
            Allowed ratings{' '}
            <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional — blank = all)</span>
          </label>
          <input className="input" value={allowedRatings}
            onChange={e => setAllowedRatings(e.target.value)}
            placeholder="e.g. G, PG, PG-13" />
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
            Unrated / NR content is excluded when a filter is active.
          </div>
        </div>
      )}

      {/* Bookmark root */}
      {type === 'bookmarks' && bookmarkRoots.length > 0 && (
        <div>
          <label className="label">Bookmark root <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span></label>
          <select className="input" value={bookmarkRootId}
            onChange={e => setBookmarkRootId(e.target.value)} style={{ cursor: 'pointer' }}>
            <option value="">— All bookmarks —</option>
            {bookmarkRoots.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
      )}

      {/* iframe URL */}
      {type === 'iframe' && (
        <div>
          <label className="label">Embed URL</label>
          <input className="input" value={iframeUrl} onChange={e => setIframeUrl(e.target.value)}
            placeholder="https://example.com" />
        </div>
      )}

      {/* Custom HTML */}
      {type === 'custom' && (
        <div>
          <label className="label">HTML / Text content</label>
          <textarea className="input" style={{ fontFamily: 'DM Mono, monospace', minHeight: 80, resize: 'vertical' }}
            value={customHtml} onChange={e => setCustomHtml(e.target.value)}
            placeholder="<div>Your custom HTML here</div>" />
        </div>
      )}

      {/* Search engines */}
      {type === 'search' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="label">Search engines</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SEARCH_ENGINE_LIST.map(e => {
              const on = searchEngines.includes(e.id)
              return (
                <button key={e.id} type="button"
                  onClick={() => setSearchEngines(prev =>
                    on ? prev.filter(x => x !== e.id) : [...prev, e.id])}
                  style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    background: on ? 'var(--accent-bg)' : 'var(--surface2)',
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                    color: on ? 'var(--accent2)' : 'var(--text)', fontWeight: on ? 600 : 400 }}>
                  {on ? '✓ ' : ''}{e.label}
                </button>
              )
            })}
          </div>
          {searchEngines.includes('searxng') && (
            <div>
              <label className="label">SearXNG URL</label>
              <input className="input" value={searxngUrl}
                onChange={e => setSearxngUrl(e.target.value)}
                placeholder="https://searxng.example.com" />
            </div>
          )}
          <div>
            <label className="label">Default engine</label>
            <select className="input" value={defaultEngine}
              onChange={e => setDefaultEngine(e.target.value)}
              style={{ cursor: 'pointer', maxWidth: 200 }}>
              {SEARCH_ENGINE_LIST.filter(e => searchEngines.includes(e.id)).map(e => (
                <option key={e.id} value={e.id}>{e.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Custom API */}
      {type === 'customapi' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label className="label">API URL</label>
            <input className="input" type="url" value={apiUrl}
              onChange={e => setApiUrl(e.target.value)}
              placeholder="http://host:port/api/stats" />
          </div>
          <div>
            <label className="label">Panel link URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span></label>
            <input className="input" type="url" value={apiUiUrl}
              onChange={e => setApiUiUrl(e.target.value)}
              placeholder="http://host:port/dashboard" />
          </div>
          <div>
            <label className="label">Bearer token <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span></label>
            <input className="input" value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Leave blank if no auth required" />
          </div>
          <div>
            <label className="label">Field mappings</label>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
              One per line: <code>path | Label</code> &nbsp;— optionally add <code>| format</code>: integer, currency, text
            </div>
            <textarea className="input"
              style={{ fontFamily: 'DM Mono, monospace', minHeight: 80, resize: 'vertical' }}
              value={apiMappings} onChange={e => setApiMappings(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label className="label" style={{ marginBottom: 0 }}>Refresh every</label>
            <input className="input" type="number" min={15} value={apiRefreshSecs}
              onChange={e => setApiRefreshSecs(Math.max(15, Number(e.target.value)))}
              style={{ width: 90 }} />
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>seconds</span>
            <button className="btn btn-secondary" style={{ fontSize: 12, marginLeft: 'auto' }}
              disabled={!apiUrl || apiPreview?.loading}
              onClick={async () => {
                setApiPreview({ loading: true, json: '', error: '' })
                try {
                  const res = await fetch('/api/customapi/preview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json',
                      'Authorization': `Bearer ${localStorage.getItem('stoa_token')}` },
                    body: JSON.stringify({ url: apiUrl, apiKey })
                  })
                  if (!res.ok) throw new Error(`HTTP ${res.status}`)
                  setApiPreview({ loading: false, json: JSON.stringify(await res.json(), null, 2), error: '' })
                } catch (e: any) {
                  setApiPreview({ loading: false, json: '', error: e.message })
                }
              }}>
              {apiPreview?.loading ? <span className="spinner" /> : 'Test & Preview'}
            </button>
          </div>
          {apiPreview && !apiPreview.loading && (
            apiPreview.error
              ? <div style={{ fontSize: 12, color: 'var(--red)' }}>{apiPreview.error}</div>
              : <textarea readOnly value={apiPreview.json}
                  style={{ width: '100%', minHeight: 120, fontSize: 11, boxSizing: 'border-box',
                    fontFamily: 'DM Mono, monospace', background: 'var(--surface)',
                    border: '1px solid var(--border)', borderRadius: 6, padding: 8,
                    color: 'var(--text-muted)', resize: 'vertical' }} />
          )}
        </div>
      )}

      {/* Home Assistant entity filter */}
      {type === 'homeassistant' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label className="label">
              Entity IDs{' '}
              <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional — comma-separated)</span>
            </label>
            <input className="input" value={haEntityIds}
              onChange={e => setHaEntityIds(e.target.value)}
              placeholder="sensor.living_room_temp, light.kitchen, lock.front_door" />
          </div>
          <div>
            <label className="label">
              Domains{' '}
              <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional — comma-separated)</span>
            </label>
            <input className="input" value={haDomains}
              onChange={e => setHaDomains(e.target.value)}
              placeholder="light, switch, sensor, binary_sensor, climate, lock" />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Specify entity IDs, domains, or both — matched entities are shown in the panel.
            Leave both blank to show all entities. Domains: <code>light</code>, <code>switch</code>,{' '}
            <code>sensor</code>, <code>binary_sensor</code>, <code>climate</code>, <code>lock</code>,{' '}
            <code>cover</code>, <code>media_player</code>, <code>fan</code>, and more.
          </div>
        </div>
      )}

      {/* OPNsense interface caps — edit mode only */}
      {type === 'opnsense' && isEdit && (
        <IfaceCapEditor
          initialCaps={ifaceCaps}
          onChange={caps => setIfaceCaps(caps)}
        />
      )}

      {/* Calendar sources slot — parent injects this in edit mode */}
      {children}

      {/* Tags — edit mode only */}
      {isEdit && tags.length > 0 && (
        <div>
          <label className="label">Tags</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {tags.map(t => {
              const hasTag = panel?.tags?.some((pt: any) => pt.id === t.id)
              return (
                <button key={t.id} type="button" onClick={async () => {
                  if (!panel) return
                  if (hasTag) await panelsApi.removeTag(panel.id, t.id)
                  else await panelsApi.addTag(panel.id, t.id)
                  onTagChanged ? onTagChanged() : onSaved()
                }} style={{
                  padding: '2px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12,
                  background: hasTag ? t.color + '20' : 'transparent',
                  border: `1px solid ${hasTag ? t.color + '60' : 'var(--border)'}`,
                  color: hasTag ? t.color : 'var(--text-dim)',
                }}>{t.name}</button>
              )
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button className="btn btn-primary" onClick={save}
          disabled={saving || !title.trim()}>
          {saving ? <span className="spinner" /> : isEdit ? 'Save' : 'Create panel'}
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        {isEdit && onDeleted && (
          <button className="btn btn-danger" style={{ marginLeft: 'auto' }}
            disabled={deleting} onClick={deletePanel}>
            {deleting ? <span className="spinner" /> : 'Delete'}
          </button>
        )}
      </div>
    </div>
  )
}
