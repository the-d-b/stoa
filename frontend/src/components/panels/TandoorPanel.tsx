import { useState, useEffect, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface TandoorRecipe {
  id: number
  name: string
  rating: number
  workingTime: number
  keywords: string[]
}

interface TandoorMealEntry {
  date: string
  mealType: string
  recipe: string
}

interface TandoorShoppingEntry {
  food: string
  unit: string
  amount: number
}

interface TandoorData {
  uiUrl: string
  integrationId: string
  recipeCount: number
  recentRecipes: TandoorRecipe[]
  mealPlan: TandoorMealEntry[]
  shopping: TandoorShoppingEntry[]
}

const TODAY = new Date().toISOString().slice(0, 10)

// Get Mon–Sun of current week as ISO strings
function weekDates(): string[] {
  const now = new Date()
  const day = now.getDay() === 0 ? 7 : now.getDay() // Mon=1..Sun=7
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day - 1))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Meal type ordering
const MEAL_ORDER: Record<string, number> = {
  breakfast: 0, lunch: 1, dinner: 2, snack: 3,
}
function mealOrder(type: string) {
  return MEAL_ORDER[type.toLowerCase()] ?? 99
}

// Star rating display
function Stars({ rating }: { rating: number }) {
  const r = Math.round(rating)
  if (!r) return null
  return (
    <span style={{ fontSize: 10, color: 'var(--amber)', letterSpacing: 0 }}>
      {'★'.repeat(r)}{'☆'.repeat(Math.max(0, 5 - r))}
    </span>
  )
}

// Keyword pill
function Keyword({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: 9, padding: '1px 5px', borderRadius: 3,
      background: 'var(--accent)18', color: 'var(--accent)',
      border: '1px solid var(--accent)30',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

// Recipe row with name, rating, cook time, and up to 3 keyword pills
function RecipeRow({ r, uiUrl }: { r: TandoorRecipe; uiUrl: string }) {
  const href = uiUrl ? `${uiUrl}/recipe/${r.id}` : '#'
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ display: 'block', textDecoration: 'none', color: 'inherit',
        padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: r.keywords.length ? 3 : 0 }}>
        <span style={{ fontSize: 12, fontWeight: 500, flex: 1, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
          {r.name}
        </span>
        <Stars rating={r.rating} />
        {r.workingTime > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
            fontFamily: 'DM Mono, monospace' }}>
            {r.workingTime}m
          </span>
        )}
      </div>
      {r.keywords.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {r.keywords.slice(0, 4).map((k, i) => <Keyword key={i} label={k} />)}
        </div>
      )}
    </a>
  )
}

// Weekly meal plan column view
function WeekPlan({ mealPlan }: { mealPlan: TandoorMealEntry[] }) {
  const dates = weekDates()
  const byDate: Record<string, TandoorMealEntry[]> = {}
  for (const m of mealPlan) {
    if (!byDate[m.date]) byDate[m.date] = []
    byDate[m.date].push(m)
  }
  for (const d of dates) {
    if (byDate[d]) byDate[d].sort((a, b) => mealOrder(a.mealType) - mealOrder(b.mealType))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {dates.map((date, i) => {
        const isToday = date === TODAY
        const entries = byDate[date] || []
        return (
          <div key={date} style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '4px 6px', borderRadius: 5,
            background: isToday ? 'var(--accent)12' : 'transparent',
            border: isToday ? '1px solid var(--accent)30' : '1px solid transparent',
          }}>
            <div style={{ width: 28, flexShrink: 0, textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: isToday ? 'var(--accent)' : 'var(--text-dim)',
                textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {DAY_NAMES[i]}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {entries.length === 0
                ? <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</span>
                : entries.map((e, j) => (
                  <div key={j} style={{ fontSize: 11, color: 'var(--text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.mealType && (
                      <span style={{ fontSize: 9, color: 'var(--text-dim)', marginRight: 4,
                        textTransform: 'capitalize' }}>{e.mealType}:</span>
                    )}
                    {e.recipe}
                  </div>
                ))
              }
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Shopping list
function ShoppingList({ items }: { items: TandoorShoppingEntry[] }) {
  if (items.length === 0) return (
    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Shopping list is empty</div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {items.slice(0, 12).map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6,
          padding: '2px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0,
            border: '1.5px solid var(--accent)', background: 'transparent' }} />
          <span style={{ fontSize: 11, flex: 1, color: 'var(--text-muted)' }}>{s.food}</span>
          {(s.amount > 0 || s.unit) && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
              fontFamily: 'DM Mono, monospace' }}>
              {s.amount > 0 ? s.amount : ''}{s.unit ? ' ' + s.unit : ''}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

export default function TandoorPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<TandoorData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId = config.integrationId as string | undefined

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setData(res.data); setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  const sseData = useSSE<TandoorData>(integrationId)
  useEffect(() => { if (sseData !== null) setData(sseData) }, [sseData])
  useEffect(() => { load() }, [load])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  )
  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4,
      color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  )
  if (!data) return null

  const uiUrl = (data.uiUrl || '').replace(/\/$/, '')
  const mealPlan = data.mealPlan || []
  const recipes = data.recentRecipes || []
  const shopping = data.shopping || []
  const todayMeals = mealPlan.filter(m => m.date === TODAY)

  const section = (label: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, marginTop: 10 }}>
      {label}
    </div>
  )

  // ── Stat chips ──────────────────────────────────────────────────────────────
  const StatChips = () => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <a href={uiUrl || '#'} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 6,
          padding: '3px 10px', borderRadius: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          textDecoration: 'none', color: 'inherit', fontSize: 12 }}>
        <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>
          {data.recipeCount}
        </span>
        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>recipes</span>
      </a>
      {mealPlan.length > 0 && (
        <div style={{ padding: '3px 10px', borderRadius: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 12 }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>
            {mealPlan.length}
          </span>
          <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 4 }}>this week</span>
        </div>
      )}
      {shopping.length > 0 && (
        <div style={{ padding: '3px 10px', borderRadius: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 12 }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>
            {shopping.length}
          </span>
          <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 4 }}>to buy</span>
        </div>
      )}
      {todayMeals.length > 0 && (
        <div style={{ padding: '3px 10px', borderRadius: 6,
          background: 'var(--accent)12', border: '1px solid var(--accent)30', fontSize: 11 }}>
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
            Today: {todayMeals.map(m => m.recipe).join(' · ')}
          </span>
        </div>
      )}
    </div>
  )

  // ── 1x ─────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center' }}>
      <StatChips />
    </div>
  )

  // ── 2-3x: chips + week plan ─────────────────────────────────────────────────
  if (heightUnits <= 3) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <StatChips />
      {section("This week's meals")}
      <WeekPlan mealPlan={mealPlan} />
    </div>
  )

  // ── 4x+: two-column ─────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', gap: 16 }}>
      {/* Left: stats + meal plan + shopping */}
      <div style={{ width: 220, flexShrink: 0, overflow: 'auto', display: 'flex',
        flexDirection: 'column' }}>
        <StatChips />
        {section("This week's meals")}
        <WeekPlan mealPlan={mealPlan} />
        {shopping.length > 0 && (
          <>
            {section('Shopping list')}
            <ShoppingList items={shopping} />
          </>
        )}
      </div>

      {/* Right: recent recipes */}
      <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        {section('Recent recipes')}
        {recipes.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recipes yet</div>
          : recipes.map((r, i) => <RecipeRow key={i} r={r} uiUrl={uiUrl} />)
        }
      </div>
    </div>
  )
}
