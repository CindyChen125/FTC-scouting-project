import { BiobuzzEntry, MatchScoutEntry, noteTagId } from '../types/scouting'
import { PitEntry } from '../types/pit'
import { CURRENT_SEASON, entryEventCode, findEvent } from '../data/events'
import { RankedTeam, RankingModel, RankingWeights, biobuzzRows, computeRankings,
  decodeRows, latestBiobuzzObservations, modelForSeason } from '../utils/ranking'

export interface TeamScoutingInsight {
  number: string
  observations: BiobuzzEntry[]
  pit: PitEntry | null
  rank: number | null
  ranking: RankedTeam | null
  autoBalls: number | null
  autoLeaveRate: number | null
  autoParkRate: number | null
  telePollen: number | null
  teleNectar: number | null
  flowerPollen: number | null
  flowerNectar: number | null
  endParkRate: number | null
  consistencySpread: number | null
  reportedIssues: string[]
  reportedStrengths: string[]
  relativeStrengths: string[]
  relativeGaps: string[]
  notes: string[]
}

export interface EventScoutingInsights {
  eventCode: string
  model: RankingModel
  ranked: RankedTeam[]
  teams: Map<string, TeamScoutingInsight>
  isBiobuzz: boolean
}

const mean = (values: number[]): number | null =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const rate = (values: boolean[]): number | null => mean(values.map((value) => value ? 1 : 0))
const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))]

export function buildEventScoutingInsights(eventCode: string, entries: MatchScoutEntry[],
  pitEntries: PitEntry[], opr: Map<string, number> = new Map(),
  weights?: RankingWeights): EventScoutingInsights {
  const event = findEvent(eventCode)
  const isBiobuzz = event.season === CURRENT_SEASON
  const eventEntries = entries.filter((entry) => entryEventCode(entry) === eventCode)
  const observations = isBiobuzz ? latestBiobuzzObservations(eventEntries as BiobuzzEntry[]) : []
  const baseModel = modelForSeason(event.season)
  const model = isBiobuzz && opr.size
    ? { ...baseModel, factors: [...baseModel.factors, { key: 'officialOpr', label: 'Official score OPR' }] }
    : baseModel
  const rows = event.results ? decodeRows(event.results.teams) :
    biobuzzRows(observations).map((row) => ({ ...row,
      raw: { ...row.raw, ...(opr.has(row.number) ? { officialOpr: opr.get(row.number)! } : {}) } }))
  const ranked = computeRankings(rows, model, weights ?? model.defaultWeights)
  const rankByTeam = new Map(ranked.map((team, index) => [team.row.number, { team, rank: index + 1 }]))
  const byTeam = new Map<string, BiobuzzEntry[]>()
  for (const entry of observations) {
    const number = entry.teamNumber.trim()
    if (!number) continue
    byTeam.set(number, [...(byTeam.get(number) ?? []), entry])
  }
  const pitByTeam = new Map<string, PitEntry>()
  for (const entry of pitEntries.filter((item) => item.eventCode === eventCode)) {
    const number = entry.teamNumber.trim()
    if (!number) continue
    const previous = pitByTeam.get(number)
    if (!previous || entry.updatedAt > previous.updatedAt) pitByTeam.set(number, entry)
  }
  const allNumbers = new Set([...rankByTeam.keys(), ...byTeam.keys(), ...pitByTeam.keys()])
  const teams = new Map<string, TeamScoutingInsight>()
  for (const number of allNumbers) {
    const list = byTeam.get(number) ?? []
    const ranking = rankByTeam.get(number)
    const tags = list.flatMap((entry) => [...(entry.auto.noteTags ?? []), ...(entry.teleop.noteTags ?? [])].map(noteTagId))
    const issues = unique(tags.filter((id) => id === 'disconnected' || id === 'mechanical-failure' || id === 'stuck-on-hive'))
    const strengths = unique(tags.filter((id) => id === 'defense'))
    const notes = unique(list.flatMap((entry) => [entry.overallNotes, entry.auto.noteText, entry.teleop.noteText]))
    const comparableFactors = model.factors.filter((factor) =>
      ['hive', 'auto', 'flowers', 'park', 'consistency'].includes(factor.key))
    const relativeStrengths = list.length >= 2 && ranked.length >= 2 && ranking
      ? comparableFactors.filter((factor) => ranking.team.breakdown[factor.key] >= 70).map((factor) => factor.label) : []
    const relativeGaps = list.length >= 2 && ranked.length >= 2 && ranking
      ? comparableFactors.filter((factor) => ranking.team.breakdown[factor.key] <= 30).map((factor) => factor.label) : []
    teams.set(number, {
      number, observations: list, pit: pitByTeam.get(number) ?? null,
      rank: ranking?.rank ?? null, ranking: ranking?.team ?? null,
      autoBalls: mean(list.map((entry) => entry.auto.cellBalls)),
      autoLeaveRate: rate(list.map((entry) => entry.auto.leave)),
      autoParkRate: rate(list.map((entry) => entry.auto.park)),
      telePollen: mean(list.map((entry) => entry.teleop.cellPollen)),
      teleNectar: mean(list.map((entry) => entry.teleop.cellNectar)),
      flowerPollen: mean(list.map((entry) => entry.endgame.flowerPollen)),
      flowerNectar: mean(list.map((entry) => entry.endgame.flowerNectar)),
      endParkRate: rate(list.map((entry) => entry.endgame.park)),
      consistencySpread: list.length >= 2 && ranking ? -ranking.team.row.raw.consistency : null,
      reportedIssues: issues, reportedStrengths: strengths, relativeStrengths, relativeGaps, notes
    })
  }
  return { eventCode, model, ranked, teams, isBiobuzz }
}
