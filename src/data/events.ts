import fperocResults from './fperocResults.json'
import caoluResults from './caoluResults.json'
import { EventResultsData } from '../types/ranking'

export interface EventInfo {
  code: string
  name: string
  results: EventResultsData
}

// Every event we have ranking data + scouting entries for. Add a new entry
// here (plus its own results JSON, same shape as fperocResults.json) when
// scouting a new event.
export const EVENTS: EventInfo[] = [
  { code: 'FPEROC', name: 'Canadian Rockies Premier Event @ KDays', results: fperocResults },
  { code: 'CNSHOS', name: 'The CaoLu Cup Teenage Robot Design and Build Invitational Tournament #1', results: caoluResults }
]

// The event currently being scouted — used as the default selection and to
// tag new scouting submissions. Update when moving to a new event, and
// entries/rankings submitted before this feature existed (no eventCode) are
// treated as belonging to this event for backward compatibility.
export const CURRENT_EVENT_CODE = EVENTS[0].code

export const findEvent = (code: string): EventInfo =>
  EVENTS.find((e) => e.code === code) ?? EVENTS[0]
