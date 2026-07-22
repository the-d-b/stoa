import React, { createContext, useContext, useEffect, useState } from 'react'
import { preferencesApi, cssApi } from '../api'

export type ThemeName = 'void' | 'slate' | 'carbon' | 'paper' | 'fog' | 'linen'

export interface ThemeDef {
  name: ThemeName
  label: string
  dark: boolean
  vars: Record<string, string>
  swatch: string
}

export const THEME_VAR_KEYS = [
  '--bg', '--surface', '--surface2', '--border', '--border2',
  '--text', '--text-muted', '--text-dim',
  '--accent', '--accent2', '--accent-bg',
  '--green', '--red', '--amber',
] as const

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

// ── Color math for the custom-theme picker ─────────────────────────────────
// Lets the picker derive the "supporting" variables (surface2, border2,
// text-muted, text-dim, accent2, accent-bg) from a small set of colors the
// user actually picks, following the ratios observed across the 6 built-in
// themes above.

export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a), cb = parseHex(b)
  if (!ca || !cb) return a
  const mix = (x: number, y: number) => Math.max(0, Math.min(255, Math.round(x + (y - x) * t)))
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(mix(ca.r, cb.r))}${toHex(mix(ca.g, cb.g))}${toHex(mix(ca.b, cb.b))}`
}

export function relativeLuminance(hex: string): number {
  const c = parseHex(hex)
  if (!c) return 0
  return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255
}

export interface PickedColors {
  bg: string
  surface: string
  border: string
  text: string
  accent: string
  green: string
  red: string
  amber: string
}

export function deriveThemeVars(picked: PickedColors, dark: boolean): Record<string, string> {
  return {
    '--bg': picked.bg,
    '--surface': picked.surface,
    '--surface2': mixHex(picked.surface, picked.text, 0.05),
    '--border': picked.border,
    '--border2': mixHex(picked.border, picked.text, 0.15),
    '--text': picked.text,
    '--text-muted': mixHex(picked.text, picked.bg, 0.45),
    '--text-dim': mixHex(picked.text, picked.bg, 0.7),
    '--accent': picked.accent,
    '--accent2': mixHex(picked.accent, dark ? '#ffffff' : '#000000', dark ? 0.3 : 0.18),
    '--accent-bg': picked.accent + '12',
    '--green': picked.green,
    '--red': picked.red,
    '--amber': picked.amber,
  }
}

export function themeVarsToCSS(vars: Record<string, string>): string {
  const decls = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n')
  return `:root {\n${decls}\n}\n`
}

// ── Stylesheet-based application ────────────────────────────────────────────
// Both built-in and custom themes are applied as real stylesheet rules (never
// inline styles), so whichever was applied most recently is exclusively in
// effect — no leftover higher-specificity values from a previous theme.

const BUILTIN_STYLE_ID = 'stoa-theme-vars'
const CUSTOM_STYLE_ID = 'stoa-custom-css'

function setStylesheet(id: string, cssText: string) {
  let el = document.getElementById(id) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = id
    document.head.appendChild(el)
  }
  el.textContent = cssText
}

function removeStylesheet(id: string) {
  document.getElementById(id)?.remove()
}

function readComputedDef(name: string): ThemeDef {
  const style = getComputedStyle(document.documentElement)
  const vars: Record<string, string> = {}
  THEME_VAR_KEYS.forEach(k => { vars[k] = style.getPropertyValue(k).trim() })
  return {
    name: name as ThemeName,
    label: name,
    dark: relativeLuminance(vars['--bg'] || '#000000') < 0.5,
    vars,
    swatch: vars['--accent'] || '#888888',
  }
}

export function isCustomPref(pref: string): boolean {
  return pref.startsWith('custom:')
}

export function customFilename(pref: string): string {
  return pref.slice('custom:'.length)
}

interface ThemeContextType {
  theme: ThemeName
  themePref: string
  isCustom: boolean
  setTheme: (t: ThemeName, persist?: boolean) => void
  setCustomTheme: (filename: string, persist?: boolean) => Promise<void>
  refreshCustomTheme: () => Promise<void>
  themeDef: ThemeDef
}

const ThemeContext = createContext<ThemeContextType | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('void')
  const [themePref, setThemePrefState] = useState<string>('void')
  const [isCustom, setIsCustom] = useState(false)
  const [themeDef, setThemeDef] = useState<ThemeDef>(THEMES[0])

  const applyPref = async (pref: string) => {
    if (isCustomPref(pref)) {
      const filename = customFilename(pref)
      try {
        const res = await fetch(cssApi.url(filename))
        if (!res.ok) throw new Error('missing')
        const text = await res.text()
        removeStylesheet(BUILTIN_STYLE_ID)
        setStylesheet(CUSTOM_STYLE_ID, text)
        setIsCustom(true)
        setThemePrefState(pref)
        setThemeDef(readComputedDef(filename))
        return
      } catch {
        // Sheet missing/deleted — fall through to the default built-in theme
        pref = 'void'
      }
    }
    removeStylesheet(CUSTOM_STYLE_ID)
    const def = THEMES.find(t => t.name === pref) || THEMES[0]
    setStylesheet(BUILTIN_STYLE_ID, themeVarsToCSS(def.vars))
    setIsCustom(false)
    setThemeState(def.name)
    setThemePrefState(def.name)
    setThemeDef(def)
  }

  useEffect(() => {
    const token = localStorage.getItem('stoa_token')
    if (token) {
      preferencesApi.get().then(r => {
        const pref = r.data.theme
        if (pref) {
          localStorage.setItem('stoa_theme', pref)
          applyPref(pref)
        } else {
          const local = localStorage.getItem('stoa_theme')
          applyPref(local || 'void')
        }
      }).catch(() => {
        const local = localStorage.getItem('stoa_theme')
        applyPref(local || 'void')
      })
    } else {
      const saved = localStorage.getItem('stoa_theme')
      applyPref(saved || 'void')
    }
  }, [])

  const setTheme = (t: ThemeName, persist = true) => {
    localStorage.setItem('stoa_theme', t)
    applyPref(t)
    if (persist && localStorage.getItem('stoa_token')) {
      preferencesApi.save({ theme: t }).catch(() => {})
    }
  }

  const setCustomTheme = async (filename: string, persist = true) => {
    const pref = `custom:${filename}`
    localStorage.setItem('stoa_theme', pref)
    await applyPref(pref)
    if (persist && localStorage.getItem('stoa_token')) {
      preferencesApi.save({ theme: pref }).catch(() => {})
    }
  }

  const refreshCustomTheme = async () => {
    if (isCustom) await applyPref(themePref)
  }

  return (
    <ThemeContext.Provider value={{ theme, themePref, isCustom, setTheme, setCustomTheme, refreshCustomTheme, themeDef }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
