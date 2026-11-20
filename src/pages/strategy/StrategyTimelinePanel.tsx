import { Input, Slider, Text, View } from '@tarojs/components'
import { useLanguage } from '../../i18n/LanguageContext'
import { FieldRobot, RobotId } from '../../strategy/fieldGeometry'
import { StrategyPhase } from '../../strategy/annotations'
import { RobotRoutes, TimelineWarning, Waypoint } from '../../strategy/timeline'

type Props = {
  phase: StrategyPhase
  robots: FieldRobot[]
  routes: RobotRoutes
  selectedId: RobotId
  selectedWaypointId: string | null
  onSelectWaypoint: (robotId: RobotId, waypointId: string) => void
  time: number
  duration: number
  playing: boolean
  speed: number
  warningsEnabled: boolean
  warnings: TimelineWarning[]
  currentWarnings: TimelineWarning[]
  onPlay: () => void
  onPause: () => void
  onRestart: () => void
  onScrub: (time: number) => void
  onSpeed: (speed: number) => void
  onToggleWarnings: () => void
  onAdd: () => void
  onChange: (robotId: RobotId, id: string, patch: Partial<Omit<Waypoint, 'id'>>) => void
  onReorder: (robotId: RobotId, id: string, direction: -1 | 1) => void
  onRemove: (robotId: RobotId, id: string) => void
}

export default function StrategyTimelinePanel(props: Props) {
  const { t } = useLanguage()
  const selected = props.robots.find((robot) => robot.id === props.selectedId)!
  const points = props.routes[props.selectedId] ?? []
  const label = (id: RobotId) => props.robots.find((robot) => robot.id === id)?.number || id.toUpperCase()
  const warningText = (warning: TimelineWarning) => {
    const robots = warning.robots.map(label).join(' + ')
    if (warning.kind === 'robot') return t('机器人重叠 Robot overlap: {robots} at {at}s', { robots, at: warning.at.toFixed(1) })
    if (warning.kind === 'boundary') return t('越过场地边界 Outside field: {robots} at {at}s', { robots, at: warning.at.toFixed(1) })
    return t('触及中央支架 Central frame: {robots} at {at}s', { robots, at: warning.at.toFixed(1) })
  }
  const nextSpeed = props.speed === 0.5 ? 1 : props.speed === 1 ? 2 : 0.5
  return <View className='strategy-timeline-panel'>
    <View className='strategy-timeline-heading'>
      <View>
        <Text className='strategy-panel-title'>{t('运动时间线 Movement timeline')}</Text>
        <Text className='strategy-help'>{props.phase === 'auto' ? t('自动阶段 Autonomous') : t('手动阶段 TeleOp')} · {t('单位：秒 Time in seconds')}</Text>
      </View>
      <Text className='strategy-timeline-time'>{props.time.toFixed(1)} / {props.duration.toFixed(1)} {t('秒 s')}</Text>
    </View>
    <View className='strategy-timeline-controls'>
      <View className='strategy-action strategy-action-text' onClick={props.playing ? props.onPause : props.onPlay}><Text>{props.playing ? t('暂停 Pause') : t('播放 Play')}</Text></View>
      <View className='strategy-action strategy-action-text' onClick={props.onRestart}><Text>{t('重新开始 Restart')}</Text></View>
      <View className='strategy-action strategy-action-text' onClick={() => props.onSpeed(nextSpeed)}><Text>{props.speed}×</Text></View>
      <View className={`strategy-action strategy-action-text strategy-warning-toggle ${props.warningsEnabled ? 'active' : ''}`} onClick={props.onToggleWarnings}><Text>{props.warningsEnabled ? t('关闭警示 Hide warnings') : t('显示警示 Show warnings')}</Text></View>
    </View>
    <Slider className='strategy-timeline-slider' min={0} max={props.duration} step={0.1} value={Math.min(props.time, props.duration)}
      activeColor='#376cbb' backgroundColor='#c9ced1' blockSize={20}
      onChange={(event) => props.onScrub(Number(event.detail.value))} />
    <Text className='strategy-help strategy-route-help'>{t('选择机器人，再点“路径点”工具并点击场地；拖动编号圆点调整路径。 Select a robot, choose Waypoint, then click the field; drag numbered points to adjust the route.')}</Text>
    <View className='strategy-timeline-route-heading'>
      <Text className='strategy-panel-title'>{t('路径 Route')}: {label(selected.id)}</Text>
      <View className='strategy-action strategy-action-text' onClick={props.onAdd}><Text>{t('添加路径点 Add waypoint')}</Text></View>
    </View>
    {!points.length && <Text className='strategy-help strategy-route-empty'>{t('尚无路径点 No waypoints yet')}</Text>}
    <View className='strategy-waypoint-list'>{points.map((point, index) => <View key={point.id}
      className={`strategy-waypoint-row ${props.selectedWaypointId === point.id ? 'active' : ''}`}
      onClick={() => props.onSelectWaypoint(selected.id, point.id)}>
      <Text className='strategy-waypoint-label'>#{index + 1} · ({point.x.toFixed(1)}, {point.y.toFixed(1)}) {t('英寸 in')}</Text>
      <View className='strategy-waypoint-edit'>
        <View className='strategy-control'><Text>{t('到达时间 Arrival (s)')}</Text><Input type='number' value={String(Number(point.at.toFixed(1)))}
          onInput={(event) => { const raw = event.detail.value.trim(); const value = Number(raw); if (raw && Number.isFinite(value)) props.onChange(selected.id, point.id, { at: value }) }} /></View>
        <View className='strategy-control'><Text>{t('朝向 Heading (degrees)')}</Text><Input type='number' value={String(Math.round(point.heading))}
          onInput={(event) => { const raw = event.detail.value.trim(); const value = Number(raw); if (raw && Number.isFinite(value)) props.onChange(selected.id, point.id, { heading: value }) }} /></View>
      </View>
      <View className='strategy-waypoint-actions'>
        <View className={`strategy-action strategy-action-text ${index === 0 ? 'disabled' : ''}`} onClick={(event) => { event.stopPropagation(); props.onReorder(selected.id, point.id, -1) }}><Text>↑</Text></View>
        <View className={`strategy-action strategy-action-text ${index === points.length - 1 ? 'disabled' : ''}`} onClick={(event) => { event.stopPropagation(); props.onReorder(selected.id, point.id, 1) }}><Text>↓</Text></View>
        <View className='strategy-action strategy-action-text strategy-delete' onClick={(event) => { event.stopPropagation(); props.onRemove(selected.id, point.id) }}><Text>{t('删除 Delete')}</Text></View>
      </View>
    </View>)}</View>
    {props.warningsEnabled && <View className='strategy-timeline-warnings'>
      <Text className='strategy-panel-title'>{t('规划警示 Planning warnings')}</Text>
      <Text className='strategy-help'>{t('检查机器人轮廓、场地边界和中央支架；警示仅供规划参考。 Checks robot footprints, field boundary, and central frame; warnings are planning aids only.')}</Text>
      {props.currentWarnings.length > 0 && <Text className='strategy-warning-now'>{t('当前时间有警示 Warnings at current time')}</Text>}
      {!props.warnings.length && <Text className='strategy-help'>{t('未发现规划冲突 No planning conflicts detected')}</Text>}
      {props.warnings.map((warning) => <Text key={warning.key} className='strategy-warning-item'
        onClick={() => props.onScrub(warning.at)}>{warningText(warning)}</Text>)}
    </View>}
  </View>
}
