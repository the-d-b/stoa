import { useState } from 'react'
import { BookmarkNode } from '../api'

interface Props {
  nodes: BookmarkNode[]
  initiallyExpanded?: boolean
  externalExpanded?: boolean | null  // controlled from panel header +/-
}

export default function BookmarkTree({ nodes, initiallyExpanded = true, externalExpanded }: Props) {
  const [globalState, setGlobalState] = useState<{ gen: number; expanded: boolean } | null>(null)

  // Sync external control from panel header into globalState
  // Using a ref to track previous value avoids infinite loops
  const prevExternalRef = useState<boolean | null | undefined>(undefined)
  if (externalExpanded !== prevExternalRef[0] && externalExpanded !== undefined) {
    prevExternalRef[1](externalExpanded)
    if (externalExpanded !== null) {
      setGlobalState(s => ({ gen: (s?.gen ?? 0) + 1, expanded: externalExpanded as boolean }))
    }
  }

  const effectiveGlobal = globalState


  if (!nodes || nodes.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '8px 0' }}>No bookmarks</div>
  }

  return (
    <div>
      {/* Expand/collapse all — only show if there are expandable sections */}


      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {nodes.map(node => (
          <TreeDisplayNode
            key={node.id}
            node={node}
            depth={0}
            globalState={effectiveGlobal}
            defaultExpanded={initiallyExpanded}
          />
        ))}
      </div>
    </div>
  )
}

function TreeDisplayNode({ node, depth, globalState, defaultExpanded }: {
  node: BookmarkNode
  depth: number
  globalState: { gen: number; expanded: boolean } | null
  defaultExpanded: boolean
}) {
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded)
  const [lastSeenGen, setLastSeenGen] = useState<number | null>(null)
  const hasChildren = (node.children || []).length > 0

  // If globalState changed (new generation), sync local state to it
  const currentGen = globalState?.gen ?? null
  if (currentGen !== null && currentGen !== lastSeenGen) {
    // Can't call setState during render, but we can derive display state
  }
  const expanded = (currentGen !== null && currentGen !== lastSeenGen)
    ? globalState!.expanded
    : localExpanded

  const handleToggle = () => {
    // After user clicks locally, mark that we've consumed the global state
    if (currentGen !== null && currentGen !== lastSeenGen) {
      setLastSeenGen(currentGen)
      // Toggle from the global state
      setLocalExpanded(!globalState!.expanded)
    } else {
      setLocalExpanded(e => !e)
    }
  }

  if (node.type === 'bookmark') {
    return (
      <a
        href={node.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 8px',
          paddingLeft: `${8 + depth * 14}px`,
          borderRadius: 6, textDecoration: 'none',
          color: 'var(--text)', fontSize: 13, transition: 'background 0.1s',
        }}
        onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
      >
        <BookmarkIcon node={node} />
        <span style={{ flex: 1 }}>{node.name}</span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" style={{ opacity: 0.25, flexShrink: 0 }}>
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>
    )
  }

  // Section node — clickable header
  return (
    <div>
      <button
        onClick={handleToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: '5px 8px',
          paddingLeft: `${8 + depth * 14}px`,
          borderRadius: 6, background: 'none', border: 'none',
          cursor: hasChildren ? 'pointer' : 'default',
          color: 'var(--text-muted)', fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.07em',
          transition: 'background 0.1s', textAlign: 'left',
        }}
        onMouseOver={e => { if (hasChildren) e.currentTarget.style.background = 'var(--surface2)' }}
        onMouseOut={e => e.currentTarget.style.background = 'none'}
      >
        {/* Triangle — always show, clickable */}
        <span style={{
          fontSize: 8, opacity: hasChildren ? 0.6 : 0.2,
          transition: 'transform 0.15s', display: 'inline-block',
          transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
        }}>▼</span>
        {node.name}
        {hasChildren && (
          <span style={{ fontSize: 10, opacity: 0.3, marginLeft: 'auto', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
            {node.children!.length}
          </span>
        )}
      </button>

      {expanded && (node.children || []).map((child: BookmarkNode) => (
        <TreeDisplayNode
          key={child.id}
          node={child}
          depth={depth + 1}
          globalState={globalState}
          defaultExpanded={defaultExpanded}
        />
      ))}
    </div>
  )
}

function BookmarkIcon({ node }: { node: BookmarkNode }) {
  if (node.iconUrl) {
    return (
      <img src={node.iconUrl} style={{ width: 14, height: 14, borderRadius: 2, flexShrink: 0 }}
        onError={e => (e.currentTarget.style.display = 'none')} />
    )
  }
  return (
    <div style={{
      width: 14, height: 14, borderRadius: 2, flexShrink: 0,
      background: 'var(--accent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2.5">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
    </div>
  )
}
