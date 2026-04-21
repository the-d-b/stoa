import React, { createContext, useContext, useEffect, useState } from 'react'
import { authApi, preferencesApi, User } from '../api'
import { THEMES, ThemeName } from './ThemeContext'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (token: string, user: User) => void
  logout: () => void
  isAdmin: boolean
  setUser: (user: User | null) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Handle OAuth callback token in URL — but ONLY if not on a public page
    // (reset-password also uses ?token= but for a different purpose)
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    const isPublicPage = ['/reset-password', '/login'].includes(window.location.pathname)

    if (urlToken && !isPublicPage) {
      // Token freshly issued by backend OAuth — store it then fetch user profile
      localStorage.setItem('stoa_token', urlToken)
      window.history.replaceState({}, '', '/')

      // Fetch user profile using the new token explicitly
      authApi.meWithToken(urlToken)
        .then((res) => setUser(res.data))
        .catch(() => localStorage.removeItem('stoa_token'))
        .finally(() => setLoading(false))
      return
    }

    // Try to restore existing session
    const token = localStorage.getItem('stoa_token')
    if (!token) {
      // No token — check if auto-login is configured before giving up
      authApi.setupStatus().then(async (res) => {
        if (res.data.autoLogin && !res.data.needsSetup) {
          try {
            const r = await authApi.autoLogin()
            localStorage.setItem('stoa_token', r.data.token)
            setUser(r.data.user)
          } catch { /* auto-login failed, stay logged out */ }
        }
      }).catch(() => {}).finally(() => setLoading(false))
      return
    }

    authApi.me()
      .then((res) => setUser(res.data))
      .catch(async () => {
        localStorage.removeItem('stoa_token')
        // Token expired — if auto-login is configured, get a fresh token silently
        try {
          const statusRes = await authApi.setupStatus()
          if (statusRes.data.autoLogin && !statusRes.data.needsSetup) {
            const r = await authApi.autoLogin()
            localStorage.setItem('stoa_token', r.data.token)
            setUser(r.data.user)
          }
        } catch { /* not auto-login mode, will show login page */ }
      })
      .finally(() => setLoading(false))
  }, [])

  const login = (token: string, user: User) => {
    localStorage.setItem('stoa_token', token)
    setUser(user)
    setLoading(false)
    // Load this user's theme preference
    preferencesApi.get().then(r => {
      const t = r.data.theme as ThemeName
      if (t) {
        const def = THEMES.find(th => th.name === t)
        if (def) {
          localStorage.setItem('stoa_theme', t)
          const root = document.documentElement
          Object.entries(def.vars).forEach(([k, v]) => root.style.setProperty(k, v))
        }
      }
    }).catch(() => {})
  }

  const logout = async () => {
    await authApi.logout().catch(() => {})
    localStorage.removeItem('stoa_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ setUser,
      user,
      loading,
      login,
      logout,
      isAdmin: user?.role === 'admin',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
