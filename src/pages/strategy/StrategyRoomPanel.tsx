import { Text, View } from '@tarojs/components'
import { useLanguage } from '../../i18n/LanguageContext'
import { StrategyRecord } from '../../strategy/strategyRecord'
import { useStrategyRoom } from '../../strategy/useStrategyRoom'

type Room = ReturnType<typeof useStrategyRoom>
type Props = { record: StrategyRecord | null; room: Room; currentUserId: string | null }

export default function StrategyRoomPanel({ record, room, currentUserId }: Props) {
  const { t } = useLanguage()
  const status = {
    idle: '未加入房间 No room open', connecting: '正在连接 Connecting', live: '实时连接 Live',
    syncing: '同步中 Syncing', offline: '连接中断 Connection lost',
    conflict: '编辑冲突 Edit conflict', error: '协作不可用 Collaboration unavailable'
  }[room.status]
  const objectLabel = (key: string | null) => {
    if (!key) return t('正在查看 Viewing')
    const [kind, phase, robot] = key.split(':')
    const kindLabel = kind === 'robot' ? t('机器人 Robot') : kind === 'waypoint' ? t('路径点 Waypoint') : t('标注 Annotation')
    return `${t('正在编辑 Editing')} ${phase === 'auto' ? t('自动阶段 Autonomous') : t('手动阶段 TeleOp')} · ${kindLabel}${kind === 'robot' || kind === 'waypoint' ? ` ${robot.toUpperCase()}` : ''}`
  }
  return <View className='strategy-room-panel'>
    <Text className='strategy-panel-title'>{t('协作房间 Collaboration room')}</Text>
    {!record ? <Text className='strategy-help'>{t('保存或载入场景以加入团队协作房间。 Save or load a scenario to join its team room.')}</Text> : <>
      <Text className='strategy-help'>{record.name} · {t(status)}</Text>
      {!!room.pending && <Text className='strategy-scout-warning'>{t('尚有 {count} 项更改待同步 {count} changes pending sync', { count: room.pending })}</Text>}
      {!!room.error && <Text className='strategy-scout-warning'>{room.error}</Text>}
      {!!room.conflicts.length && <View className='strategy-room-conflict'>
        <Text>{t('同一对象被两人修改。选择保留你的版本或接受队友版本。 The same object changed in two places. Choose which version to keep.')}</Text>
        <View className='strategy-room-actions'>
          <View className='strategy-action strategy-action-text' onClick={room.resolveMine}><Text>{t('保留我的修改 Keep mine')}</Text></View>
          <View className='strategy-action strategy-action-text' onClick={room.resolveTheirs}><Text>{t('使用队友修改 Use teammate version')}</Text></View>
        </View>
      </View>}
      <Text className='strategy-scout-section-title'>{t('房间成员 Room participants')}</Text>
      {!room.participants.length && <Text className='strategy-help'>{t('正在获取成员列表 Loading participants')}</Text>}
      {room.participants.map((person) => <View key={person.sessionId} className='strategy-room-person'>
        <Text>{person.displayName || person.userId.slice(0, 8)}{person.userId === currentUserId ? ` · ${t('我 Me')}` : ''}</Text>
        <Text>{objectLabel(person.editingKey)}</Text>
      </View>)}
    </>}
    <Text className='strategy-help'>{t('外部队伍分享暂未开放；此房间仅供已登录的本队成员使用。 External team sharing is disabled; this room is for signed-in team members only.')}</Text>
  </View>
}
