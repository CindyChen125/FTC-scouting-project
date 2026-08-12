import { EventTeamResult, RankedTeam } from '../types/ranking'

// Placeholder weights carried over from the app's design docs — Cindy said to
// make these up for now and adjust once real season data exists.
export const RANKING_WEIGHTS = {
  auto: 0.3,
  teleop: 0.35,
  endgame: 0.2,
  consistency: 0.1,
  defense: 0.05
}

const normalize = (value: number, min: number, max: number): number => {
  if (max === min) return 50
  return ((value - min) / (max - min)) * 100
}

export function computeRankings(teams: EventTeamResult[]): RankedTeam[] {
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

  const ranked: RankedTeam[] = teams.map((team) => {
    const auto = normalize(team.oprAuto, autoRange[0], autoRange[1])
    const teleop = normalize(team.oprTeleop, teleopRange[0], teleopRange[1])
    const endgame = normalize(team.oprEndgame, endgameRange[0], endgameRange[1])
    // Lower std deviation is better, so invert the normalized value.
    const consistency = 100 - normalize(team.devTotal, devRange[0], devRange[1])
    const defense = normalize(team.avgPenaltyByOpp, defenseRange[0], defenseRange[1])

    const breakdown = { auto, teleop, endgame, consistency, defense }
    const compositeScore =
      auto * RANKING_WEIGHTS.auto +
      teleop * RANKING_WEIGHTS.teleop +
      endgame * RANKING_WEIGHTS.endgame +
      consistency * RANKING_WEIGHTS.consistency +
      defense * RANKING_WEIGHTS.defense

    return { team, breakdown, compositeScore }
  })

  return ranked.sort((a, b) => b.compositeScore - a.compositeScore)
}
