import { useEffect, useState } from 'react'
import { integrationsApi, Panel } from '../../api'

interface RSSItem { title: string; link: string; pubDate?: string }

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff/60)}m`
  if (diff < 86400) return `${Math.floor(diff/3600)}h`
  if (diff < 86400 * 7) return `${Math.floor(diff/86400)}d`
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Items to show based on height units
function itemLimit(heightUnits: number): number {
  if (heightUnits <= 1) return 2
  if (heightUnits <= 2) return 6
  if (heightUnits <= 4) return 16
  return 36
}

export default function RSSPanel({ panel, heightUnits = 2 }: { panel: Panel; heightUnits?: number }) {
  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const [items, setItems] = useState<RSSItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const integrationId = config.integrationId
    if (!integrationId) { setLoading(false); return }
    setLoading(true)
    integrationsApi.getPanelData(panel.id)
      .then(r => { setItems(r.data.items || []); setError('') })
      .catch(() => setError('Failed to load feed'))
      .finally(() => setLoading(false))
  }, [panel.id, config.integrationId])

  if (!config.integrationId) return (
    <div style={{ padding: 12, fontSize: 12, color: 'var(--text-dim)' }}>
      No RSS integration configured — add one in integrations.
    </div>
  )

  if (loading) return (
    <div style={{ padding: 12, fontSize: 12, color: 'var(--text-dim)' }}>Loading...</div>
  )

  if (error) return (
    <div style={{ padding: 12, fontSize: 12, color: 'var(--red)' }}>⚠ {error}</div>
  )

  const limit = itemLimit(heightUnits)
  const visible = items.slice(0, limit)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%',
      padding: '4px 12px', overflowY: 'auto' }}>

      {visible.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>No items</div>
      )}
      {visible.map((item, i) => (
        <a key={i} href={item.link || '#'} target="_blank" rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'baseline', gap: 6, padding: '5px 0',
            borderBottom: i < visible.length - 1 ? '1px solid var(--border)' : 'none',
            fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none',
            lineHeight: 1.4, flexShrink: 0, minWidth: 0,
          }}
          onMouseOver={e => (e.currentTarget.style.color = 'var(--text)')}
          onMouseOut={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.title}
          </span>
          {item.pubDate && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
              fontFamily: 'DM Mono, monospace' }}>
              {timeAgo(item.pubDate)}
            </span>
          )}
        </a>
      ))}
    </div>
  )
}
