import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import OAuthConfigPanel from '../components/admin/OAuthConfigPanel'
import UsersPanel from '../components/admin/UsersPanel'
import GroupsPanel from '../components/admin/GroupsPanel'
import TagsPanel from '../components/admin/TagsPanel'

const tabs = [
  { path: '/admin/oauth', label: 'OAuth' },
  { path: '/admin/users', label: 'Users' },
  { path: '/admin/groups', label: 'Groups' },
  { path: '/admin/tags', label: 'Tags' },
]

export default function AdminPage() {
  const location = useLocation()

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-100 mb-6">Administration</h1>

      {/* Tab nav */}
      <nav className="flex gap-1 mb-6 border-b border-gray-800 pb-0">
        {tabs.map((tab) => {
          const active = location.pathname === tab.path
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                active
                  ? 'text-stoa-400 border-stoa-500 bg-stoa-500/5'
                  : 'text-gray-500 border-transparent hover:text-gray-300 hover:border-gray-700'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>

      {/* Tab content */}
      <Routes>
        <Route path="/" element={<Navigate to="/admin/oauth" replace />} />
        <Route path="/oauth" element={<OAuthConfigPanel />} />
        <Route path="/users" element={<UsersPanel />} />
        <Route path="/groups" element={<GroupsPanel />} />
        <Route path="/tags" element={<TagsPanel />} />
      </Routes>
    </div>
  )
}
