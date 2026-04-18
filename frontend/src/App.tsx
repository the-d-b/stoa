import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { UserModeProvider, useUserMode } from './context/UserModeContext'
import { authApi } from './api'

import SetupPage from './pages/SetupPage'
import ProfilePage from './pages/ProfilePage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import AdminPage from './pages/AdminPage'
import HelpPage from './pages/HelpPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import Layout from './components/layout/Layout'
import ThemeSwitcher from './components/layout/ThemeSwitcher'
import ErrorBoundary from './components/ErrorBoundary'


function AppRoutes() {
  const { user, loading } = useAuth()
  const userMode = useUserMode()
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)

  useEffect(() => {
    authApi.setupStatus()
      .then((res) => setNeedsSetup(res.data.needsSetup))
      .catch(() => setNeedsSetup(false))
  }, [])

  if (loading || needsSetup === null) return <LoadingScreen />

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
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
        <Route path="/profile" element={<ProfilePage />} />
        {user.role === 'admin' && userMode !== 'single' && (
          <Route path="/admin/*" element={<AdminPage />} />
        )}
        <Route path="/help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <StoaLogo size={40} />
        <div className="spinner" />
      </div>
    </div>
  )
}

export function StoaLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="24" width="28" height="3" rx="1.5" fill="var(--accent)" />
      <rect x="4" y="8" width="3" height="16" rx="1.5" fill="var(--accent)" opacity="0.7" />
      <rect x="10" y="8" width="3" height="16" rx="1.5" fill="var(--accent)" opacity="0.85" />
      <rect x="19" y="8" width="3" height="16" rx="1.5" fill="var(--accent)" opacity="0.85" />
      <rect x="25" y="8" width="3" height="16" rx="1.5" fill="var(--accent)" opacity="0.7" />
      <rect x="2" y="5" width="28" height="3" rx="1.5" fill="var(--accent2)" />
    </svg>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <UserModeProvider>
            <ErrorBoundary>
              <AppRoutes />
              <ThemeSwitcher />
            </ErrorBoundary>
          </UserModeProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
