import { Text, View } from '@tarojs/components'
import { translate as t } from '../../i18n'
import './index.scss'

export type SyncState = 'local' | 'queued' | 'synced' | 'error'

const LABELS: Record<SyncState, string> = {
  local: '已保存到本机 / Saved locally',
  queued: '等待同步 / Waiting to sync',
  synced: '已同步 / Synced',
  error: '同步出错，数据仍保存在本机 / Sync error — data is still local'
}

export default function SyncStatus({ state, onRetry }: { state: SyncState, onRetry?: () => void }) {
  return (
    <View className={`sync-status sync-status--${state}`} role='status'>
      <View className='sync-status-mark' aria-hidden='true' />
      <Text className='sync-status-label'>{LABELS[state]}</Text>
      {state === 'error' && onRetry && (
        <Text className='sync-status-retry' onClick={onRetry}>{t('retrySync')}</Text>
      )}
    </View>
  )
}
