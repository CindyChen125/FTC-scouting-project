import { EventTeamResult } from '../types/ranking'
import { BiobuzzEntry, Season , noteTagId } from '../types/scouting'
import { hiveBalls, flowerBalls, allianceTips, movementPoints } from '../games/biobuzz'
import { translate as tr } from '../i18n'

export interface RankingFactorDef {
  key: string
  label: string
}

export type RankingWeights = Record<string, number>

// What a season's ranking is built from: which factors, their starting
// weights, and where a user's own slider tweaks are remembered.
export interface RankingModel {
  factors: RankingFactorDef[]
  defaultWeights: RankingWeights
  storageKey: string
}

// One team's raw numbers, before normalizing. Higher is better for every
// factor — anything where lower is better is flipped when the row is built.
export interface RankRow {
  number: string
  title: string
  meta: string
  raw: Record<string, number>
}

export interface RankedTeam {
  row: RankRow
  // 0–100 per factor, relative to the other teams at the event.
  breakdown: Record<string, number>
  compositeScore: number
}

const normalize = (value: number, min: number, max: number): number => {
  if (max === min) return 50
  return ((value - min) / (max - min)) * 100
}

// Computes each team's normalized 0–100 score per factor plus a weighted
// composite. The weights don't need to sum to 1 — they're normalized by their
// total so the composite always stays on the 0–100 scale.
export function computeRankings(
  rows: RankRow[],
  model: RankingModel,
  weights: RankingWeights = model.defaultWeights
): RankedTeam[] {
  const ranges = Object.fromEntries(
    model.factors.map(({ key }) => {
      const values = rows.map((r) => r.raw[key]).filter(Number.isFinite)
      return [key, [Math.min(...values), Math.max(...values)]]
    })
  )
  const ranked = rows.map((row) => {
    const available = model.factors.filter(({ key }) => Number.isFinite(row.raw[key]))
    const totalWeight = available.reduce((sum, f) => sum + (weights[f.key] ?? 0), 0)
    const breakdown = Object.fromEntries(
      model.factors.map(({ key }) => [key, Number.isFinite(row.raw[key]) ? normalize(row.raw[key], ranges[key][0], ranges[key][1]) : 50])
    )
    const weightedSum = available.reduce(
      (sum, f) => sum + breakdown[f.key] * (weights[f.key] ?? 0),
      0
    )
    const compositeScore = totalWeight === 0 ? 0 : weightedSum / totalWeight
    return { row, breakdown, compositeScore }
  })

  return ranked.sort((a, b) => b.compositeScore - a.compositeScore)
}

// ---- DECODE 2025: official results from ftcscout.org ----

export const DECODE_MODEL: RankingModel = {
  factors: [
    { key: 'auto', label: 'Auto' },
    { key: 'teleop', label: 'Teleop' },
    { key: 'endgame', label: 'Endgame' },
    { key: 'consistency', label: 'Consistency' },
    { key: 'defense', label: 'Defense' }
  ],
  // Placeholder weights from the app's design docs — never tuned against real data.
  defaultWeights: { auto: 0.3, teleop: 0.35, endgame: 0.2, consistency: 0.1, defense: 0.05 },
  storageKey: 'rankingWeights'
}

export const decodeRows = (teams: EventTeamResult[]): RankRow[] =>
  teams.map((t) => ({
    number: String(t.number),
    title: `${t.number} · ${t.name}`,
    meta: tr('qualificationRank', { wins: t.wins, losses: t.losses, ties: t.ties, rank: t.rank }),
    raw: {
      auto: t.oprAuto,
      teleop: t.oprTeleop,
      endgame: t.oprEndgame,
      // Lower std deviation is better.
      consistency: -t.devTotal,
      defense: t.avgPenaltyByOpp
    }
  }))

// ---- BIOBUZZ 2026: our own scouting entries ----

export const BIOBUZZ_MODEL: RankingModel = {
  factors: [
    { key: 'hive', label: 'Hive' },
    { key: 'auto', label: 'Auto' },
    { key: 'flowers', label: 'Flowers' },
    { key: 'park', label: 'Leave+Park' },
    { key: 'tips', label: 'Alliance tips' },
    { key: 'reliability', label: 'No reported breakdown' },
    { key: 'consistency', label: 'Consistency' }
  ],
  // Hive shooting drives both match points and two RPs, so it leads. Starting
  // guesses — adjust once real matches show what wins.
  defaultWeights: { hive: 0.45, auto: 0.2, flowers: 0.15, park: 0.1, tips: 0, reliability: 0, consistency: 0.1 },
  storageKey: 'rankingWeights:2026'
}

const mean = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length

const stdDev = (values: number[]) => {
  const m = mean(values)
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)))
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function biobuzzRows(entries: BiobuzzEntry[]): RankRow[] {
  // Use the latest observation per match for rankings; keep every raw record
  // in the data list and export so disagreements remain reviewable.
  const perMatch = new Map<string, BiobuzzEntry>()
  for (const entry of entries) {
    const key = JSON.stringify([entry.eventCode, entry.matchId, entry.teamNumber.trim()])
    const previous = perMatch.get(key)
    if (!previous || entry.updatedAt > previous.updatedAt) perMatch.set(key, entry)
  }
  entries = [...perMatch.values()]
  const byTeam = new Map<string, BiobuzzEntry[]>()
  for (const e of entries) {
    const team = e.teamNumber.trim()
    if (!team) continue
    byTeam.set(team, [...(byTeam.get(team) ?? []), e])
  }

  const teams = [...byTeam.entries()].map(([number, list]) => ({
    number,
    list,
    totals: list.map((e) => hiveBalls(e) + flowerBalls(e))
  }))

  // A single match has no spread, which would rank a team seen once as the
  // most consistent. Give those the typical spread of teams seen more often.
  const knownSpreads = teams.filter((t) => t.list.length >= 2).map((t) => stdDev(t.totals))
  const typicalSpread = mean(knownSpreads)

  return teams.map(({ number, list, totals }) => {
    const hive = mean(list.map((e) => e.teleop.cellPollen + e.teleop.cellNectar))
    const flowers = mean(list.map(flowerBalls))
    const failures = list.filter((entry) =>
      [...(entry.auto.noteTags ?? []), ...(entry.teleop.noteTags ?? [])].some((tag) => {
        const id = noteTagId(tag)
        return id === 'disconnected' || id === 'mechanical-failure'
      })
    ).length
    return {
      number,
      title: tr('teamNumber', { number }),
      meta: tr('teamSummary', { count: list.length, failures, hive: round1(mean(list.map(hiveBalls))), flowers: round1(flowers) }),
      raw: {
        hive,
        auto: mean(list.map((e) => e.auto.cellBalls)),
        flowers,
        park: mean(list.map(movementPoints)),
        tips: mean(list.map(allianceTips)),
        reliability: 1 - failures / list.length,
        consistency: -(list.length >= 2 ? stdDev(totals) : typicalSpread)
      }
    }
  })
}

export const modelForSeason = (season: Season): RankingModel =>
  season === 2025 ? DECODE_MODEL : BIOBUZZ_MODEL
