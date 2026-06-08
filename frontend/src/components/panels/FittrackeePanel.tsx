import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface FittrackeeWorkout {
  id: string
  sportId: number
  sportLabel: string
  title: string
  workoutDate: string
  distance: number
  duration: string
  aveSpeed: number
  ascent: number
}

interface FittrackeeData {
  uiUrl: string
  nbWorkouts: number
  nbSports: number
  totalDistance: number
  totalDuration: string
  totalAscent: number
  workouts: FittrackeeWorkout[]
}

const SPORT_EMOJI: Record<string, string> = {
  'Running':              '🏃',
  'Cycling (Sport)':     '🚴',
  'Cycling (Transport)': '🚲',
  'Hiking':              '🥾',
  'Mountain Biking':     '🚵',
  'Walking':             '🚶',
  'Trail':               '🏔️',
  'Swimming':            '🏊',
  'Rowing':              '🚣',
  'Skiing':              '⛷️',
  'Snowboard':           '🏂',
}

function sportEmoji(label: string) {
  return SPORT_EMOJI[label] ?? '🏅'
}

function fmtDist(km: number | null | undefined) {
  if (!km) return ''
  return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`
}

function fmtDuration(dur: string | null | undefined) {
  if (!dur) return ''
  // "H:MM:SS" or "HH:MM:SS" — trim to H:MM
  const parts = dur.split(':')
  if (parts.length >= 2) {
    const h = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }
  return dur
}

function fmtDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fmtTotalDist(km: number) {
  if (!km) return '0 km'
  if (km >= 1000) return `${(km / 1000).toFixed(1)}k km`
  return `${Math.round(km)} km`
}

function WorkoutRow({ w, uiUrl }: { w: FittrackeeWorkout; uiUrl: string }) {
  const href = uiUrl ? `${uiUrl.replace(/\/$/, '')}/workouts/${w.id}` : undefined
  const title = w.title || w.sportLabel
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0',
      borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ fontSize: 13, flexShrink: 0 }}>{sportEmoji(w.sportLabel)}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {href
          ? <a href={href} target="_blank" rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}>{title}</a>
          : <span style={{ fontWeight: 500 }}>{title}</span>
        }
        {w.distance > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 5 }}>
            {fmtDist(w.distance)}
          </span>
        )}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
        flexShrink: 0, gap: 1 }}>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
          {fmtDuration(w.duration)}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
          {fmtDate(w.workoutDate)}
        </span>
      </div>
    </div>
  )
}

export default function FittrackeePanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<FittrackeeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await integrationsApi.getPanelData(panel.id)
      setData(r.data)
      setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>Loading...</div>
  if (error)   return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>🏃 {error}</div>
  if (!data)   return null

  const workouts = data.workouts ?? []

  // ── 1x ───────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) return (
    <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 12,
      height: '100%', overflow: 'hidden' }}>
      <span style={{ fontSize: 18 }}>🏃</span>
      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
        <strong style={{ color: 'var(--text)' }}>{data.nbWorkouts}</strong> workouts
      </span>
      {data.totalDistance > 0 && (
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>{fmtTotalDist(data.totalDistance)}</strong>
        </span>
      )}
    </div>
  )

  // ── 2x-3x ────────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>{data.nbWorkouts}</strong> workouts
        </span>
        {data.totalDistance > 0 && (
          <span style={{ color: 'var(--text-dim)' }}>
            <strong style={{ color: 'var(--text)' }}>{fmtTotalDist(data.totalDistance)}</strong> total
          </span>
        )}
        {data.nbSports > 0 && (
          <span style={{ color: 'var(--text-dim)' }}>
            <strong style={{ color: 'var(--text)' }}>{data.nbSports}</strong> sports
          </span>
        )}
      </div>
      {workouts.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {workouts.map((w, i) => <WorkoutRow key={i} w={w} uiUrl={data.uiUrl} />)}
        </div>
      )}
    </div>
  )

  // ── 4x+ ──────────────────────────────────────────────────────────────────────
  const chips = [
    { label: 'Workouts', value: data.nbWorkouts.toString() },
    ...(data.totalDistance > 0 ? [{ label: 'Distance', value: fmtTotalDist(data.totalDistance) }] : []),
    ...(data.totalDuration ? [{ label: 'Time', value: fmtDuration(data.totalDuration) }] : []),
    ...(data.totalAscent > 0 ? [{ label: 'Ascent', value: `${Math.round(data.totalAscent)} m` }] : []),
    ...(data.nbSports > 0 ? [{ label: 'Sports', value: data.nbSports.toString() }] : []),
  ]

  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
        {chips.map(c => (
          <div key={c.label} style={{ background: 'var(--surface2)', borderRadius: 6,
            padding: '3px 8px', fontSize: 11 }}>
            <span style={{ color: 'var(--text-dim)' }}>{c.label} </span>
            <strong style={{ color: 'var(--text)' }}>{c.value}</strong>
          </div>
        ))}
      </div>
      {workouts.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>Recent workouts</div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {workouts.map((w, i) => <WorkoutRow key={i} w={w} uiUrl={data.uiUrl} />)}
          </div>
        </div>
      )}
    </div>
  )
}
