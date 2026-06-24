import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

interface GrocyProduct {
  name: string
  amount: number
  bestBeforeDate: string
  daysFromNow: number
}

interface GrocyChore {
  name: string
  nextExecution: string
  lastTracked: string
  isOverdue: boolean
  daysOverdue: number
}

interface GrocyTask {
  name: string
  dueDate: string
  category: string
  isOverdue: boolean
}

interface GrocyShoppingItem {
  productName: string
  amount: number
  note: string
}

interface GrocyPanelData {
  uiUrl: string
  integrationId: string
  expiringCount: number
  expiredCount: number
  overdueChores: number
  pendingTasks: number
  products: GrocyProduct[]
  chores: GrocyChore[]
  tasks: GrocyTask[]
  shoppingItems: GrocyShoppingItem[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso || iso.length < 10) return ''
  const d = new Date(iso.slice(0, 10) + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function daysLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d ago`
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days}d`
}

function urgencyColor(daysFromNow: number): string {
  if (daysFromNow < 0) return 'var(--red)'
  if (daysFromNow <= 2) return '#f97316'
  if (daysFromNow <= 5) return '#f59e0b'
  return '#eab308'
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.06em', marginBottom: 6, fontWeight: 600 }}>
      {children}
    </div>
  )
}

function StatChip({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '4px 8px', display: 'flex', flexDirection: 'column',
      alignItems: 'center', minWidth: 0 }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--text)', lineHeight: 1.2 }}>{value}</span>
      <span style={{ fontSize: 7, color: 'var(--text-dim)', marginTop: 2, textTransform: 'uppercase',
        letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}

function ProductRow({ p }: { p: GrocyProduct }) {
  const color = urgencyColor(p.daysFromNow)
  const qty = p.amount !== 1 ? `${p.amount}×` : ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
      borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {qty && <span style={{ color: 'var(--text-dim)', marginRight: 4 }}>{qty}</span>}{p.name}
      </span>
      <span style={{ fontSize: 11, color, flexShrink: 0 }}>{daysLabel(p.daysFromNow)}</span>
    </div>
  )
}

function ChoreRow({ chore }: { chore: GrocyChore }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
      borderBottom: '1px solid var(--border)' }}>
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
        stroke={chore.isOverdue ? '#f59e0b' : 'var(--text-dim)'} strokeWidth={2} style={{ flexShrink: 0 }}>
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
      <span style={{ fontSize: 12, color: chore.isOverdue ? '#f59e0b' : 'var(--text)',
        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {chore.name}
      </span>
      <span style={{ fontSize: 10, flexShrink: 0, color: chore.isOverdue ? '#f59e0b' : 'var(--text-dim)' }}>
        {chore.isOverdue
          ? (chore.daysOverdue > 0 ? `${chore.daysOverdue}d overdue` : 'overdue')
          : (chore.nextExecution ? fmtDate(chore.nextExecution) : '')}
      </span>
    </div>
  )
}

function TaskRow({ task }: { task: GrocyTask }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
      borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 10, height: 10, borderRadius: 2,
        border: `1.5px solid ${task.isOverdue ? 'var(--red)' : 'var(--text-dim)'}`, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: task.isOverdue ? 'var(--red)' : 'var(--text)',
        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {task.name}
      </span>
      {task.dueDate && (
        <span style={{ fontSize: 11, color: task.isOverdue ? 'var(--red)' : 'var(--text-dim)', flexShrink: 0 }}>
          {fmtDate(task.dueDate)}
        </span>
      )}
    </div>
  )
}

function ShoppingRow({ item }: { item: GrocyShoppingItem }) {
  const qty = item.amount > 0 && item.amount !== 1 ? `${item.amount}×` : ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
      borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 10, height: 10, borderRadius: 2, border: '1.5px solid #6366f1', flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {qty && <span style={{ color: 'var(--text-dim)', marginRight: 4 }}>{qty}</span>}{item.productName}
      </span>
    </div>
  )
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export default function GrocyPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<GrocyPanelData | null>(null)
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

  if (!integrationId) return <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 13 }}>No integration configured.</div>
  if (loading)       return <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)         return <div style={{ padding: 16, color: 'var(--red)',      fontSize: 13 }}>{error}</div>
  if (!data)         return null

  const products = data.products     || []
  const chores   = data.chores       || []
  const tasks    = data.tasks        || []
  const shopping = data.shoppingItems || []

  const expiredColor  = data.expiredCount  > 0 ? 'var(--red)' : 'var(--text-dim)'
  const expiringColor = data.expiringCount > 0 ? '#f59e0b'    : 'var(--text-dim)'
  const choresColor   = data.overdueChores > 0 ? '#f59e0b'    : 'var(--text-dim)'
  const tasksColor    = data.pendingTasks  > 0 ? 'var(--text)' : 'var(--text-dim)'

  const chipRow = (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
      <StatChip label="Expired"  value={data.expiredCount}  color={expiredColor} />
      <StatChip label="Expiring" value={data.expiringCount} color={expiringColor} />
      <StatChip label="Chores"   value={data.overdueChores} color={choresColor} />
      <StatChip label="Tasks"    value={data.pendingTasks}  color={tasksColor} />
      <StatChip label="Shopping" value={shopping.length} />
    </div>
  )

  // ── 1x: chip row only ─────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', height: '100%', boxSizing: 'border-box' }}>
        {chipRow}
      </div>
    )
  }

  // ── 2x–3x: chip row + food expiry ─────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column',
        gap: 10, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
        {chipRow}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {products.length > 0 ? (
            <>
              <SectionLabel>Food Expiry</SectionLabel>
              {products.map((p, i) => (
                <a key={i} href={`${data.uiUrl}/stockoverview`} target="_blank" rel="noreferrer"
                  style={{ textDecoration: 'none', display: 'block', color: 'inherit' }}>
                  <ProductRow p={p} />
                </a>
              ))}
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>No expiring products.</div>
          )}
        </div>
      </div>
    )
  }

  // ── 4x+: single scrollable column ─────────────────────────────────────────────
  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column',
      gap: 14, height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>

      {chipRow}

      {products.length > 0 && (
        <div>
          <SectionLabel>Food Expiry</SectionLabel>
          {products.map((p, i) => (
            <a key={i} href={`${data.uiUrl}/stockoverview`} target="_blank" rel="noreferrer"
              style={{ textDecoration: 'none', display: 'block', color: 'inherit' }}>
              <ProductRow p={p} />
            </a>
          ))}
        </div>
      )}

      {chores.length > 0 && (
        <div>
          <SectionLabel>
            Chores
            {data.overdueChores > 0 && (
              <span style={{ color: '#f59e0b', marginLeft: 6,
                textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
                {data.overdueChores} overdue
              </span>
            )}
          </SectionLabel>
          {chores.map((c, i) => (
            <a key={i} href={`${data.uiUrl}/chores`} target="_blank" rel="noreferrer"
              style={{ textDecoration: 'none', display: 'block', color: 'inherit' }}>
              <ChoreRow chore={c} />
            </a>
          ))}
        </div>
      )}

      {tasks.length > 0 && (
        <div>
          <SectionLabel>Tasks</SectionLabel>
          {tasks.map((t, i) => (
            <a key={i} href={`${data.uiUrl}/tasks`} target="_blank" rel="noreferrer"
              style={{ textDecoration: 'none', display: 'block', color: 'inherit' }}>
              <TaskRow task={t} />
            </a>
          ))}
        </div>
      )}

      {shopping.length > 0 && (
        <div>
          <SectionLabel>Shopping List ({shopping.length})</SectionLabel>
          {shopping.map((item, i) => (
            <a key={i} href={`${data.uiUrl}/shoppinglist`} target="_blank" rel="noreferrer"
              style={{ textDecoration: 'none', display: 'block', color: 'inherit' }}>
              <ShoppingRow item={item} />
            </a>
          ))}
        </div>
      )}

      {products.length === 0 && chores.length === 0 && tasks.length === 0 && shopping.length === 0 && (
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>All clear — nothing pending.</div>
      )}
    </div>
  )
}
