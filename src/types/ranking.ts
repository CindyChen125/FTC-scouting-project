// One team's quals performance at a reference event, pulled from ftcscout.org's
// GraphQL API (api.ftcscout.org) and baked into a static JSON file at build time —
// this data is historical (event already finished) so it doesn't need a live fetch.
export interface EventTeamResult {
  number: number
  name: string
  rank: number
  wins: number
  losses: number
  ties: number
  qualMatchesPlayed: number
  // Per-team contribution estimates (OPR) decomposed from alliance-level scores.
  oprAuto: number
  oprTeleop: number
  oprEndgame: number
  avgTotal: number
  // Avg points awarded to this team's alliance from opponent penalties — proxy for defensive pressure.
  avgPenaltyByOpp: number
  // Std deviation of total match score — lower means more consistent.
  devTotal: number
}

export interface EventResultsData {
  season: number
  eventCode: string
  eventName: string
  teams: EventTeamResult[]
}

export interface RankingBreakdown {
  auto: number
  teleop: number
  endgame: number
  consistency: number
  defense: number
}

export interface RankedTeam {
  team: EventTeamResult
  breakdown: RankingBreakdown
  compositeScore: number
}
