/**
 * CatalogBrowser — a searchable, faceted alternative to TypeCardPicker for
 * choosing a type. Same single-select contract (types/value/onChange), so it
 * drops into the same create-flow slots. Rich content (What is X?, tags,
 * official link, key how-to) comes from the generated catalog
 * (src/catalog.generated.ts, built from the docs front-matter).
 */
import { useMemo, useState } from 'react'
import { CATALOG, CatalogEntry } from '../../catalog.generated'
import { PickerType } from './TypeCardPicker'

// Picker ids that differ from their doc id (so catalog enrichment can join).
const ID_ALIAS: Record<string, string> = {
  securityposture: 'security-posture',
  dockerapps: 'docker-apps',
}
const CATALOG_BY_ID: Record<string, CatalogEntry> = {}
for (const e of CATALOG) CATALOG_BY_ID[e.id] = e
const entryFor = (id: string): CatalogEntry | undefined =>
  CATALOG_BY_ID[id] || CATALOG_BY_ID[ID_ALIAS[id]]

const CATEGORY_ORDER = [
  'Media Servers', 'Media Management', 'Downloads', 'Print Media', 'Music', 'Gaming',
  'Storage & Virtualization', 'Network & Security', 'Finance', 'Digital Life',
  'Online Content', 'Stoa Features',
]

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  tested: { label: 'Tested', color: 'var(--green)' },
  'needs-testing': { label: 'Needs testing', color: 'var(--amber)' },
  experimental: { label: 'Experimental', color: 'var(--accent2, #a855f7)' },
  new: { label: 'New', color: 'var(--accent)' },
}

interface Props {
  types: PickerType[]
  value?: string
  onChange?: (id: string) => void
  autoFocus?: boolean
}

export default function CatalogBrowser({ types, value, onChange, autoFocus }: Props) {
  const [q, setQ] = useState('')
  const [tags, setTags] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)

  // Enrich each pickable type with its catalog entry once.
  const items = useMemo(() => types.map(t => {
    const e = entryFor(t.id)
    return {
      ...t,
      entry: e,
      tags: e?.tags ?? [],
      whatIs: e?.whatIs || t.desc,
      status: e?.status,
    }
  }), [types])

  // Tag facet vocabulary (categories are intentionally omitted from the
  // catalog — search + tags cover discovery here; categories drive the tiles).
  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const it of items) for (const tg of it.tags) s.add(tg)
    return [...s].sort((a, b) => a.localeCompare(b)) // alphabetical — predictable to scan
  }, [items])

  const ql = q.toLowerCase().trim()
  const filtered = useMemo(() => items.filter(it => {
    if (tags.size && !it.tags.some(tg => tags.has(tg))) return false
    if (ql) {
      const hay = (it.label + ' ' + it.id + ' ' + it.whatIs + ' ' + it.tags.join(' ')).toLowerCase()
      if (!hay.includes(ql)) return false
    }
    return true
  }).sort((a, b) => {
    const c = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
    return c !== 0 ? c : a.label.localeCompare(b.label)
  }), [items, tags, ql])

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const next = new Set(set)
    next.has(v) ? next.delete(v) : next.add(v)
    setter(next)
  }

  const chip = (label: string, active: boolean, onClick: () => void, count?: number) => (
    <button type="button" key={label} onClick={onClick} style={{
      fontSize: 11, padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      background: active ? 'var(--accent-bg)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text-muted)', whiteSpace: 'nowrap',
    }}>
      {label}{count != null && <span style={{ opacity: 0.6, marginLeft: 4 }}>{count}</span>}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input className="input" value={q} onChange={e => setQ(e.target.value)} autoFocus={autoFocus}
        placeholder="Search the catalog — name, description, or tag…" style={{ fontSize: 13 }} />

      {/* Tag facets — full height, no scroll */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {allTags.map(tg => chip('#' + tg, tags.has(tg), () => toggle(tags, setTags, tg)))}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
        {filtered.length} of {items.length}
        {(tags.size || ql) ? (
          <button type="button" onClick={() => { setTags(new Set()); setQ('') }}
            style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11 }}>
            clear
          </button>
        ) : null}
      </div>

      {filtered.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>No matches.</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
        {filtered.map(it => {
          const sel = it.id === value
          const open = openId === it.id
          const st = it.status ? STATUS_STYLE[it.status] : undefined
          return (
            <div key={it.id} style={{
              border: `1px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
              background: sel ? 'var(--accent-bg)' : 'var(--surface2)',
              borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <button type="button" onClick={() => onChange?.(it.id)} style={{
                background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 5,
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: sel ? 'var(--accent)' : 'var(--text)' }}>
                    {it.label}
                  </span>
                  {it.warn && <span style={{ fontSize: 10, color: 'var(--amber)' }}>⚠</span>}
                  {sel && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>✓</span>}
                  {st && (
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-dim)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: st.color }} />
                      {st.label}
                    </span>
                  )}
                </span>
                <span style={{
                  fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.45,
                  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: open ? 99 : 3, WebkitBoxOrient: 'vertical',
                }}>
                  {it.whatIs}
                </span>
              </button>

              {it.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {it.tags.slice(0, 6).map(tg => (
                    <button type="button" key={tg} onClick={() => toggle(tags, setTags, tg)} style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 999, cursor: 'pointer',
                      border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)',
                    }}>#{tg}</button>
                  ))}
                </div>
              )}

              {(it.entry?.officialUrl || it.entry?.gettingKey) && (
                <div>
                  <button type="button" onClick={() => setOpenId(open ? null : it.id)} style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    color: 'var(--accent)', fontSize: 11,
                  }}>
                    {open ? 'Hide details ▴' : 'Details ▾'}
                  </button>
                  {open && (
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                      {it.entry?.officialUrl && (
                        <a href={it.entry.officialUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                          Official site ↗
                        </a>
                      )}
                      {it.entry?.gettingKey && (
                        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{it.entry.gettingKey}</div>
                      )}
                      <button type="button" onClick={() => onChange?.(it.id)} className="btn btn-primary"
                        style={{ fontSize: 11, alignSelf: 'flex-start' }}>
                        Select {it.label}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
