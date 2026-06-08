import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface DuolingoCourse {
  code: string
  name: string
  level: number
  xp: number
  active: boolean
}

interface DuolingoDayXP {
  date: string
  xp: number
}

interface DuolingoData {
  username: string
  name: string
  streak: number
  todayXP: number
  dailyGoal: number
  totalXP: number
  goalMet: boolean
  league: string
  courses: DuolingoCourse[]
  recentXP: DuolingoDayXP[]
}

const LANG_FLAG: Record<string, string> = {
  en: '🇬🇧', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪', ja: '🇯🇵',
  zh: '🇨🇳', it: '🇮🇹', pt: '🇵🇹', ru: '🇷🇺', ko: '🇰🇷',
  ar: '🇸🇦', hi: '🇮🇳', tr: '🇹🇷', nl: '🇳🇱', pl: '🇵🇱',
  sv: '🇸🇪', da: '🇩🇰', el: '🇬🇷', he: '🇮🇱', id: '🇮🇩',
  vi: '🇻🇳', uk: '🇺🇦', cs: '🇨🇿', fi: '🇫🇮', hu: '🇭🇺',
  ro: '🇷🇴', sw: '🇰🇪', nb: '🇳🇴', cy: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', eo: '🌍',
  la: '🏛️', haw: '🌺', gd: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', hy: '🇦🇲', bn: '🇧🇩',
}

const LEAGUE_COLOR: Record<string, string> = {
  Bronze:   '#CD7F32', Silver:   '#A8A8A8', Gold:     '#FFD700',
  Sapphire: '#1E90FF', Ruby:     '#E0115F', Emerald:  '#50C878',
  Amethyst: '#9B59B6', Pearl:    '#E8D5C4', Obsidian: '#6B6B6B',
  Diamond:  '#89CFF0',
}

const DUO_GREEN = '#58CC02'
const DUO_GREEN_DIM = '#89E219'

function langFlag(code: string) {
  return LANG_FLAG[code.toLowerCase()] ?? '🌐'
}

function leagueColor(league: string) {
  return LEAGUE_COLOR[league] ?? 'var(--text-muted)'
}

function GoalBar({ todayXP, dailyGoal, goalMet }: { todayXP: number; dailyGoal: number; goalMet: boolean }) {
  const pct = dailyGoal > 0 ? Math.min(100, (todayXP / dailyGoal) * 100) : 0
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Daily XP</span>
        <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace',
          color: goalMet ? DUO_GREEN : 'var(--text-dim)', fontWeight: goalMet ? 600 : 400 }}>
          {goalMet && '✓ '}{todayXP} / {dailyGoal}
        </span>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`,
          background: goalMet ? DUO_GREEN : DUO_GREEN_DIM,
          borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

function XPChart({ days }: { days: DuolingoDayXP[] }) {
  const maxXP = Math.max(...days.map(d => d.xp), 1)
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: 6 }}>
        XP — last {days.length} days
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 64 }}>
        {days.map((d, i) => {
          const h = d.xp > 0 ? Math.max(3, (d.xp / maxXP) * 56) : 0
          const isToday = d.date === today
          const showLabel = i === 0 || i === days.length - 1 || isToday
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 2 }}>
              <div style={{ width: '100%', height: 56, display: 'flex',
                flexDirection: 'column', justifyContent: 'flex-end' }}>
                {d.xp > 0 ? (
                  <div style={{ width: '100%', height: h,
                    background: isToday ? DUO_GREEN : DUO_GREEN_DIM + '99',
                    borderRadius: '3px 3px 1px 1px', minHeight: 3,
                    boxShadow: isToday ? `0 0 6px ${DUO_GREEN}60` : undefined,
                  }} title={`${d.date}: ${d.xp} XP`} />
                ) : (
                  <div style={{ width: '100%', height: 3, background: 'var(--border)', borderRadius: 2 }} />
                )}
              </div>
              {showLabel && (
                <div style={{ fontSize: 8, color: isToday ? DUO_GREEN : 'var(--text-dim)',
                  whiteSpace: 'nowrap', fontWeight: isToday ? 600 : 400 }}>
                  {isToday ? 'today' : d.date.slice(5)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CourseBar({ course, maxXP }: { course: DuolingoCourse; maxXP: number }) {
  const pct = maxXP > 0 ? (course.xp / maxXP) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ fontSize: 14, flexShrink: 0, width: 22, textAlign: 'center' }}>
        {langFlag(course.code)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ fontSize: 11, color: course.active ? 'var(--text)' : 'var(--text-muted)',
            fontWeight: course.active ? 600 : 400, display: 'flex', alignItems: 'center', gap: 4 }}>
            {course.name}
            {course.active && (
              <span style={{ fontSize: 9, color: DUO_GREEN, fontWeight: 700, letterSpacing: '0.02em' }}>
                ACTIVE
              </span>
            )}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace',
            flexShrink: 0, marginLeft: 4 }}>
            Lv{course.level} · {course.xp.toLocaleString()} XP
          </span>
        </div>
        <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`,
            background: course.active ? DUO_GREEN : DUO_GREEN_DIM + '77', borderRadius: 2 }} />
        </div>
      </div>
    </div>
  )
}

function LeagueBadge({ league, size = 'sm' }: { league: string; size?: 'sm' | 'md' }) {
  const color = leagueColor(league)
  const pad = size === 'md' ? '3px 10px' : '2px 8px'
  const fs = size === 'md' ? 12 : 11
  return (
    <div style={{ padding: pad, borderRadius: 10,
      background: color + '1A', border: `1px solid ${color}40`,
      fontSize: fs, fontWeight: 600, color, flexShrink: 0 }}>
      {league}
    </div>
  )
}

export default function DuolingoPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<DuolingoData | null>(null)
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
  if (error)   return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>🦉 {error}</div>
  if (!data)   return null

  const activeCourse = data.courses?.find(c => c.active) ?? data.courses?.[0] ?? null
  const maxXP = Math.max(...(data.courses ?? []).map(c => c.xp), 1)

  // ── 1× ───────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10,
        height: '100%', overflow: 'hidden' }}>
        <span style={{ fontSize: 16 }}>🔥</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: '#FF6B35',
          fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>{data.streak}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {activeCourse && (
            <div style={{ fontSize: 11, color: 'var(--text)', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {langFlag(activeCourse.code)} {activeCourse.name}
            </div>
          )}
          <div style={{ fontSize: 10, color: data.goalMet ? DUO_GREEN : 'var(--text-dim)' }}>
            {data.todayXP} / {data.dailyGoal} XP{data.goalMet ? ' ✓' : ''}
          </div>
        </div>
        {data.league && <LeagueBadge league={data.league} />}
      </div>
    )
  }

  // ── 2–3× ─────────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 18 }}>🔥</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: '#FF6B35',
            fontFamily: 'DM Mono, monospace' }}>{data.streak}</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>day streak</span>
          <div style={{ flex: 1 }} />
          {data.league && <LeagueBadge league={data.league} />}
        </div>
        <div style={{ flexShrink: 0 }}>
          <GoalBar todayXP={data.todayXP} dailyGoal={data.dailyGoal} goalMet={data.goalMet} />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex',
          flexDirection: 'column', gap: 8 }}>
          {(data.courses ?? []).map(c => (
            <CourseBar key={c.code} course={c} maxXP={maxXP} />
          ))}
        </div>
      </div>
    )
  }

  // ── 4×+ ──────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 20 }}>🔥</span>
        <span style={{ fontSize: 28, fontWeight: 700, color: '#FF6B35',
          fontFamily: 'DM Mono, monospace' }}>{data.streak}</span>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>day streak</span>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Total XP</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: DUO_GREEN,
            fontFamily: 'DM Mono, monospace' }}>{data.totalXP.toLocaleString()}</div>
        </div>
        {data.league && <LeagueBadge league={data.league} size="md" />}
      </div>

      <div style={{ flexShrink: 0 }}>
        <GoalBar todayXP={data.todayXP} dailyGoal={data.dailyGoal} goalMet={data.goalMet} />
      </div>

      {(data.recentXP ?? []).length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <XPChart days={data.recentXP} />
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex',
        flexDirection: 'column', gap: 8 }}>
        {(data.courses ?? []).map(c => (
          <CourseBar key={c.code} course={c} maxXP={maxXP} />
        ))}
      </div>
    </div>
  )
}
