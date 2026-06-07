import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

interface ABCategory {
  id: string
  name: string
  budgeted: number
  spent: number
  carryover: number
  balance: number
}

interface ABCategoryGroup {
  id: string
  name: string
  hidden: boolean
  budgeted: number
  spent: number
  balance: number
  categories: ABCategory[]
}

interface ABAccount {
  id: string
  name: string
  type: string
  offBudget: boolean
  balance: number
}

interface ABData {
  uiUrl: string
  integrationId: string
  budgetId: string
  month: string
  income: number
  spent: number
  balance: number
  categoryGroups: ABCategoryGroup[]
  accounts: ABAccount[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Amounts are in cents
function fmtMoney(cents: number): string {
  const abs = Math.abs(cents)
  const dollars = abs / 100
  const sign = cents < 0 ? '-' : ''
  if (dollars >= 1_000_000) return `${sign}$${(dollars / 1_000_000).toFixed(1)}M`
  if (dollars >= 10_000) return `${sign}$${(dollars / 1_000).toFixed(1)}k`
  return `${sign}$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function moneyColor(cents: number, invert = false): string {
  if (cents === 0) return 'var(--text)'
  const positive = cents > 0
  return (positive !== invert) ? '#4ade80' : '#e53e3e'
}

function monthLabel(ym: string): string {
  if (!ym) return ''
  const [year, month] = ym.split('-')
  const d = new Date(parseInt(year), parseInt(month) - 1, 1)
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ColHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.05em',
      marginBottom: 5, borderBottom: '1px solid var(--border)', paddingBottom: 3,
    }}>
      {children}
    </div>
  )
}

function SummaryChip({ label, cents, invert = false }: { label: string; cents: number; invert?: boolean }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '5px 12px', borderRadius: 8,
      background: 'var(--surface2)', border: '1px solid var(--border)', minWidth: 72,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'DM Mono, monospace', color: moneyColor(cents, invert) }}>
        {fmtMoney(cents)}
      </div>
    </div>
  )
}

function SpendBar({ group }: { group: ABCategoryGroup }) {
  const pct = group.budgeted > 0 ? Math.min(Math.abs(group.spent) / group.budgeted, 1) : 0
  const over = group.budgeted > 0 && Math.abs(group.spent) > group.budgeted
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
          <span style={{ fontSize: 10, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {group.name}
          </span>
          <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: over ? '#e53e3e' : 'var(--text-dim)', flexShrink: 0, marginLeft: 4 }}>
            {fmtMoney(Math.abs(group.spent))} / {fmtMoney(group.budgeted)}
          </span>
        </div>
        <div style={{ height: 4, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            width: `${pct * 100}%`, height: '100%', borderRadius: 2,
            background: over ? '#e53e3e' : pct > 0.85 ? '#f59e0b' : '#4ade80',
          }} />
        </div>
      </div>
    </div>
  )
}

function CategoryRow({ cat }: { cat: ABCategory }) {
  const pct = cat.budgeted > 0 ? Math.min(Math.abs(cat.spent) / cat.budgeted, 1) : 0
  const over = cat.budgeted > 0 && Math.abs(cat.spent) > cat.budgeted
  return (
    <div style={{ paddingLeft: 8, paddingTop: 2, paddingBottom: 2, borderLeft: '2px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cat.name}
        </span>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-dim)' }}>
            {fmtMoney(Math.abs(cat.spent))}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>/</span>
          <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-dim)' }}>
            {fmtMoney(cat.budgeted)}
          </span>
        </div>
      </div>
      {cat.budgeted > 0 && (
        <div style={{ height: 2, background: 'var(--surface2)', borderRadius: 1, marginTop: 2 }}>
          <div style={{
            width: `${pct * 100}%`, height: '100%', borderRadius: 1,
            background: over ? '#e53e3e' : pct > 0.85 ? '#f59e0b' : '#38bdf8',
          }} />
        </div>
      )}
    </div>
  )
}

function AccountRow({ account }: { account: ABAccount }) {
  const color = moneyColor(account.balance)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <div style={{ flex: 1, fontSize: 11, color: account.offBudget ? 'var(--text-dim)' : 'var(--text)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {account.name}
      </div>
      {account.offBudget && (
        <span style={{ fontSize: 9, color: 'var(--text-dim)', flexShrink: 0 }}>off</span>
      )}
      <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color, flexShrink: 0 }}>
        {fmtMoney(account.balance)}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ActualBudgetPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<ABData | null>(null)
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

  const wrap = (children: React.ReactNode) => (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '10px 14px', boxSizing: 'border-box', overflow: 'hidden' }}>
      {children}
    </div>
  )

  if (!integrationId) return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No integration configured.</div>)
  if (loading) return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>)
  if (error) return wrap(<div style={{ color: '#e53e3e', fontSize: 13 }}>{error}</div>)
  if (!data) return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No data.</div>)

  const onBudgetAccounts = data.accounts.filter(a => !a.offBudget)
  const offBudgetAccounts = data.accounts.filter(a => a.offBudget)
  const netWorth = data.accounts.reduce((s, a) => s + a.balance, 0)

  // ── 1× ───────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return wrap(
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <SummaryChip label="Income" cents={data.income} />
        <SummaryChip label="Spent" cents={Math.abs(data.spent)} invert />
        <SummaryChip label="Balance" cents={data.balance} />
        {data.accounts.length > 0 && <SummaryChip label="Net Worth" cents={netWorth} />}
      </div>
    )
  }

  // ── 2–3× ─────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return wrap(
      <>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 6 }}>{monthLabel(data.month)}</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <SummaryChip label="Income" cents={data.income} />
          <SummaryChip label="Spent" cents={Math.abs(data.spent)} invert />
          <SummaryChip label="Balance" cents={data.balance} />
        </div>
        <div style={{ flex: 1, display: 'flex', gap: 14, overflow: 'hidden', minHeight: 0 }}>
          <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
            <ColHeader>Budget</ColHeader>
            {data.categoryGroups.map(g => <SpendBar key={g.id} group={g} />)}
          </div>
          {data.accounts.length > 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden' }}>
              <ColHeader>Accounts</ColHeader>
              {data.accounts.slice(0, 8).map(a => <AccountRow key={a.id} account={a} />)}
            </div>
          )}
        </div>
      </>
    )
  }

  // ── 4×+ — three columns ───────────────────────────────────────────────────
  return wrap(
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Worth</div>
          <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: moneyColor(netWorth) }}>
            {fmtMoney(netWorth)}
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{monthLabel(data.month)}</div>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 16, overflow: 'hidden', minHeight: 0 }}>

        {/* Col 1 — Accounts */}
        <div style={{ width: 180, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {onBudgetAccounts.length > 0 && (
            <>
              <ColHeader>Accounts</ColHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden' }}>
                {onBudgetAccounts.map(a => <AccountRow key={a.id} account={a} />)}
              </div>
            </>
          )}
          {offBudgetAccounts.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <ColHeader>Off-Budget</ColHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden' }}>
                {offBudgetAccounts.map(a => <AccountRow key={a.id} account={a} />)}
              </div>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <ColHeader>Month</ColHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Income</span>
                <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#4ade80' }}>{fmtMoney(data.income)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Spent</span>
                <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#e53e3e' }}>{fmtMoney(Math.abs(data.spent))}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Balance</span>
                <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: moneyColor(data.balance) }}>{fmtMoney(data.balance)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Col 2 — Category group bars */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ColHeader>Budget Groups</ColHeader>
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.categoryGroups.map(g => <SpendBar key={g.id} group={g} />)}
          </div>
        </div>

        {/* Col 3 — Category detail */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ColHeader>Categories</ColHeader>
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.categoryGroups.map(g => (
              <div key={g.id}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{g.name}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {g.categories.map(c => <CategoryRow key={c.id} cat={c} />)}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </>
  )
}
