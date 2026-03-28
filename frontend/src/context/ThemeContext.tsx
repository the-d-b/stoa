import React, { createContext, useContext, useEffect, useState } from 'react'

export type ThemeName = 'void' | 'slate' | 'carbon' | 'paper' | 'fog' | 'linen'

export interface ThemeDef {
  name: ThemeName
  label: string
  dark: boolean
  vars: Record<string, string>
  swatch: string
}

export const THEMES: ThemeDef[] = [
  {
    name: 'void', label: 'Void', dark: true, swatch: '#7c6fff',
    vars: {
      '--bg': '#0c0c0f', '--surface': '#13131a', '--surface2': '#1a1a24',
      '--border': '#ffffff0f', '--border2': '#ffffff18',
      '--text': '#e8e8f0', '--text-muted': '#6b6b80', '--text-dim': '#3a3a50',
      '--accent': '#7c6fff', '--accent2': '#a594ff', '--accent-bg': '#7c6fff12',
      '--green': '#4ade80', '--red': '#f87171', '--amber': '#fbbf24',
    }
  },
  {
    name: 'slate', label: 'Slate', dark: true, swatch: '#60a5fa',
    vars: {
      '--bg': '#0d1117', '--surface': '#161b22', '--surface2': '#21262d',
      '--border': '#30363d', '--border2': '#444c56',
      '--text': '#e6edf3', '--text-muted': '#7d8590', '--text-dim': '#3d444d',
      '--accent': '#60a5fa', '--accent2': '#93c5fd', '--accent-bg': '#60a5fa12',
      '--green': '#3fb950', '--red': '#f85149', '--amber': '#d29922',
    }
  },
  {
    name: 'carbon', label: 'Carbon', dark: true, swatch: '#fb923c',
    vars: {
      '--bg': '#111110', '--surface': '#1c1b1a', '--surface2': '#242423',
      '--border': '#2e2c2a', '--border2': '#3d3a37',
      '--text': '#eeece9', '--text-muted': '#79746c', '--text-dim': '#44403c',
      '--accent': '#fb923c', '--accent2': '#fdba74', '--accent-bg': '#fb923c12',
      '--green': '#86efac', '--red': '#fca5a5', '--amber': '#fde68a',
    }
  },
  {
    name: 'paper', label: 'Paper', dark: false, swatch: '#7c6fff',
    vars: {
      '--bg': '#fafaf9', '--surface': '#ffffff', '--surface2': '#f5f5f4',
      '--border': '#e7e5e4', '--border2': '#d6d3d1',
      '--text': '#1c1917', '--text-muted': '#78716c', '--text-dim': '#a8a29e',
      '--accent': '#7c6fff', '--accent2': '#6d59f0', '--accent-bg': '#7c6fff12',
      '--green': '#16a34a', '--red': '#dc2626', '--amber': '#d97706',
    }
  },
  {
    name: 'fog', label: 'Fog', dark: false, swatch: '#3b82f6',
    vars: {
      '--bg': '#f8fafc', '--surface': '#ffffff', '--surface2': '#f1f5f9',
      '--border': '#e2e8f0', '--border2': '#cbd5e1',
      '--text': '#0f172a', '--text-muted': '#64748b', '--text-dim': '#94a3b8',
      '--accent': '#3b82f6', '--accent2': '#2563eb', '--accent-bg': '#3b82f612',
      '--green': '#16a34a', '--red': '#dc2626', '--amber': '#d97706',
    }
  },
  {
    name: 'linen', label: 'Linen', dark: false, swatch: '#16a34a',
    vars: {
      '--bg': '#fdf6ec', '--surface': '#fffbf5', '--surface2': '#f7edd8',
      '--border': '#e8d8be', '--border2': '#d4c4a8',
      '--text': '#1a1208', '--text-muted': '#7c6a4e', '--text-dim': '#a89880',
      '--accent': '#16a34a', '--accent2': '#15803d', '--accent-bg': '#16a34a12',
      '--green': '#15803d', '--red': '#b91c1c', '--amber': '#b45309',
    }
  },
]

interface ThemeContextType {
  theme: ThemeName
  setTheme: (t: ThemeName) => void
  themeDef: ThemeDef
}

const ThemeContext = createContext<ThemeContextType | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('void')

  useEffect(() => {
    const saved = localStorage.getItem('stoa_theme') as ThemeName
    if (saved) applyTheme(saved)
  }, [])

  const setTheme = (t: ThemeName) => {
    localStorage.setItem('stoa_theme', t)
    applyTheme(t)
  }

  const applyTheme = (t: ThemeName) => {
    const def = THEMES.find(th => th.name === t) || THEMES[0]
    const root = document.documentElement
    Object.entries(def.vars).forEach(([k, v]) => root.style.setProperty(k, v))
    setThemeState(t)
  }

  const themeDef = THEMES.find(t => t.name === theme) || THEMES[0]

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themeDef }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
