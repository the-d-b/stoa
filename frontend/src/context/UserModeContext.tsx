import { createContext, useContext, useEffect, useState } from 'react'
import { authApi } from '../api'
import { useAuth } from './AuthContext'

interface UserModeState {
  mode: 'single' | 'multi' | null  // null = not yet loaded
  autoLogin: boolean
  oauthConfigured: boolean
  loaded: boolean
}

const UserModeContext = createContext<UserModeState>({ mode: null, autoLogin: false, oauthConfigured: false, loaded: false })

export function UserModeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UserModeState>({ mode: null, autoLogin: false, oauthConfigured: false, loaded: false })
  const { user } = useAuth()

  useEffect(() => {
    setState(s => ({ ...s, loaded: false }))
    authApi.setupStatus()
      .then(res => setState({
        mode: res.data?.userMode === 'single' ? 'single' : 'multi',
        autoLogin: res.data?.autoLogin ?? false,
        oauthConfigured: res.data?.oauthConfigured ?? false,
        loaded: true,
      }))
      .catch(() => setState({ mode: 'multi', autoLogin: false, oauthConfigured: false, loaded: true }))
  }, [user?.id])

  return <UserModeContext.Provider value={state}>{children}</UserModeContext.Provider>
}

export const useUserMode = () => useContext(UserModeContext).mode
export const useAutoLogin = () => useContext(UserModeContext).autoLogin
export const useOAuthConfigured = () => useContext(UserModeContext).oauthConfigured
export const useUserModeLoaded = () => useContext(UserModeContext).loaded
export const useUserModeState = () => useContext(UserModeContext)
