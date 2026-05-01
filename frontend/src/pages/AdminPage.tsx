import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import ErrorBoundary from '../components/ErrorBoundary'
import OAuthConfigPanel from '../components/admin/OAuthConfigPanel'
import GoogleCalendarConfigPanel from '../components/admin/GoogleCalendarConfigPanel'
import UsersPanel from '../components/admin/UsersPanel'
import GroupsPanel from '../components/admin/GroupsPanel'
import TagsPanel from '../components/admin/TagsPanel'
import BookmarksPanel from '../components/admin/BookmarksPanel'
import PanelsAdminPanel from '../components/admin/PanelsAdminPanel'
import SecretsPanel from '../components/admin/SecretsPanel'
import IntegrationsPanel from '../components/admin/IntegrationsPanel'
import MailConfigPanel from '../components/admin/MailConfigPanel'
import SessionsPanel from '../components/admin/SessionsPanel'

const tabs = [
  { path: '/admin/bookmarks', label: 'Bookmarks',        icon: '↗' },
  { path: '/admin/panels',    label: 'System Panels',    icon: '▤' },
  { path: '/admin/secrets',   label: 'System Secrets',   icon: '🔑' },
  { path: '/admin/integrations', label: 'System Integrations', icon: '⇄' },
  { path: '/admin/oauth',     label: 'OAuth',     icon: '⬡' },
  { path: '/admin/mail',      label: 'Mail',            icon: '✉' },
  { path: '/admin/google',    label: 'Google Cal', icon: '📅' },
  { path: '/admin/sessions',  label: 'Sessions',  icon: '◎' },
  { path: '/admin/users',     label: 'Users',     icon: '○' },
  { path: '/admin/groups',    label: 'Groups',    icon: '◈' },
  { path: '/admin/tags',      label: 'Tags',      icon: '◇' },
]

export default function AdminPage() {
  const location = useLocation()

  const navGroups = [
    {
      label: 'Content',
      items: tabs.filter(t => ['/admin/bookmarks', '/admin/panels'].includes(t.path)),
    },
    {
      label: 'System',
      items: tabs.filter(t => ['/admin/secrets', '/admin/integrations'].includes(t.path)),
    },
    {
      label: 'Access',
      items: tabs.filter(t => ['/admin/sessions', '/admin/users', '/admin/groups', '/admin/tags'].includes(t.path)),
    },
    {
      label: 'Config',
      items: tabs.filter(t => ['/admin/oauth', '/admin/google', '/admin/mail'].includes(t.path)),
    },
  ]

  return (
    <div className="fade-up profile-layout" style={{ display: 'flex', gap: 32, alignItems: 'flex-start', maxWidth: 960 }}>

      {/* Vertical sidebar */}
      <div className="profile-sidebar" style={{ width: 180, flexShrink: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          Administration
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {navGroups.map(group => (
            <div key={group.label}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4, paddingLeft: 8 }}>
                {group.label}
              </div>
              {group.items.map(tab => {
                const active = location.pathname === tab.path
                return (
                  <Link key={tab.path} to={tab.path} style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '7px 10px', fontSize: 13, fontWeight: active ? 500 : 400,
                    background: active ? 'var(--accent-bg)' : 'transparent',
                    color: active ? 'var(--accent2)' : 'var(--text-muted)',
                    borderRadius: 7, textDecoration: 'none', transition: 'all 0.12s',
                  }}
                  onMouseOver={e => { if (!active) e.currentTarget.style.background = 'var(--surface2)' }}
                  onMouseOut={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                    <span style={{ fontSize: 11, width: 14, textAlign: 'center', flexShrink: 0 }}>{tab.icon}</span>
                    {tab.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>

      <ErrorBoundary>
        <Routes>
          <Route index element={<Navigate to="bookmarks" replace />} />
          <Route path="bookmarks" element={<BookmarksPanel />} />
          <Route path="panels"    element={<PanelsAdminPanel />} />
          <Route path="secrets"   element={<SecretsPanel />} />
          <Route path="integrations" element={<IntegrationsPanel />} />
          <Route path="oauth"     element={<OAuthConfigPanel />} />
          <Route path="mail"      element={<MailConfigPanel />} />
          <Route path="google"    element={<div style={{padding:16}}><GoogleCalendarConfigPanel /></div>} />
          <Route path="sessions"  element={<SessionsPanel />} />
          <Route path="users"     element={<UsersPanel />} />
          <Route path="groups"    element={<GroupsPanel />} />
          <Route path="tags"      element={<TagsPanel />} />
        </Routes>
      </ErrorBoundary>
      </div>
    </div>
  )
}
