import { useState, useEffect } from 'react'
import { integrationsApi } from '../../api'
import { useSSE } from '../../hooks/useSSE'
import AuthCoverStrip from './AuthCoverStrip'

interface HomeboxLocation {
  id: string
  name: string
  itemCount: number
  link?: string
}

interface HomeboxPhoto {
  id: string
  name: string
  thumbUrl: string
  link?: string
}

interface HomeboxData {
  totalItems: number
  totalLocations: number
  totalLabels: number
  totalWithWarranty: number
  totalItemPrice: number
  locations: HomeboxLocation[]
  tags: HomeboxLocation[]
  photos: HomeboxPhoto[]
}

function fmtCurrency(v: number) {
  if (!v) return '$0'
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`
  return `$${v.toFixed(0)}`
}

function LocationBar({ loc, maxCount }: { loc: HomeboxLocation; maxCount: number }) {
  const pct = maxCount > 0 ? Math.round((loc.itemCount / maxCount) * 100) : 0
  const nameStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text)', width: 130, flexShrink: 0,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      {loc.link
        ? <a href={loc.link} target="_blank" rel="noopener noreferrer"
            style={{ ...nameStyle, color: 'var(--text)', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>{loc.name}</a>
        : <span style={nameStyle}>{loc.name}</span>
      }
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--surface2)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)',
          borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0,
        width: 24, textAlign: 'right' }}>
        {loc.itemCount}
      </span>
    </div>
  )
}

function LocationRow({ loc }: { loc: HomeboxLocation }) {
  const nameStyle: React.CSSProperties = { flex: 1, fontSize: 12, color: 'var(--text)', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
      borderBottom: '1px solid var(--border)' }}>
      {loc.link
        ? <a href={loc.link} target="_blank" rel="noopener noreferrer"
            style={{ ...nameStyle, textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>{loc.name}</a>
        : <span style={nameStyle}>{loc.name}</span>
      }
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>
        {loc.itemCount}
      </span>
    </div>
  )
}

export default function HomeboxPanel({ panel, heightUnits }: { panel: any; heightUnits: number }) {
  const [data, setData] = useState<HomeboxData | null>(null)
  const [err, setErr] = useState('')

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const integrationId: string | undefined = config.integrationId

  useEffect(() => {
    integrationsApi.getPanelData(panel.id)
      .then((r: any) => setData(r.data))
      .catch(() => setErr('Failed to load'))
  }, [panel.id])

  const sseData = useSSE<HomeboxData>(integrationId)
  useEffect(() => { if (sseData !== null) setData(sseData) }, [sseData])

  if (err) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>{err}</div>
  if (!data) return <div style={{ padding: 16 }}><span className="spinner" /></div>

  const locations = data.locations || []
  const tags = data.tags || []
  const photos = data.photos || []
  const maxCount = locations.length > 0 ? Math.max(...locations.map(l => l.itemCount)) : 1
  const maxTagCount = tags.length > 0 ? Math.max(...tags.map(t => t.itemCount)) : 1

  // ── 1x ──────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', height: '100%' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', flexShrink: 0 }}>Homebox</span>
        <span style={{ fontSize: 12, color: 'var(--text)' }}>
          <b>{data.totalItems.toLocaleString()}</b>
          <span style={{ color: 'var(--text-muted)' }}> items</span>
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{data.totalLocations} locations</span>
        {data.totalItemPrice > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtCurrency(data.totalItemPrice)} value</span>
        )}
        {data.totalWithWarranty > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{data.totalWithWarranty} warranted</span>
        )}
      </div>
    )
  }

  // ── 2-3x ────────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
        padding: '10px 12px', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Homebox</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {data.totalItems.toLocaleString()} items · {data.totalLocations} locations
            {data.totalItemPrice > 0 ? ` · ${fmtCurrency(data.totalItemPrice)}` : ''}
            {data.totalWithWarranty > 0 ? ` · ${data.totalWithWarranty} warranted` : ''}
          </span>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {locations.map(l => <LocationRow key={l.id} loc={l} />)}
        </div>
      </div>
    )
  }

  // ── 4x+ ─────────────────────────────────────────────────────────────────────
  const statChips = [
    { label: 'Items', value: data.totalItems.toLocaleString() },
    { label: 'Locations', value: data.totalLocations.toString() },
    ...(data.totalItemPrice > 0 ? [{ label: 'Value', value: fmtCurrency(data.totalItemPrice) }] : []),
    ...(data.totalWithWarranty > 0 ? [{ label: 'Warranted', value: data.totalWithWarranty.toString() }] : []),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
      padding: '12px 14px', gap: 10 }}>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {statChips.map(s => (
          <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 7,
            padding: '5px 12px', textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Location + tag breakdown */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
          textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
          By Location
        </div>
        {locations.length === 0
          ? <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No locations configured</div>
          : locations.map(l => <LocationBar key={l.id} loc={l} maxCount={maxCount} />)
        }

        {tags.length > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
              textTransform: 'uppercase', letterSpacing: '0.07em', margin: '12px 0 6px' }}>
              By Tag
            </div>
            {tags.map(t => <LocationBar key={t.id} loc={t} maxCount={maxTagCount} />)}
          </>
        )}
      </div>

      {/* Photos */}
      {photos.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
            textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
            Photos
          </div>
          <AuthCoverStrip items={photos.map(p => ({ coverUrl: p.thumbUrl, title: p.name, linkUrl: p.link }))} height={56} />
        </div>
      )}
    </div>
  )
}
