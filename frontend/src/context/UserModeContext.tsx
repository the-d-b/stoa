import { createContext, useContext, useEffect, useState } from 'react'
import { authApi } from '../api'
import { useAuth } from './AuthContext'

interface UserModeState {
  mode: 'single' | 'multi' | null  // null = not yet loaded
  autoLogin: boolean
  loaded: boolean
}

const UserModeContext = createContext<UserModeState>({ mode: null, autoLogin: false, loaded: false })

export function UserModeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UserModeState>({ mode: null, autoLogin: false, loaded: false })
  const { user } = useAuth()

  useEffect(() => {
    // Re-fetch whenever auth state changes (e.g. after wizard completes and logs in)
    setState(s => ({ ...s, loaded: false }))
    authApi.setupStatus()
      .then(res => setState({
        mode: res.data?.userMode === 'single' ? 'single' : 'multi',
        autoLogin: res.data?.autoLogin ?? false,
        loaded: true,
      }))
      .catch(() => setState({ mode: 'multi', autoLogin: false, loaded: true }))
  }, [user?.id])  // re-run when user changes (login/logout/setup complete)

  return <UserModeContext.Provider value={state}>{children}</UserModeContext.Provider>
}

export const useUserMode = () => useContext(UserModeContext).mode
export const useAutoLogin = () => useContext(UserModeContext).autoLogin
export const useUserModeLoaded = () => useContext(UserModeContext).loaded
export const useUserModeState = () => useContext(UserModeContext)
