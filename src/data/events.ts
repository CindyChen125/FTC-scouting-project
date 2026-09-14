import fperocResults from './fperocResults.json'
import caoluResults from './caoluResults.json'
import { EventResultsData } from '../types/ranking'
import { Season } from '../types/scouting'

export interface EventInfo {
  code: string
  name: string
  season: Season
  // Official quals results baked in from ftcscout.org. Only past DECODE events
  // have these; BIOBUZZ events are ranked from our own scouting instead.
  results?: EventResultsData
}

// Every event we have scouting entries for, newest season first. Add a new
// entry here when scouting a new event.
export const EVENTS: EventInfo[] = [
  { code: 'BIOBUZZ-PRACTICE', name: 'BIOBUZZ 练习赛 Practice & Scrimmages', season: 2026 },
  { code: 'FPEROC', name: 'Canadian Rockies Premier Event @ KDays', season: 2025, results: fperocResults as EventResultsData },
  { code: 'CNSHOS', name: 'The CaoLu Cup Teenage Robot Design and Build Invitational Tournament #1', season: 2025, results: caoluResults as EventResultsData }
]

// The event currently being scouted — the default selection and the event new
// submissions are tagged with. Update when moving to a new event.
export const CURRENT_EVENT_CODE = EVENTS[0].code
export const CURRENT_SEASON: Season = 2026

// Entries saved before events were tracked have no eventCode. They all came
// from KDays, so they stay there however CURRENT_EVENT_CODE changes.
export const LEGACY_EVENT_CODE = 'FPEROC'

export const entryEventCode = (entry: { eventCode?: string }) =>
  entry.eventCode ?? LEGACY_EVENT_CODE

export const findEvent = (code: string): EventInfo =>
  EVENTS.find((e) => e.code === code) ?? EVENTS[0]
