/**
 * NewPanelForm — shared panel creation form used by both
 * system settings (scope='system') and personal profile (scope='personal').
 *
 * Owns all state for the creation flow. Calls onCreated() after success.
 */
import { useState } from 'react'
import { panelsApi, myPanelsApi, Integration } from '../../api'

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
  'weather','steam','rss',
]

interface Props {
  scope: 'system' | 'personal'
  integrations: Integration[]    // pre-loaded by parent, filtered to SYSTEM or personal
  onCreated: () => void
  onCancel: () => void
  /** System scope only — bookmark root selector */
  bookmarkRoots?: { id: string; label: string }[]
  /** Initial type selection */
  defaultType?: string
}

export default function NewPanelForm({
  scope, integrations, onCreated, onCancel,
  bookmarkRoots = [], defaultType = 'bookmarks',
}: Props) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState(defaultType)
  const [height, setHeight] = useState(2)
  const [integrationId, setIntegrationId] = useState('')
  const [allowedRatings, setAllowedRatings] = useState('')
  const [searchEngines, setSearchEngines] = useState<string[]>(['ddg', 'google'])
  const [searxngUrl, setSearxngUrl] = useState('')
  const [bookmarkRootId, setBookmarkRootId] = useState('')
  const [creating, setCreating] = useState(false)

  const typeDef = PANEL_TYPES.find(t => t.id === type)
  const needsIntegration = INTEGRATION_TYPES.includes(type)
  const compatibleIntegrations = integrations.filter(i => i.type === type)
  const hasIntegration = compatibleIntegrations.length > 0

  const buildConfig = () => {
    const base: any = { height }
    if (type === 'search') {
      base.engines = searchEngines
      base.defaultEngine = searchEngines[0] || 'ddg'
      if (searchEngines.includes('searxng') && searxngUrl) base.searxngUrl = searxngUrl
    } else if (type === 'customapi') {
      return JSON.stringify({ url: '', apiKey: '', mappings: [], refreshSecs: 600, height })
    } else if (type === 'calendar') {
      return JSON.stringify({ firstDay: 0, height, sources: [] })
    } else if (type === 'bookmarks') {
      if (bookmarkRootId) base.rootNodeId = bookmarkRootId
    } else if (needsIntegration) {
      if (integrationId) base.integrationId = integrationId
      base.refreshSecs = 300
      if (type === 'opnsense') base.maxMbps = 1000
      if (RATINGS_TYPES.includes(type) && allowedRatings.trim()) {
        base.allowedRatings = allowedRatings.trim()
      }
    }
    return JSON.stringify(base)
  }

  const create = async () => {
    if (!title.trim()) return
    setCreating(true)
    try {
      const api = scope === 'system' ? panelsApi : myPanelsApi
      await api.create({ type, title: title.trim(), config: buildConfig() })
      onCreated()
    } finally { setCreating(false) }
  }

  const handleTypeChange = (newType: string) => {
    setType(newType)
    setIntegrationId('')
    setAllowedRatings('')
  }

  return (
    <div className="card" style={{ marginBottom: 20, padding: 20,
      display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Row 1: Title, Type, Height — always visible, never resized */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 160 }}>
          <label className="label">Panel title</label>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. My Sonarr" autoFocus />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label className="label">Panel type</label>
          <select className="input" value={type}
            onChange={e => handleTypeChange(e.target.value)} style={{ cursor: 'pointer' }}>
            {PANEL_TYPES.map(t => {
              const warn = t.needsIntegration && !integrations.some(i => i.type === t.id)
              return <option key={t.id} value={t.id}>{t.label}{warn ? ' ⚠' : ''}</option>
            })}
          </select>
        </div>
        <div>
          <label className="label">Height</label>
          <select className="input" value={height}
            onChange={e => setHeight(Number(e.target.value))} style={{ cursor: 'pointer' }}>
            {HEIGHT_OPTIONS.map(h => <option key={h} value={h}>{h}x</option>)}
          </select>
        </div>
      </div>

      {/* Type description */}
      {typeDef?.desc && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: -4 }}>
          {typeDef.desc}
        </div>
      )}

      {/* Row 2: Integration selector (shown for integration types) */}
      {needsIntegration && (
        <div>
          {!hasIntegration ? (
            <div style={{ fontSize: 12, color: 'var(--amber)' }}>
              ⚠ No {type} integration configured.{' '}
              <a href={scope === 'system' ? '/admin/integrations' : '/profile'}
                style={{ color: 'var(--accent2)' }}>Add one →</a>
            </div>
          ) : (
            <>
              <label className="label">Integration</label>
              <select className="input" value={integrationId}
                onChange={e => setIntegrationId(e.target.value)} style={{ cursor: 'pointer' }}>
                <option value="">— Select integration —</option>
                {compatibleIntegrations.map(i => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </>
          )}
        </div>
      )}

      {/* Row 3: Allowed ratings (Radarr / Sonarr / Plex) */}
      {RATINGS_TYPES.includes(type) && (
        <div>
          <label className="label">
            Allowed ratings{' '}
            <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional — blank = all)</span>
          </label>
          <input className="input" value={allowedRatings}
            onChange={e => setAllowedRatings(e.target.value)}
            placeholder="e.g. G, PG, PG-13" />
        </div>
      )}

      {/* Row 4: Bookmark root (bookmarks type only) */}
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

      {/* Row 5: Search engine config */}
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
            <select className="input" value={searchEngines[0] || 'ddg'}
              onChange={e => setSearchEngines(prev => [e.target.value, ...prev.filter(x => x !== e.target.value)])}
              style={{ cursor: 'pointer', maxWidth: 200 }}>
              {SEARCH_ENGINE_LIST.filter(e => searchEngines.includes(e.id)).map(e => (
                <option key={e.id} value={e.id}>{e.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Action buttons — always last row */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={create}
          disabled={creating || !title.trim()}>
          {creating ? <span className="spinner" /> : 'Create panel'}
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
