import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Language, setCurrentLanguage, translate } from './index'

const storageKey = 'settings:language'
interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  toggleLanguage: () => void
}

function storedLanguage(): Language {
  try {
    const value = Taro.getStorageSync(storageKey) || Taro.getStorageSync('scoutLanguage')
    if (['en', 'English', 'english'].includes(value)) return 'en'
  } catch { /* Use the default language when storage is unavailable. */ }
  return 'zh'
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'zh',
  setLanguage: () => {},
  toggleLanguage: () => {}
})

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<Language>(storedLanguage)

  const setLanguage = useCallback((nextLanguage: Language) => {
    setCurrentLanguage(nextLanguage)
    setLanguageState(nextLanguage)
  }, [])
  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'zh' ? 'en' : 'zh')
  }, [language, setLanguage])

  setCurrentLanguage(language)
  useEffect(() => {
    try {
      Taro.setStorageSync(storageKey, language)
      Taro.removeStorageSync('scoutLanguage')
    } catch { /* Language switching still works for this session. */ }
    if (typeof document !== 'undefined') document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  }, [language])

  return <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage }}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  return { ...context, t: translate }
}
