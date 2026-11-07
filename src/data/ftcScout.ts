import Taro from '@tarojs/taro'
import { supabase } from '../supabase/config'
import { withTimeout } from '../supabase/timeout'

export const STATIONS = ['Red 1', 'Red 2', 'Blue 1', 'Blue 2'] as const
export type Station = typeof STATIONS[number]
export interface ScheduledMatch {
  number: number
  teams: Partial<Record<Station, string>>
  redScore?: number
  blueScore?: number
}
export interface ImportedEvent {
  code: string
  name: string
  matches: ScheduledMatch[]
  teams?: string[]
}
const key = 'ftcScoutEvents:2026'
export const readImportedEvents = (): ImportedEvent[] => Taro.getStorageSync(key) || []

export async function syncImportedEvents(): Promise<ImportedEvent[]> {
  const { data, error } = await withTimeout(supabase.from('event_imports').select('data').eq('season', 2026))
  if (error) throw error
  const merged = new Map(readImportedEvents().map((event) => [event.code, event]))
  for (const row of data ?? []) {
    if (typeof row.data?.code === 'string' && Array.isArray(row.data?.matches)) merged.set(row.data.code, row.data)
  }
  const events = [...merged.values()]
  Taro.setStorageSync(key, events)
  return events
}

export async function importEvent(input: string): Promise<ImportedEvent> {
  const code = input.trim().toUpperCase()
  if (!/^[A-Z0-9]{2,24}$/.test(code)) throw new Error('Enter an FTCScout event code.')
  const url = `https://api.ftcscout.org/rest/v1/events/2026/${code}`
  const [event, schedule, roster] = await Promise.all([
    Taro.request<{ name: string }>({ url, timeout: 10000 }),
    Taro.request<unknown>({ url: `${url}/matches`, timeout: 10000 }),
    Taro.request<unknown>({ url: `${url}/teams`, timeout: 10000 }).catch(() => null)
  ])
  if (event.statusCode !== 200 || schedule.statusCode !== 200 || !Array.isArray(schedule.data)) {
    throw new Error('Could not load this BIOBUZZ event. Check the code and your connection.')
  }
  const matches: ScheduledMatch[] = []
  for (const match of schedule.data) {
    if (match?.tournamentLevel !== 'Quals' || !Number.isSafeInteger(match.id) || !Array.isArray(match.teams)) continue
    const teams: ScheduledMatch['teams'] = {}
    for (const team of match.teams) {
      const alliance = team?.alliance
      const station = team?.station === 'One' ? 1 : team?.station === 'Two' ? 2 : 0
      if ((alliance === 'Red' || alliance === 'Blue') && station && Number.isSafeInteger(team.teamNumber)) {
        teams[`${alliance} ${station}` as Station] = String(team.teamNumber)
      }
    }
    matches.push({
      number: match.id,
      teams,
      redScore: match.hasBeenPlayed && Number.isFinite(match.scores?.red?.totalPoints) ? match.scores.red.totalPoints : undefined,
      blueScore: match.hasBeenPlayed && Number.isFinite(match.scores?.blue?.totalPoints) ? match.scores.blue.totalPoints : undefined
    })
  }
  const listedTeams = Array.isArray(roster?.data)
    ? roster.data.filter((team) => Number.isSafeInteger(team?.teamNumber)).map((team) => String(team.teamNumber))
    : []
  const teams = [...new Set([...listedTeams, ...matches.flatMap((match) => Object.values(match.teams))])]
    .sort((a, b) => Number(a) - Number(b))
  const result = { code, name: event.data?.name || code, matches: matches.sort((a, b) => a.number - b.number), teams }
  Taro.setStorageSync(key, [...readImportedEvents().filter((e) => e.code !== code), result])
  const { error } = await withTimeout(supabase.from('event_imports').upsert({
    season: 2026, code, data: result, updated_at: new Date().toISOString()
  }, { onConflict: 'season,code' }))
  if (error) throw new Error('Saved on this device, but sharing failed. Check database setup and retry import.')
  return result
}
