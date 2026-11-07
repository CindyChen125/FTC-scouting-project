import Taro from '@tarojs/taro'
import { CURRENT_EVENT_CODE } from './events'

const SELECTED_EVENT_KEY = 'settings:selectedEvent'

export function readSelectedEventCode(): string {
  try {
    return Taro.getStorageSync(SELECTED_EVENT_KEY) || CURRENT_EVENT_CODE
  } catch {
    return CURRENT_EVENT_CODE
  }
}

export function writeSelectedEventCode(code: string) {
  if (!code) return
  try { Taro.setStorageSync(SELECTED_EVENT_KEY, code) } catch { /* Keep the current view usable. */ }
}
