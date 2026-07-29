// Generates src/catalog.generated.ts from docs/integrations/*/README.md.
//
// The docs' YAML front-matter is the single source of truth (see
// docs/integrations/README.md). This turns each page into one catalog entry:
// the structured front-matter fields plus the prose from the "What is X?" and
// "Getting the key" sections. Runs automatically before `npm run build`
// (package.json "prebuild") and on demand via `npm run gen:catalog`.
//
// Emits a .ts (not .json) so it's typed and needs no tsconfig json flags.

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DOCS = resolve(__dirname, '../../docs/integrations')
const OUT = resolve(__dirname, '../src/catalog.generated.ts')

// Category display order (mirrors the 12-category taxonomy).
const CATEGORY_ORDER = [
  'Media Servers', 'Media Management', 'Downloads', 'Print Media', 'Music', 'Gaming',
  'Storage & Virtualization', 'Network & Security', 'Finance', 'Digital Life',
  'Online Content', 'Stoa Features',
]

if (!existsSync(DOCS)) {
  console.warn(`[gen-catalog] docs not found at ${DOCS} — keeping existing ${OUT}`)
  process.exit(0)
}

// ── front-matter parsing (simple, controlled format) ─────────────────────────
function parseFrontMatter(text) {
  if (!text.startsWith('---')) return null
  const end = text.indexOf('\n---', 3)
  if (end === -1) return null
  const block = text.slice(3, end).trim()
  const fm = {}
  for (const raw of block.split('\n')) {
    const line = raw.trimEnd()
    const i = line.indexOf(':')
    if (i === -1) continue
    const key = line.slice(0, i).trim()
    let val = line.slice(i + 1).trim()
    if (key === 'tags') {
      val = val.replace(/^\[|\]$/g, '')
      fm.tags = val ? val.split(',').map(t => t.trim()).filter(Boolean) : []
    } else if (val === 'true' || val === 'false') {
      fm[key] = val === 'true'
    } else {
      fm[key] = val
    }
  }
  return { fm, bodyStart: end + 4 }
}

// ── section body extraction (heading → next '## '/'### '/'---') ───────────────
const SKIP_LINE = /^\*\*(Official site|Data source|Standard):\*\*/
function extractSection(body, headingRe, { dropLinkLines = false } = {}) {
  const lines = body.split('\n')
  let i = lines.findIndex(l => headingRe.test(l))
  if (i === -1) return undefined
  const out = []
  for (i = i + 1; i < lines.length; i++) {
    const l = lines[i]
    if (l.trim() === '---' || /^#{2,3}\s/.test(l)) break
    if (dropLinkLines && SKIP_LINE.test(l.trim())) continue
    out.push(l)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() || undefined
}

// ── build entries ─────────────────────────────────────────────────────────────
const entries = []
for (const name of readdirSync(DOCS)) {
  const path = join(DOCS, name, 'README.md')
  if (!existsSync(path) || !statSync(join(DOCS, name)).isDirectory()) continue
  const text = readFileSync(path, 'utf8')
  const parsed = parseFrontMatter(text)
  if (!parsed) { console.warn(`[gen-catalog] no front-matter: ${name}`); continue }
  const { fm, bodyStart } = parsed
  if (!fm.id) { console.warn(`[gen-catalog] no id: ${name}`); continue }
  const body = text.slice(bodyStart)

  const entry = {
    id: fm.id,
    name: fm.name || fm.id,
    category: fm.category || 'Uncategorized',
    tags: fm.tags || [],
    builtin: fm.category === 'Stoa Features',
    status: fm.status || 'needs-testing',
    whatIs: extractSection(body, /^##\s+what is/i, { dropLinkLines: true }) || '',
  }
  if (fm.official_url) entry.officialUrl = fm.official_url
  if (fm.polling) entry.polling = fm.polling
  if (fm.secret_format) entry.secretFormat = fm.secret_format
  if (typeof fm.url_required === 'boolean') entry.urlRequired = fm.url_required
  if (fm.example_url) entry.exampleUrl = fm.example_url
  const gk = extractSection(body, /^##\s+getting the key/i)
  if (gk) entry.gettingKey = gk

  entries.push(entry)
}

entries.sort((a, b) => {
  const ca = CATEGORY_ORDER.indexOf(a.category)
  const cb = CATEGORY_ORDER.indexOf(b.category)
  if (ca !== cb) return (ca === -1 ? 99 : ca) - (cb === -1 ? 99 : cb)
  return a.name.localeCompare(b.name)
})

// ── emit typed .ts ────────────────────────────────────────────────────────────
const header = `// AUTO-GENERATED from docs/integrations/*/README.md by scripts/gen-catalog.mjs.
// Do not edit by hand — run \`npm run gen:catalog\` (also runs before every build).

export interface CatalogEntry {
  id: string
  name: string
  category: string
  tags: string[]
  builtin: boolean          // a built-in Stoa panel (no external integration)
  status: string            // tested | needs-testing | experimental | new
  officialUrl?: string
  polling?: string
  secretFormat?: string     // canonical enum; absent for built-in panels
  urlRequired?: boolean
  exampleUrl?: string
  whatIs: string
  gettingKey?: string
}

export const CATALOG: CatalogEntry[] = ${JSON.stringify(entries, null, 2)}
`
writeFileSync(OUT, header, 'utf8')

const byCat = {}
for (const e of entries) byCat[e.category] = (byCat[e.category] || 0) + 1
console.log(`[gen-catalog] wrote ${entries.length} entries -> ${OUT}`)
for (const c of CATEGORY_ORDER) if (byCat[c]) console.log(`  ${byCat[c].toString().padStart(3)}  ${c}`)
