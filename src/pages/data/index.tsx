import { useEffect, useMemo, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import AppHeader from '../../components/AppHeader'
import RangeSlider from '../../components/RangeSlider'
import { MatchScoutEntry } from '../../types/scouting'
import { subscribeScoutEntries } from '../../firebase/scouting'
import {
  computeRankings,
  RANKING_WEIGHTS,
  RANKING_FACTORS,
  RankingFactor,
  RankingWeights
} from '../../utils/ranking'
import { EVENTS, CURRENT_EVENT_CODE, findEvent } from '../../data/events'
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
  const [syncError, setSyncError] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Empty selection = Overall (weighted composite). One or more selected =
  // rank by the average of those factors' scores.
  const [selectedFactors, setSelectedFactors] = useState<RankingFactor[]>([])
  const [weights, setWeights] = useState<RankingWeights>(loadStoredWeights)
  const [eventCode, setEventCode] = useState(CURRENT_EVENT_CODE)
  const [eventPickerOpen, setEventPickerOpen] = useState(false)

  const selectedEvent = findEvent(eventCode)
  const isOverall = selectedFactors.length === 0

  const toggleFactor = (factor: RankingFactor) => {
    setSelectedFactors((prev) =>
      prev.includes(factor) ? prev.filter((f) => f !== factor) : [...prev, factor]
    )
  }

  // Live-subscribed to every scout's submitted entries across devices (Firestore).
  // Fires immediately from the local offline cache, then again on every change.
  useEffect(() => {
    const unsubscribe = subscribeScoutEntries(
      (loaded) => {
        setEntries(loaded)
        setSyncError(false)
      },
      () => setSyncError(true)
    )
    return unsubscribe
  }, [])

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

  // Entries submitted before eventCode existed are treated as belonging to
  // the current default event, so nothing old silently disappears.
  const eventEntries = useMemo(
    () => entries.filter((entry) => (entry.eventCode ?? CURRENT_EVENT_CODE) === eventCode),
    [entries, eventCode]
  )

  const visibleEntries = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return eventEntries
    return eventEntries.filter(
      (entry) => entry.matchId.toLowerCase().includes(q) || entry.teamNumber.toLowerCase().includes(q)
    )
  }, [eventEntries, query])

  // Compute the weighted composite + per-factor breakdown, then order by the
  // selected mode: Overall = composite, otherwise by the average of the
  // chosen factors.
  const rankedTeams = useMemo(() => {
    const ranked = computeRankings(selectedEvent.results.teams, weights)
    if (selectedFactors.length === 0) return ranked
    return [...ranked].sort(
      (a, b) => meanOf(b.breakdown, selectedFactors) - meanOf(a.breakdown, selectedFactors)
    )
  }, [selectedEvent, weights, selectedFactors])

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
        <View className='event-selector'>
          <View className='event-selector-header' onClick={() => setEventPickerOpen((open) => !open)}>
            <Text className='event-selector-name'>{selectedEvent.name}</Text>
            <Text className='event-selector-arrow'>{eventPickerOpen ? '▴' : '▾'}</Text>
          </View>
          {eventPickerOpen && (
            <View className='event-selector-list'>
              {EVENTS.map((ev) => (
                <View
                  key={ev.code}
                  className={`event-selector-option ${ev.code === eventCode ? 'active' : ''}`}
                  onClick={() => {
                    setEventCode(ev.code)
                    setEventPickerOpen(false)
                  }}
                >
                  {ev.name}
                </View>
              ))}
            </View>
          )}
        </View>

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
            {syncError && (
              <Text className='sync-error'>
                ⚠️ Can't sync with the shared database right now — showing local data only.
              </Text>
            )}

            {visibleEntries.length === 0 && (
              <Text className='empty-state'>
                {entries.length === 0
                  ? 'No scouting data saved yet.'
                  : eventEntries.length === 0
                    ? `No scouting data for ${selectedEvent.name} yet.`
                    : 'No entries match your search.'}
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
              <Text className='rankings-event-meta'>
                Quals results · {selectedEvent.results.teams.length} teams
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
