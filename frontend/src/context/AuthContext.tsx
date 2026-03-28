import React, { createContext, useContext, useEffect, useState } from 'react'
import { authApi, User } from '../api'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (token: string, user: User) => void
  logout: () => void
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Handle OAuth callback token in URL
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')

    if (urlToken) {
      // Token freshly issued by backend — store it then fetch user profile
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
      setLoading(false)
      return
    }

    authApi.me()
      .then((res) => setUser(res.data))
      .catch(() => localStorage.removeItem('stoa_token'))
      .finally(() => setLoading(false))
  }, [])

  const login = (token: string, user: User) => {
    localStorage.setItem('stoa_token', token)
    setUser(user)
  }

  const logout = async () => {
    await authApi.logout().catch(() => {})
    localStorage.removeItem('stoa_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{
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
