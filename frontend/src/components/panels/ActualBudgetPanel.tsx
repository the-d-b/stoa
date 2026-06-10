import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

interface ABCategory {
  id: string
  name: string
  budgeted: number
  spent: number
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

interface ABBudget {
  uiUrl: string
  integrationId: string
  budgetId: string
  budgetName: string
  month: string
  income: number
  spent: number
  balance: number
  categoryGroups: ABCategoryGroup[]
  accounts: ABAccount[]
}

interface ABData {
  budgets: ABBudget[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(cents: number): string {
  const abs = Math.abs(cents)
  const dollars = abs / 100
  const sign = cents < 0 ? '-' : ''
  if (dollars >= 1_000_000) return `${sign}$${(dollars / 1_000_000).toFixed(1)}M`
  if (dollars >= 10_000)    return `${sign}$${(dollars / 1_000).toFixed(1)}k`
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
  return new Date(parseInt(year), parseInt(month) - 1, 1)
    .toLocaleString(undefined, { month: 'long', year: 'numeric' })
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

function SummaryChip({ label, cents, invert = false, small = false }: {
  label: string; cents: number; invert?: boolean; small?: boolean
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: small ? '2px 7px' : '5px 12px', borderRadius: 6,
      background: 'var(--surface2)', border: '1px solid var(--border)',
      minWidth: small ? 52 : 72,
    }}>
      <div style={{ fontSize: small ? 8 : 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.2 }}>
        {label}
      </div>
      <div style={{ fontSize: small ? 10 : 13, fontWeight: 600, fontFamily: 'DM Mono, monospace', color: moneyColor(cents, invert), lineHeight: 1.3 }}>
        {fmtMoney(cents)}
      </div>
    </div>
  )
}

function SpendBar({ group }: { group: ABCategoryGroup }) {
  const pct = group.budgeted > 0 ? Math.min(Math.abs(group.spent) / group.budgeted, 1) : 0
  const over = group.budgeted > 0 && Math.abs(group.spent) > group.budgeted
  return (
    <div style={{ minWidth: 0 }}>
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
  )
}


function AccountRow({ account }: { account: ABAccount }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <div style={{ flex: 1, fontSize: 11, color: account.offBudget ? 'var(--text-dim)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {account.name}
      </div>
      {account.offBudget && <span style={{ fontSize: 9, color: 'var(--text-dim)', flexShrink: 0 }}>off</span>}
      <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: moneyColor(account.balance), flexShrink: 0 }}>
        {fmtMoney(account.balance)}
      </div>
    </div>
  )
}

function AssetDonut({ accounts }: { accounts: ABAccount[] }) {
  const assets      = accounts.reduce((s, a) => s + Math.max(0,  a.balance), 0)
  const liabilities = accounts.reduce((s, a) => s + Math.max(0, -a.balance), 0)
  const total = assets + liabilities
  if (total === 0) return null

  const r    = 36
  const circ = 2 * Math.PI * r
  const assetArc = (assets / total) * circ
  const liabArc  = (liabilities / total) * circ
  const net  = assets - liabilities

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: 96, height: 96 }}>
        <svg width={96} height={96} viewBox="0 0 100 100">
          {/* track */}
          <circle cx={50} cy={50} r={r} fill="none" stroke="var(--surface2)" strokeWidth={14} />
          {/* assets */}
          {assets > 0 && (
            <circle cx={50} cy={50} r={r} fill="none" stroke="#4ade80" strokeWidth={14}
              strokeDasharray={`${assetArc} ${circ}`}
              strokeDashoffset={0}
              transform="rotate(-90 50 50)" />
          )}
          {/* liabilities */}
          {liabilities > 0 && (
            <circle cx={50} cy={50} r={r} fill="none" stroke="#e53e3e" strokeWidth={14}
              strokeDasharray={`${liabArc} ${circ}`}
              strokeDashoffset={`${-assetArc}`}
              transform="rotate(-90 50 50)" />
          )}
        </svg>
        {/* center label — positioned div avoids SVG font quirks */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 8, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.03em', lineHeight: 1.2 }}>Net</div>
          <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: moneyColor(net), lineHeight: 1.2 }}>
            {fmtMoney(net)}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--text-dim)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
          {fmtMoney(assets)}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#e53e3e', flexShrink: 0 }} />
          {fmtMoney(liabilities)}
        </span>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ActualBudgetPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData]           = useState<ABData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string>('')

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId: string   = config.integrationId || ''
  const defaultBudget: string = config.budgetId || ''

  useEffect(() => {
    if (!integrationId) { setLoading(false); return }
    integrationsApi.getPanelData(panel.id)
      .then(res => {
        const d: ABData = res.data
        setData(d)
        const matched = defaultBudget
          ? d.budgets.find(b => b.budgetId === defaultBudget || b.budgetName === defaultBudget)
          : null
        setSelectedId(matched ? matched.budgetId : (d.budgets[0]?.budgetId ?? ''))
        setLoading(false)
      })
      .catch(e => { setError(e.response?.data?.error || e.message || 'Failed to load'); setLoading(false) })
  }, [panel.id, integrationId])

  const sseData = useSSE<ABData>(integrationId)
  useEffect(() => {
    if (!sseData) return
    if (!sseData.budgets.some(b => b.budgetId === selectedId)) {
      setSelectedId(sseData.budgets[0]?.budgetId ?? '')
    }
    setData(sseData)
    setLoading(false)
  }, [sseData])

  const wrap = (children: React.ReactNode) => (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '10px 14px', boxSizing: 'border-box', overflow: 'hidden' }}>
      {children}
    </div>
  )

  if (!integrationId) return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No integration configured.</div>)
  if (loading)        return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>)
  if (error)          return wrap(<div style={{ color: '#e53e3e', fontSize: 13 }}>{error}</div>)
  if (!data || data.budgets.length === 0) return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No data.</div>)

  const budget          = data.budgets.find(b => b.budgetId === selectedId) ?? data.budgets[0]
  const onBudget        = budget.accounts.filter(a => !a.offBudget)
  const offBudget       = budget.accounts.filter(a =>  a.offBudget)
  const netWorth        = budget.accounts.reduce((s, a) => s + a.balance, 0)
  const multibudget     = data.budgets.length > 1

  // Budget selector pills — shared across all heights
  const Pills = ({ small = false, center = false }: { small?: boolean; center?: boolean }) => multibudget ? (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: small ? 5 : 8, justifyContent: center ? 'center' : undefined }}>
      {data.budgets.map(b => {
        const active = b.budgetId === budget.budgetId
        return (
          <button key={b.budgetId} onClick={() => setSelectedId(b.budgetId)} type="button" style={{
            padding: small ? '1px 6px' : '2px 10px',
            borderRadius: 5, fontSize: small ? 9 : 11, cursor: 'pointer',
            background: active ? 'var(--accent-bg)' : 'var(--surface2)',
            border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
            color: active ? 'var(--accent2)' : 'var(--text-dim)',
            fontWeight: active ? 600 : 400,
          }}>
            {b.budgetName || b.budgetId}
          </button>
        )
      })}
    </div>
  ) : null

  // ── 1× — maximally compact: pills + four chips, no month label ───────────
  if (heightUnits <= 1) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4px 10px', boxSizing: 'border-box', overflow: 'hidden', gap: 4 }}>
        <Pills small />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
          <SummaryChip small label="Income"    cents={budget.income} />
          <SummaryChip small label="Spent"     cents={Math.abs(budget.spent)} invert />
          <SummaryChip small label="Balance"   cents={budget.balance} />
          {budget.accounts.length > 0 && <SummaryChip small label="Net Worth" cents={netWorth} />}
        </div>
      </div>
    )
  }

  // ── 2–3× — centered pills + month + three chips + net worth alone ────────
  if (heightUnits <= 3) {
    return wrap(
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Pills center />
        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{monthLabel(budget.month)}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <SummaryChip label="Income"  cents={budget.income} />
          <SummaryChip label="Spent"   cents={Math.abs(budget.spent)} invert />
          <SummaryChip label="Balance" cents={budget.balance} />
        </div>
        {budget.accounts.length > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Worth</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: moneyColor(netWorth) }}>
              {fmtMoney(netWorth)}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── 4×+ — stacked vertical layout, all centered ──────────────────────────
  return wrap(
    <>
      <Pills center />

      {/* Stats — centered column */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{monthLabel(budget.month)}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <SummaryChip label="Income"  cents={budget.income} />
          <SummaryChip label="Spent"   cents={Math.abs(budget.spent)} invert />
          <SummaryChip label="Balance" cents={budget.balance} />
        </div>
        {budget.accounts.length > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Worth</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: moneyColor(netWorth) }}>
              {fmtMoney(netWorth)}
            </div>
          </div>
        )}
      </div>

      {/* Stacked body — scrollable, all sections centered */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>

        {/* Accounts */}
        {budget.accounts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: 440 }}>
              {onBudget.length > 0 && (
                <>
                  <ColHeader>Accounts</ColHeader>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {onBudget.map(a => <AccountRow key={a.id} account={a} />)}
                  </div>
                </>
              )}
              {offBudget.length > 0 && (
                <div style={{ marginTop: onBudget.length > 0 ? 10 : 0 }}>
                  <ColHeader>Off-Budget</ColHeader>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {offBudget.map(a => <AccountRow key={a.id} account={a} />)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Budget Groups */}
        {budget.categoryGroups.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: 440 }}>
              <ColHeader>Budget Groups</ColHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {budget.categoryGroups.map(g => <SpendBar key={g.id} group={g} />)}
              </div>
            </div>
          </div>
        )}

        {/* Asset / Liability donut */}
        {budget.accounts.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 4 }}>
            <AssetDonut accounts={budget.accounts} />
          </div>
        )}

      </div>
    </>
  )
}
