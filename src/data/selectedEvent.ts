import Taro from '@tarojs/taro'
import { CompetitionEvent, CURRENT_EVENT_CODE, findEvent } from './events'

const ACTIVE_EVENT_KEY = 'events:active-cache'
const VIEWED_EVENT_KEY = 'events:viewed'

export function readCachedActiveEvent(): CompetitionEvent {
  try {
    const cached = Taro.getStorageSync(ACTIVE_EVENT_KEY) as CompetitionEvent | undefined
    if (cached?.code && cached?.name && cached?.season) return cached
  } catch { /* Fall through to the bundled event. */ }

  const fallback = findEvent(CURRENT_EVENT_CODE)
  return {
    id: `bundled:${fallback.code}`,
    ...fallback,
    isActive: true
  }
}

export function cacheActiveEvent(event: CompetitionEvent) {
  try { Taro.setStorageSync(ACTIVE_EVENT_KEY, event) } catch { /* Offline cache is best-effort. */ }
}

export function readViewedEventCode(fallback = readCachedActiveEvent().code): string {
  try { return Taro.getStorageSync(VIEWED_EVENT_KEY) || fallback } catch { return fallback }
}

export function writeViewedEventCode(code: string) {
  if (!code) return
  try { Taro.setStorageSync(VIEWED_EVENT_KEY, code) } catch { /* Keep browsing usable without storage. */ }
}
