import { useEffect, useMemo, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useAuth } from '../../auth/AuthContext'
import { useLanguage } from '../../i18n/LanguageContext'
import { FieldRobot, RobotId } from '../../strategy/fieldGeometry'
import { StrategyDetails } from '../../strategy/strategyRecord'
import { buildEventScoutingInsights, TeamScoutingInsight } from '../../strategy/scoutingInsights'
import { MatchScoutEntry, noteTagLabel } from '../../types/scouting'
import { PitEntry, BALL_OPTIONS, DRIVETRAIN_OPTIONS, ROLE_OPTIONS,
  optionLabel, formatPitAuto, formatColorSort } from '../../types/pit'
import { subscribeScoutEntries } from '../../supabase/scouting'
import { subscribePitEntries } from '../../supabase/pit'
import { readImportedEvents, syncImportedEvents } from '../../data/ftcScout'
import { findEvent } from '../../data/events'
import { officialOpr } from '../../utils/officialOpr'
import { modelForSeason } from '../../utils/ranking'

type Props = { details: StrategyDetails; robots: FieldRobot[]; selectedId: RobotId }
const ROBOT_IDS: RobotId[] = ['red1', 'red2', 'blue1', 'blue2']
const numeric = (value: string) => /^\d{1,6}$/.test(value.trim()) ? value.trim() : ''
const one = (value: number | null) => value === null ? '—' : value.toFixed(1)
const percent = (value: number | null) => value === null ? '—' : `${Math.round(value * 100)}%`

export default function StrategyScoutingPanel({ details, robots, selectedId }: Props) {
  const { t, language } = useLanguage()
  const { userId } = useAuth()
  const [entries, setEntries] = useState<MatchScoutEntry[]>([])
  const [pitEntries, setPitEntries] = useState<PitEntry[]>([])
  const [syncError, setSyncError] = useState(false)
  const [importedEvents, setImportedEvents] = useState(readImportedEvents)
  const [comparisonIds, setComparisonIds] = useState<RobotId[]>(ROBOT_IDS)
  useEffect(() => {
    if (!userId) { setEntries([]); return }
    return subscribeScoutEntries(userId, (loaded) => { setEntries(loaded); setSyncError(false) }, () => setSyncError(true))
  }, [userId])
  useEffect(() => {
    if (!userId) { setPitEntries([]); return }
    return subscribePitEntries(userId, setPitEntries, () => setSyncError(true))
  }, [userId])
  useEffect(() => {
    if (!userId) return
    let active = true
    syncImportedEvents().then((events) => { if (active) setImportedEvents(events) }).catch(() => {})
    return () => { active = false }
  }, [userId])

  const eventCode = details.eventCode.trim().toUpperCase()
  const robotNumber = (id: RobotId) => {
    const robot = robots.find((item) => item.id === id)
    const fallback = id.startsWith('red') ? details.redTeams[id.endsWith('1') ? 0 : 1] : details.blueTeams[id.endsWith('1') ? 0 : 1]
    return numeric(robot?.number ?? '') || numeric(fallback)
  }
  const opr = useMemo(() => {
    const scheduleCode = findEvent(eventCode).ftcScoutCode ?? eventCode
    const matches = importedEvents.find((event) => event.code === scheduleCode)?.matches ?? []
    return officialOpr(matches)
  }, [eventCode, importedEvents])
  const insights = useMemo(() => {
    const baseModel = modelForSeason(findEvent(eventCode).season)
    let stored: Record<string, number> = {}
    try { stored = Taro.getStorageSync?.(baseModel.storageKey) || {} } catch { /* use shared defaults */ }
    return buildEventScoutingInsights(eventCode, entries, pitEntries, opr,
      { ...baseModel.defaultWeights, ...stored })
  }, [eventCode, entries, pitEntries, opr, language])
  const selectedNumber = robotNumber(selectedId)
  const selected = selectedNumber ? insights.teams.get(selectedNumber) : undefined
  const selectedRobot = robots.find((robot) => robot.id === selectedId)!
  const compared = ROBOT_IDS.filter((id) => comparisonIds.includes(id)).map((id) => ({ id, number: robotNumber(id) }))
    .filter((item) => item.number)
    .filter((item, index, all) => all.findIndex((other) => other.number === item.number) === index)
  const toggleCompare = (id: RobotId) => setComparisonIds((old) => old.includes(id) ? old.filter((item) => item !== id) : [...old, id])
  const tagList = (tags: string[]) => tags.map((tag) => t(noteTagLabel(tag))).join(' · ')
  const detailRow = (label: string, value: string) => <View className='strategy-scout-detail-row' key={label}>
    <Text>{t(label)}</Text><Text>{value}</Text>
  </View>
  const pit = selected?.pit?.data

  const metricRows: { label: string; value: (insight: TeamScoutingInsight | undefined) => string }[] = [
    { label: '自动蜂房球均值 Avg Auto hive balls', value: (team) => one(team?.autoBalls ?? null) },
    { label: '手动花粉均值 Avg TeleOp pollen', value: (team) => one(team?.telePollen ?? null) },
    { label: '手动花蜜均值 Avg TeleOp nectar', value: (team) => one(team?.teleNectar ?? null) },
    { label: '终局花朵均值 Avg Endgame flowers', value: (team) => team?.flowerPollen === null || team?.flowerPollen === undefined ? '—' : one(team.flowerPollen + (team.flowerNectar ?? 0)) },
    { label: '终局停泊率 Endgame park rate', value: (team) => percent(team?.endParkRate ?? null) },
    { label: '一致性波动 Consistency spread', value: (team) => one(team?.consistencySpread ?? null) }
  ]

  return <View className='strategy-scouting-panel'>
    <Text className='strategy-panel-title'>{t('侦察数据 Scouting insights')}</Text>
    <Text className='strategy-help'>{t('赛事 Event')}: {eventCode || '—'} · {t('仅显示此赛事的数据 Only this event is included')}</Text>
    {syncError && <Text className='strategy-scout-warning'>{t('侦察数据更新失败；可能显示缓存记录。 Scouting refresh failed; cached records may be shown.')}</Text>}
    <View className='strategy-scout-selected'>
      <Text className='strategy-scout-team-title'>{selectedRobot.number || selectedRobot.id.toUpperCase()}{selectedNumber ? ` · #${selectedNumber}` : ''}</Text>
      {!selectedNumber && <Text className='strategy-help'>{t('输入数字队号以查看侦察数据 Enter a numeric team number to see scouting data')}</Text>}
      {selectedNumber && !selected && <Text className='strategy-help'>{t('没有可用的侦察数据 No scouting data available')}</Text>}
      {selected && <>
        {selected.ranking && insights.ranked.length < 2 && <Text className='strategy-help'>{t('至少两支队伍才有可比较的排名 Ranking needs at least two teams with data')}</Text>}
        {selected.ranking && insights.ranked.length >= 2 && <View className='strategy-scout-section'>
          <Text className='strategy-scout-section-title'>{t('赛事排名 Event ranking')}: #{selected.rank} / {insights.ranked.length} · {selected.ranking.compositeScore.toFixed(1)} / 100</Text>
          <Text className='strategy-help'>{t('按当前排名权重计算；分数相对于本赛事已记录队伍。 Uses current ranking weights; scores are relative to recorded teams at this event.')}</Text>
          <View className='strategy-scout-factor-list'>{insights.model.factors.map((factor) => <View key={factor.key} className='strategy-scout-factor'>
            <Text>{t(factor.label)}</Text><Text>{Number.isFinite(selected.ranking?.row.raw[factor.key]) && !(factor.key === 'consistency' && selected.observations.length < 2)
              ? selected.ranking?.breakdown[factor.key].toFixed(0) : '—'}</Text>
          </View>)}</View>
        </View>}
        <View className='strategy-scout-section'>
          <Text className='strategy-scout-section-title'>{t('比赛侦察 Match scouting')} · {selected.observations.length} {t('场 matches')}</Text>
          {!selected.observations.length && <Text className='strategy-help'>{t('没有比赛侦察记录 No match scouting records')}</Text>}
          {!!selected.observations.length && <View className='strategy-scout-detail-grid'>
            {detailRow('自动蜂房球均值 Avg Auto hive balls', one(selected.autoBalls))}
            {detailRow('自动远离率 Auto leave rate', percent(selected.autoLeaveRate))}
            {detailRow('自动停泊率 Auto park rate', percent(selected.autoParkRate))}
            {detailRow('手动花粉均值 Avg TeleOp pollen', one(selected.telePollen))}
            {detailRow('手动花蜜均值 Avg TeleOp nectar', one(selected.teleNectar))}
            {detailRow('终局花粉均值 Avg Endgame pollen', one(selected.flowerPollen))}
            {detailRow('终局花蜜均值 Avg Endgame nectar', one(selected.flowerNectar))}
            {detailRow('终局停泊率 Endgame park rate', percent(selected.endParkRate))}
            {detailRow('一致性波动 Consistency spread', selected.consistencySpread === null ? t('至少两场记录需要 At least two matches needed') : one(selected.consistencySpread))}
          </View>}
        </View>
        {(selected.reportedStrengths.length > 0 || selected.reportedIssues.length > 0 || selected.relativeStrengths.length > 0 || selected.relativeGaps.length > 0 || selected.notes.length > 0) && <View className='strategy-scout-section'>
          <Text className='strategy-scout-section-title'>{t('观察记录 Observations')}</Text>
          {!!selected.reportedStrengths.length && detailRow('记录的优势 Reported strengths', tagList(selected.reportedStrengths))}
          {!!selected.reportedIssues.length && detailRow('记录的问题 Reported issues', tagList(selected.reportedIssues))}
          {!!selected.relativeStrengths.length && detailRow('相对强项 Relative strengths', selected.relativeStrengths.map((factor) => t(factor)).join(' · '))}
          {!!selected.relativeGaps.length && detailRow('相对短板 Relative gaps', selected.relativeGaps.map((factor) => t(factor)).join(' · '))}
          {selected.notes.slice(0, 6).map((note, index) => <Text key={index} className='strategy-scout-note'>{note}</Text>)}
        </View>}
        <View className='strategy-scout-section'>
          <Text className='strategy-scout-section-title'>{t('Pit 侦察 Pit scouting')}</Text>
          {!pit && <Text className='strategy-help'>{t('没有 Pit 侦察记录 No pit scouting record')}</Text>}
          {pit && <View className='strategy-scout-detail-grid'>
            {detailRow('底盘 Drivetrain', optionLabel(DRIVETRAIN_OPTIONS, pit.drivetrain))}
            {detailRow('蜂房能力 Hive capability', optionLabel(BALL_OPTIONS, pit.hiveBalls))}
            {detailRow('花朵能力 Flower capability', optionLabel(BALL_OPTIONS, pit.flowerBalls))}
            {detailRow('首选角色 Preferred role', optionLabel(ROLE_OPTIONS, pit.role))}
            {detailRow('自动动作 Auto abilities', formatPitAuto(pit.autoActions))}
            {detailRow('分色能力 Color sorting', formatColorSort(pit.colorSort))}
            {!!pit.notes && <Text className='strategy-scout-note'>{pit.notes}</Text>}
          </View>}
        </View>
      </>}
    </View>
    <View className='strategy-scout-section'>
      <Text className='strategy-panel-title'>{t('规划队伍对比 Planned team comparison')}</Text>
      <Text className='strategy-help'>{t('选择至少两台已填写队号的机器人。 Select at least two robots with team numbers.')}</Text>
      <View className='strategy-scout-compare-choices'>{robots.map((robot) => <View key={robot.id}
        className={`strategy-action strategy-action-text ${comparisonIds.includes(robot.id) ? 'active' : ''}`}
        onClick={() => toggleCompare(robot.id)}><Text>{robot.number || robot.id.toUpperCase()}</Text></View>)}</View>
      {compared.length >= 2 ? <View className='strategy-scout-table-scroll'><View className='strategy-scout-table'
        style={{ gridTemplateColumns: `minmax(155px, 1.2fr) repeat(${compared.length}, minmax(120px, 1fr))` }}>
        <Text>{t('指标 Metric')}</Text>{compared.map((item) => <Text key={item.id}>#{item.number}</Text>)}
        {metricRows.map((metric) => <View key={metric.label} className='strategy-scout-table-row'>
          <Text>{t(metric.label)}</Text>{compared.map((item) => <Text key={item.id}>{metric.value(insights.teams.get(item.number))}</Text>)}
        </View>)}
      </View></View> : <Text className='strategy-help'>{t('需要至少两支不同队伍 Add at least two different teams')}</Text>}
    </View>
  </View>
}
