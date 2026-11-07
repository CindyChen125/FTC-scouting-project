import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { getLanguage, Language, LANGUAGES, setCurrentLanguage, translate } from './index'

const storageKey = 'settings:language'
const LanguageContext = createContext({ language: getLanguage(), setLanguage: (_: Language) => {} })

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, updateLanguage] = useState<Language>(() => {
    let saved: Language = 'both'
    try {
      const stored = Taro.getStorageSync(storageKey)
      const legacy = Taro.getStorageSync('scoutLanguage')
      saved = LANGUAGES.includes(stored) ? stored : legacy === 'English' ? 'en' : legacy === '中文' ? 'zh' : 'both'
    } catch { /* Language selection remains usable without device storage. */ }
    setCurrentLanguage(saved)
    return saved
  })
  const setLanguage = (next: Language) => {
    setCurrentLanguage(next)
    updateLanguage(next)
    try { Taro.setStorageSync(storageKey, next) } catch { /* Keep the session preference. */ }
  }
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN'
  }, [language])
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  return { ...context, t: translate }
}
