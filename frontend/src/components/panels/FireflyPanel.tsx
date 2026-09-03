import { useState, useEffect, useCallback, useRef } from 'react'
import { integrationsApi, Panel } from '../../api'
import { useSSE } from '../../hooks/useSSE'

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
  month: string
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
  if (key === 'spent' || key === 'bills-unpaid') return n < 0 ? 'var(--red)' : 'var(--green)'
  if (key === 'earned' || key === 'net-worth' || key === 'balance' || key === 'left-to-spend') {
    return n >= 0 ? 'var(--green)' : 'var(--red)'
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
  'balance': 'Balance',
}

// The compact tile set shown at 1x/2x+ headers — kept small on purpose,
// per spec net worth is NOT one of these (it's shown separately, added at 2x).
const TILE_KEYS = ['earned', 'spent', 'left-to-spend', 'balance']

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

function SummaryChip({ item, small = false }: { item: FireflySummaryItem; small?: boolean }) {
  const label = KEY_LABELS[item.key] || item.title || item.key
  const display = item.valueParsed || fmtBalance(item.value, item.currencySymbol)
  const color = balanceColor(item.value, item.key)
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: small ? '2px 7px' : '5px 12px', borderRadius: 6,
      background: 'var(--surface2)', border: '1px solid var(--border)',
      minWidth: small ? 52 : 72,
    }}>
      <div style={{ fontSize: small ? 8 : 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.2, textAlign: 'center' }}>
        {label}
      </div>
      <div style={{ fontSize: small ? 10 : 13, fontWeight: 600, fontFamily: 'DM Mono, monospace', color, lineHeight: 1.3 }}>
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
  const [monthOffset, setMonthOffset] = useState(0)
  const [data, setData] = useState<FireflyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId: string = config.integrationId || ''

  const load = useCallback(async () => {
    if (!integrationId) { setLoading(false); return }
    try {
      const res = await integrationsApi.getPanelData(panel.id, { month: monthOffset })
      setData(res.data)
      setError(null)
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id, integrationId, monthOffset])

  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => { load() }, [load])

  // Mirrors PiHolePanel/FittrackeePanel's pattern: a background SSE broadcast
  // reflects the integration's default (current month) fetch, not necessarily
  // whatever month this panel has navigated to — so on any SSE signal,
  // re-fetch live with the current monthOffset instead of applying the
  // broadcast payload directly.
  const sseData = useSSE<FireflyData>(integrationId)
  useEffect(() => { if (sseData !== null) loadRef.current() }, [sseData])

  const wrap = (children: React.ReactNode) => (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '10px 14px', boxSizing: 'border-box', overflow: 'hidden' }}>
      {children}
    </div>
  )

  if (!integrationId) return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No integration configured.</div>)
  if (loading) return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>)
  if (error) return wrap(<div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>)
  if (!data) return wrap(<div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No data.</div>)

  const netWorth = data.summary.find(s => s.key === 'net-worth')
  const tiles = TILE_KEYS.map(k => data.summary.find(s => s.key === k)).filter((s): s is FireflySummaryItem => !!s)
  // "This Month" body list at 4x+ shows detail the tiles don't already cover
  // (bills paid/unpaid) rather than repeating earned/spent/left-to-spend/balance.
  const extraSummary = data.summary.filter(s => s.key !== 'net-worth' && !TILE_KEYS.includes(s.key))

  // ── 1× — data tiles only, no net worth ────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 10px', boxSizing: 'border-box', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
          {tiles.map(item => <SummaryChip key={item.key} item={item} small />)}
        </div>
      </div>
    )
  }

  // ── 2–3× — tiles + net worth, centered ────────────────────────────────────
  if (heightUnits <= 3) {
    return wrap(
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {tiles.map(item => <SummaryChip key={item.key} item={item} />)}
        </div>
        {netWorth && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Worth</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: balanceColor(netWorth.value, 'net-worth') }}>
              {netWorth.valueParsed || fmtBalance(netWorth.value, netWorth.currencySymbol)}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── 4×+ — tiles + net worth header, accounts + this month body ───────────
  return wrap(
    <>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setMonthOffset(m => m - 1)} title="Previous month" style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)',
            fontSize: 13, padding: '0 4px', lineHeight: 1,
          }}>‹</button>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', minWidth: 90, textAlign: 'center' }}>
            {monthLabel(data.month)}
          </div>
          <button onClick={() => setMonthOffset(m => Math.min(0, m + 1))} disabled={monthOffset === 0}
            title="Next month" style={{
              background: 'none', border: 'none', cursor: monthOffset === 0 ? 'default' : 'pointer',
              color: monthOffset === 0 ? 'var(--border)' : 'var(--text-dim)',
              fontSize: 13, padding: '0 4px', lineHeight: 1,
            }}>›</button>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {tiles.map(item => <SummaryChip key={item.key} item={item} />)}
        </div>
        {netWorth && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Worth</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: balanceColor(netWorth.value, 'net-worth') }}>
              {netWorth.valueParsed || fmtBalance(netWorth.value, netWorth.currencySymbol)}
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>

        {/* Accounts */}
        {data.accounts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: 440 }}>
              <ColHeader>Accounts</ColHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {data.accounts.map(a => <AccountRow key={a.id} account={a} />)}
              </div>
            </div>
          </div>
        )}

        {/* This Month — bills paid/unpaid, the detail not already in the tiles above */}
        {extraSummary.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: 440 }}>
              <ColHeader>This Month</ColHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {extraSummary.map(item => <SummaryRow key={item.key} item={item} />)}
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  )
}
