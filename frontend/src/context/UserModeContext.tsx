import { createContext, useContext, useEffect, useState } from 'react'
import { authApi } from '../api'

interface UserModeState {
  mode: 'single' | 'multi' | null  // null = not yet loaded
  autoLogin: boolean
}

const UserModeContext = createContext<UserModeState>({ mode: null, autoLogin: false })

export function UserModeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UserModeState>({ mode: null, autoLogin: false })

  useEffect(() => {
    authApi.setupStatus()
      .then(res => setState({
        mode: res.data?.userMode === 'single' ? 'single' : 'multi',
        autoLogin: res.data?.autoLogin ?? false,
      }))
      .catch(() => setState({ mode: 'multi', autoLogin: false }))
  }, [])

  return <UserModeContext.Provider value={state}>{children}</UserModeContext.Provider>
}

export const useUserMode = () => useContext(UserModeContext).mode
export const useAutoLogin = () => useContext(UserModeContext).autoLogin
export const useUserModeState = () => useContext(UserModeContext)
