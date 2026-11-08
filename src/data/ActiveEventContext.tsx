import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useState } from 'react'
import { CompetitionEvent, registerManagedEvents } from './events'
import { cacheActiveEvent, readCachedActiveEvent } from './selectedEvent'
import { fetchCompetitionEvents, subscribeCompetitionEvents } from '../supabase/events'
import { useAuth } from '../auth/AuthContext'
import Taro from '@tarojs/taro'

interface ActiveEventValue {
  activeEvent: CompetitionEvent
  events: CompetitionEvent[]
  loading: boolean
  offline: boolean
  refresh: () => Promise<void>
}

const fallback = readCachedActiveEvent()
const ActiveEventContext = createContext<ActiveEventValue>({
  activeEvent: fallback,
  events: [fallback],
  loading: true,
  offline: false,
  refresh: async () => {}
})

export const useActiveEvent = () => useContext(ActiveEventContext)

export function ActiveEventProvider({ children }: PropsWithChildren) {
  const { userId } = useAuth()
  const [activeEvent, setActiveEvent] = useState(readCachedActiveEvent)
  const [events, setEvents] = useState<CompetitionEvent[]>([readCachedActiveEvent()])
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)

  const applyEvents = useCallback((next: CompetitionEvent[]) => {
    registerManagedEvents(next)
    setEvents(next)
    const confirmed = next.find((event) => event.isActive)
    if (confirmed) {
      setActiveEvent(confirmed)
      cacheActiveEvent(confirmed)
    }
    setOffline(false)
    setLoading(false)
  }, [])

  const refresh = useCallback(async () => {
    try {
      applyEvents(await fetchCompetitionEvents())
    } catch (error) {
      setOffline(true)
      setLoading(false)
      throw error
    }
  }, [applyEvents])

  useEffect(() => {
    registerManagedEvents(events)
  }, [events])

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    return subscribeCompetitionEvents(
      applyEvents,
      () => {
        setOffline(true)
        setLoading(false)
      }
    )
  }, [applyEvents, userId])

  useEffect(() => {
    if (!userId || typeof Taro.onNetworkStatusChange !== 'function') return
    const handleNetwork = (status: { isConnected: boolean }) => {
      if (status.isConnected) refresh().catch(() => {})
    }
    Taro.onNetworkStatusChange(handleNetwork)
    return () => Taro.offNetworkStatusChange?.(handleNetwork)
  }, [refresh, userId])

  return (
    <ActiveEventContext.Provider value={{ activeEvent, events, loading, offline, refresh }}>
      {children}
    </ActiveEventContext.Provider>
  )
}
