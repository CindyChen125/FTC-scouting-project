import messages from './messages.json'

export type Language = 'en' | 'zh'
let currentLanguage: Language = 'zh'
export const getLanguage = () => currentLanguage
export const setCurrentLanguage = (language: Language) => { currentLanguage = language }

// Only interface messages go through this function. IDs and free text stay intact.
export function translate(key: string, values: Record<string, string | number> = {}, language = currentLanguage): string {
  const message = (messages as Record<string, { en: string; zh: string }>)[key]
  const template = message ? message[language] : key
  return template.replace(/\{(\w+)\}/g, (token, name) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : token)
}

export const dateTime = (value: number) => new Date(value).toLocaleString(currentLanguage === 'zh' ? 'zh-CN' : 'en-US')
