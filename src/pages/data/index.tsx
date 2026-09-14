import { useEffect, useMemo, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import AppHeader from '../../components/AppHeader'
import RangeSlider from '../../components/RangeSlider'
import { BiobuzzEntry, MatchScoutEntry } from '../../types/scouting'
import { subscribeScoutEntries, pendingCount } from '../../supabase/scouting'
import { subscribePitEntries } from '../../supabase/pit'
import {
  PitEntry,
  optionLabel,
  formatPitAuto,
  formatColorSort,
  DRIVETRAIN_OPTIONS,
  BALL_OPTIONS,
  ROLE_OPTIONS
} from '../../types/pit'
import {
  computeRankings,
  modelForSeason,
  decodeRows,
  biobuzzRows,
  RankingModel,
  RankingWeights
} from '../../utils/ranking'
import { EVENTS, CURRENT_EVENT_CODE, CURRENT_SEASON, findEvent, entryEventCode } from '../../data/events'
import { gameForEntry } from '../../games'
import { useAuth } from '../../auth/AuthContext'
import { fetchProfiles } from '../../supabase/admin'
import { exportEntriesToExcel, exportPitToExcel } from '../../utils/exportEntries'
import './index.scss'

type MainTab = 'mine' | 'rankings' | 'pit'

// One line of what a team told us in the pits, for ranking cards.
const pitSummary = (p: PitEntry) =>
  [
    `蜂巢 Hive: ${optionLabel(BALL_OPTIONS, p.data.hiveBalls)}`,
    `花朵 Flowers: ${optionLabel(BALL_OPTIONS, p.data.flowerBalls)}`,
    `角色 Role: ${optionLabel(ROLE_OPTIONS, p.data.role)}`
  ].join(' · ')

const meanOf = (breakdown: Record<string, number>, factors: string[]) =>
  factors.reduce((sum, f) => sum + breakdown[f], 0) / factors.length

// Each season remembers its own slider positions — the factors differ.
const loadStoredWeights = (model: RankingModel): RankingWeights => {
  const stored = Taro.getStorageSync(model.storageKey)
  return stored ? { ...model.defaultWeights, ...stored } : { ...model.defaultWeights }
}

export default function CurrentData() {
  const { userId } = useAuth()
  const [mainTab, setMainTab] = useState<MainTab>('mine')
  const [entries, setEntries] = useState<MatchScoutEntry[]>([])
  const [pitEntries, setPitEntries] = useState<PitEntry[]>([])
  const [syncError, setSyncError] = useState(false)
  const [queued, setQueued] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Empty selection = Overall (weighted composite). One or more selected =
  // rank by the average of those factors' scores.
  const [selectedFactors, setSelectedFactors] = useState<string[]>([])
  const [eventCode, setEventCode] = useState(CURRENT_EVENT_CODE)
  const rankingModel = modelForSeason(findEvent(eventCode).season)
  const [weights, setWeights] = useState<RankingWeights>(() => loadStoredWeights(rankingModel))
  const [eventPickerOpen, setEventPickerOpen] = useState(false)
  // user id -> display name, so entries show who really scouted them even
  // after someone is renamed.
  const [names, setNames] = useState<Record<string, string>>({})

  // Keyed on userId: profiles are unreadable until signed in, so fetching on
  // mount alone would run before login and never retry.
  useEffect(() => {
    if (!userId) return
    fetchProfiles()
      .then((profiles) =>
        setNames(Object.fromEntries(profiles.map((p) => [p.userId, p.displayName || p.username])))
      )
      .catch(() => setNames({}))
  }, [userId])

  const selectedEvent = findEvent(eventCode)
  const isOverall = selectedFactors.length === 0

  // Displayed weight percentages are each slider's share of the total, so
  // they always add up to 100% regardless of the raw slider values.
  const totalWeight = rankingModel.factors.reduce((sum, f) => sum + (weights[f.key] ?? 0), 0)
  const weightPercent = (factor: string) =>
    totalWeight === 0 ? 0 : Math.round((weights[factor] / totalWeight) * 100)

  const selectEvent = (code: string) => {
    setEventCode(code)
    setEventPickerOpen(false)
    // Factors are season-specific, so a selection from another season is meaningless.
    setSelectedFactors([])
    setWeights(loadStoredWeights(modelForSeason(findEvent(code).season)))
  }

  const toggleFactor = (factor: string) => {
    setSelectedFactors((prev) =>
      prev.includes(factor) ? prev.filter((f) => f !== factor) : [...prev, factor]
    )
  }

  // Live-subscribed to every scout's submitted entries across devices (Supabase).
  // Emits immediately from local storage, then again on every realtime change.
  useEffect(() => {
    const unsubscribe = subscribeScoutEntries(
      userId,
      (loaded) => {
        setEntries(loaded)
        setSyncError(false)
        setQueued(pendingCount())
      },
      () => {
        setSyncError(true)
        setQueued(pendingCount())
      }
    )
    return unsubscribe
  }, [userId])

  // Offline for pit data shows up through the match subscription's warning,
  // which fails at the same time, so no second banner.
  useEffect(() => subscribePitEntries(userId, setPitEntries), [userId])

  const updateWeight = (factor: string, value: number) => {
    setWeights((prev) => {
      const next = { ...prev, [factor]: value }
      Taro.setStorageSync(rankingModel.storageKey, next)
      return next
    })
  }

  const resetWeights = () => {
    setWeights({ ...rankingModel.defaultWeights })
    Taro.setStorageSync(rankingModel.storageKey, { ...rankingModel.defaultWeights })
  }

  const eventEntries = useMemo(
    () => entries.filter((entry) => entryEventCode(entry) === eventCode),
    [entries, eventCode]
  )

  const eventPitEntries = useMemo(
    () =>
      pitEntries
        .filter((p) => p.eventCode === eventCode)
        .sort((a, b) => a.teamNumber.localeCompare(b.teamNumber, undefined, { numeric: true })),
    [pitEntries, eventCode]
  )

  const pitByTeam = useMemo(
    () => new Map(eventPitEntries.map((p) => [p.teamNumber.trim(), p])),
    [eventPitEntries]
  )

  const visiblePitEntries = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? eventPitEntries.filter((p) => p.teamNumber.toLowerCase().includes(q)) : eventPitEntries
  }, [eventPitEntries, query])

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
  // Past DECODE events rank from their official ftcscout results; BIOBUZZ
  // events rank from what our scouts recorded.
  const rankRows = useMemo(
    () =>
      selectedEvent.results
        ? decodeRows(selectedEvent.results.teams)
        : biobuzzRows(eventEntries as BiobuzzEntry[]),
    [selectedEvent, eventEntries]
  )

  const rankedTeams = useMemo(() => {
    const ranked = computeRankings(rankRows, rankingModel, weights)
    if (selectedFactors.length === 0) return ranked
    return [...ranked].sort(
      (a, b) => meanOf(b.breakdown, selectedFactors) - meanOf(a.breakdown, selectedFactors)
    )
  }, [rankRows, rankingModel, weights, selectedFactors])

  const visibleRankedTeams = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rankedTeams
    return rankedTeams.filter(
      (rt) => rt.row.title.toLowerCase().includes(q)
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
                  onClick={() => selectEvent(ev.code)}
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
          <View className={`tab-item ${mainTab === 'pit' ? 'active' : ''}`} onClick={() => setMainTab('pit')}>
            Pit
          </View>
        </View>

        {searchOpen && (
          <Input
            className='search-input'
            value={query}
            placeholder={
              mainTab === 'mine'
                ? 'Search by match or team #'
                : mainTab === 'pit'
                  ? 'Search by team #'
                  : 'Search by team # or name'
            }
            // @ts-expect-error h5-only DOM attribute, prevents browser autofill from injecting saved values
            autoComplete='off'
            onInput={(e) => setQuery(e.detail.value)}
          />
        )}

        {mainTab === 'mine' && (
          <>
            {syncError && (
              <Text className='sync-error'>
                ⚠️ Can't reach the shared database — showing this device's data only.
                {queued > 0
                  ? ` ${queued} submitted ${queued === 1 ? 'entry is' : 'entries are'} saved and will upload automatically once you're back online.`
                  : ''}
              </Text>
            )}

            {visibleEntries.length > 0 && (
              <View
                className='export-btn'
                onClick={() => exportEntriesToExcel(visibleEntries, selectedEvent.name, names)}
              >
                ⬇️ Export to Excel ({visibleEntries.length})
              </View>
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
              <View
                className='entry-card'
                key={`${entry.matchId}-${entry.teamNumber}`}
                onClick={() =>
                  Taro.navigateTo({
                    url: `/pages/entry/index?eventCode=${encodeURIComponent(entryEventCode(entry))}&matchId=${encodeURIComponent(entry.matchId)}&teamNumber=${encodeURIComponent(entry.teamNumber)}`
                  })
                }
              >
                <View className='entry-header'>
                  <Text className='entry-title'>{entry.matchId} · Team {entry.teamNumber}</Text>
                  <Text className={`entry-alliance ${entry.alliance}`}>{entry.alliance}</Text>
                </View>
                <Text className='entry-meta'>
                  Scout: {(entry.scoutedBy && names[entry.scoutedBy]) || entry.scoutName || '—'}
                  {entry.lastEditedBy && entry.lastEditedBy !== entry.scoutedBy
                    ? ` · edited by ${names[entry.lastEditedBy] || '—'}`
                    : ''}
                </Text>
                <Text className='entry-meta'>Updated: {new Date(entry.updatedAt).toLocaleString()}</Text>

                <View className='entry-stats'>
                  {gameForEntry(entry).cardStats(entry).map((stat) => (
                    <View className='entry-stat' key={stat.label}>
                      <Text className='entry-stat-label'>{stat.label}</Text>
                      <Text className='entry-stat-value'>{stat.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </>
        )}

        {mainTab === 'rankings' && (
          <>
            <View className='rankings-header'>
              <Text className='rankings-event-meta'>
                {selectedEvent.results
                  ? `Quals results · ${rankRows.length} teams`
                  : `From our scouting · ${rankRows.length} teams · ${eventEntries.length} entries`}
              </Text>
            </View>

            <View className='mode-bar'>
              <View
                className={`mode-item ${isOverall ? 'active' : ''}`}
                onClick={() => setSelectedFactors([])}
              >
                Overall
              </View>
              {rankingModel.factors.map((f) => (
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
                Ranking by average of: {selectedFactors.map((f) => rankingModel.factors.find((x) => x.key === f)?.label ?? f).join(' · ')}
              </Text>
            )}

            {isOverall && (
              <View className='weights-panel'>
                <View className='weights-panel-head'>
                  <Text className='weights-panel-title'>Adjust weights</Text>
                  <Text className='weights-reset' onClick={resetWeights}>Reset</Text>
                </View>
                {rankingModel.factors.map((f) => (
                  <View className='weight-row' key={f.key}>
                    <View className='weight-row-head'>
                      <Text className='weight-label'>{f.label}</Text>
                      <Text className='weight-value'>{weightPercent(f.key)}%</Text>
                    </View>
                    <RangeSlider
                      min={0}
                      max={1}
                      step={0.05}
                      value={weights[f.key] ?? 0}
                      onChange={(v) => updateWeight(f.key, v)}
                    />
                  </View>
                ))}
                <Text className='weights-note'>
                  Sliders are relative to each other — percentages shown are each factor's share of the total, so they always add up to 100%.
                </Text>
              </View>
            )}

            {visibleRankedTeams.length === 0 && (
              <Text className='empty-state'>
                {rankRows.length === 0
                  ? 'No scouting data for this event yet — rankings appear once matches are submitted.'
                  : 'No teams match your search.'}
              </Text>
            )}

            {visibleRankedTeams.map((rt, i) => (
              <View className='team-card' key={rt.row.number}>
                <View className='team-header'>
                  <Text className='team-composite-rank'>#{i + 1}</Text>
                  <View className='team-header-text'>
                    <Text className='team-title'>{rt.row.title}</Text>
                    <Text className='team-meta'>{rt.row.meta}</Text>
                    {pitByTeam.has(rt.row.number) && (
                      <Text className='team-meta'>🔧 {pitSummary(pitByTeam.get(rt.row.number)!)}</Text>
                    )}
                  </View>
                  <Text className='team-score'>{scoreFor(rt).toFixed(1)}</Text>
                </View>

                <View className='team-breakdown'>
                  {rankingModel.factors.map((f) => (
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

        {mainTab === 'pit' && (
          <>
            {selectedEvent.season !== CURRENT_SEASON ? (
              <Text className='empty-state'>Pit scouting started with BIOBUZZ — none for this event.</Text>
            ) : (
              <>
                {visiblePitEntries.length > 0 && (
                  <View
                    className='export-btn'
                    onClick={() => exportPitToExcel(visiblePitEntries, selectedEvent.name, names)}
                  >
                    ⬇️ Export to Excel ({visiblePitEntries.length})
                  </View>
                )}

                {visiblePitEntries.length === 0 && (
                  <Text className='empty-state'>
                    {eventPitEntries.length === 0
                      ? 'No pit scouting for this event yet. Use 赛前侦查 Pit Scouting on the home screen.'
                      : 'No teams match your search.'}
                  </Text>
                )}

                {visiblePitEntries.map((p) => (
                  <View
                    className='entry-card'
                    key={p.teamNumber}
                    onClick={() =>
                      Taro.navigateTo({
                        url: `/pages/pit/index?eventCode=${encodeURIComponent(p.eventCode)}&teamNumber=${encodeURIComponent(p.teamNumber)}`
                      })
                    }
                  >
                    <View className='entry-header'>
                      <Text className='entry-title'>Team {p.teamNumber}</Text>
                      <Text className='entry-meta'>{optionLabel(DRIVETRAIN_OPTIONS, p.data.drivetrain)}</Text>
                    </View>
                    <Text className='entry-meta'>
                      Scout: {(p.scoutedBy && names[p.scoutedBy]) || p.scoutName || '—'}
                      {p.lastEditedBy && p.lastEditedBy !== p.scoutedBy
                        ? ` · edited by ${names[p.lastEditedBy] || '—'}`
                        : ''}
                    </Text>

                    <View className='pit-facts'>
                      <Text className='pit-fact'>射入蜂巢 Hive: {optionLabel(BALL_OPTIONS, p.data.hiveBalls)}</Text>
                      <Text className='pit-fact'>放入花朵 Flowers: {optionLabel(BALL_OPTIONS, p.data.flowerBalls)}</Text>
                      <Text className='pit-fact'>颜色分拣 Color sort: {formatColorSort(p.data.colorSort)}</Text>
                      <Text className='pit-fact'>自动 Auto: {formatPitAuto(p.data.autoActions)}</Text>
                      <Text className='pit-fact'>角色 Role: {optionLabel(ROLE_OPTIONS, p.data.role)}</Text>
                      {!!p.data.notes && <Text className='pit-fact'>备注 Notes: {p.data.notes}</Text>}
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </View>
    </View>
  )
}
