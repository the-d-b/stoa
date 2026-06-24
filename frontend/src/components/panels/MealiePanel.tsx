import { useState, useEffect, useCallback, useRef } from 'react'
import { integrationsApi, Panel } from '../../api'

interface MealieRecipe {
  name: string
  slug: string
  rating: number
  totalTime: string
  hasImage: boolean
}

interface MealieMealEntry {
  date: string
  mealType: string
  title: string
  recipe: MealieRecipe | null
}

interface MealieShoppingItem {
  note: string
  quantity: number
  food: string
  unit: string
  checked: boolean
  label: string
}

interface MealieShoppingList {
  id: string
  name: string
  items: MealieShoppingItem[]
}

interface MealiePanelData {
  uiUrl: string
  integrationId: string
  totalRecipes: number
  mealPlan: MealieMealEntry[]
  recipes: MealieRecipe[]
  shoppingLists: MealieShoppingList[]
}

const TODAY = new Date().toISOString().slice(0, 10)
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MEAL_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, side: 3 }

function fmtShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return DAY_NAMES[d.getDay()] + ' ' + (d.getMonth() + 1) + '/' + d.getDate()
}

function authedFetch(url: string) {
  const token = localStorage.getItem('stoa_token')
  return fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
      {children}
    </div>
  )
}

function StatChip({ value, label, href }: { value: number | string; label: string; href?: string }) {
  const inner = (
    <div style={{ padding: '3px 10px', borderRadius: 6, background: 'var(--surface2)',
      border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 5,
      textDecoration: 'none', color: 'inherit' }}>
      <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{value}</span>
      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{label}</span>
    </div>
  )
  if (href) {
    return <a href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>{inner}</a>
  }
  return inner
}

// ── Recipe photo carousel (Immich-style) ──────────────────────────────────────

function RecipeCarousel({ recipes, integrationId, uiUrl }: {
  recipes: MealieRecipe[]
  integrationId: string
  uiUrl: string
}) {
  const [current, setCurrent] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const revokeRef = useRef<string[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const photoRecipes = recipes.filter(r => r.hasImage)
  const photoKey = photoRecipes.map(r => r.slug).join(',')

  useEffect(() => {
    if (!photoRecipes.length || !integrationId) return
    Promise.all(photoRecipes.map(async r => {
      try {
        const res = await authedFetch(`/api/mealie/${integrationId}/image/${r.slug}`)
        if (!res.ok) return null
        const blob = await res.blob()
        return { slug: r.slug, objUrl: URL.createObjectURL(blob) }
      } catch { return null }
    })).then(results => {
      const map: Record<string, string> = {}
      const urls: string[] = []
      results.forEach(r => { if (r) { map[r.slug] = r.objUrl; urls.push(r.objUrl) } })
      revokeRef.current.forEach(u => URL.revokeObjectURL(u))
      revokeRef.current = urls
      setImageUrls(map)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey, integrationId])

  useEffect(() => () => { revokeRef.current.forEach(u => URL.revokeObjectURL(u)) }, [])

  const advance = useCallback(() => setCurrent(c => (c + 1) % Math.max(1, photoRecipes.length)), [photoRecipes.length])

  useEffect(() => {
    if (hovered || photoRecipes.length <= 1) return
    timerRef.current = setInterval(advance, 4000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [hovered, advance, photoRecipes.length])

  if (photoRecipes.length === 0) {
    return (
      <div style={{ width: '100%', height: '100%', background: 'var(--surface2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>No recipe photos</span>
      </div>
    )
  }

  const recipe = photoRecipes[Math.min(current, photoRecipes.length - 1)]
  const objUrl = imageUrls[recipe.slug]
  const href = uiUrl ? `${uiUrl}/recipe/${recipe.slug}` : undefined

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 8, overflow: 'hidden' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      <a href={href} target="_blank" rel="noopener noreferrer"
        style={{ display: 'block', width: '100%', height: '100%', textDecoration: 'none' }}>
        {objUrl ? (
          <img src={objUrl} alt={recipe.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'var(--surface2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>…</span>
          </div>
        )}
      </a>

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
        padding: '24px 10px 8px', pointerEvents: 'none' }}>
        <span style={{ fontSize: 12, color: '#fff', fontWeight: 500,
          textShadow: '0 1px 3px rgba(0,0,0,0.8)', display: 'block',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          paddingRight: photoRecipes.length > 1 ? 52 : 0 }}>
          {recipe.name}
        </span>
        {recipe.totalTime && (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', display: 'block', marginTop: 2 }}>
            {recipe.totalTime}
          </span>
        )}
      </div>

      {photoRecipes.length > 1 && (
        <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 3, zIndex: 2 }}>
          {photoRecipes.map((_, i) => (
            <button key={i} onClick={e => { e.preventDefault(); setCurrent(i) }}
              style={{ width: i === current ? 14 : 5, height: 5, borderRadius: 3,
                background: i === current ? '#fff' : 'rgba(255,255,255,0.4)',
                border: 'none', padding: 0, cursor: 'pointer',
                transition: 'width 0.25s, background 0.25s' }} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Meal plan ─────────────────────────────────────────────────────────────────

function groupByDate(entries: MealieMealEntry[]): Map<string, MealieMealEntry[]> {
  const map = new Map<string, MealieMealEntry[]>()
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  for (const e of sorted) {
    if (!map.has(e.date)) map.set(e.date, [])
    map.get(e.date)!.push(e)
  }
  for (const [, day] of map) {
    day.sort((a, b) => (MEAL_ORDER[a.mealType] ?? 9) - (MEAL_ORDER[b.mealType] ?? 9))
  }
  return map
}

function mealIcon(type: string): string {
  if (type === 'breakfast') return '🌅'
  if (type === 'lunch') return '☀️'
  if (type === 'dinner') return '🌙'
  return '🍽️'
}

function MealPlanView({ mealPlan, uiUrl }: { mealPlan: MealieMealEntry[]; uiUrl: string }) {
  const planByDate = groupByDate(mealPlan)
  const dates = Array.from(planByDate.keys())
  if (dates.length === 0) return (
    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No meals planned this week.</div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {dates.map(date => {
        const isToday = date === TODAY
        const entries = planByDate.get(date)!
        return (
          <div key={date} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '4px 6px', borderRadius: 5,
            background: isToday ? 'var(--accent)12' : 'transparent',
            border: isToday ? '1px solid var(--accent)30' : '1px solid transparent' }}>
            <div style={{ width: 36, flexShrink: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.04em', color: isToday ? 'var(--accent)' : 'var(--text-dim)' }}>
                {fmtShortDate(date)}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {entries.map((e, j) => {
                const eName = e.recipe?.name || e.title || '—'
                const eHref = e.recipe?.slug ? `${uiUrl}/recipe/${e.recipe.slug}` : undefined
                return (
                  <a key={j} href={eHref} target="_blank" rel="noopener noreferrer"
                    style={{ textDecoration: 'none', display: 'flex', alignItems: 'center',
                      gap: 4, color: 'inherit' }}>
                    <span style={{ fontSize: 11, flexShrink: 0 }}>{mealIcon(e.mealType)}</span>
                    <span style={{ fontSize: 11, color: 'var(--text)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eName}</span>
                  </a>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Shopping list ─────────────────────────────────────────────────────────────

function ShoppingListView({ list, uiUrl }: { list: MealieShoppingList; uiUrl: string }) {
  const unchecked = list.items.filter(i => !i.checked)
  if (unchecked.length === 0) return (
    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Shopping list is empty.</div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {unchecked.slice(0, 15).map((item, i) => {
        const label = item.food || item.note || '?'
        const qty = item.quantity > 0 ? `${item.quantity !== Math.floor(item.quantity) ? item.quantity : Math.floor(item.quantity)}${item.unit ? ' ' + item.unit : ''}` : ''
        return (
          <a key={i} href={`${uiUrl}/shopping`} target="_blank" rel="noopener noreferrer"
            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
              padding: '3px 0', borderBottom: '1px solid var(--border)', color: 'inherit' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2,
              border: '1.5px solid #6366f1', background: 'transparent', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'var(--text)', flex: 1, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
            {qty && <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>{qty}</span>}
          </a>
        )
      })}
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function MealiePanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<MealiePanelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId: string = config.integrationId || ''

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setData(res.data); setError(null)
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  useEffect(() => { if (!integrationId) { setLoading(false); return }; load() }, [load, integrationId])

  if (!integrationId) return <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 13 }}>No integration configured.</div>
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error) return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data) return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const recipes = data.recipes || []
  const mealPlan = data.mealPlan || []
  const primaryList = data.shoppingLists?.[0] ?? null
  const shoppingCount = primaryList ? primaryList.items.filter(i => !i.checked).length : 0

  const chips = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <StatChip value={data.totalRecipes} label="recipes" href={uiUrl || undefined} />
      {mealPlan.length > 0 && <StatChip value={mealPlan.length} label="this week" />}
      {shoppingCount > 0 && <StatChip value={shoppingCount} label="to buy" />}
    </div>
  )

  // ── 1x: stat chips ──────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', padding: '0 12px', overflow: 'hidden' }}>
        {chips}
      </div>
    )
  }

  // ── 2x–3x: photo carousel ───────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ height: '100%', padding: 8, boxSizing: 'border-box', overflow: 'hidden' }}>
        <RecipeCarousel recipes={recipes} integrationId={data.integrationId} uiUrl={uiUrl} />
      </div>
    )
  }

  // ── 4x+: carousel + meal plan + shopping ────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: '0 0 55%', maxHeight: 280, minHeight: 80, padding: '8px 8px 4px' }}>
        <RecipeCarousel recipes={recipes} integrationId={data.integrationId} uiUrl={uiUrl} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 12px', minHeight: 0,
        display: 'flex', flexDirection: 'column', gap: 12 }}>
        {chips}
        {mealPlan.length > 0 && (
          <div>
            <SectionLabel>This Week's Meals</SectionLabel>
            <MealPlanView mealPlan={mealPlan} uiUrl={uiUrl} />
          </div>
        )}
        {primaryList && shoppingCount > 0 && (
          <div>
            <SectionLabel>{primaryList.name} ({shoppingCount} left)</SectionLabel>
            <ShoppingListView list={primaryList} uiUrl={uiUrl} />
          </div>
        )}
        {mealPlan.length === 0 && shoppingCount === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No meals planned or shopping items.</div>
        )}
      </div>
    </div>
  )
}
