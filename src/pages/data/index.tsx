import { useMemo, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import AppHeader from '../../components/AppHeader'
import RangeSlider from '../../components/RangeSlider'
import { MatchScoutEntry } from '../../types/scouting'
import {
  computeRankings,
  RANKING_WEIGHTS,
  RANKING_FACTORS,
  RankingFactor,
  RankingWeights
} from '../../utils/ranking'
import fperocResults from '../../data/fperocResults.json'
import './index.scss'

type MainTab = 'mine' | 'rankings'

const WEIGHTS_STORAGE_KEY = 'rankingWeights'

const meanOf = (breakdown: Record<RankingFactor, number>, factors: RankingFactor[]) =>
  factors.reduce((sum, f) => sum + breakdown[f], 0) / factors.length

const loadStoredWeights = (): RankingWeights => {
  const stored = Taro.getStorageSync(WEIGHTS_STORAGE_KEY)
  return stored ? { ...RANKING_WEIGHTS, ...stored } : { ...RANKING_WEIGHTS }
}

export default function CurrentData() {
  const [mainTab, setMainTab] = useState<MainTab>('mine')
  const [entries, setEntries] = useState<MatchScoutEntry[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Empty selection = Overall (weighted composite). One or more selected =
  // rank by the average of those factors' scores.
  const [selectedFactors, setSelectedFactors] = useState<RankingFactor[]>([])
  const [weights, setWeights] = useState<RankingWeights>(loadStoredWeights)

  const isOverall = selectedFactors.length === 0

  const toggleFactor = (factor: RankingFactor) => {
    setSelectedFactors((prev) =>
      prev.includes(factor) ? prev.filter((f) => f !== factor) : [...prev, factor]
    )
  }

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

  const updateWeight = (factor: RankingFactor, value: number) => {
    setWeights((prev) => {
      const next = { ...prev, [factor]: value }
      Taro.setStorageSync(WEIGHTS_STORAGE_KEY, next)
      return next
    })
  }

  const resetWeights = () => {
    setWeights({ ...RANKING_WEIGHTS })
    Taro.setStorageSync(WEIGHTS_STORAGE_KEY, { ...RANKING_WEIGHTS })
  }

  const visibleEntries = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(
      (entry) => entry.matchId.toLowerCase().includes(q) || entry.teamNumber.toLowerCase().includes(q)
    )
  }, [entries, query])

  // Compute the weighted composite + per-factor breakdown, then order by the
  // selected mode: Overall = composite, otherwise by the average of the
  // chosen factors.
  const rankedTeams = useMemo(() => {
    const ranked = computeRankings(fperocResults.teams, weights)
    if (selectedFactors.length === 0) return ranked
    return [...ranked].sort(
      (a, b) => meanOf(b.breakdown, selectedFactors) - meanOf(a.breakdown, selectedFactors)
    )
  }, [weights, selectedFactors])

  const visibleRankedTeams = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rankedTeams
    return rankedTeams.filter(
      (rt) => String(rt.team.number).includes(q) || rt.team.name.toLowerCase().includes(q)
    )
  }, [rankedTeams, query])

  const scoreFor = (rt: typeof rankedTeams[number]) =>
    isOverall ? rt.compositeScore : meanOf(rt.breakdown, selectedFactors)

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
                      {entry.auto.nearGoalsMade + entry.auto.farGoalsMade}
                    </Text>
                  </View>
                  <View className='entry-stat'>
                    <Text className='entry-stat-label'>Teleop goals</Text>
                    <Text className='entry-stat-value'>
                      {entry.teleop.nearGoalsMade + entry.teleop.farGoalsMade}
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
                Quals results · {fperocResults.teams.length} teams
              </Text>
            </View>

            <View className='mode-bar'>
              <View
                className={`mode-item ${isOverall ? 'active' : ''}`}
                onClick={() => setSelectedFactors([])}
              >
                Overall
              </View>
              {RANKING_FACTORS.map((f) => (
                <View
                  key={f.key}
                  className={`mode-item ${selectedFactors.includes(f.key) ? 'active' : ''}`}
                  onClick={() => toggleFactor(f.key)}
                >
                  {f.label}
                </View>
              ))}
            </View>

            {!isOverall && (
              <Text className='mode-hint'>
                Ranking by average of: {selectedFactors.map((f) => RANKING_FACTORS.find((x) => x.key === f)!.label).join(' · ')}
              </Text>
            )}

            {isOverall && (
              <View className='weights-panel'>
                <View className='weights-panel-head'>
                  <Text className='weights-panel-title'>Adjust weights</Text>
                  <Text className='weights-reset' onClick={resetWeights}>Reset</Text>
                </View>
                {RANKING_FACTORS.map((f) => (
                  <View className='weight-row' key={f.key}>
                    <View className='weight-row-head'>
                      <Text className='weight-label'>{f.label}</Text>
                      <Text className='weight-value'>{Math.round(weights[f.key] * 100)}%</Text>
                    </View>
                    <RangeSlider
                      min={0}
                      max={1}
                      step={0.05}
                      value={weights[f.key]}
                      onChange={(v) => updateWeight(f.key, v)}
                    />
                  </View>
                ))}
                <Text className='weights-note'>
                  Weights are relative — they're normalized automatically, so they don't need to add up to 100%.
                </Text>
              </View>
            )}

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
                  <Text className='team-score'>{scoreFor(rt).toFixed(1)}</Text>
                </View>

                <View className='team-breakdown'>
                  {RANKING_FACTORS.map((f) => (
                    <View className={`breakdown-row ${selectedFactors.includes(f.key) ? 'highlight' : ''}`} key={f.key}>
                      <Text className='breakdown-label'>{f.label}</Text>
                      <View className='breakdown-bar-track'>
                        <View className='breakdown-bar-fill' style={{ width: `${rt.breakdown[f.key]}%` }} />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </>
        )}
      </View>
    </View>
  )
}
