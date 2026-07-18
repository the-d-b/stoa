import { useEffect, useState, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'

interface GitHubRepo {
  name: string
  fullName: string
  description?: string
  language?: string
  stars: number
  forks: number
  pushedAt: string
  url: string
  isFork: boolean
}

interface GitHubEvent {
  type: string
  repoName: string
  createdAt: string
  detail?: string
}

interface GitHubDayCount {
  date: string
  count: number
}

interface GitHubData {
  login: string
  name: string
  avatarUrl: string
  bio?: string
  location?: string
  publicRepos: number
  followers: number
  following: number
  topRepos: GitHubRepo[]
  recentRepos: GitHubRepo[]
  events: GitHubEvent[]
  activity: GitHubDayCount[]
}

// ── Language colors (GitHub-standard) ────────────────────────────────────────

const LANG_COLOR: Record<string, string> = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5',
  Go: '#00ADD8', Rust: '#dea584', Java: '#b07219', 'C++': '#f34b7d',
  C: '#555555', 'C#': '#178600', CSS: '#563d7c', HTML: '#e34c26',
  Ruby: '#701516', Kotlin: '#A97BFF', Swift: '#F05138', Dart: '#00B4AB',
  Vue: '#41b883', Svelte: '#ff3e00', PHP: '#4F5D95', Shell: '#89e051',
  Dockerfile: '#384d54', Lua: '#000080', Haskell: '#5e5086', Scala: '#c22d40',
  Elixir: '#6e4a7e', R: '#198CE7', MATLAB: '#e16737', Nix: '#7e7eff',
  Zig: '#ec915c', Clojure: '#db5855',
}

function langColor(lang?: string) {
  return lang ? (LANG_COLOR[lang] ?? '#8b949e') : '#8b949e'
}

// ── Event type helpers ────────────────────────────────────────────────────────

const EVENT_ICON: Record<string, string> = {
  PushEvent: '↑',
  PullRequestEvent: '⎇',
  IssuesEvent: '○',
  IssueCommentEvent: '💬',
  CreateEvent: '✦',
  DeleteEvent: '✕',
  ReleaseEvent: '▲',
  WatchEvent: '★',
  ForkEvent: '⑂',
  CommitCommentEvent: '💬',
  PullRequestReviewEvent: '✓',
  PullRequestReviewCommentEvent: '✓',
}

const EVENT_LABEL: Record<string, string> = {
  PushEvent: 'Push',
  PullRequestEvent: 'PR',
  IssuesEvent: 'Issue',
  IssueCommentEvent: 'Comment',
  CreateEvent: 'Create',
  DeleteEvent: 'Delete',
  ReleaseEvent: 'Release',
  WatchEvent: 'Star',
  ForkEvent: 'Fork',
  CommitCommentEvent: 'Comment',
  PullRequestReviewEvent: 'Review',
  PullRequestReviewCommentEvent: 'Review',
}

function eventIcon(type: string) { return EVENT_ICON[type] ?? '•' }
function eventLabel(type: string) { return EVENT_LABEL[type] ?? type.replace('Event', '') }

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtRelDate(iso: string) {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function fmtShortName(repoName: string) {
  const parts = repoName.split('/')
  return parts[parts.length - 1]
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '4px 10px', borderRadius: 8, background: 'var(--surface2)',
      border: '1px solid var(--border)', minWidth: 48 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)',
        fontFamily: 'DM Mono, monospace' }}>{value}</span>
      <span style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.06em' }}>{label}</span>
    </div>
  )
}

function RepoRow({ repo }: { repo: GitHubRepo }) {
  return (
    <a href={repo.url} target="_blank" rel="noreferrer"
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0',
        borderBottom: '1px solid var(--border)', fontSize: 12, textDecoration: 'none',
        color: 'inherit' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: langColor(repo.language) }} title={repo.language ?? undefined} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: 'var(--accent2)', fontWeight: 500 }}>{repo.name}</div>
        {repo.description && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.description}</div>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {repo.stars > 0 && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>★ {repo.stars}</div>
        )}
        <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{fmtRelDate(repo.pushedAt)}</div>
      </div>
    </a>
  )
}

function EventRow({ ev }: { ev: GitHubEvent }) {
  const repoShort = fmtShortName(ev.repoName)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '3px 0',
      borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, width: 14,
        textAlign: 'center', marginTop: 1 }}>{eventIcon(ev.type)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500,
            flexShrink: 0 }}>{eventLabel(ev.type)}</span>
          <span style={{ color: 'var(--accent2)', overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap' }}>{repoShort}</span>
        </div>
        {ev.detail && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.detail}</div>
        )}
      </div>
      <span style={{ fontSize: 9, color: 'var(--text-dim)', flexShrink: 0 }}>
        {fmtRelDate(ev.createdAt)}
      </span>
    </div>
  )
}

function ActivityChart({ activity }: { activity: GitHubDayCount[] }) {
  const maxCount = Math.max(...activity.map(d => d.count), 1)
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: 6 }}>
        Activity — 30 days
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 52 }}>
        {activity.map((d, i) => {
          const h = d.count > 0 ? Math.max(3, (d.count / maxCount) * 44) : 0
          const isToday = d.date === today
          const showLabel = i === 0 || i === activity.length - 1 || isToday
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 2 }}>
              <div style={{ width: '100%', height: 44, display: 'flex',
                flexDirection: 'column', justifyContent: 'flex-end' }}>
                {d.count > 0 ? (
                  <div style={{ width: '100%', height: h,
                    background: isToday ? '#238636' : '#238636AA',
                    borderRadius: '2px 2px 1px 1px', minHeight: 3 }}
                    title={`${d.date}: ${d.count} event${d.count !== 1 ? 's' : ''}`} />
                ) : (
                  <div style={{ width: '100%', height: 3, background: 'var(--border)', borderRadius: 2 }} />
                )}
              </div>
              {showLabel && (
                <div style={{ fontSize: 8, color: isToday ? '#238636' : 'var(--text-dim)',
                  whiteSpace: 'nowrap' }}>
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

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function GitHubPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<GitHubData | null>(null)
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
  if (error)   return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>⬡ {error}</div>
  if (!data)   return null

  const lastEvent = data.events?.[0] ?? null

  // ── 1× ─────────────────────────────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8,
        height: '100%', overflow: 'hidden' }}>
        {data.avatarUrl && (
          <img src={data.avatarUrl} alt={data.login}
            style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data.name || data.login}
          </div>
          {lastEvent && (
            <div style={{ fontSize: 10, color: 'var(--text-dim)', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {eventIcon(lastEvent.type)} {eventLabel(lastEvent.type)} {fmtShortName(lastEvent.repoName)}
            </div>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data.publicRepos} repos · {data.followers} followers
        </span>
      </div>
    )
  }

  // ── 2–3× ───────────────────────────────────────────────────────────────────
  if (heightUnits <= 3) {
    return (
      <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Profile header — wraps on narrow panels so chips drop below the name */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexShrink: 0,
          flexWrap: 'wrap' }}>
          {data.avatarUrl && (
            <a href={`https://github.com/${data.login}`} target="_blank" rel="noreferrer">
              <img src={data.avatarUrl} alt={data.login}
                style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            </a>
          )}
          <div style={{ flex: '1 1 120px', minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {data.name || data.login}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              @{data.login}{data.location ? ` · ${data.location}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <StatChip label="repos" value={data.publicRepos} />
            <StatChip label="followers" value={data.followers} />
          </div>
        </div>
        {/* Recent events */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {(data.events ?? []).slice(0, 12).map((ev, i) => (
            <EventRow key={i} ev={ev} />
          ))}
        </div>
      </div>
    )
  }

  // ── 4×+ ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '10px 14px', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Profile header — wraps on narrow panels so chips drop below the name */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0,
        flexWrap: 'wrap' }}>
        {data.avatarUrl && (
          <a href={`https://github.com/${data.login}`} target="_blank" rel="noreferrer">
            <img src={data.avatarUrl} alt={data.login}
              style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          </a>
        )}
        <div style={{ flex: '1 1 140px', minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data.name || data.login}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            @{data.login}{data.location ? ` · 📍 ${data.location}` : ''}
          </div>
          {data.bio && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {data.bio}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <StatChip label="repos" value={data.publicRepos} />
          <StatChip label="followers" value={data.followers} />
          <StatChip label="following" value={data.following} />
        </div>
      </div>

      {/* Activity chart */}
      {(data.activity ?? []).length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <ActivityChart activity={data.activity} />
        </div>
      )}

      {/* Top repos */}
      {(data.topRepos ?? []).length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4 }}>Top repos</div>
          {data.topRepos.slice(0, 4).map((r, i) => <RepoRow key={i} repo={r} />)}
        </div>
      )}

      {/* Event feed */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 4 }}>Recent activity</div>
        {(data.events ?? []).map((ev, i) => (
          <EventRow key={i} ev={ev} />
        ))}
      </div>
    </div>
  )
}
