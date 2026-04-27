import { useEffect, useState, useRef, useCallback } from 'react'
import { BookmarkNode } from '../api'

interface SearchResult {
  node: BookmarkNode
  path: string  // human readable path like "Work / Tools"
}

interface Props {
  // All bookmark nodes from all visible panels (flat)
  allNodes: BookmarkNode[]
}

export default function SearchModal({ allNodes }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Flatten all bookmark nodes to searchable list
  const flatBookmarks = useCallback((): SearchResult[] => {
    const results: SearchResult[] = []
    const walk = (nodes: BookmarkNode[], pathParts: string[]) => {
      for (const node of nodes) {
        if (node.type === 'bookmark' && node.url) {
          results.push({
            node,
            path: pathParts.join(' / '),
          })
        }
        if (node.children && node.children.length > 0) {
          walk(node.children, node.type === 'section' ? [...pathParts, node.name] : pathParts)
        }
      }
    }
    walk(allNodes, [])
    return results
  }, [allNodes])

  // Open on any printable keypress (not in an input)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if already in an input/textarea/contenteditable
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement).isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') { setOpen(false); setQuery(''); return }

      // Open on any printable character - don't set query here,
      // the input will receive the character naturally via the keydown event
      if (e.key.length === 1) {
        setOpen(true)
        setSelected(0)
        // Don't set query - let the input field receive the character naturally
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Focus input when modal opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
      // Move cursor to end
      const len = inputRef.current.value.length
      inputRef.current.setSelectionRange(len, len)
    }
  }, [open])

  // Filter results as query changes
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const q = query.toLowerCase()
    const all = flatBookmarks()
    const filtered = all.filter(r =>
      r.node.name.toLowerCase().includes(q) ||
      r.node.url?.toLowerCase().includes(q) ||
      r.path.toLowerCase().includes(q)
    ).slice(0, 12)
    setResults(filtered)
    setSelected(0)
  }, [query, flatBookmarks])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); setQuery(''); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && results[selected]) {
      window.open(results[selected].node.url, '_blank')
      setOpen(false); setQuery('')
    }
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh',
      }}
      onClick={e => { if (e.target === e.currentTarget) { setOpen(false); setQuery('') } }}
    >
      <div style={{
        width: '100%', maxWidth: 540,
        background: 'var(--surface)', border: '1px solid var(--border2)',
        borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px', borderBottom: results.length > 0 ? '1px solid var(--border)' : 'none',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search bookmarks..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: 16, fontFamily: 'inherit',
            }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-dim)', fontSize: 12, padding: '2px 6px',
              borderRadius: 4,
            }}>✕</button>
          )}
          <kbd style={{
            fontSize: 11, color: 'var(--text-dim)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '2px 6px', fontFamily: 'DM Mono, monospace',
          }}>esc</kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {results.map((r, i) => (
              <a
                key={r.node.id}
                href={r.node.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => { setOpen(false); setQuery('') }}
                onMouseEnter={() => setSelected(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 16px', textDecoration: 'none',
                  background: selected === i ? 'var(--accent-bg)' : 'transparent',
                  borderLeft: selected === i ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'background 0.1s',
                }}
              >
                {/* Icon */}
                {r.node.iconUrl
                  ? <img src={r.node.iconUrl} style={{ width: 18, height: 18, borderRadius: 3, flexShrink: 0 }}
                      onError={e => (e.currentTarget.style.display = 'none')} />
                  : <div style={{
                      width: 18, height: 18, borderRadius: 3, flexShrink: 0,
                      background: 'var(--accent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </div>
                }

                {/* Name + path */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, color: selected === i ? 'var(--accent2)' : 'var(--text)',
                    fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    <HighlightMatch text={r.node.name} query={query} />
                  </div>
                  {r.path && (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>
                      {r.path}
                    </div>
                  )}
                </div>

                {/* URL preview */}
                <div style={{
                  fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace',
                  maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>
                  {r.node.url?.replace(/^https?:\/\//, '')}
                </div>
              </a>
            ))}
          </div>
        )}

        {/* Empty state */}
        {query && results.length === 0 && (
          <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--text-dim)', textAlign: 'center' }}>
            No bookmarks matching "{query}"
          </div>
        )}

        {/* Footer hint */}
        <div style={{
          padding: '8px 16px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-dim)',
        }}>
          <span><kbd style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px' }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px' }}>↵</kbd> open</span>
          <span><kbd style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px' }}>esc</kbd> close</span>
          <span style={{ marginLeft: 'auto' }}>type anywhere to search</span>
        </div>
      </div>
    </div>
  )
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ background: 'var(--accent)', color: 'white', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  )
}
