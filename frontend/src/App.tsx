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
import ExpressSetupPage from './pages/ExpressSetupPage'
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

  if (loading || needsSetup === null) {
    // Still show reset-password page while auth is loading — don't block it
    if (window.location.pathname === '/reset-password') {
      return (
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Routes>
      )
    }
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
        {user.role === 'admin' && (
          <Route path="/express-setup" element={<ExpressSetupPage />} />
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
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Torso */}
      <path d="M28 74 C24 88 32 98 50 98 C68 98 76 88 72 74 Z" fill="var(--accent)"/>
      {/* Head */}
      <circle cx="50" cy="52" r="32" fill="var(--accent)"/>
      {/* Left ear tuft */}
      <polygon points="25,32 31,4 45,28" fill="var(--accent)"/>
      {/* Right ear tuft — one notch higher for a slightly asymmetric, alert look */}
      <polygon points="55,28 69,2 75,32" fill="var(--accent)"/>
      {/* Facial disc */}
      <ellipse cx="50" cy="54" rx="23" ry="21" fill="var(--accent2)"/>
      {/* Left eye */}
      <circle cx="36" cy="49" r="12" fill="white"/>
      <circle cx="37.5" cy="49" r="8.5" fill="#0e0c1a"/>
      <circle cx="41" cy="45" r="3" fill="white"/>
      {/* Right eye — pupils angled slightly inward for focused intensity */}
      <circle cx="64" cy="49" r="12" fill="white"/>
      <circle cx="62.5" cy="49" r="8.5" fill="#0e0c1a"/>
      <circle cx="67" cy="45" r="3" fill="white"/>
      {/* Beak */}
      <polygon points="44,62 56,62 50,72" fill="#f5c518"/>
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
