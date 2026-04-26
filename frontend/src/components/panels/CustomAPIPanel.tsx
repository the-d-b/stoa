import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface CustomAPIField { label: string; value: unknown; format?: string }
interface CustomAPIData { fields: CustomAPIField[] }

function fmtValue(v: unknown, format?: string): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v)))) {
    const n = Number(v)
    switch (format) {
      case 'integer':  return Math.round(n).toString()
      case 'currency': return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      case 'text':     return String(v)
      default:         return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2)
    }
  }
  return String(v)
}

export default function CustomAPIPanel({ panel }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<CustomAPIData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const refreshSecs = config.refreshSecs || 600

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setData(res.data); setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  useEffect(() => {
    load()
    const interval = setInterval(load, refreshSecs * 1000)
    return () => clearInterval(interval)
  }, [load, refreshSecs])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error)   return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data)   return null

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexWrap: 'wrap', gap: 6, alignContent: 'center' }}>
      {(data.fields || []).map((f, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 12 }}>
          <span style={{ color: 'var(--text-dim)' }}>{f.label}</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600,
            color: 'var(--text)' }}>{fmtValue(f.value, f.format)}</span>
        </div>
      ))}
    </div>
  )
}
