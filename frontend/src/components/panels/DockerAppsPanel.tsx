/**
 * DockerAppsPanel — auto-discovers app tiles from Docker container labels,
 * following Homepage's label convention (homepage.name/icon/href/description/
 * group/weight) so a Homepage user can point stoa at the same containers and
 * get a populated panel with zero re-tagging. Deliberately does not honor
 * Homepage's homepage.widget.* labels (live stats scraping) — stoa's own
 * Integration/Panel system already covers that, per instance, with more
 * capability.
 *
 * Access is gated server-side by the same docker_enabled/docker_groups check
 * used by the admin Docker container list, not by panel ownership — a user
 * without Docker access sees an explicit message rather than empty data.
 */
import { useState, useEffect, useCallback } from 'react'
import { integrationsApi, Panel } from '../../api'
import { integrationIconUrl } from '../../integrationIcons'

interface DockerApp {
  name: string
  icon?: string
  href?: string
  description?: string
  group: string
  weight: number
  host: string
  state: string
}

interface DockerAppsData {
  enabled: boolean
  hasAccess: boolean
  apps: DockerApp[]
}

function appIconUrl(icon?: string): string | null {
  if (!icon) return null
  if (/^https?:\/\//i.test(icon)) return icon
  const slug = icon.replace(/\.(png|svg|webp)$/i, '').toLowerCase()
  return integrationIconUrl(slug)
}

function AppIcon({ app }: { app: DockerApp }) {
  const url = appIconUrl(app.icon)
  if (url) {
    return <img src={url} alt="" width={20} height={20} style={{ flexShrink: 0, borderRadius: 4 }}
      onError={e => (e.currentTarget.style.display = 'none')} />
  }
  return (
    <div style={{
      width: 20, height: 20, borderRadius: 4, flexShrink: 0,
      background: 'var(--accent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 600, color: 'var(--accent2)',
    }}>
      {app.name.charAt(0).toUpperCase()}
    </div>
  )
}

export default function DockerAppsPanel({ panel, heightUnits }: { panel: Panel; heightUnits: number }) {
  const [data, setData] = useState<DockerAppsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const res = await integrationsApi.getPanelData(panel.id)
      setData(res.data)
      setError('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally { setLoading(false) }
  }, [panel.id])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
  if (error) return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, color: 'var(--amber)', fontSize: 12 }}><span>⚠</span><span>{error}</span></div>
  if (!data) return null

  if (!data.enabled) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic', padding: 8 }}>
        Docker isn't connected yet — an admin can enable it under Admin → Docker.
      </div>
    )
  }

  if (!data.hasAccess) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic', padding: 8 }}>
        You don't have Docker access on this instance — ask an admin to add you to a Docker access group.
      </div>
    )
  }

  const apps = data.apps

  if (apps.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic', padding: 8 }}>
        No labeled containers found yet. Add <code>homepage.name</code> and <code>homepage.href</code> labels
        to a container (optionally <code>homepage.icon</code>, <code>homepage.description</code>,{' '}
        <code>homepage.group</code>, <code>homepage.weight</code>) and it'll appear here automatically.
      </div>
    )
  }

  // ── 1x — compact summary ──────────────────────────────────────────────
  if (heightUnits <= 1) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{apps.length}</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>docker app{apps.length !== 1 ? 's' : ''}</div>
      </div>
    )
  }

  const groups: { name: string; apps: DockerApp[] }[] = []
  for (const app of apps) {
    let g = groups.find(g => g.name === app.group)
    if (!g) { g = { name: app.group, apps: [] }; groups.push(g) }
    g.apps.push(app)
  }

  const toggleGroup = (name: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {groups.map(g => {
        const isCollapsed = collapsed.has(g.name)
        return (
          <div key={g.name}>
            <div onClick={() => toggleGroup(g.name)} style={{
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 6, userSelect: 'none',
            }}>
              <span style={{ fontSize: 9, transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.12s' }}>▾</span>
              {g.name} <span style={{ opacity: 0.6 }}>({g.apps.length})</span>
            </div>
            {!isCollapsed && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {g.apps.map((app, i) => (
                  <a key={app.host + app.name + i} href={app.href} target="_blank" rel="noopener noreferrer"
                    title={app.description || app.name}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                      borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)',
                      textDecoration: 'none', color: 'var(--text)', minWidth: 140, flex: '1 0 auto',
                    }}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--surface)'}
                    onMouseOut={e => e.currentTarget.style.background = 'var(--surface2)'}>
                    <AppIcon app={app} />
                    <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {app.name}
                    </span>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginLeft: 'auto',
                      background: app.state === 'running' ? 'var(--green)' : 'var(--text-dim)',
                    }} title={app.state} />
                  </a>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
