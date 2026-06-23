import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface DuolingoCourse {
  id: string
  learningLanguage: string
  title: string
  xp: number
  crowns: number
  active: boolean
}

interface DuolingoData {
  username: string
  name: string
  avatarUrl: string
  streak: number
  longestStreak: number
  streakDoneToday: boolean
  totalXP: number
  hasPlus: boolean
  league: string
  courses: DuolingoCourse[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DUO_GREEN  = '#58CC02'
const DUO_ORANGE = '#FF9600'
const DUO_RED    = '#FF4B4B'

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
  Bronze: '#CD7F32', Silver: '#A8A8A8', Gold: '#FFD700',
  Sapphire: '#1E90FF', Ruby: '#E0115F', Emerald: '#50C878',
  Amethyst: '#9B59B6', Pearl: '#E8D5C4', Obsidian: '#6B6B6B',
  Diamond: '#89CFF0',
}

function langFlag(code: string) { return LANG_FLAG[code?.toLowerCase()] ?? '🌐' }
function leagueColor(l: string) { return LEAGUE_COLOR[l] ?? 'var(--text-muted)' }

// ── Streak countdown (ticks every second) ────────────────────────────────────

function useStreakCountdown(streakDoneToday: boolean) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (streakDoneToday) { setLabel(''); return }
    const tick = () => {
      const now = new Date()
      const midnight = new Date()
      midnight.setHours(24, 0, 0, 0) // local midnight
      const ms = midnight.getTime() - now.getTime()
      if (ms <= 0) { setLabel('now'); return }
      const h = Math.floor(ms / 3600000)
      const m = Math.floor((ms % 3600000) / 60000)
      const s = Math.floor((ms % 60000) / 1000)
      setLabel(`${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [streakDoneToday])
  return label
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StreakBadge({ streak, size = 'md' }: { streak: number; size?: 'sm' | 'md' | 'lg' }) {
  const fs = size === 'lg' ? 30 : size === 'md' ? 22 : 16
  const efs = size === 'lg' ? 24 : size === 'md' ? 18 : 14
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      <span style={{ fontSize: efs }}>🔥</span>
      <span style={{ fontSize: fs, fontWeight: 700, color: DUO_ORANGE,
        fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>{streak}</span>
    </div>
  )
}

function StreakAlert({ countdown }: { countdown: string }) {
  if (!countdown) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
      borderRadius: 8, background: DUO_ORANGE + '18', border: `1px solid ${DUO_ORANGE}40`,
    }}>
      <span style={{ fontSize: 13 }}>⚠️</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: DUO_ORANGE }}>Streak at risk</div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Practice within {countdown} (local midnight)</div>
      </div>
    </div>
  )
}

function StreakOk() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
      borderRadius: 8, background: DUO_GREEN + '18', border: `1px solid ${DUO_GREEN}40`,
    }}>
      <span style={{ fontSize: 13 }}>✅</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: DUO_GREEN }}>Streak maintained today</span>
    </div>
  )
}

const MILESTONES = [7, 14, 30, 60, 90, 180, 365, 500, 730, 1000, 1500, 2000]

function nextMilestone(streak: number): { prev: number; target: number; pct: number } {
  for (const m of MILESTONES) {
    if (streak < m) {
      const prev = MILESTONES[MILESTONES.indexOf(m) - 1] ?? 0
      return { prev, target: m, pct: Math.round(((streak - prev) / (m - prev)) * 100) }
    }
  }
  const rounded = Math.ceil((streak + 1) / 500) * 500
  return { prev: rounded - 500, target: rounded, pct: Math.round(((streak - (rounded - 500)) / 500) * 100) }
}

function StreakMilestone({ streak }: { streak: number }) {
  const { prev, target, pct } = nextMilestone(streak)
  return (
    <div style={{ padding: '7px 10px', borderRadius: 8, background: 'var(--surface2)',
      border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
          Next milestone: <span style={{ color: DUO_ORANGE, fontWeight: 600 }}>🔥 {target} days</span>
        </span>
        <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-dim)' }}>
          {target - streak} to go
        </span>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3,
          background: `linear-gradient(90deg, ${DUO_ORANGE}99, ${DUO_ORANGE})` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{prev}</span>
        <span style={{ fontSize: 9, color: DUO_ORANGE, fontWeight: 600 }}>{pct}%</span>
        <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{target}</span>
      </div>
    </div>
  )
}

function LeagueBadge({ league, size = 'sm' }: { league: string; size?: 'sm' | 'md' }) {
  if (!league) return null
  const color = leagueColor(league)
  return (
    <div style={{
      padding: size === 'md' ? '3px 10px' : '2px 8px',
      borderRadius: 10, background: color + '1A', border: `1px solid ${color}40`,
      fontSize: size === 'md' ? 12 : 10, fontWeight: 700, color, flexShrink: 0,
      letterSpacing: '0.02em',
    }}>
      {league}
    </div>
  )
}

function CourseRow({ course, maxXP }: { course: DuolingoCourse; maxXP: number }) {
  const pct = maxXP > 0 ? Math.min(100, (course.xp / maxXP) * 100) : 0
  const crownsDisplay = course.crowns >= 9999 ? '∞' : course.crowns.toLocaleString()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span style={{ fontSize: 18, flexShrink: 0, width: 24, textAlign: 'center' }}>
        {langFlag(course.learningLanguage)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            <span style={{
              fontSize: 12, fontWeight: course.active ? 600 : 400,
              color: course.active ? 'var(--text)' : 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{course.title}</span>
            {course.active && (
              <span style={{ fontSize: 9, color: DUO_GREEN, fontWeight: 700,
                letterSpacing: '0.05em', flexShrink: 0 }}>ACTIVE</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 6 }}>
            <span style={{ fontSize: 10, color: '#FFD700', fontFamily: 'DM Mono, monospace' }}>
              👑 {crownsDisplay}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
              {course.xp.toLocaleString()} XP
            </span>
          </div>
        </div>
        <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`, borderRadius: 2,
            background: course.active ? DUO_GREEN : DUO_GREEN + '55',
          }} />
        </div>
      </div>
    </div>
  )
}

function Avatar({ url, name, size }: { url: string; name: string; size: number }) {
  const isDefault = !url || url.includes('default_')
  if (isDefault) {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: DUO_GREEN + '33', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: size * 0.45, border: `2px solid ${DUO_GREEN}44`,
      }}>
        🦉
      </div>
    )
  }
  return (
    <img src={url} alt={name}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover',
        flexShrink: 0, border: `2px solid ${DUO_GREEN}44` }} />
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

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

  const countdown = useStreakCountdown(data?.streakDoneToday ?? true)

  if (loading) return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>Loading...</div>
  if (error)   return <div style={{ padding: 16, fontSize: 13, color: DUO_RED }}>🦉 {error}</div>
  if (!data)   return null

  const courses = data.courses ?? []
  const activeCourse = courses.find(c => c.active) ?? courses[0] ?? null
  const maxXP = Math.max(...courses.map(c => c.xp), 1)

  // ── 1× ───────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10,
        height: '100%', overflow: 'hidden', flexWrap: 'wrap' }}>
        <StreakBadge streak={data.streak} size="sm" />
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>day streak</span>
        {!data.streakDoneToday && countdown && (
          <span style={{ fontSize: 10, color: DUO_ORANGE, fontWeight: 600 }}>
            ⚠️ {countdown}
          </span>
        )}
        {activeCourse && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            · {langFlag(activeCourse.learningLanguage)} {activeCourse.title}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
          {data.totalXP.toLocaleString()} XP
        </span>
        {data.league && <LeagueBadge league={data.league} />}
      </div>
    )
  }

  // ── 2–3× ─────────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ height: '100%', overflow: 'hidden', display: 'flex',
        flexDirection: 'column', gap: 8 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Avatar url={data.avatarUrl} name={data.name} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {data.name || data.username}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>@{data.username}
              {data.hasPlus && <span style={{ marginLeft: 5, color: '#FFD700', fontWeight: 600 }}>PLUS</span>}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
            <StreakBadge streak={data.streak} size="md" />
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>day streak</span>
          </div>
        </div>
        {/* Streak status */}
        <div style={{ flexShrink: 0 }}>
          {data.streakDoneToday ? <StreakOk /> : <StreakAlert countdown={countdown} />}
        </div>
        {/* Courses */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex',
          flexDirection: 'column', gap: 8 }}>
          {courses.map(c => <CourseRow key={c.id} course={c} maxXP={maxXP} />)}
        </div>
      </div>
    )
  }

  // ── 4×+ ──────────────────────────────────────────────────────────────────────
  const totalCrowns = courses.reduce((s, c) => s + Math.min(c.crowns, 9999), 0)

  return (
    <div style={{ height: '100%', overflow: 'auto', display: 'flex',
      flexDirection: 'column', gap: 10 }}>
      {/* Profile header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0 }}>
        <Avatar url={data.avatarUrl} name={data.name} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data.name || data.username}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>
            @{data.username}
            {data.hasPlus && (
              <span style={{ marginLeft: 8, color: '#FFD700', fontWeight: 700,
                fontSize: 10, letterSpacing: '0.04em' }}>✦ PLUS</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', background: 'var(--surface2)',
              border: '1px solid var(--border)', borderRadius: 6, padding: '2px 7px' }}>
              <span style={{ color: DUO_GREEN, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
                {data.totalXP.toLocaleString()}
              </span>
              <span style={{ marginLeft: 3 }}>XP</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', background: 'var(--surface2)',
              border: '1px solid var(--border)', borderRadius: 6, padding: '2px 7px' }}>
              <span style={{ color: '#FFD700', fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
                👑 {totalCrowns.toLocaleString()}
              </span>
              <span style={{ marginLeft: 3 }}>crowns</span>
            </div>
            {data.longestStreak > 0 && data.longestStreak > data.streak && (
              <div style={{ fontSize: 10, color: 'var(--text-dim)', background: 'var(--surface2)',
                border: '1px solid var(--border)', borderRadius: 6, padding: '2px 7px' }}>
                <span style={{ color: DUO_ORANGE, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
                  🔥 {data.longestStreak}
                </span>
                <span style={{ marginLeft: 3 }}>best</span>
              </div>
            )}
            {data.league && <LeagueBadge league={data.league} size="sm" />}
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: 'center' }}>
          <StreakBadge streak={data.streak} size="lg" />
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>day streak</div>
        </div>
      </div>

      {/* Streak status */}
      <div style={{ flexShrink: 0 }}>
        {data.streakDoneToday ? <StreakOk /> : <StreakAlert countdown={countdown} />}
      </div>

      {/* Streak milestone */}
      <div style={{ flexShrink: 0 }}>
        <StreakMilestone streak={data.streak} />
      </div>

      {/* Courses */}
      {courses.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
            borderBottom: '1px solid var(--border)', paddingBottom: 3, marginBottom: 8 }}>
            Courses ({courses.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {courses.map(c => <CourseRow key={c.id} course={c} maxXP={maxXP} />)}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 'auto', paddingTop: 8,
        borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <a href={`https://www.duolingo.com/profile/${data.username}`}
            target="_blank" rel="noreferrer"
            style={{ fontSize: 10, color: DUO_GREEN, textDecoration: 'none', fontWeight: 500 }}>
            View on Duolingo ↗
          </a>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            {courses.length} course{courses.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  )
}
