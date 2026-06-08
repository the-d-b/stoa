import {useEffect, useState, useRef, useCallback } from 'react'
import { searchApi, notesApi, kanbanApi, Panel, BookmarkNode } from '../api'

interface SearchResult {
  type: string
  id: string
  title: string
  excerpt?: string
  url?: string
  iconUrl?: string
  panelId?: string
  porticoId?: string
  path?: string
}

const TYPE_ICON: Record<string, string> = {
  bookmark:  '🔗',
  panel:     '▦',
  note:      '📝',
  checklist: '☑',
  kanban:    '▦',
}
const TYPE_LABEL: Record<string, string> = {
  bookmark:  'Bookmark',
  panel:     'Panel',
  note:      'Note',
  checklist: 'Checklist',
  kanban:    'Kanban',
}

const MODAL_ENGINES = [
  { id: 'ddg',    label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=',           icon: '🦆' },
  { id: 'google', label: 'Google',     url: 'https://www.google.com/search?q=',     icon: '🔍' },
  { id: 'brave',  label: 'Brave',      url: 'https://search.brave.com/search?q=',   icon: '🦁' },
  { id: 'bing',   label: 'Bing',       url: 'https://www.bing.com/search?q=',       icon: '🅱' },
]

interface Props {
  panels: Panel[]
  subtrees: Record<string, BookmarkNode>
}

export default function SearchModal({ panels, subtrees }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [backendResults, setBackendResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Open on any printable keypress outside an input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement).isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') { setOpen(false); setQuery(''); return }
      if (e.key.length === 1) { e.preventDefault(); setOpen(true); setQuery(e.key); setSelected(0) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
      const len = inputRef.current.value.length
      inputRef.current.setSelectionRange(len, len)
    }
  }, [open])

  // Flatten all bookmark nodes from all subtrees
  const flatBookmarks = useCallback((): SearchResult[] => {
    const out: SearchResult[] = []
    const walk = (nodes: BookmarkNode[], pathParts: string[]) => {
      for (const node of nodes) {
        if (node.type === 'bookmark' && node.url) {
          out.push({ type: 'bookmark', id: node.id, title: node.name,
            url: node.url, iconUrl: node.iconUrl, path: pathParts.join(' / ') })
        }
        if (node.children?.length) {
          walk(node.children, node.type === 'section' ? [...pathParts, node.name] : pathParts)
        }
      }
    }
    for (const tree of Object.values(subtrees)) {
      if (tree) walk(Array.isArray(tree) ? tree : [tree], [])
    }
    return out
  }, [subtrees])

  // Frontend search — panels + bookmarks (instant, no backend)
  const frontendSearch = useCallback((q: string): SearchResult[] => {
    const lower = q.toLowerCase()

    // Panels by title — cap at 5
    const panelHits: SearchResult[] = []
    for (const p of panels) {
      if (p.title?.toLowerCase().includes(lower)) {
        panelHits.push({ type: 'panel', id: p.id, title: p.title, path: p.type })
        if (panelHits.length >= 5) break
      }
    }

    // Bookmarks — cap at 8, searched independently
    const bkHits: SearchResult[] = []
    for (const r of flatBookmarks()) {
      if (r.title.toLowerCase().includes(lower) ||
          r.url?.toLowerCase().includes(lower) ||
          r.path?.toLowerCase().includes(lower)) {
        bkHits.push(r)
        if (bkHits.length >= 8) break
      }
    }

    return [...panelHits, ...bkHits]
  }, [panels, flatBookmarks])

  // Combined: frontend immediately, backend debounced for notes+checklists
  useEffect(() => {
    if (!query.trim()) {
      setResults([]); setBackendResults([]); setSearching(false)
      return
    }

    // Instant frontend results
    setResults(frontendSearch(query))
    setSelected(0)

    // Debounced backend for notes + checklists + kanban
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const [r, kr] = await Promise.all([
          searchApi.query(query),
          kanbanApi.search(query),
        ])
        const deeper = (r.data || []).filter((x: SearchResult) =>
          x.type === 'note' || x.type === 'checklist'
        )
        const kanbanHits: SearchResult[] = (kr.data || []).map((x: any) => ({
          type: 'kanban',
          id: x.id,
          title: x.title,
          excerpt: x.notes ? x.notes.slice(0, 80) : (x.boardName + (x.dueDate ? ` · ${x.dueDate}` : '')),
          panelId: x.boardRefId || x.boardId,
          path: x.panelTitle + ' › ' + x.boardName,
          _boardId: x.boardRefId || x.boardId,
          _boardName: x.boardName,
          _panelTitle: x.panelTitle,
        }))
        setBackendResults([...deeper, ...kanbanHits])
      } catch { setBackendResults([]) }
      finally { setSearching(false) }
    }, 300)
  }, [query, frontendSearch])

  // Combine: frontend first, then backend deeper results
  const allResults = [...results, ...backendResults]

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); setQuery(''); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, allResults.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && allResults[selected]) activate(allResults[selected])
  }

  const activate = (r: SearchResult) => {
    if (r.type === 'bookmark' && r.url) {
      window.open(r.url, '_blank')
    } else if (r.type === 'note') {
      // Fetch full note then open overlay directly -- no portico switching needed
      notesApi.get(r.id).then((res: any) => {
        window.dispatchEvent(new CustomEvent('stoa-open-note', { detail: { note: res.data } }))
      }).catch(() => {})
    } else if (r.type === 'checklist') {
      if (r.panelId) {
        window.dispatchEvent(new CustomEvent('stoa-navigate-panel', { detail: { panelId: r.panelId } }))
      }
    } else if (r.type === 'kanban') {
      const detail = (r as any)
      window.dispatchEvent(new CustomEvent('stoa-open-kanban-board', {
        detail: {
          boardId: detail._boardId || r.panelId,
          boardName: detail._boardName || '',
          panelTitle: detail._panelTitle || '',
        }
      }))
    } else if (r.type === 'panel') {
      window.dispatchEvent(new CustomEvent('stoa-navigate-panel', { detail: { panelId: r.id } }))
    }
    setOpen(false); setQuery('')
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
        width: '100%', maxWidth: 560,
        background: 'var(--surface)', border: '1px solid var(--border2)',
        borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px',
          borderBottom: allResults.length > 0 ? '1px solid var(--border)' : 'none',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input ref={inputRef} value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search panels, bookmarks, notes, checklists, kanban..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: 16, fontFamily: 'inherit' }} />
          {searching && <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>⟳</span>}
          {query && (
            <button onClick={() => setQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-dim)', fontSize: 12, padding: '2px 6px', borderRadius: 4 }}>✕</button>
          )}
          <kbd style={{ fontSize: 11, color: 'var(--text-dim)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '2px 6px', fontFamily: 'DM Mono, monospace' }}>esc</kbd>
        </div>

        {/* Results */}
        {allResults.length > 0 && (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {allResults.map((r, i) => (
              <div key={`${r.type}-${r.id}-${i}`}
                onClick={() => activate(r)}
                onMouseEnter={() => setSelected(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 16px',
                  cursor: ['bookmark','note','panel'].includes(r.type) ? 'pointer' : 'default',
                  background: selected === i ? 'var(--accent-bg)' : 'transparent',
                  borderLeft: selected === i ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'background 0.1s',
                }}>
                {r.type === 'bookmark' && r.iconUrl
                  ? <img src={r.iconUrl} style={{ width: 18, height: 18, borderRadius: 3, flexShrink: 0 }}
                      onError={e => (e.currentTarget.style.display = 'none')} />
                  : <span style={{ fontSize: 14, flexShrink: 0, width: 18, textAlign: 'center' }}>
                      {TYPE_ICON[r.type] || '○'}
                    </span>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500,
                    color: selected === i ? 'var(--accent2)' : 'var(--text)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <HighlightMatch text={r.title} query={query} />
                  </div>
                  {(r.excerpt || r.path) && (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.excerpt || r.path}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
                  padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)',
                  fontFamily: 'DM Mono, monospace' }}>
                  {TYPE_LABEL[r.type] || r.type}
                </span>
                {r.type === 'bookmark' && r.url && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)',
                    fontFamily: 'DM Mono, monospace', maxWidth: 140,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {r.url.replace(/^https?:\/\//, '')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {query && !searching && allResults.length === 0 && (
          <div style={{ padding: '16px', fontSize: 13, color: 'var(--text-dim)', textAlign: 'center' }}>
            No Stoa results for "{query}"
          </div>
        )}
        {query && (
          <div style={{ padding: '8px 16px', borderTop: allResults.length > 0 ? '1px solid var(--border)' : 'none',
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', marginRight: 4 }}>Search web:</span>
            {MODAL_ENGINES.map(e => (
              <button key={e.id}
                onClick={() => { window.open(e.url + encodeURIComponent(query), '_blank') }}
                style={{ display: 'flex', alignItems: 'center', gap: 4,
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  color: 'var(--text)' }}>
                <span>{e.icon}</span>
                <span>{e.label}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-dim)' }}>
          <span><kbd style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px' }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px' }}>↵</kbd> open</span>
          <span><kbd style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px' }}>esc</kbd> close</span>
          <span style={{ marginLeft: 'auto', opacity: 0.6 }}>type anywhere to search</span>
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
