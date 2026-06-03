import { useState } from 'react'

export interface PickerType {
  id: string
  label: string
  desc: string
  category: string
  warn?: boolean
}

interface Props {
  types: PickerType[]
  value: string
  onChange: (id: string) => void
}

export default function TypeCardPicker({ types, value, onChange }: Props) {
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const filterLow = filter.toLowerCase().trim()
  const isFiltering = filterLow.length > 0

  const visibleTypes = isFiltering
    ? types.filter(t =>
        t.label.toLowerCase().includes(filterLow) ||
        t.desc.toLowerCase().includes(filterLow) ||
        t.id.toLowerCase().includes(filterLow)
      )
    : types

  const categories: string[] = []
  for (const t of visibleTypes) {
    if (!categories.includes(t.category)) categories.push(t.category)
  }

  const toggleCollapse = (cat: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Filter input */}
      <div style={{ position: 'relative' }}>
        <input
          className="input"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter..."
          style={{ paddingRight: filter ? 28 : undefined, fontSize: 13 }}
        />
        {filter && (
          <button
            type="button"
            onClick={() => setFilter('')}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-dim)', fontSize: 16, padding: 0, lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* No results */}
      {isFiltering && categories.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>
          No matches for "{filter}"
        </div>
      )}

      {/* Category groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {categories.map(cat => {
          const isCollapsed = !isFiltering && collapsed.has(cat)
          const catTypes = visibleTypes.filter(t => t.category === cat)

          return (
            <div key={cat}>
              <button
                type="button"
                onClick={() => { if (!isFiltering) toggleCollapse(cat) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  marginBottom: isCollapsed ? 0 : 6,
                  background: 'none', border: 'none', padding: 0,
                  cursor: isFiltering ? 'default' : 'pointer',
                }}
              >
                {!isFiltering && (
                  <span style={{ fontSize: 9 }}>{isCollapsed ? '▸' : '▾'}</span>
                )}
                {cat}
                {isCollapsed && (
                  <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                    ({catTypes.length})
                  </span>
                )}
              </button>

              {!isCollapsed && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: 6,
                }}>
                  {catTypes.map(t => {
                    const sel = t.id === value
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onChange(t.id)}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 7,
                          border: `1px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                          background: sel ? 'var(--accent-bg)' : 'var(--surface2)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 3,
                        }}
                      >
                        <span style={{
                          fontSize: 13, fontWeight: 500,
                          color: sel ? 'var(--accent)' : 'var(--text)',
                        }}>
                          {t.label}
                          {t.warn && <span style={{ fontSize: 10, color: 'var(--amber)', marginLeft: 4 }}>⚠</span>}
                        </span>
                        <span style={{
                          fontSize: 11, color: 'var(--text-dim)',
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}>
                          {t.desc}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
