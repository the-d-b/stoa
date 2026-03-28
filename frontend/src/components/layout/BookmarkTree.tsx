import { useState } from 'react'
import { BookmarkNode } from '../../api'

interface Props {
  nodes: BookmarkNode[]
  initiallyExpanded?: boolean
}

export default function BookmarkTree({ nodes, initiallyExpanded = true }: Props) {
  const [allExpanded, setAllExpanded] = useState(initiallyExpanded)

  if (!nodes || nodes.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '8px 0' }}>No bookmarks</div>
  }

  return (
    <div>
      {/* Expand/collapse all */}
      {nodes.some(n => n.children && n.children.length > 0) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => setAllExpanded(true)}>Expand all</button>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => setAllExpanded(false)}>Collapse all</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {nodes.map(node => (
          <TreeDisplayNode key={node.id} node={node} depth={0} forceExpanded={allExpanded} />
        ))}
      </div>
    </div>
  )
}

function TreeDisplayNode({ node, depth, forceExpanded }: {
  node: BookmarkNode
  depth: number
  forceExpanded: boolean
}) {
  const [localExpanded, setLocalExpanded] = useState(true)
  const expanded = forceExpanded !== undefined ? forceExpanded : localExpanded
  const hasChildren = node.children && node.children.length > 0

  if (node.type === 'bookmark') {
    return (
      <a
        href={node.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 8px', paddingLeft: 8 + depth * 16 + 'px',
          borderRadius: 6, textDecoration: 'none',
          color: 'var(--text)', fontSize: 13,
          transition: 'background 0.1s',
        }}
        onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
      >
        <BookmarkIcon node={node} />
        <span style={{ flex: 1 }}>{node.name}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" style={{ opacity: 0.3, flexShrink: 0 }}>
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>
    )
  }

  // Section
  return (
    <div>
      <button
        onClick={() => setLocalExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: '5px 8px', paddingLeft: 8 + depth * 16 + 'px',
          borderRadius: 6, background: 'none', border: 'none',
          cursor: hasChildren ? 'pointer' : 'default',
          color: 'var(--text-muted)', fontSize: 12, fontWeight: 500,
          textTransform: 'uppercase', letterSpacing: '0.06em',
          transition: 'background 0.1s', textAlign: 'left',
        }}
        onMouseOver={e => { if (hasChildren) e.currentTarget.style.background = 'var(--surface2)' }}
        onMouseOut={e => e.currentTarget.style.background = 'none'}
      >
        {hasChildren && (
          <span style={{ fontSize: 8, opacity: 0.5 }}>{expanded ? '▼' : '▶'}</span>
        )}
        {node.name}
        {hasChildren && (
          <span style={{ fontSize: 10, opacity: 0.4, marginLeft: 'auto' }}>
            {node.children!.length}
          </span>
        )}
      </button>

      {expanded && node.children && node.children.map(child => (
        <TreeDisplayNode key={child.id} node={child} depth={depth + 1} forceExpanded={forceExpanded} />
      ))}
    </div>
  )
}

function BookmarkIcon({ node }: { node: BookmarkNode }) {
  if (node.iconUrl) {
    return (
      <img
        src={node.iconUrl}
        style={{ width: 14, height: 14, borderRadius: 2, flexShrink: 0 }}
        onError={e => (e.currentTarget.style.display = 'none')}
      />
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
