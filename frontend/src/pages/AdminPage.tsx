import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import ErrorBoundary from '../components/ErrorBoundary'
import OAuthConfigPanel from '../components/admin/OAuthConfigPanel'
import UsersPanel from '../components/admin/UsersPanel'
import GroupsPanel from '../components/admin/GroupsPanel'
import TagsPanel from '../components/admin/TagsPanel'
import BookmarksPanel from '../components/admin/BookmarksPanel'
import PanelsAdminPanel from '../components/admin/PanelsAdminPanel'
import SecretsPanel from '../components/admin/SecretsPanel'
import IntegrationsPanel from '../components/admin/IntegrationsPanel'
import SettingsPanel from '../components/admin/SettingsPanel'

const tabs = [
  { path: '/admin/bookmarks', label: 'Bookmarks',        icon: '↗' },
  { path: '/admin/panels',    label: 'System Panels',    icon: '▤' },
  { path: '/admin/secrets',   label: 'System Secrets',   icon: '🔑' },
  { path: '/admin/integrations', label: 'System Integrations', icon: '⇄' },
  { path: '/admin/oauth',     label: 'OAuth',     icon: '⬡' },
  { path: '/admin/settings',  label: 'Settings',  icon: '⚙' },
  { path: '/admin/users',     label: 'Users',     icon: '○' },
  { path: '/admin/groups',    label: 'Groups',    icon: '◈' },
  { path: '/admin/tags',      label: 'Tags',      icon: '◇' },
]

export default function AdminPage() {
  const location = useLocation()

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
          Administration
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Manage bookmarks, panels, OAuth, users, groups, and tags
        </p>
      </div>

      <nav style={{
        display: 'flex', gap: 4, marginBottom: 28,
        borderBottom: '1px solid var(--border)', paddingBottom: 0,
        overflowX: 'auto',
      }}>
        {tabs.map(tab => {
          const active = location.pathname === tab.path
          return (
            <Link key={tab.path} to={tab.path} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', fontSize: 13, fontWeight: 500,
              textDecoration: 'none', borderRadius: '8px 8px 0 0',
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
              color: active ? 'var(--accent2)' : 'var(--text-muted)',
              background: active ? 'var(--accent-bg)' : 'transparent',
              transition: 'all 0.15s', marginBottom: -1, whiteSpace: 'nowrap',
            }}>
              <span style={{ fontSize: 11 }}>{tab.icon}</span>
              {tab.label}
            </Link>
          )
        })}
      </nav>

      <ErrorBoundary>
        <Routes>
          <Route index element={<Navigate to="bookmarks" replace />} />
          <Route path="bookmarks" element={<BookmarksPanel />} />
          <Route path="panels"    element={<PanelsAdminPanel />} />
          <Route path="secrets"   element={<SecretsPanel />} />
          <Route path="integrations" element={<IntegrationsPanel />} />
          <Route path="oauth"     element={<OAuthConfigPanel />} />
          <Route path="settings"  element={<SettingsPanel />} />
          <Route path="users"     element={<UsersPanel />} />
          <Route path="groups"    element={<GroupsPanel />} />
          <Route path="tags"      element={<TagsPanel />} />
        </Routes>
      </ErrorBoundary>
    </div>
  )
}
