import messages from './messages.json'

export type Language = 'both'
let currentLanguage: Language = 'both'
export const getLanguage = () => currentLanguage
export const setCurrentLanguage = (_language: Language) => { currentLanguage = 'both' }

// Only interface messages go through this function. IDs and free text stay intact.
export function translate(key: string, values: Record<string, string | number> = {}, _language = currentLanguage): string {
  const message = (messages as Record<string, { en: string; zh: string }>)[key]
  const template = message
    ? message.zh === message.en ? message.en : `${message.zh} / ${message.en}`
    : key
  return template.replace(/\{(\w+)\}/g, (token, name) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : token)
}

export const dateTime = (value: number) => new Date(value).toLocaleString('zh-CN')
