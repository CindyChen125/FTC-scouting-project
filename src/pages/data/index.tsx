import { useEffect, useMemo, useState } from 'react'
import { View, Text, Input, Picker, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { translate as t, dateTime } from '../../i18n'
import { useLanguage } from '../../i18n/LanguageContext'
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
import { EVENTS, CURRENT_EVENT_CODE, CURRENT_SEASON, findEvent, eventLabel, entryEventCode } from '../../data/events'
import { readImportedEvents, syncImportedEvents } from '../../data/ftcScout'
import { officialOpr } from '../../utils/officialOpr'
import { gameForEntry } from '../../games'
import { useAuth } from '../../auth/AuthContext'
import { fetchProfiles } from '../../supabase/admin'
import { exportEntriesToExcel, exportPitToExcel } from '../../utils/exportEntries'
import './index.scss'

type MainTab = 'mine' | 'rankings' | 'pit'

// One line of what a team told us in the pits, for ranking cards.
const pitSummary = (p: PitEntry) =>
  [
    `${t('蜂巢 Hive')}: ${optionLabel(BALL_OPTIONS, p.data.hiveBalls)}`,
    `${t('花朵 Flowers')}: ${optionLabel(BALL_OPTIONS, p.data.flowerBalls)}`,
    `${t('角色 Role:')} ${optionLabel(ROLE_OPTIONS, p.data.role)}`
  ].join(' · ')

const meanOf = (breakdown: Record<string, number>, factors: string[]) =>
  factors.reduce((sum, f) => sum + breakdown[f], 0) / factors.length

// Each season remembers its own slider positions — the factors differ.
const loadStoredWeights = (model: RankingModel): RankingWeights => {
  const stored = Taro.getStorageSync(model.storageKey)
  return stored ? { ...model.defaultWeights, ...stored } : { ...model.defaultWeights }
}

export default function CurrentData() {
  const { language } = useLanguage()
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
  const [importedEvents, setImportedEvents] = useState(readImportedEvents)
  useEffect(() => {
    if (!userId) return
    let active = true
    syncImportedEvents().then((events) => { if (active) setImportedEvents(events) }).catch(() => {})
    return () => { active = false }
  }, [userId])
  const eventOptions = [...new Set([
    ...EVENTS.map((event) => event.code),
    ...importedEvents.map((event) => event.code),
    ...entries.map(entryEventCode),
    ...pitEntries.map((entry) => entry.eventCode)
  ])].map(findEvent)
  const schedule = importedEvents.find((event) => event.code === eventCode)?.matches
  const opr = useMemo(() => officialOpr(schedule ?? []), [schedule])
  const [comparison, setComparison] = useState({ eventCode: '', left: '', right: '' })
  const [partnerTeam, setPartnerTeam] = useState({ eventCode: '', number: '' })
  const baseModel = modelForSeason(findEvent(eventCode).season)
  const rankingModel = useMemo(() => opr.size && baseModel === modelForSeason(CURRENT_SEASON)
    ? { ...baseModel, factors: [...baseModel.factors, { key: 'officialOpr', label: 'Official score OPR' }] }
    : baseModel, [baseModel, opr.size])
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
        : biobuzzRows(eventEntries as BiobuzzEntry[]).map((row) => ({
          ...row,
          raw: { ...row.raw, ...(opr.has(row.number) ? { officialOpr: opr.get(row.number)! } : {}) }
        })),
    // Row summaries are translated when constructed; refresh them on language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedEvent, eventEntries, opr, language]
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
      <AppHeader title={t("Current Data")} showBack onSearch={() => setSearchOpen((open) => !open)} />

      <View className='page-content'>
        <View className='event-selector'>
          <View className='event-selector-header' onClick={() => setEventPickerOpen((open) => !open)}>
            <Text className='event-selector-name'>{eventLabel(selectedEvent)}</Text>
            <Text className='event-selector-arrow'>{eventPickerOpen ? '▴' : '▾'}</Text>
          </View>
          {eventPickerOpen && (
            <View className='event-selector-list'>
              {eventOptions.map((ev) => (
                <View
                  key={ev.code}
                  className={`event-selector-option ${ev.code === eventCode ? 'active' : ''}`}
                  onClick={() => selectEvent(ev.code)}
                >
                  {eventLabel(ev)}
                </View>
              ))}
            </View>
          )}
        </View>

        <View className='tab-bar'>
          <View className={`tab-item ${mainTab === 'mine' ? 'active' : ''}`} onClick={() => setMainTab('mine')}>{t("My Scouting Data")}</View>
          <View className={`tab-item ${mainTab === 'rankings' ? 'active' : ''}`} onClick={() => setMainTab('rankings')}>{t("Rankings")}</View>
          <View className={`tab-item ${mainTab === 'pit' ? 'active' : ''}`} onClick={() => setMainTab('pit')}>{t("Pit")}</View>
        </View>

        {searchOpen && (
          <Input
            className='search-input'
            value={query}
            placeholder={
              mainTab === 'mine'
                ? t("Search by match or team #")
                : mainTab === 'pit'
                  ? t("Search by team #")
                  : t("Search by team # or name")
            }
            // @ts-expect-error h5-only DOM attribute, prevents browser autofill from injecting saved values
            autoComplete='off'
            onInput={(e) => setQuery(e.detail.value)}
          />
        )}

        {mainTab === 'mine' && (
          <>
            {syncError && (
              <Text className='sync-error'>{t("⚠️ Can't reach the shared database — showing this device's data only.")}{queued > 0
                  ? ` ${t('queuedEntries', { count: queued })}`
                  : ''}
              </Text>
            )}

            {visibleEntries.length > 0 && (
              <View
                className='export-btn'
                onClick={() => exportEntriesToExcel(visibleEntries, selectedEvent.name, names)}
              >{t('Export to Excel')} ({visibleEntries.length})
              </View>
            )}

            {visibleEntries.length === 0 && (
              <Text className='empty-state'>
                {entries.length === 0
                  ? t("No scouting data saved yet.")
                  : eventEntries.length === 0
                    ? t('noEventEntries', { event: eventLabel(selectedEvent) })
                    : t("No entries match your search.")}
              </Text>
            )}

            {visibleEntries.map((entry) => (
              <View
                className='entry-card'
                key={`${entry.matchId}-${entry.teamNumber}-${entry.observationKey ?? entry.scoutedBy ?? 'legacy'}`}
                onClick={() =>
                  Taro.navigateTo({
                    url: `/pages/entry/index?eventCode=${encodeURIComponent(entryEventCode(entry))}&matchId=${encodeURIComponent(entry.matchId)}&teamNumber=${encodeURIComponent(entry.teamNumber)}&observationKey=${encodeURIComponent(entry.observationKey ?? entry.scoutedBy ?? 'legacy')}`
                  })
                }
              >
                <View className='entry-header'>
                  <Text className='entry-title'>{entry.matchId} · {t('teamNumber', { number: entry.teamNumber })}</Text>
                  <Text className={`entry-alliance ${entry.alliance}`}>{t(entry.alliance === 'red' ? 'Red' : 'Blue')}</Text>
                </View>
                <Text className='entry-meta'>{t("Scout:")} {(entry.scoutedBy && names[entry.scoutedBy]) || entry.scoutName || '—'}
                  {entry.lastEditedBy && entry.lastEditedBy !== entry.scoutedBy
                    ? t('editedBy', { name: names[entry.lastEditedBy] || '—' })
                    : ''}
                </Text>
                <Text className='entry-meta'>{t("Updated:")} {dateTime(entry.updatedAt)}</Text>

                <View className='entry-stats'>
                  {gameForEntry(entry).cardStats(entry).map((stat) => (
                    <View className='entry-stat' key={t(stat.label)}>
                      <Text className='entry-stat-label'>{t(stat.label)}</Text>
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
            {selectedEvent.season === CURRENT_SEASON && rankRows.length > 1 && (() => {
              const own = partnerTeam.eventCode === eventCode ? rankRows.find((row) => row.number === partnerTeam.number) : undefined
              const dimensions = ['hive', 'auto', 'flowers', 'park']
              const weakest = own && dimensions
                .map((key) => ({
                  key,
                  relative: rankRows.filter((row) => row.raw[key] < own.raw[key]).length / (rankRows.length - 1),
                  spread: rankRows.some((row) => row.raw[key] !== own.raw[key])
                }))
                .filter(({ spread }) => spread)
                .sort((a, b) => a.relative - b.relative)[0]?.key
              const label = baseModel.factors.find((factor) => factor.key === weakest)?.label
              const suggestions = weakest && own ? rankRows.filter((row) => row.number !== own.number && row.raw[weakest] > own.raw[weakest])
                .sort((a, b) => b.raw[weakest] - a.raw[weakest]).slice(0, 3) : []
              return (
                <View className='weights-panel'>
                  <Text className='weights-panel-title'>{t("搭档推荐 Partner finder")}</Text>
                  <Picker textProps={{ okText: t('Confirm'), cancelText: t('Cancel') }} mode='selector' range={rankRows.map((row) => row.title)}
                    onChange={(e) => {
                      const row = rankRows[Number(e.detail.value)]
                      if (row) setPartnerTeam({ eventCode, number: row.number })
                    }}
                  >
                    <Button size='mini'>{own ? t('ourRobot', { team: own.title }) : t("选择我方队伍 Choose our team")}</Button>
                  </Picker>
                  {own && (suggestions.length > 0
                    ? <Text>{t('strengthen', { factor: t(label ?? ''), teams: suggestions.map((row) => row.title).join(' · ') })}</Text>
                    : <Text>{t("No clear complementary match from current scouting.")}</Text>)}
                </View>
              )
            })()}
            {schedule && (
              <View className='weights-panel'>
                <Text className='weights-panel-title'>{t("官方比分 Official results")}</Text>
                {schedule.filter((match) => match.redScore !== undefined && match.blueScore !== undefined).map((match) => (
                  <View className='weight-row-head' key={match.number}>
                    <Text>Q{match.number}</Text>
                    <Text>{t('allianceScore', { red: match.redScore!, blue: match.blueScore! })}</Text>
                  </View>
                ))}
                {!schedule.some((match) => match.redScore !== undefined) && <Text>{t("No posted scores yet. Refresh the import in Start Scouting.")}</Text>}
              </View>
            )}
            <View className='rankings-header'>
              <Text className='rankings-event-meta'>
                {selectedEvent.results
                  ? t('qualificationTeams', { teams: rankRows.length })
                  : t('scoutedTeams', { teams: rankRows.length, entries: eventEntries.length })}
              </Text>
            </View>

            {rankRows.length >= 2 && (() => {
              const choices = [...rankRows].sort((a, b) => Number(a.number) - Number(b.number))
              const selected = comparison.eventCode === eventCode ? comparison : { left: '', right: '' }
              const left = choices.find((row) => row.number === selected.left)
              const right = choices.find((row) => row.number === selected.right)
              return (
                <View className='weights-panel'>
                  <Text className='weights-panel-title'>{t("队伍对比 Compare teams")}</Text>
                  <View className='comparison-grid'>
                    <Text>{t("指标 Metric")}</Text>
                    {(['left', 'right'] as const).map((side) => (
                      <Picker key={side} textProps={{ okText: t('Confirm'), cancelText: t('Cancel') }} mode='selector' range={choices.map((row) => row.title)}
                        onChange={(e) => {
                          const choice = choices[Number(e.detail.value)]
                          if (choice) setComparison({ ...selected, eventCode, [side]: choice.number })
                        }}
                      >
                        <Button size='mini'>{selected[side] ? t('teamNumber', { number: selected[side] }) : side === 'left' ? t("Team A") : t("Team B")}</Button>
                      </Picker>
                    ))}
                    {left && right && left.number !== right.number && rankingModel.factors.map((factor) => (
                      <View key={factor.key} className='comparison-row'>
                        <Text>{t(factor.label)}</Text>
                        {[left, right].map((row) => (
                          <Text key={row.number}>{factor.key === 'reliability'
                            ? `${(row.raw[factor.key] * 100).toFixed(0)}%`
                            : row.raw[factor.key]?.toFixed(1) ?? '—'}</Text>
                        ))}
                      </View>
                    ))}
                  </View>
                  {left && right && left.number === right.number && <Text>{t("请选择两支不同队伍 Choose two different teams.")}</Text>}
                </View>
              )
            })()}

            <View className='mode-bar'>
              <View
                className={`mode-item ${isOverall ? 'active' : ''}`}
                onClick={() => setSelectedFactors([])}
              >{t("Overall")}</View>
              {rankingModel.factors.map((f) => (
                <View
                  key={f.key}
                  className={`mode-item ${selectedFactors.includes(f.key) ? 'active' : ''}`}
                  onClick={() => toggleFactor(f.key)}
                >
                  {t(f.label)}
                </View>
              ))}
            </View>

            {!isOverall && (
              <Text className='mode-hint'>{t("Ranking by average of:")} {selectedFactors.map((f) => t(rankingModel.factors.find((x) => x.key === f)?.label ?? f)).join(' · ')}
              </Text>
            )}

            {isOverall && (
              <View className='weights-panel'>
                <View className='weights-panel-head'>
                  <Text className='weights-panel-title'>{t("Adjust weights")}</Text>
                  <Text className='weights-reset' onClick={resetWeights}>{t("Reset")}</Text>
                </View>
                {rankingModel.factors.map((f) => (
                  <View className='weight-row' key={f.key}>
                    <View className='weight-row-head'>
                      <Text className='weight-label'>{t(f.label)}</Text>
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
                <Text className='weights-note'>{t("Sliders are relative to each other — percentages shown are each factor's share of the total, so they always add up to 100%.")}</Text>
              </View>
            )}

            {visibleRankedTeams.length === 0 && (
              <Text className='empty-state'>
                {rankRows.length === 0
                  ? t("No scouting data for this event yet — rankings appear once matches are submitted.")
                  : t("No teams match your search.")}
              </Text>
            )}

            {visibleRankedTeams.map((rt, i) => (
              <View className='team-card' key={rt.row.number}>
                <View className='team-header'>
                  <Text className='team-composite-rank'>#{i + 1}</Text>
                  <View className='team-header-text'>
                    <Text className='team-title'>{rt.row.title}</Text>
                    <Text className='team-meta'>{rt.row.meta}</Text>
                    {opr.has(rt.row.number) && <Text className='team-meta'>{t("Official score OPR:")} {opr.get(rt.row.number)?.toFixed(1)}</Text>}
                    {pitByTeam.has(rt.row.number) && (
                      <Text className='team-meta'>{t("Pit ·")}{pitSummary(pitByTeam.get(rt.row.number)!)}</Text>
                    )}
                  </View>
                  <Text className='team-score'>{scoreFor(rt).toFixed(1)}</Text>
                </View>

                <View className='team-breakdown'>
                  {rankingModel.factors.map((f) => (
                    <View className={`breakdown-row ${selectedFactors.includes(f.key) ? 'highlight' : ''}`} key={f.key}>
                      <Text className='breakdown-label'>{t(f.label)}</Text>
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
              <Text className='empty-state'>{t("Pit scouting started with BIOBUZZ — none for this event.")}</Text>
            ) : (
              <>
                {visiblePitEntries.length > 0 && (
                  <View
                    className='export-btn'
                    onClick={() => exportPitToExcel(visiblePitEntries, selectedEvent.name, names)}
                  >{t('Export to Excel')} ({visiblePitEntries.length})
                  </View>
                )}

                {visiblePitEntries.length === 0 && (
                  <Text className='empty-state'>
                    {eventPitEntries.length === 0
                      ? t("No pit scouting for this event yet. Use 赛前侦查 Pit Scouting on the home screen.")
                      : t("No teams match your search.")}
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
                      <Text className='entry-title'>{t('teamNumber', { number: p.teamNumber })}</Text>
                      <Text className='entry-meta'>{optionLabel(DRIVETRAIN_OPTIONS, p.data.drivetrain)}</Text>
                    </View>
                    <Text className='entry-meta'>{t("Scout:")} {(p.scoutedBy && names[p.scoutedBy]) || p.scoutName || '—'}
                      {p.lastEditedBy && p.lastEditedBy !== p.scoutedBy
                        ? t('editedBy', { name: names[p.lastEditedBy] || '—' })
                        : ''}
                    </Text>

                    <View className='pit-facts'>
                      <Text className='pit-fact'>{t("射入蜂巢 Hive:")} {optionLabel(BALL_OPTIONS, p.data.hiveBalls)}</Text>
                      <Text className='pit-fact'>{t("放入花朵 Flowers:")} {optionLabel(BALL_OPTIONS, p.data.flowerBalls)}</Text>
                      <Text className='pit-fact'>{t("颜色分拣 Color sort:")} {formatColorSort(p.data.colorSort)}</Text>
                      <Text className='pit-fact'>{t("自动 Auto:")} {formatPitAuto(p.data.autoActions)}</Text>
                      <Text className='pit-fact'>{t("角色 Role:")} {optionLabel(ROLE_OPTIONS, p.data.role)}</Text>
                      {!!p.data.notes && <Text className='pit-fact'>{t("备注 Notes:")} {p.data.notes}</Text>}
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
