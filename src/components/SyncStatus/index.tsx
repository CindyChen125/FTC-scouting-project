import { Text, View } from '@tarojs/components'
import { translate as t } from '../../i18n'
import type { SyncFailure } from '../../supabase/timeout'
import './index.scss'

export type SyncState = 'local' | 'queued' | 'synced' | 'error'

const LABELS: Record<SyncState, string> = {
  local: '已保存到本机 / Saved locally',
  queued: '等待同步 / Waiting to sync',
  synced: '已同步 / Synced',
  error: '同步出错，数据仍保存在本机 / Sync error — data is still local'
}

const ERROR_LABELS: Record<SyncFailure['kind'], string> = {
  network: '网络不可用，等待同步 / Offline — waiting to sync',
  authentication: '登录已失效，数据仍在本机 / Sign-in expired — data is still local',
  permission: '同步被权限阻止，数据仍在本机 / Permission blocked sync — data is still local',
  schema: '数据库需要更新，数据仍在本机 / Database update required — data is still local',
  validation: '服务器拒绝了数据，副本仍在本机 / Server rejected the data — local copy retained',
  storage: '本机存储出错，表单仍保留 / Local storage error — form remains open',
  server: '服务器同步出错，数据仍在本机 / Server sync error — data is still local'
}

export default function SyncStatus({
  state,
  failure,
  onRetry
}: {
  state: SyncState
  failure?: SyncFailure
  onRetry?: () => void
}) {
  const label = state === 'error' && failure ? ERROR_LABELS[failure.kind] : LABELS[state]
  return (
    <View className={`sync-status sync-status--${state}`} role='status'>
      <View className='sync-status-mark' aria-hidden='true' />
      <View className='sync-status-copy'>
        <Text className='sync-status-label'>{label}</Text>
        {state === 'error' && failure?.message && (
          <Text className='sync-status-detail'>{failure.message}</Text>
        )}
      </View>
      {state === 'error' && onRetry && (
        <Text className='sync-status-retry' onClick={onRetry}>{t('retrySync')}</Text>
      )}
    </View>
  )
}
