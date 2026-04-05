import { createContext, useContext, useEffect, useState } from 'react'
import { configApi } from '../api'

type UserMode = 'single' | 'multi'

const UserModeContext = createContext<UserMode>('multi')

export function UserModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<UserMode>('multi')

  useEffect(() => {
    configApi.getMode().then(res => {
      if (res.data?.mode === 'single') setMode('single')
    }).catch(() => {})
  }, [])

  return <UserModeContext.Provider value={mode}>{children}</UserModeContext.Provider>
}

export const useUserMode = () => useContext(UserModeContext)
