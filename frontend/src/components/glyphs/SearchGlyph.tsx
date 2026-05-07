import { useState, useRef } from 'react'
import { Glyph } from '../../api'

interface Engine {
  id: string
  label: string
  url: string
  icon: string
}

const ENGINES: Engine[] = [
  { id: 'ddg',    label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=',                icon: '🦆' },
  { id: 'google', label: 'Google',     url: 'https://www.google.com/search?q=',          icon: '🔍' },
  { id: 'bing',   label: 'Bing',       url: 'https://www.bing.com/search?q=',            icon: '🅱' },
  { id: 'brave',  label: 'Brave',      url: 'https://search.brave.com/search?q=',        icon: '🦁' },
  { id: 'yahoo',  label: 'Yahoo',      url: 'https://search.yahoo.com/search?p=',        icon: '📣' },
  { id: 'searxng',label: 'SearXNG',    url: '__searxng__',                               icon: '🔒' },
]

export default function SearchGlyph({ glyph }: { glyph: Glyph }) {
  const config = (() => { try { return JSON.parse(glyph.config || '{}') } catch { return {} } })()
  const enabledIds: string[] = config.engines || ['ddg', 'google']
  const defaultId: string = config.defaultEngine || enabledIds[0] || 'ddg'
  const searxngUrl: string = config.searxngUrl || ''

  const availableEngines = ENGINES.filter(e => {
    if (!enabledIds.includes(e.id)) return false
    if (e.id === 'searxng' && !searxngUrl) return false
    return true
  })

  const resolveUrl = (engine: Engine) =>
    engine.id === 'searxng' ? `${searxngUrl.replace(/\/$/, '')}/search?q=` : engine.url

  const [query, setQuery] = useState('')
  const [engineId, setEngineId] = useState(defaultId)
  const inputRef = useRef<HTMLInputElement>(null)

  const activeEngine = availableEngines.find(e => e.id === engineId) || availableEngines[0]

  const search = () => {
    if (!query.trim() || !activeEngine) return
    window.open(resolveUrl(activeEngine) + encodeURIComponent(query.trim()), '_blank')
    setQuery('')
    inputRef.current?.focus()
  }

  if (availableEngines.length === 0) return (
    <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '4px 8px' }}>No search engines configured</div>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px' }}>
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && search()}
        placeholder="Search..."
        style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '4px 8px', fontSize: 12,
          color: 'var(--text)', outline: 'none', width: 160,
          fontFamily: 'inherit',
        }}
        onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
        onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
      />
      {availableEngines.length > 1 && (
        <select
          value={engineId}
          onChange={e => setEngineId(e.target.value)}
          style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '4px 6px', fontSize: 11,
            color: 'var(--text)', cursor: 'pointer', outline: 'none',
          }}
          title="Select search engine"
        >
          {availableEngines.map(e => (
            <option key={e.id} value={e.id}>{e.icon} {e.label}</option>
          ))}
        </select>
      )}
      {availableEngines.length === 1 && (
        <span style={{ fontSize: 14 }} title={availableEngines[0].label}>
          {availableEngines[0].icon}
        </span>
      )}
    </div>
  )
}
