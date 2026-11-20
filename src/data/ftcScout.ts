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
  season?: number
  matches: ScheduledMatch[]
  teams?: string[]
  fetchedAt?: number
}
const key = 'ftcScoutEvents:2026'
export const readImportedEvents = (): ImportedEvent[] => Taro.getStorageSync(key) || []

const normalizeEventName = (name: string) => name.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export async function findFtcScoutEvent(name: string, season = 2026): Promise<{ code: string; name: string } | null> {
  const url = `https://api.ftcscout.org/rest/v1/events/search/${season}?searchText=${encodeURIComponent(name.trim())}&limit=25`
  const response = await Taro.request<unknown>({ url, timeout: 10000 })
  if (response.statusCode !== 200 || !Array.isArray(response.data)) return null
  const results = response.data.filter((event) =>
    typeof event?.code === 'string' && typeof event?.name === 'string' && (!event.season || event.season === season)
  ) as Array<{ code: string; name: string; season?: number }>
  const normalizedName = normalizeEventName(name)
  const exact = results.find((event) => normalizeEventName(event.name) === normalizedName)
  const match = exact ?? (results.length === 1 ? results[0] : null)
  return match ? { code: match.code.toUpperCase(), name: match.name } : null
}

export async function syncImportedEvents(): Promise<ImportedEvent[]> {
  const { data, error } = await withTimeout(supabase.from('event_imports').select('data'))
  if (error) throw error
  const merged = new Map(readImportedEvents().map((event) => [event.code, event]))
  for (const row of data ?? []) {
    if (typeof row.data?.code === 'string' && Array.isArray(row.data?.matches)) merged.set(row.data.code, row.data)
  }
  const events = [...merged.values()]
  Taro.setStorageSync(key, events)
  return events
}

export async function importEvent(input: string, season = 2026): Promise<ImportedEvent> {
  const code = input.trim().toUpperCase()
  if (!/^[A-Z0-9]{2,24}$/.test(code)) throw new Error('Enter an FTCScout event code.')
  const url = `https://api.ftcscout.org/rest/v1/events/${season}/${code}`
  const [event, schedule, roster] = await Promise.all([
    Taro.request<{ name: string }>({ url, timeout: 10000 }),
    Taro.request<unknown>({ url: `${url}/matches`, timeout: 10000 }).catch(() => null),
    Taro.request<unknown>({ url: `${url}/teams`, timeout: 10000 }).catch(() => null)
  ])
  if (event.statusCode !== 200) {
    throw new Error('Could not load this event. Check the code and your connection.')
  }
  const matches: ScheduledMatch[] = []
  for (const match of (schedule.statusCode === 200 && Array.isArray(schedule.data) ? schedule.data : [])) {
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
  const result = { code, name: event.data?.name || code, season, matches: matches.sort((a, b) => a.number - b.number), teams, fetchedAt: Date.now() }
  Taro.setStorageSync(key, [...readImportedEvents().filter((e) => e.code !== code), result])
  const { error } = await withTimeout(supabase.from('event_imports').upsert({
    season, code, data: result, updated_at: new Date().toISOString()
  }, { onConflict: 'season,code' }))
  if (error) throw new Error('Saved on this device, but sharing failed. Check database setup and retry import.')
  return result
}

const refreshes = new Map<string, Promise<ImportedEvent>>()
export function refreshEventImportIfStale(code: string, season = 2026, maxAgeMs = 12 * 60 * 60 * 1000) {
  const normalizedCode = code.trim().toUpperCase()
  const current = readImportedEvents().find((event) => event.code === normalizedCode)
  if (current?.fetchedAt && Date.now() - current.fetchedAt < maxAgeMs) return Promise.resolve(current)
  const key = `${season}:${normalizedCode}`
  const existing = refreshes.get(key)
  if (existing) return existing
  const request = importEvent(normalizedCode, season).finally(() => refreshes.delete(key))
  refreshes.set(key, request)
  return request
}
