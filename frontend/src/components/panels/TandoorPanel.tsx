import { useState, useEffect, useCallback, useRef } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface TandoorRecipe {
  id: number
  name: string
  rating: number
  workingTime: number
  keywords: string[]
  hasImage: boolean
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
  recipes: TandoorRecipe[]
  mealPlan: TandoorMealEntry[]
  shopping: TandoorShoppingEntry[]
}

const TODAY = new Date().toISOString().slice(0, 10)

function weekDates(): string[] {
  const now = new Date()
  const day = now.getDay() === 0 ? 7 : now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day - 1))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MEAL_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 }

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
  recipes: TandoorRecipe[]
  integrationId: string
  uiUrl: string
}) {
  const [current, setCurrent] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [imageUrls, setImageUrls] = useState<Record<number, string>>({})
  const revokeRef = useRef<string[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const photoRecipes = recipes.filter(r => r.hasImage)
  const photoKey = photoRecipes.map(r => r.id).join(',')

  useEffect(() => {
    if (!photoRecipes.length || !integrationId) return
    Promise.all(photoRecipes.map(async r => {
      try {
        const res = await authedFetch(`/api/tandoor/${integrationId}/image/${r.id}`)
        if (!res.ok) return null
        const blob = await res.blob()
        return { id: r.id, objUrl: URL.createObjectURL(blob) }
      } catch { return null }
    })).then(results => {
      const map: Record<number, string> = {}
      const urls: string[] = []
      results.forEach(r => { if (r) { map[r.id] = r.objUrl; urls.push(r.objUrl) } })
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
  const objUrl = imageUrls[recipe.id]
  const href = uiUrl ? `${uiUrl}/recipe/${recipe.id}` : undefined

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
        {recipe.workingTime > 0 && (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', display: 'block', marginTop: 2 }}>
            {recipe.workingTime}m
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

// ── Weekly meal plan ──────────────────────────────────────────────────────────

function WeekPlan({ mealPlan, uiUrl }: { mealPlan: TandoorMealEntry[]; uiUrl: string }) {
  const dates = weekDates()
  const byDate: Record<string, TandoorMealEntry[]> = {}
  for (const m of mealPlan) {
    if (!byDate[m.date]) byDate[m.date] = []
    byDate[m.date].push(m)
  }
  for (const d of dates) {
    if (byDate[d]) byDate[d].sort((a, b) => (MEAL_ORDER[a.mealType.toLowerCase()] ?? 9) - (MEAL_ORDER[b.mealType.toLowerCase()] ?? 9))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {dates.map((date, i) => {
        const isToday = date === TODAY
        const entries = byDate[date] || []
        return (
          <div key={date} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '4px 6px', borderRadius: 5,
            background: isToday ? 'var(--accent)12' : 'transparent',
            border: isToday ? '1px solid var(--accent)30' : '1px solid transparent' }}>
            <div style={{ width: 28, flexShrink: 0, textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.05em', color: isToday ? 'var(--accent)' : 'var(--text-dim)' }}>
                {DAY_NAMES[i]}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {entries.length === 0
                ? <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</span>
                : entries.map((e, j) => (
                  <a key={j} href={uiUrl ? `${uiUrl}/meal-plan` : undefined} target="_blank"
                    rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block',
                      fontSize: 11, color: 'var(--text)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.mealType && (
                      <span style={{ fontSize: 9, color: 'var(--text-dim)', marginRight: 4,
                        textTransform: 'capitalize' }}>{e.mealType}:</span>
                    )}
                    {e.recipe}
                  </a>
                ))
              }
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Shopping list ─────────────────────────────────────────────────────────────

function ShoppingList({ items, uiUrl }: { items: TandoorShoppingEntry[]; uiUrl: string }) {
  if (items.length === 0) return (
    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Shopping list is empty</div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {items.slice(0, 15).map((s, i) => (
        <a key={i} href={uiUrl ? `${uiUrl}/shopping` : undefined} target="_blank" rel="noopener noreferrer"
          style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 0', borderBottom: '1px solid var(--border)', color: 'inherit' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0,
            border: '1.5px solid var(--accent)', background: 'transparent', display: 'inline-block' }} />
          <span style={{ fontSize: 11, flex: 1, color: 'var(--text)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.food}</span>
          {(s.amount > 0 || s.unit) && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
              fontFamily: 'DM Mono, monospace' }}>
              {s.amount > 0 ? s.amount : ''}{s.unit ? ' ' + s.unit : ''}
            </span>
          )}
        </a>
      ))}
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

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
  const recipes = data.recipes || []
  const mealPlan = data.mealPlan || []
  const shopping = data.shopping || []

  const chips = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <StatChip value={data.recipeCount} label="recipes" href={uiUrl || undefined} />
      {mealPlan.length > 0 && <StatChip value={mealPlan.length} label="this week" />}
      {shopping.length > 0 && <StatChip value={shopping.length} label="to buy" />}
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
            <WeekPlan mealPlan={mealPlan} uiUrl={uiUrl} />
          </div>
        )}
        {shopping.length > 0 && (
          <div>
            <SectionLabel>Shopping List</SectionLabel>
            <ShoppingList items={shopping} uiUrl={uiUrl} />
          </div>
        )}
        {mealPlan.length === 0 && shopping.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No meals planned or shopping items.</div>
        )}
      </div>
    </div>
  )
}
