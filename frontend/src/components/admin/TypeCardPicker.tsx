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
  // single-select
  value?: string
  onChange?: (id: string) => void
  // multi-select
  values?: string[]
  onChangeMulti?: (ids: string[]) => void
  // focus the filter input on mount
  autoFocus?: boolean
}

export default function TypeCardPicker({ types, value, onChange, values, onChangeMulti, autoFocus }: Props) {
  const isMulti = values !== undefined
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
          autoFocus={autoFocus}
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
                    const sel = isMulti ? (values?.includes(t.id) ?? false) : t.id === value
                    const handleClick = () => {
                      if (isMulti && onChangeMulti && values !== undefined) {
                        onChangeMulti(sel ? values.filter(id => id !== t.id) : [...values, t.id])
                      } else {
                        onChange?.(t.id)
                      }
                    }
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={handleClick}
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
                          position: 'relative',
                        }}
                      >
                        {isMulti && sel && (
                          <span style={{
                            position: 'absolute', top: 5, right: 7,
                            fontSize: 10, color: 'var(--accent)', fontWeight: 700,
                          }}>✓</span>
                        )}
                        <span style={{
                          fontSize: 13, fontWeight: 500,
                          color: sel ? 'var(--accent)' : 'var(--text)',
                          paddingRight: isMulti ? 14 : 0,
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
