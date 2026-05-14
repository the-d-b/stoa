import { useState, useRef } from 'react'
import { Panel } from '../../api'

interface Engine { id: string; label: string; url: string; icon: string }

const ENGINES: Engine[] = [
  { id: 'ddg',     label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=',          icon: '🦆' },
  { id: 'google',  label: 'Google',     url: 'https://www.google.com/search?q=',    icon: '🔍' },
  { id: 'bing',    label: 'Bing',       url: 'https://www.bing.com/search?q=',      icon: '🅱' },
  { id: 'brave',   label: 'Brave',      url: 'https://search.brave.com/search?q=',  icon: '🦁' },
  { id: 'yahoo',   label: 'Yahoo',      url: 'https://search.yahoo.com/search?p=',  icon: '📣' },
  { id: 'searxng', label: 'SearXNG',    url: '__searxng__',                         icon: '🔒' },
]

export default function SearchPanel({ panel, heightUnits = 1 }: { panel: Panel; heightUnits?: number }) {
  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const enabledIds: string[] = config.engines?.length ? config.engines : ['ddg', 'google']
  const defaultId: string = config.defaultEngine || enabledIds[0] || 'ddg'
  const searxngUrl: string = (config.searxngUrl || '').replace(/\/$/, '')

  const available = ENGINES.filter(e => {
    if (!enabledIds.includes(e.id)) return false
    if (e.id === 'searxng' && !searxngUrl) return false
    return true
  })

  const resolveUrl = (e: Engine) =>
    e.id === 'searxng' ? `${searxngUrl}/search?q=` : e.url

  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const openEngine = (e: Engine) => {
    if (!query.trim()) return
    window.open(resolveUrl(e) + encodeURIComponent(query.trim()), '_blank')
    // Don't clear query — user may want to try other engines
  }

  const openDefault = () => {
    const def = available.find(e => e.id === defaultId) || available[0]
    if (def) openEngine(def)
  }

  if (available.length === 0) return (
    <div style={{ padding: 12, fontSize: 12, color: 'var(--text-dim)' }}>
      No search engines configured.
    </div>
  )

  const inputStyle: React.CSSProperties = {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', minWidth: 0,
  }

  const inputWrap: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 7, padding: '5px 10px',
  }

  // ── 1x: input row + search button row ────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5,
      padding: '5px 10px', height: '100%', justifyContent: 'center' }}>
      <div style={inputWrap}>
        <SearchIcon />
        <input ref={inputRef} value={query} style={inputStyle}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && openDefault()}
          placeholder="Search..." />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={openDefault} disabled={!query.trim()}
          style={btnStyle(!!query.trim(), true)}>
          {available.find(e => e.id === defaultId)?.icon || '🔍'} Search
        </button>
      </div>
    </div>
  )

  // ── 2x+: input row + engine pills row ────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6,
      padding: '10px 12px', height: '100%', justifyContent: 'center' }}>
      <div style={inputWrap}>
        <SearchIcon />
        <input ref={inputRef} value={query} style={inputStyle}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && openDefault()}
          placeholder="Search..." />
        {query && (
          <button onClick={() => setQuery('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-dim)', fontSize: 11, padding: 0, flexShrink: 0 }}>✕</button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {available.map(e => (
          <button key={e.id} onClick={() => openEngine(e)} disabled={!query.trim()}
            title={`Search ${e.label}`}
            style={pillStyle(!!query.trim())}>
            <span>{e.icon}</span>
            <span>{e.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

function btnStyle(active: boolean, primary: boolean): React.CSSProperties {
  return {
    padding: '3px 12px', borderRadius: 6, fontSize: 12,
    cursor: active ? 'pointer' : 'default', border: 'none',
    background: active ? (primary ? 'var(--accent)' : 'var(--surface2)') : 'var(--surface2)',
    color: active ? (primary ? 'white' : 'var(--text)') : 'var(--text-dim)',
    fontWeight: primary ? 600 : 400, transition: 'background 0.15s',
  }
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '3px 10px', borderRadius: 20, fontSize: 11,
    cursor: active ? 'pointer' : 'default',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    color: active ? 'var(--text)' : 'var(--text-dim)',
    opacity: active ? 1 : 0.5,
    transition: 'opacity 0.15s',
  }
}
