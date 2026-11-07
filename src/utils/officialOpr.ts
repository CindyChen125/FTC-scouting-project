import type { ScheduledMatch } from '../data/ftcScout'

// Fit alliance scores from the qualification matches that have posted scores.
// If the schedule cannot identify individual contributions, omit the estimate.
export function officialOpr(matches: ScheduledMatch[]): Map<string, number> {
  const rows = matches.flatMap((match) => (['Red', 'Blue'] as const).flatMap((color) => {
    const a = match.teams[`${color} 1`]
    const b = match.teams[`${color} 2`]
    const score = color === 'Red' ? match.redScore : match.blueScore
    return a && b && a !== b && score !== undefined ? [{ a, b, score }] : []
  }))
  const teams = [...new Set(rows.flatMap(({ a, b }) => [a, b]))]
  const indexes = new Map(teams.map((team, index) => [team, index]))
  const n = teams.length
  const matrix = teams.map(() => Array<number>(n + 1).fill(0))
  for (const { a, b, score } of rows) {
    const ids = [indexes.get(a)!, indexes.get(b)!]
    for (const i of ids) {
      for (const j of ids) matrix[i][j] += 1
      matrix[i][n] += score
    }
  }
  for (let i = 0; i < n; i++) {
    let pivot = i
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(matrix[j][i]) > Math.abs(matrix[pivot][i])) pivot = j
    }
    if (Math.abs(matrix[pivot][i]) < 1e-9) return new Map()
    ;[matrix[i], matrix[pivot]] = [matrix[pivot], matrix[i]]
    const divisor = matrix[i][i]
    for (let k = i; k <= n; k++) matrix[i][k] /= divisor
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const multiple = matrix[j][i]
      for (let k = i; k <= n; k++) matrix[j][k] -= multiple * matrix[i][k]
    }
  }
  return new Map(teams.map((team, index) => [team, matrix[index][n]]))
}
