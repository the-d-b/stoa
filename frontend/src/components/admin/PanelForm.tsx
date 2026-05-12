/**
 * PanelForm — unified create + edit form for panels.
 * Used by system settings (scope='system') and personal profile (scope='personal').
 *
 * Create mode: panel prop is undefined. Shows type selector, empty fields.
 * Edit mode:   panel prop is provided. Type is locked, fields pre-populated.
 */
import { useState, useEffect } from 'react'
import { panelsApi, myPanelsApi, Integration, Panel, Tag } from '../../api'

// ── Authoritative panel type list ─────────────────────────────────────────────
export const PANEL_TYPES: {
  id: string; label: string; desc: string; needsIntegration: boolean
}[] = [
  { id: 'authentik',    label: 'Authentik',    desc: 'Identity provider',                    needsIntegration: true  },
  { id: 'bookmarks',    label: 'Bookmarks',    desc: 'Bookmark tree panel',                  needsIntegration: false },
  { id: 'calendar',     label: 'Calendar',     desc: 'Calendar with sources',                needsIntegration: false },
  { id: 'checklist',    label: 'Checklist',    desc: 'Todo list with due dates',             needsIntegration: false },
  { id: 'customapi',    label: 'Custom API',   desc: 'Generic JSON API with field mappings', needsIntegration: false },
  { id: 'custom',       label: 'Text/HTML',    desc: 'Custom HTML or text content',          needsIntegration: false },
  { id: 'gluetun',      label: 'Gluetun',      desc: 'VPN container',                        needsIntegration: true  },
  { id: 'iframe',       label: 'Web embed',    desc: 'Embed a web page',                     needsIntegration: false },
  { id: 'kuma',         label: 'Uptime Kuma',  desc: 'Status monitoring',                    needsIntegration: true  },
  { id: 'lidarr',       label: 'Lidarr',       desc: 'Music tracking',                       needsIntegration: true  },
  { id: 'notes',        label: 'Notes',        desc: 'Multi-note notepad panel',             needsIntegration: false },
  { id: 'opnsense',     label: 'OPNsense',     desc: 'Firewall/router stats',                needsIntegration: true  },
  { id: 'photoprism',   label: 'PhotoPrism',   desc: 'Photo management',                     needsIntegration: true  },
  { id: 'plex',         label: 'Plex',         desc: 'Media server',                         needsIntegration: true  },
  { id: 'proxmox',      label: 'Proxmox',      desc: 'Hypervisor',                           needsIntegration: true  },
  { id: 'radarr',       label: 'Radarr',       desc: 'Movie tracking',                       needsIntegration: true  },
  { id: 'readarr',      label: 'Readarr',      desc: 'Book & audiobook tracking',            needsIntegration: true  },
  { id: 'rss',          label: 'RSS Feed',     desc: 'Live RSS/Atom feed reader',            needsIntegration: true  },
  { id: 'search',       label: 'Search',       desc: 'External search engine panel',         needsIntegration: false },
  { id: 'sonarr',       label: 'Sonarr',       desc: 'TV show tracking',                     needsIntegration: true  },
  { id: 'steam',        label: 'Steam',        desc: 'Steam library, activity & store',      needsIntegration: true  },
  { id: 'tautulli',     label: 'Tautulli',     desc: 'Plex analytics',                       needsIntegration: true  },
  { id: 'transmission', label: 'Transmission', desc: 'BitTorrent client',                    needsIntegration: true  },
  { id: 'truenas',      label: 'TrueNAS',      desc: 'NAS management',                       needsIntegration: true  },
  { id: 'weather',      label: 'Weather',      desc: 'Current conditions & forecast',        needsIntegration: true  },
  { id: 'sports',       label: 'Sports',       desc: 'NHL/NFL/NBA/MLB scores, standings & schedule', needsIntegration: true  },
]

const SEARCH_ENGINE_LIST = [
  { id: 'ddg', label: 'DuckDuckGo' }, { id: 'google', label: 'Google' },
  { id: 'bing', label: 'Bing' }, { id: 'brave', label: 'Brave' },
  { id: 'yahoo', label: 'Yahoo' }, { id: 'searxng', label: 'SearXNG' },
]

const HEIGHT_OPTIONS = [1,2,3,4,5,6,7,8]
const RATINGS_TYPES = ['radarr', 'sonarr', 'plex']
const INTEGRATION_TYPES = [
  'sonarr','radarr','readarr','lidarr','plex','tautulli','truenas','proxmox',
  'kuma','gluetun','opnsense','transmission','photoprism','authentik',
  'weather','steam','rss','sports',
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
  children?: React.ReactNode       // calendar sources slot — only used in edit mode
}

export default function PanelForm({
  scope, integrations, tags = [], panel,
  bookmarkRoots = [], onSaved, onCancel, onDeleted, children,
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

  // Re-init when switching to a different panel in edit mode
  useEffect(() => {
    if (!panel) return
    const c = parseCfg(panel.config)
    setTitle(panel.title)
    setType(panel.type)
    setHeight(c.height ?? 2)
    setIntegrationId(c.integrationId ?? '')
    setAllowedRatings(c.allowedRatings ?? '')
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
      base.refreshSecs = cfg.refreshSecs || 300
      if (type === 'opnsense') {
        base.maxMbps = cfg.maxMbps || 1000
        if (Object.keys(ifaceCaps).length > 0) base.ifaceCaps = ifaceCaps
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
  const compatibleIntegrations = integrations.filter(i => i.type === type)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Row 1: Title, Type, Height */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 160 }}>
          <label className="label">Panel title</label>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. My Sonarr" autoFocus={!isEdit} />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label className="label">Panel type</label>
          {isEdit ? (
            <div style={{ padding: '6px 10px', borderRadius: 6, fontSize: 13,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              color: 'var(--text-muted)' }}>
              {typeDef?.label ?? type}
            </div>
          ) : (
            <select className="input" value={type}
              onChange={e => handleTypeChange(e.target.value)} style={{ cursor: 'pointer' }}>
              {PANEL_TYPES.map(t => {
                const warn = t.needsIntegration && !integrations.some(i => i.type === t.id)
                return <option key={t.id} value={t.id}>{t.label}{warn ? ' ⚠' : ''}</option>
              })}
            </select>
          )}
        </div>
        <div>
          <label className="label">Height</label>
          <select className="input" value={height}
            onChange={e => setHeight(Number(e.target.value))} style={{ cursor: 'pointer' }}>
            {HEIGHT_OPTIONS.map(h => <option key={h} value={h}>{h}x</option>)}
          </select>
        </div>
      </div>

      {/* Type description — create mode only */}
      {!isEdit && typeDef?.desc && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: -4 }}>
          {typeDef.desc}
        </div>
      )}

      {/* Integration selector */}
      {needsIntegration && (
        <div>
          <label className="label">Integration</label>
          {compatibleIntegrations.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 2 }}>
              ⚠ No {typeDef?.label ?? type} integration configured.{' '}
              <a href={scope === 'system' ? '/admin/integrations' : '/profile'}
                style={{ color: 'var(--accent2)' }}>Add one →</a>
            </div>
          ) : (
            <select className="input" value={integrationId}
              onChange={e => setIntegrationId(e.target.value)} style={{ cursor: 'pointer' }}>
              <option value="">— Select integration —</option>
              {compatibleIntegrations.map(i => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
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
                placeholder="https://search.rose.home" />
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
                  onSaved()
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
