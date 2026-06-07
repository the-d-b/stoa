import { useState, useEffect } from 'react'
import { integrationsApi, Panel } from '../../api'

interface FireflySummaryItem {
  key: string
  title: string
  value: string
  valueParsed: string
  currencyCode: string
  currencySymbol: string
  icon: string
}

interface FireflyAccount {
  id: string
  name: string
  type: string
  balance: string
  currencyCode: string
  currencySymbol: string
  active: boolean
}

interface FireflyData {
  uiUrl: string
  integrationId: string
  version: string
  apiVersion: string
  summary: FireflySummaryItem[]
  accounts: FireflyAccount[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBalance(raw: string, symbol: string): string {
  const n = parseFloat(raw)
  if (isNaN(n)) return raw
  const abs = Math.abs(n)
  let formatted: string
  if (abs >= 1_000_000) formatted = `${(n / 1_000_000).toFixed(2)}M`
  else if (abs >= 10_000) formatted = `${(n / 1_000).toFixed(1)}k`
  else formatted = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return symbol ? `${symbol}${formatted}` : formatted
}

function balanceColor(raw: string, key?: string): string {
  const n = parseFloat(raw)
  if (isNaN(n)) return 'var(--text)'
  if (key === 'spent' || key === 'bills-unpaid') return n < 0 ? '#e53e3e' : '#4ade80'
  if (key === 'earned' || key === 'net-worth' || key === 'net-savings' || key === 'left-to-spend') {
    return n >= 0 ? '#4ade80' : '#e53e3e'
  }
  return 'var(--text)'
}

const KEY_LABELS: Record<string, string> = {
  'net-worth': 'Net Worth',
  'earned': 'Earned',
  'spent': 'Spent',
  'bills-paid': 'Bills Paid',
  'bills-unpaid': 'Bills Unpaid',
  'left-to-spend': 'Left to Spend',
  'net-savings': 'Net Savings',
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

function SummaryChip({ item }: { item: FireflySummaryItem }) {
  const label = KEY_LABELS[item.key] || item.title || item.key
  const display = item.valueParsed || fmtBalance(item.value, item.currencySymbol)
  const color = balanceColor(item.value, item.key)
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '5px 10px', borderRadius: 8,
      background: 'var(--surface2)', border: '1px solid var(--border)', minWidth: 72,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2, textAlign: 'center' }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'DM Mono, monospace', color }}>
        {display}
      </div>
    </div>
  )
}

function SummaryRow({ item }: { item: FireflySummaryItem }) {
  const label = KEY_LABELS[item.key] || item.title || item.key
  const display = item.valueParsed || fmtBalance(item.value, item.currencySymbol)
  const color = balanceColor(item.value, item.key)
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color, textAlign: 'right',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {display}
      </span>
    </div>
  )
}

function AccountRow({ account }: { account: FireflyAccount }) {
  const color = balanceColor(account.balance)
  const display = fmtBalance(account.balance, account.currencySymbol)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <div style={{ flex: 1, fontSize: 11, color: 'var(--text)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {account.name}
      </div>
      <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color, flexShrink: 0 }}>
        {display}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function FireflyPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<FireflyData | null>(null)
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

  const netWorth = data.summary.find(s => s.key === 'net-worth')
  const topSummary = data.summary.filter(s => ['net-worth', 'earned', 'spent', 'left-to-spend'].includes(s.key))
  const restSummary = data.summary.filter(s => !['net-worth', 'earned', 'spent', 'left-to-spend'].includes(s.key))

  // ── 1× ───────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return wrap(
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {topSummary.map(item => <SummaryChip key={item.key} item={item} />)}
      </div>
    )
  }

  // ── 2–3× ─────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return wrap(
      <>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {topSummary.map(item => <SummaryChip key={item.key} item={item} />)}
        </div>
        <div style={{ flex: 1, display: 'flex', gap: 14, overflow: 'hidden', minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden' }}>
            <ColHeader>This Month</ColHeader>
            {restSummary.map(item => <SummaryRow key={item.key} item={item} />)}
          </div>
          {data.accounts.length > 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden' }}>
              <ColHeader>Accounts</ColHeader>
              {data.accounts.slice(0, 6).map(a => <AccountRow key={a.id} account={a} />)}
            </div>
          )}
        </div>
      </>
    )
  }

  // ── 4×+ — three columns ───────────────────────────────────────────────────
  return wrap(
    <>
      {netWorth && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Worth</div>
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: balanceColor(netWorth.value, 'net-worth') }}>
            {netWorth.valueParsed || fmtBalance(netWorth.value, netWorth.currencySymbol)}
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', gap: 16, overflow: 'hidden', minHeight: 0 }}>

        {/* Col 1 — Monthly summary */}
        <div style={{ width: 180, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ColHeader>This Month</ColHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {data.summary.filter(s => s.key !== 'net-worth').map(item => (
              <SummaryRow key={item.key} item={item} />
            ))}
          </div>
        </div>

        {/* Col 2 — Accounts */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ColHeader>Asset Accounts</ColHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
            {data.accounts.map(a => <AccountRow key={a.id} account={a} />)}
          </div>
        </div>

        {/* Col 3 — Server info */}
        {data.version && (
          <div style={{ width: 140, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <ColHeader>About</ColHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {data.version && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 50, flexShrink: 0 }}>Version</span>
                  <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{data.version}</span>
                </div>
              )}
              {data.apiVersion && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 50, flexShrink: 0 }}>API</span>
                  <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{data.apiVersion}</span>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </>
  )
}
