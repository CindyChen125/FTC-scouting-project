import { supabase } from './config'
import { withTimeout } from './timeout'
import { CompetitionEvent } from '../data/events'
import { Season } from '../types/scouting'

type EventRow = {
  id: string
  code: string
  name: string
  season: number
  ftcscout_code: string | null
  is_active: boolean
  created_at: string
}

const fromRow = (row: EventRow): CompetitionEvent => ({
  id: row.id,
  code: row.code,
  name: row.name,
  season: row.season as Season,
  ftcScoutCode: row.ftcscout_code ?? undefined,
  isActive: row.is_active,
  createdAt: row.created_at
})

let eventsRequest: Promise<CompetitionEvent[]> | null = null

export function fetchCompetitionEvents(): Promise<CompetitionEvent[]> {
  if (eventsRequest) return eventsRequest
  eventsRequest = (async () => {
    const { data, error } = await withTimeout(
      supabase
        .from('competition_events')
        .select('id, code, name, season, ftcscout_code, is_active, created_at')
        .order('created_at', { ascending: false })
    )
    if (error) throw error
    return ((data ?? []) as EventRow[]).map(fromRow)
  })().finally(() => {
    eventsRequest = null
  })
  return eventsRequest
}

export async function createCompetitionEvent(input: {
  name: string
  season: Season
  ftcScoutCode?: string
}): Promise<CompetitionEvent> {
  const { data, error } = await withTimeout(
    supabase.rpc('create_competition_event', {
      event_name: input.name.trim(),
      event_season: input.season,
      event_ftcscout_code: input.ftcScoutCode?.trim().toUpperCase() || null
    })
  )
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Event was not created')
  return fromRow(row as EventRow)
}

export async function activateCompetitionEvent(eventId: string): Promise<CompetitionEvent> {
  const { data, error } = await withTimeout(
    supabase.rpc('set_active_competition_event', { target_event_id: eventId })
  )
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Event was not activated')
  return fromRow(row as EventRow)
}

let channelSeq = 0

export function subscribeCompetitionEvents(
  onChange: (events: CompetitionEvent[]) => void,
  onError?: (error: Error) => void
) {
  let active = true
  const load = async () => {
    try {
      const events = await fetchCompetitionEvents()
      if (active) onChange(events)
    } catch (error) {
      if (active) onError?.(error as Error)
    }
  }

  load()
  const channel = supabase
    .channel(`competition_events_${++channelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'competition_events' }, load)
    .subscribe()

  return () => {
    active = false
    supabase.removeChannel(channel)
  }
}
