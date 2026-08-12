import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react'
import Taro from '@tarojs/taro'

export type ThemeMode = 'light' | 'dark'

const THEME_KEY = 'settings:theme'
const FONT_SCALE_KEY = 'settings:fontScale'

export const FONT_SCALE_MIN = 85
export const FONT_SCALE_MAX = 130
export const FONT_SCALE_STEP = 5
const DEFAULT_FONT_SCALE_PERCENT = 100

interface ThemeContextValue {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  fontScalePercent: number
  setFontScalePercent: (percent: number) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function loadTheme(): ThemeMode {
  const saved = Taro.getStorageSync(THEME_KEY)
  return saved === 'dark' ? 'dark' : 'light'
}

function loadFontScalePercent(): number {
  const saved = Taro.getStorageSync(FONT_SCALE_KEY)
  return typeof saved === 'number' && saved >= FONT_SCALE_MIN && saved <= FONT_SCALE_MAX
    ? saved
    : DEFAULT_FONT_SCALE_PERCENT
}

export function ThemeProvider({ children }: PropsWithChildren<any>) {
  const [theme, setThemeState] = useState<ThemeMode>(loadTheme)
  const [fontScalePercent, setFontScalePercentState] = useState<number>(loadFontScalePercent)

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.classList.toggle('theme-dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.style.setProperty('--font-scale', String(fontScalePercent / 100))
  }, [fontScalePercent])

  const setTheme = (next: ThemeMode) => {
    setThemeState(next)
    Taro.setStorageSync(THEME_KEY, next)
  }

  const setFontScalePercent = (percent: number) => {
    setFontScalePercentState(percent)
    Taro.setStorageSync(FONT_SCALE_KEY, percent)
  }

  const value = useMemo(
    () => ({ theme, setTheme, fontScalePercent, setFontScalePercent }),
    [theme, fontScalePercent]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
