import { useMemo, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import AppHeader from '../../components/AppHeader'
import { MatchScoutEntry } from '../../types/scouting'
import { computeRankings, RANKING_WEIGHTS } from '../../utils/ranking'
import fperocResults from '../../data/fperocResults.json'
import './index.scss'

type MainTab = 'mine' | 'rankings'

export default function CurrentData() {
  const [mainTab, setMainTab] = useState<MainTab>('mine')
  const [entries, setEntries] = useState<MatchScoutEntry[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

  const loadEntries = () => {
    const { keys } = Taro.getStorageInfoSync()
    const loaded = keys
      .filter((key) => key.startsWith('scout:'))
      .map((key) => Taro.getStorageSync(key) as MatchScoutEntry)
      .filter(Boolean)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    setEntries(loaded)
  }

  // Re-scan storage every time this page becomes visible so newly saved entries show up.
  useDidShow(() => {
    loadEntries()
  })

  const visibleEntries = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(
      (entry) => entry.matchId.toLowerCase().includes(q) || entry.teamNumber.toLowerCase().includes(q)
    )
  }, [entries, query])

  const rankedTeams = useMemo(() => computeRankings(fperocResults.teams), [])

  const visibleRankedTeams = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rankedTeams
    return rankedTeams.filter(
      (rt) => String(rt.team.number).includes(q) || rt.team.name.toLowerCase().includes(q)
    )
  }, [rankedTeams, query])

  return (
    <View className='data-page'>
      <AppHeader title='Current Data' showBack onSearch={() => setSearchOpen((open) => !open)} />

      <View className='page-content'>
        <View className='tab-bar'>
          <View className={`tab-item ${mainTab === 'mine' ? 'active' : ''}`} onClick={() => setMainTab('mine')}>
            My Scouting Data
          </View>
          <View className={`tab-item ${mainTab === 'rankings' ? 'active' : ''}`} onClick={() => setMainTab('rankings')}>
            Rankings
          </View>
        </View>

        {searchOpen && (
          <Input
            className='search-input'
            value={query}
            placeholder={mainTab === 'mine' ? 'Search by match or team #' : 'Search by team # or name'}
            // @ts-expect-error h5-only DOM attribute, prevents browser autofill from injecting saved values
            autoComplete='off'
            onInput={(e) => setQuery(e.detail.value)}
          />
        )}

        {mainTab === 'mine' && (
          <>
            {visibleEntries.length === 0 && (
              <Text className='empty-state'>
                {entries.length === 0 ? 'No scouting data saved yet.' : 'No entries match your search.'}
              </Text>
            )}

            {visibleEntries.map((entry) => (
              <View className='entry-card' key={`${entry.matchId}-${entry.teamNumber}`}>
                <View className='entry-header'>
                  <Text className='entry-title'>{entry.matchId} · Team {entry.teamNumber}</Text>
                  <Text className={`entry-alliance ${entry.alliance}`}>{entry.alliance}</Text>
                </View>
                <Text className='entry-meta'>Scout: {entry.scoutName || '—'}</Text>
                <Text className='entry-meta'>Updated: {new Date(entry.updatedAt).toLocaleString()}</Text>

                <View className='entry-stats'>
                  <View className='entry-stat'>
                    <Text className='entry-stat-label'>Auto goals</Text>
                    <Text className='entry-stat-value'>
                      {entry.auto.nearGoalsMade + entry.auto.farGoalsMade}/{entry.auto.nearGoalsAttempted + entry.auto.farGoalsAttempted}
                    </Text>
                  </View>
                  <View className='entry-stat'>
                    <Text className='entry-stat-label'>Teleop goals</Text>
                    <Text className='entry-stat-value'>
                      {entry.teleop.nearGoalsMade + entry.teleop.farGoalsMade}/{entry.teleop.nearGoalsAttempted + entry.teleop.farGoalsAttempted}
                    </Text>
                  </View>
                  <View className='entry-stat'>
                    <Text className='entry-stat-label'>Endgame</Text>
                    <Text className='entry-stat-value'>{entry.endgame.parkStatus}</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {mainTab === 'rankings' && (
          <>
            <View className='rankings-header'>
              <Text className='rankings-event-name'>{fperocResults.eventName}</Text>
              <Text className='rankings-event-meta'>
                Quals results · {fperocResults.teams.length} teams · custom weighted ranking
              </Text>
              <Text className='rankings-weights'>
                Weights: Auto {RANKING_WEIGHTS.auto * 100}% · Teleop {RANKING_WEIGHTS.teleop * 100}% · Endgame {RANKING_WEIGHTS.endgame * 100}% · Consistency {RANKING_WEIGHTS.consistency * 100}% · Defense {RANKING_WEIGHTS.defense * 100}%
              </Text>
            </View>

            {visibleRankedTeams.length === 0 && (
              <Text className='empty-state'>No teams match your search.</Text>
            )}

            {visibleRankedTeams.map((rt, i) => (
              <View className='team-card' key={rt.team.number}>
                <View className='team-header'>
                  <Text className='team-composite-rank'>#{i + 1}</Text>
                  <View className='team-header-text'>
                    <Text className='team-title'>{rt.team.number} · {rt.team.name}</Text>
                    <Text className='team-meta'>
                      {rt.team.wins}-{rt.team.losses}-{rt.team.ties} · quals rank {rt.team.rank}
                    </Text>
                  </View>
                  <Text className='team-score'>{rt.compositeScore.toFixed(1)}</Text>
                </View>

                <View className='team-breakdown'>
                  <View className='breakdown-row'>
                    <Text className='breakdown-label'>Auto</Text>
                    <View className='breakdown-bar-track'>
                      <View className='breakdown-bar-fill' style={{ width: `${rt.breakdown.auto}%` }} />
                    </View>
                  </View>
                  <View className='breakdown-row'>
                    <Text className='breakdown-label'>Teleop</Text>
                    <View className='breakdown-bar-track'>
                      <View className='breakdown-bar-fill' style={{ width: `${rt.breakdown.teleop}%` }} />
                    </View>
                  </View>
                  <View className='breakdown-row'>
                    <Text className='breakdown-label'>Endgame</Text>
                    <View className='breakdown-bar-track'>
                      <View className='breakdown-bar-fill' style={{ width: `${rt.breakdown.endgame}%` }} />
                    </View>
                  </View>
                  <View className='breakdown-row'>
                    <Text className='breakdown-label'>Consistency</Text>
                    <View className='breakdown-bar-track'>
                      <View className='breakdown-bar-fill' style={{ width: `${rt.breakdown.consistency}%` }} />
                    </View>
                  </View>
                  <View className='breakdown-row'>
                    <Text className='breakdown-label'>Defense</Text>
                    <View className='breakdown-bar-track'>
                      <View className='breakdown-bar-fill' style={{ width: `${rt.breakdown.defense}%` }} />
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}
      </View>
    </View>
  )
}
