import { useAuth } from '../context/AuthContext'

export default function DashboardPage() {
  const { user } = useAuth()

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="text-gray-700 mb-4">
        <GridIcon />
      </div>
      <h2 className="text-xl font-medium text-gray-400 mb-2">
        Welcome back, {user?.username}
      </h2>
      <p className="text-sm text-gray-600 max-w-sm">
        Your dashboard is empty. Services and bookmarks are coming in v0.0.2.
        {user?.role === 'admin' && (
          <> Head to <a href="/admin" className="text-stoa-400 hover:underline">settings</a> to configure OAuth and manage users.</>
        )}
      </p>
    </div>
  )
}

function GridIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}
