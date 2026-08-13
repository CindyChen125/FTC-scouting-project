import { EventTeamResult, RankedTeam } from '../types/ranking'

export type RankingFactor = 'auto' | 'teleop' | 'endgame' | 'consistency' | 'defense'

export interface RankingWeights {
  auto: number
  teleop: number
  endgame: number
  consistency: number
  defense: number
}

// Placeholder weights carried over from the app's design docs — Cindy said to
// make these up for now and adjust once real season data exists. Users can now
// tweak them live in the Rankings tab.
export const RANKING_WEIGHTS: RankingWeights = {
  auto: 0.3,
  teleop: 0.35,
  endgame: 0.2,
  consistency: 0.1,
  defense: 0.05
}

// Order + labels used to render factor buttons and the weight sliders.
export const RANKING_FACTORS: { key: RankingFactor; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'teleop', label: 'Teleop' },
  { key: 'endgame', label: 'Endgame' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'defense', label: 'Defense' }
]

const normalize = (value: number, min: number, max: number): number => {
  if (max === min) return 50
  return ((value - min) / (max - min)) * 100
}

// Computes each team's normalized 0–100 score per factor plus a weighted
// composite. The weights don't need to sum to 1 — they're normalized by their
// total so the composite always stays on the 0–100 scale.
export function computeRankings(
  teams: EventTeamResult[],
  weights: RankingWeights = RANKING_WEIGHTS
): RankedTeam[] {
  const autoVals = teams.map((t) => t.oprAuto)
  const teleopVals = teams.map((t) => t.oprTeleop)
  const endgameVals = teams.map((t) => t.oprEndgame)
  const devVals = teams.map((t) => t.devTotal)
  const defenseVals = teams.map((t) => t.avgPenaltyByOpp)

  const autoRange = [Math.min(...autoVals), Math.max(...autoVals)]
  const teleopRange = [Math.min(...teleopVals), Math.max(...teleopVals)]
  const endgameRange = [Math.min(...endgameVals), Math.max(...endgameVals)]
  const devRange = [Math.min(...devVals), Math.max(...devVals)]
  const defenseRange = [Math.min(...defenseVals), Math.max(...defenseVals)]

  const totalWeight =
    weights.auto + weights.teleop + weights.endgame + weights.consistency + weights.defense

  const ranked: RankedTeam[] = teams.map((team) => {
    const auto = normalize(team.oprAuto, autoRange[0], autoRange[1])
    const teleop = normalize(team.oprTeleop, teleopRange[0], teleopRange[1])
    const endgame = normalize(team.oprEndgame, endgameRange[0], endgameRange[1])
    // Lower std deviation is better, so invert the normalized value.
    const consistency = 100 - normalize(team.devTotal, devRange[0], devRange[1])
    const defense = normalize(team.avgPenaltyByOpp, defenseRange[0], defenseRange[1])

    const breakdown = { auto, teleop, endgame, consistency, defense }
    const weightedSum =
      auto * weights.auto +
      teleop * weights.teleop +
      endgame * weights.endgame +
      consistency * weights.consistency +
      defense * weights.defense
    const compositeScore = totalWeight === 0 ? 0 : weightedSum / totalWeight

    return { team, breakdown, compositeScore }
  })

  return ranked.sort((a, b) => b.compositeScore - a.compositeScore)
}
