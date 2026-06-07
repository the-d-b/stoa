import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

interface MealieRecipe {
  name: string
  slug: string
  rating: number
  totalTime: string
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
  recentRecipes: MealieRecipe[]
  shoppingLists: MealieShoppingList[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MEAL_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, side: 3 }

function fmtShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return DAY_NAMES[d.getDay()] + ' ' + (d.getMonth() + 1) + '/' + d.getDate()
}

function isToday(iso: string): boolean {
  const today = new Date().toISOString().slice(0, 10)
  return iso === today
}

function mealIcon(type: string): string {
  if (type === 'breakfast') return '🌅'
  if (type === 'lunch') return '☀️'
  if (type === 'dinner') return '🌙'
  return '🍽️'
}

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating)
  return (
    <span style={{ fontSize: 10, color: '#f59e0b', letterSpacing: '-1px' }}>
      {Array.from({ length: 5 }).map((_, i) => i < full ? '★' : '☆').join('')}
    </span>
  )
}

// ── Grouped meal plan by date ─────────────────────────────────────────────────

function groupByDate(entries: MealieMealEntry[]): Map<string, MealieMealEntry[]> {
  const map = new Map<string, MealieMealEntry[]>()
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  for (const e of sorted) {
    if (!map.has(e.date)) map.set(e.date, [])
    map.get(e.date)!.push(e)
  }
  // Sort each day's entries by meal type order
  for (const [, entries] of map) {
    entries.sort((a, b) => (MEAL_ORDER[a.mealType] ?? 9) - (MEAL_ORDER[b.mealType] ?? 9))
  }
  return map
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: '#1a1a1a', borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80 }}>
      <span style={{ fontSize: 20, fontWeight: 700, color: '#e0e0e0' }}>{value}</span>
      <span style={{ fontSize: 10, color: '#888', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
    </div>
  )
}

function MealRow({ entry, uiUrl }: { entry: MealieMealEntry; uiUrl: string }) {
  const name = entry.recipe?.name || entry.title || '—'
  const href = entry.recipe?.slug && uiUrl
    ? `${uiUrl.replace(/\/$/, '')}/recipe/${entry.recipe.slug}`
    : undefined
  const inner = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
      <span style={{ fontSize: 12, flexShrink: 0 }}>{mealIcon(entry.mealType)}</span>
      <span style={{ fontSize: 12, color: '#ddd', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      {entry.recipe && entry.recipe.rating > 0 && <Stars rating={entry.recipe.rating} />}
    </div>
  )
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        {inner}
      </a>
    )
  }
  return <div>{inner}</div>
}

function DayBlock({ date, entries, uiUrl, compact }: { date: string; entries: MealieMealEntry[]; uiUrl: string; compact?: boolean }) {
  const today = isToday(date)
  return (
    <div style={{ marginBottom: compact ? 6 : 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: today ? '#6366f1' : '#888',
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}>
          {fmtShortDate(date)}
        </span>
        {today && (
          <span style={{ fontSize: 10, background: '#6366f1', color: '#fff', borderRadius: 3, padding: '1px 5px' }}>Today</span>
        )}
      </div>
      {entries.map((e, i) => <MealRow key={i} entry={e} uiUrl={uiUrl} />)}
    </div>
  )
}

function RecipeRow({ recipe, uiUrl }: { recipe: MealieRecipe; uiUrl: string }) {
  const href = uiUrl ? `${uiUrl.replace(/\/$/, '')}/recipe/${recipe.slug}` : undefined
  const inner = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #1a1a1a' }}>
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2} style={{ flexShrink: 0 }}>
        <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
        <path d="M7 2v20" />
        <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recipe.name}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 2, alignItems: 'center' }}>
          {recipe.rating > 0 && <Stars rating={recipe.rating} />}
          {recipe.totalTime && <span style={{ fontSize: 10, color: '#666' }}>{recipe.totalTime}</span>}
        </div>
      </div>
    </div>
  )
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        {inner}
      </a>
    )
  }
  return <div>{inner}</div>
}

function ShoppingListView({ list }: { list: MealieShoppingList }) {
  const unchecked = list.items.filter(i => !i.checked)
  const checked = list.items.filter(i => i.checked)
  const renderItem = (item: MealieShoppingItem, i: number) => {
    const label = item.food || item.note || '?'
    const qty = item.quantity > 0 ? `${item.quantity > 1 || item.quantity !== Math.floor(item.quantity) ? item.quantity : Math.floor(item.quantity)}${item.unit ? ' ' + item.unit : ''}` : ''
    return (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', opacity: item.checked ? 0.4 : 1 }}>
        <div style={{ width: 10, height: 10, borderRadius: 2, border: `1.5px solid ${item.checked ? '#555' : '#6366f1'}`, background: item.checked ? '#555' : 'transparent', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: '#ddd', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {qty && <span style={{ fontSize: 11, color: '#777', flexShrink: 0 }}>{qty}</span>}
      </div>
    )
  }
  return (
    <div>
      {unchecked.map(renderItem)}
      {checked.length > 0 && unchecked.length > 0 && (
        <div style={{ fontSize: 10, color: '#555', margin: '6px 0 3px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Done ({checked.length})</div>
      )}
      {checked.slice(0, 3).map((item, i) => renderItem(item, unchecked.length + i))}
    </div>
  )
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export default function MealiePanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<MealiePanelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId: string = config.integrationId || ''

  useEffect(() => {
    if (!integrationId) { setLoading(false); return }
    integrationsApi.getPanelData(panel.id)
      .then(res => { setData(res.data); setLoading(false) })
      .catch(e => { setError(e.response?.data?.error || e.message || 'Failed to load'); setLoading(false) })
  }, [panel.id, integrationId])

  if (!integrationId) return <div style={{ padding: 16, color: '#666', fontSize: 13 }}>No integration configured.</div>
  if (loading) return <div style={{ padding: 16, color: '#888', fontSize: 13 }}>Loading...</div>
  if (error) return <div style={{ padding: 16, color: '#ef4444', fontSize: 13 }}>{error}</div>
  if (!data) return null

  const planByDate = groupByDate(data.mealPlan || [])
  const planDates = Array.from(planByDate.keys())
  const primaryList = data.shoppingLists?.[0] ?? null

  // ── 1x ────────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    const mealsThisWeek = (data.mealPlan || []).length
    return (
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, height: '100%', overflow: 'hidden' }}>
        <StatChip label="Recipes" value={data.totalRecipes} />
        {mealsThisWeek > 0 && <StatChip label="This Week" value={`${mealsThisWeek} meals`} />}
        {primaryList && <StatChip label="Shopping" value={`${primaryList.items.filter(i => !i.checked).length} items`} />}
      </div>
    )
  }

  // ── 2-3x ──────────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <StatChip label="Recipes" value={data.totalRecipes} />
          {(data.mealPlan || []).length > 0 && <StatChip label="This Week" value={`${data.mealPlan.length} meals`} />}
          {primaryList && <StatChip label="Shopping" value={`${primaryList.items.filter(i => !i.checked).length} items`} />}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {planDates.length > 0 ? (
            <>
              <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>This Week</div>
              {planDates.map(date => (
                <DayBlock key={date} date={date} entries={planByDate.get(date)!} uiUrl={data.uiUrl} compact />
              ))}
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#555', marginTop: 8 }}>No meals planned this week.</div>
          )}
        </div>
      </div>
    )
  }

  // ── 4x+ ───────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left col — meal plan + shopping */}
      <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid #1e1e1e', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <StatChip label="Recipes" value={data.totalRecipes} />
          {(data.mealPlan || []).length > 0 && <StatChip label="Meals" value={data.mealPlan.length} />}
        </div>

        {planDates.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>This Week</div>
            {planDates.map(date => (
              <DayBlock key={date} date={date} entries={planByDate.get(date)!} uiUrl={data.uiUrl} />
            ))}
          </div>
        )}

        {primaryList && (
          <div>
            <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              {primaryList.name}
              <span style={{ marginLeft: 6, color: '#777', textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>
                ({primaryList.items.filter(i => !i.checked).length} left)
              </span>
            </div>
            <ShoppingListView list={primaryList} />
          </div>
        )}
      </div>

      {/* Right col — recent recipes */}
      <div style={{ flex: 1, padding: '12px 14px', overflowY: 'auto', minWidth: 0 }}>
        <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Recent Recipes</div>
        {(data.recentRecipes || []).map((recipe, i) => (
          <RecipeRow key={i} recipe={recipe} uiUrl={data.uiUrl} />
        ))}
      </div>
    </div>
  )
}
