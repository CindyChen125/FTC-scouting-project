import { createContext, PropsWithChildren, useContext, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { Language, setCurrentLanguage, translate } from './index'

const storageKey = 'settings:language'
const BILINGUAL: Language = 'both'
const LanguageContext = createContext({ language: BILINGUAL })

export function LanguageProvider({ children }: PropsWithChildren) {
  setCurrentLanguage(BILINGUAL)
  useEffect(() => {
    try {
      Taro.setStorageSync(storageKey, BILINGUAL)
      Taro.removeStorageSync('scoutLanguage')
    } catch { /* Bilingual rendering does not depend on storage. */ }
    if (typeof document !== 'undefined') document.documentElement.lang = 'zh-CN'
  }, [])
  return <LanguageContext.Provider value={{ language: BILINGUAL }}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  return { ...context, t: translate }
}
