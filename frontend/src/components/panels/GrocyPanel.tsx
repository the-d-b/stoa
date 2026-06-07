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
  if (daysFromNow < 0) return '#ef4444' // expired
  if (daysFromNow <= 2) return '#f97316' // orange — very soon
  if (daysFromNow <= 5) return '#f59e0b' // amber — soon
  return '#eab308'                        // yellow — this week
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: '#1a1a1a', borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 72 }}>
      <span style={{ fontSize: 20, fontWeight: 700, color: color || '#e0e0e0' }}>{value}</span>
      <span style={{ fontSize: 10, color: '#888', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
    </div>
  )
}

function ProductRow({ p }: { p: GrocyProduct }) {
  const color = urgencyColor(p.daysFromNow)
  const qty = p.amount !== 1 ? `${p.amount}×` : ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #1a1a1a' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: '#ddd', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {qty && <span style={{ color: '#888', marginRight: 4 }}>{qty}</span>}{p.name}
      </span>
      <span style={{ fontSize: 11, color, flexShrink: 0 }}>{daysLabel(p.daysFromNow)}</span>
    </div>
  )
}

function ChoreRow({ chore }: { chore: GrocyChore }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #1a1a1a' }}>
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={chore.isOverdue ? '#f59e0b' : '#555'} strokeWidth={2} style={{ flexShrink: 0 }}>
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
      <span style={{ fontSize: 12, color: chore.isOverdue ? '#f59e0b' : '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {chore.name}
      </span>
      {chore.isOverdue && (
        <span style={{ fontSize: 10, color: '#f59e0b', flexShrink: 0 }}>
          {chore.daysOverdue > 0 ? `${chore.daysOverdue}d overdue` : 'overdue'}
        </span>
      )}
    </div>
  )
}

function TaskRow({ task }: { task: GrocyTask }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #1a1a1a' }}>
      <div style={{ width: 10, height: 10, borderRadius: 2, border: `1.5px solid ${task.isOverdue ? '#ef4444' : '#555'}`, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: task.isOverdue ? '#ef4444' : '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {task.name}
      </span>
      {task.dueDate && (
        <span style={{ fontSize: 11, color: task.isOverdue ? '#ef4444' : '#666', flexShrink: 0 }}>
          {fmtDate(task.dueDate)}
        </span>
      )}
    </div>
  )
}

function ShoppingRow({ item }: { item: GrocyShoppingItem }) {
  const qty = item.amount > 0 && item.amount !== 1 ? `${item.amount}×` : ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <div style={{ width: 10, height: 10, borderRadius: 2, border: '1.5px solid #6366f1', flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {qty && <span style={{ color: '#888', marginRight: 4 }}>{qty}</span>}{item.productName}
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

  if (!integrationId) return <div style={{ padding: 16, color: '#666', fontSize: 13 }}>No integration configured.</div>
  if (loading) return <div style={{ padding: 16, color: '#888', fontSize: 13 }}>Loading...</div>
  if (error) return <div style={{ padding: 16, color: '#ef4444', fontSize: 13 }}>{error}</div>
  if (!data) return null

  const products = data.products || []
  const chores = data.chores || []
  const tasks = data.tasks || []
  const shopping = data.shoppingItems || []
  const overdueChores = chores.filter(c => c.isOverdue)

  // ── 1x ────────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, height: '100%', overflow: 'hidden' }}>
        {data.expiredCount > 0 && <StatChip label="Expired" value={data.expiredCount} color="#ef4444" />}
        {data.expiringCount > 0 && <StatChip label="Expiring" value={data.expiringCount} color="#f59e0b" />}
        {data.overdueChores > 0 && <StatChip label="Chores Due" value={data.overdueChores} color="#f59e0b" />}
        {data.pendingTasks > 0 && <StatChip label="Tasks" value={data.pendingTasks} />}
        {shopping.length > 0 && <StatChip label="Shopping" value={shopping.length} />}
      </div>
    )
  }

  // ── 2-3x ──────────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          {data.expiredCount > 0 && <StatChip label="Expired" value={data.expiredCount} color="#ef4444" />}
          {data.expiringCount > 0 && <StatChip label="Expiring" value={data.expiringCount} color="#f59e0b" />}
          {data.overdueChores > 0 && <StatChip label="Chores Due" value={data.overdueChores} color="#f59e0b" />}
          {data.pendingTasks > 0 && <StatChip label="Tasks" value={data.pendingTasks} />}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {products.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Food Expiry</div>
              {products.slice(0, 6).map((p, i) => <ProductRow key={i} p={p} />)}
            </div>
          )}
          {overdueChores.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Overdue Chores</div>
              {overdueChores.slice(0, 4).map((c, i) => <ChoreRow key={i} chore={c} />)}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── 4x+ ───────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left col — food expiry + chores */}
      <div style={{ width: 230, flexShrink: 0, borderRight: '1px solid #1e1e1e', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {data.expiredCount > 0 && <StatChip label="Expired" value={data.expiredCount} color="#ef4444" />}
          {data.expiringCount > 0 && <StatChip label="Expiring" value={data.expiringCount} color="#f59e0b" />}
          {products.length === 0 && <StatChip label="Expiring" value={0} color="#22c55e" />}
        </div>

        {products.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Food Expiry</div>
            {products.map((p, i) => <ProductRow key={i} p={p} />)}
          </div>
        )}

        {chores.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Chores
              {data.overdueChores > 0 && (
                <span style={{ marginLeft: 6, color: '#f59e0b' }}>{data.overdueChores} overdue</span>
              )}
            </div>
            {chores.slice(0, 8).map((c, i) => <ChoreRow key={i} chore={c} />)}
          </div>
        )}
      </div>

      {/* Right col — tasks + shopping */}
      <div style={{ flex: 1, padding: '12px 14px', overflowY: 'auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tasks.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Tasks
              {data.pendingTasks > 0 && (
                <span style={{ marginLeft: 6, color: tasks.some(t => t.isOverdue) ? '#ef4444' : '#888' }}>{data.pendingTasks} pending</span>
              )}
            </div>
            {tasks.slice(0, 10).map((t, i) => <TaskRow key={i} task={t} />)}
          </div>
        )}

        {shopping.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Shopping List <span style={{ color: '#888', textTransform: 'none', letterSpacing: 0 }}>({shopping.length})</span>
            </div>
            {shopping.slice(0, 20).map((item, i) => <ShoppingRow key={i} item={item} />)}
          </div>
        )}

        {tasks.length === 0 && shopping.length === 0 && (
          <div style={{ color: '#555', fontSize: 13, marginTop: 8 }}>No pending tasks or shopping items.</div>
        )}
      </div>
    </div>
  )
}
