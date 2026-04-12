import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface RadarrMovie {
  id: number; title: string; titleSlug: string; year: number
  digitalRelease?: string; physicalRelease?: string
  hasFile: boolean; date?: string
}
interface RadarrData {
  uiUrl: string
  history: RadarrMovie[]; missing: RadarrMovie[]
  missingCount: number; movieCount: number; onDiskCount: number
}

function formatDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const linkStyle: React.CSSProperties = { color: 'inherit', textDecoration: 'none', fontWeight: 500 }
const linkHover = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.textDecoration = 'underline' }
const linkOut  = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.textDecoration = 'none' }

function MovieLink({ uiUrl, titleSlug, title, year }: { uiUrl: string; titleSlug: string; title: string; year?: number }) {
  const href = uiUrl && titleSlug
    ? `${uiUrl}/movie/${titleSlug}`
    : `https://www.imdb.com/search/title/?title=${encodeURIComponent(title)}`
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={linkStyle} onMouseOver={linkHover} onMouseOut={linkOut}>
      {title}{year ? <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 5 }}>{year}</span> : null}
    </a>
  )
}

export default function RadarrPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<RadarrData | null>(null)
  const [missingSample, setMissingSample] = useState<RadarrMovie[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const SAMPLE_SIZE = 8

  const resample = (missing: RadarrMovie[]) => {
    const shuffled = [...missing].sort(() => Math.random() - 0.5)
    setMissingSample(shuffled.slice(0, SAMPLE_SIZE))
  }

  const config = (() => { try { return JSON.parse(panel.config || '{}') } catch { return {} } })()
  const refreshSecs = config.refreshSecs || 300

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setData(res.data)
      resample(res.data.missing || [])
      setError('')
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

  const uiUrl = data.uiUrl || ''

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 4, marginTop: 10 }}>{text}</div>
  )

  const statsBar = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {[
        { label: 'Movies',  value: data.movieCount },
        { label: 'On disk', value: data.onDiskCount },
        { label: 'Missing', value: data.missingCount || (data.missing || []).length },
      ].map(s => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 5, background: 'var(--surface2)',
          border: '1px solid var(--border)', fontSize: 11 }}>
          <span style={{ color: 'var(--text-dim)' }}>{s.label}</span>
          <span style={{ fontWeight: 600, fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{s.value}</span>
        </div>
      ))}
    </div>
  )

  const HistoryRow = ({ m }: { m: RadarrMovie }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8,
      padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <MovieLink uiUrl={uiUrl} titleSlug={m.titleSlug} title={m.title} year={m.year} />
      </span>
      {m.date && (
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, fontFamily: 'DM Mono, monospace' }}>
          {formatDate(m.date)}
        </span>
      )}
      <span style={{ fontSize: 9, color: 'var(--green)', flexShrink: 0 }}>✓</span>
    </div>
  )

  const MissingRow = ({ m }: { m: RadarrMovie }) => {
    const digital = m.digitalRelease
    const physical = m.physicalRelease
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8,
        padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <MovieLink uiUrl={uiUrl} titleSlug={m.titleSlug} title={m.title} year={m.year} />
        </span>
        <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {digital && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}
              title="Digital release">
              D {formatDate(digital)}
            </span>
          )}
          {physical && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}
              title="Physical release">
              P {formatDate(physical)}
            </span>
          )}
        </span>
      </div>
    )
  }

  if (heightUnits <= 1) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {statsBar}
    </div>
  )

  // 2x — history only, no missing (not enough room)
  if (heightUnits < 4) return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>{statsBar}</div>
      {sectionTitle('Recently downloaded')}
      {(data.history || []).length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent downloads</div>
        : (data.history || []).slice(0, 5).map((m, i) => <HistoryRow key={i} m={m} />)
      }
    </div>
  )

  // 4x — history + missing sample
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>{statsBar}</div>
      {sectionTitle('Recently downloaded')}
      {(data.history || []).length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No recent downloads</div>
        : (data.history || []).map((m, i) => <HistoryRow key={i} m={m} />)
      }
      {(data.missingCount || 0) > 0 && (
        <>
          {sectionTitle(`Missing — ${data.missingCount} total`)}
          {missingSample.map((m, i) => <MissingRow key={i} m={m} />)}
        </>
      )}
    </div>
  )
}
