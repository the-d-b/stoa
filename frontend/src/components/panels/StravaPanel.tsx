import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface StravaActivity {
  name: string
  type: string
  date: string
  distance: number
  movingTime: number
  elevationGain: number
  averageSpeed: number
  kudosCount: number
  prCount: number
  averageHR: number
  hasHeartrate: boolean
}

interface StravaTotals {
  count: number
  distance: number
  movingTime: number
  elevationGain: number
}

interface StravaWeek {
  label: string
  runM: number
  rideM: number
  swimM: number
}

interface StravaData {
  athleteName: string
  profileUrl: string
  city: string
  country: string
  measurementPref: string
  recentRunTotals: StravaTotals
  recentRideTotals: StravaTotals
  recentSwimTotals: StravaTotals
  ytdRunTotals: StravaTotals
  ytdRideTotals: StravaTotals
  ytdSwimTotals: StravaTotals
  allRunTotals: StravaTotals
  allRideTotals: StravaTotals
  allSwimTotals: StravaTotals
  activities: StravaActivity[]
  weeklyData: StravaWeek[]
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtDist(meters: number, imperial: boolean) {
  if (imperial) {
    const mi = meters / 1609.34
    return mi >= 100 ? `${Math.round(mi)}mi` : `${mi.toFixed(1)}mi`
  }
  const km = meters / 1000
  return km >= 100 ? `${Math.round(km)}km` : `${km.toFixed(1)}km`
}

function fmtTime(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtPace(mps: number, type: string, imperial: boolean) {
  if (!mps || mps <= 0) return ''
  const isRide = type === 'Ride' || type === 'VirtualRide' || type === 'EBikeRide' ||
    type === 'GravelRide' || type === 'MountainBikeRide'
  if (isRide) {
    const kph = mps * 3.6
    return imperial ? `${(kph * 0.621371).toFixed(1)} mph` : `${kph.toFixed(1)} km/h`
  }
  // Pace: min/km or min/mi
  const secsPerUnit = imperial ? (1609.34 / mps) : (1000 / mps)
  const m = Math.floor(secsPerUnit / 60)
  const s = Math.round(secsPerUnit % 60)
  const unit = imperial ? '/mi' : '/km'
  return `${m}:${s.toString().padStart(2, '0')}${unit}`
}

function fmtRelDate(dateStr: string) {
  const d = new Date(dateStr)
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

// ── Sport helpers ─────────────────────────────────────────────────────────────

const SPORT_EMOJI: Record<string, string> = {
  Run: '🏃', VirtualRun: '🏃', TrailRun: '🏃',
  Ride: '🚴', VirtualRide: '🚴', EBikeRide: '🚴', GravelRide: '🚴', MountainBikeRide: '🚵',
  Swim: '🏊',
  Walk: '🚶', Hike: '🥾',
  AlpineSki: '⛷️', BackcountrySki: '⛷️', NordicSki: '⛷️',
  Rowing: '🚣', Kayaking: '🚣',
  WeightTraining: '🏋️', Workout: '💪', Yoga: '🧘',
  Soccer: '⚽', Tennis: '🎾', Basketball: '🏀',
}

function sportEmoji(type: string) {
  return SPORT_EMOJI[type] ?? '🏅'
}

const RUN_COLOR = '#f97316'
const RIDE_COLOR = '#6366f1'
const SWIM_COLOR = '#06b6d4'

// ── Components ────────────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: color ?? 'var(--text)', fontFamily: 'DM Mono, monospace' }}>
        {value}
      </span>
    </div>
  )
}

function RecentRow({ t, imperial }: { t: StravaActivity; imperial: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0',
      borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{sportEmoji(t.type)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
          {t.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {fmtDist(t.distance, imperial)}
          {t.movingTime > 0 && ` · ${fmtTime(t.movingTime)}`}
          {t.elevationGain > 0 && ` · ↑${Math.round(t.elevationGain)}m`}
          {t.averageSpeed > 0 && ` · ${fmtPace(t.averageSpeed, t.type, imperial)}`}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{fmtRelDate(t.date)}</div>
        {t.kudosCount > 0 && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>👏 {t.kudosCount}</div>
        )}
      </div>
    </div>
  )
}

function SportSummary({ label, totals, color, imperial }:
  { label: string; totals: StravaTotals; color: string; imperial: boolean }) {
  if (totals.count === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 3, height: 28, background: color, borderRadius: 2, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>
          {fmtDist(totals.distance, imperial)}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
          {totals.count} {label.toLowerCase()}{totals.count !== 1 ? 's' : ''} · {fmtTime(totals.movingTime)}
        </div>
      </div>
    </div>
  )
}

function WeeklyChart({ weeks, imperial }: { weeks: StravaWeek[]; imperial: boolean }) {
  const divisor = imperial ? 1609.34 : 1000
  const maxVal = Math.max(...weeks.map(w => (w.runM + w.rideM + w.swimM) / divisor), 0.1)

  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: 6 }}>
        Weekly distance — 8 weeks
        <span style={{ marginLeft: 10 }}>
          <span style={{ color: RUN_COLOR }}>● Run</span>
          {' '}
          <span style={{ color: RIDE_COLOR }}>● Ride</span>
          {' '}
          <span style={{ color: SWIM_COLOR }}>● Swim</span>
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
        {weeks.map((week, i) => {
          const runH = (week.runM / divisor / maxVal) * 72
          const rideH = (week.rideM / divisor / maxVal) * 72
          const swimH = (week.swimM / divisor / maxVal) * 72
          const hasActivity = runH + rideH + swimH > 0
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{ width: '100%', height: 72, display: 'flex', flexDirection: 'column',
                justifyContent: 'flex-end', gap: 1 }}>
                {swimH > 0 && (
                  <div style={{ width: '100%', height: swimH, background: SWIM_COLOR,
                    borderRadius: rideH === 0 && runH === 0 ? '3px 3px 1px 1px' : '1px 1px 1px 1px', minHeight: 2 }} />
                )}
                {rideH > 0 && (
                  <div style={{ width: '100%', height: rideH, background: RIDE_COLOR,
                    borderRadius: runH === 0 ? '3px 3px 1px 1px' : '1px 1px 1px 1px', minHeight: 2 }} />
                )}
                {runH > 0 && (
                  <div style={{ width: '100%', height: runH, background: RUN_COLOR,
                    borderRadius: '3px 3px 1px 1px', minHeight: 2 }} />
                )}
                {!hasActivity && (
                  <div style={{ width: '100%', height: 3, background: 'var(--border)', borderRadius: 2 }} />
                )}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center',
                whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>
                {week.label.split(' ')[1] ?? week.label}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function StravaPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<StravaData | null>(null)
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

  const imperial = data.measurementPref === 'feet'
  const acts = data.activities ?? []
  const last = acts[0] ?? null

  // ── 1× ───────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8,
        height: '100%', overflow: 'hidden' }}>
        {last ? (
          <>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{sportEmoji(last.type)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{last.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {fmtDist(last.distance, imperial)} · {fmtTime(last.movingTime)}
              </div>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
              fontFamily: 'DM Mono, monospace' }}>{fmtRelDate(last.date)}</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 18 }}>🏃</span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{data.athleteName}</span>
          </>
        )}
      </div>
    )
  }

  // ── 2–3× ─────────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    const r = data.recentRunTotals
    const b = data.recentRideTotals
    const s = data.recentSwimTotals
    return (
      <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {data.profileUrl && (
            <img src={data.profileUrl} alt={data.athleteName}
              style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {data.athleteName}
            </div>
            {(data.city || data.country) && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {[data.city, data.country].filter(Boolean).join(', ')}
              </div>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>4 weeks</div>
        </div>
        {/* 4-week sport summary */}
        <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
          {r.count > 0 && <SportSummary label="Run" totals={r} color={RUN_COLOR} imperial={imperial} />}
          {b.count > 0 && <SportSummary label="Ride" totals={b} color={RIDE_COLOR} imperial={imperial} />}
          {s.count > 0 && <SportSummary label="Swim" totals={s} color={SWIM_COLOR} imperial={imperial} />}
          {r.count === 0 && b.count === 0 && s.count === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>No activities in the last 4 weeks</span>
          )}
        </div>
        {/* Recent activities */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {acts.slice(0, 8).map((t, i) => <RecentRow key={i} t={t} imperial={imperial} />)}
        </div>
      </div>
    )
  }

  // ── 4×+ ──────────────────────────────────────────────────────────────────────
  const r = data.recentRunTotals
  const b = data.recentRideTotals
  const s = data.recentSwimTotals
  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {data.profileUrl && (
          <img src={data.profileUrl} alt={data.athleteName}
            style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{data.athleteName}</div>
          {(data.city || data.country) && (
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {[data.city, data.country].filter(Boolean).join(', ')}
            </div>
          )}
        </div>
        {/* YTD quick stats */}
        <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
          {data.ytdRunTotals.count > 0 && (
            <StatChip label="YTD runs" value={fmtDist(data.ytdRunTotals.distance, imperial)} color={RUN_COLOR} />
          )}
          {data.ytdRideTotals.count > 0 && (
            <StatChip label="YTD rides" value={fmtDist(data.ytdRideTotals.distance, imperial)} color={RIDE_COLOR} />
          )}
        </div>
      </div>

      {/* 4-week sport summary */}
      <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
        {r.count > 0 && <SportSummary label="Run" totals={r} color={RUN_COLOR} imperial={imperial} />}
        {b.count > 0 && <SportSummary label="Ride" totals={b} color={RIDE_COLOR} imperial={imperial} />}
        {s.count > 0 && <SportSummary label="Swim" totals={s} color={SWIM_COLOR} imperial={imperial} />}
      </div>

      {/* Weekly chart */}
      {data.weeklyData?.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <WeeklyChart weeks={data.weeklyData} imperial={imperial} />
        </div>
      )}

      {/* Activity list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {acts.map((t, i) => <RecentRow key={i} t={t} imperial={imperial} />)}
      </div>
    </div>
  )
}
