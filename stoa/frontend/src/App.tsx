import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { authApi } from './api'

import SetupPage from './pages/SetupPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import AdminPage from './pages/AdminPage'
import Layout from './components/layout/Layout'

function AppRoutes() {
  const { user, loading } = useAuth()
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)

  useEffect(() => {
    authApi.setupStatus()
      .then((res) => setNeedsSetup(res.data.needsSetup))
      .catch(() => setNeedsSetup(false))
  }, [])

  if (loading || needsSetup === null) {
    return <LoadingScreen />
  }

  if (needsSetup) {
    return (
      <Routes>
        <Route path="*" element={<SetupPage onComplete={() => setNeedsSetup(false)} />} />
      </Routes>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        {user.role === 'admin' && (
          <Route path="/admin/*" element={<AdminPage />} />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <StoaLogo size={48} />
        <div className="w-6 h-6 border-2 border-stoa-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  )
}

export function StoaLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="24" width="28" height="3" rx="1.5" fill="#6366f1" />
      <rect x="4" y="8" width="3" height="16" rx="1.5" fill="#6366f1" />
      <rect x="10" y="8" width="3" height="16" rx="1.5" fill="#6366f1" />
      <rect x="19" y="8" width="3" height="16" rx="1.5" fill="#6366f1" />
      <rect x="25" y="8" width="3" height="16" rx="1.5" fill="#6366f1" />
      <rect x="2" y="5" width="28" height="3" rx="1.5" fill="#818cf8" />
    </svg>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
