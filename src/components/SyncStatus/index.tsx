import { Text, View } from '@tarojs/components'
import { translate as t } from '../../i18n'
import { useLanguage } from '../../i18n/LanguageContext'
import type { SyncFailure } from '../../supabase/timeout'
import './index.scss'

export type SyncState = 'local' | 'queued' | 'synced' | 'error'

const LABELS: Record<SyncState, string> = {
  local: 'sync.local',
  queued: 'sync.queued',
  synced: 'sync.synced',
  error: 'sync.error'
}

const ERROR_LABELS: Record<SyncFailure['kind'], string> = {
  network: 'sync.error.network',
  authentication: 'sync.error.authentication',
  permission: 'sync.error.permission',
  schema: 'sync.error.schema',
  validation: 'sync.error.validation',
  missing: 'sync.error.missing',
  storage: 'sync.error.storage',
  server: 'sync.error.server'
}

const ERROR_DETAILS: Record<SyncFailure['kind'], string> = {
  network: 'sync.detail.network',
  authentication: 'sync.detail.authentication',
  permission: 'sync.detail.permission',
  schema: 'sync.detail.schema',
  validation: 'sync.detail.validation',
  missing: 'sync.detail.missing',
  storage: 'sync.detail.storage',
  server: 'sync.detail.server'
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
  useLanguage()
  const label = state === 'error' && failure ? ERROR_LABELS[failure.kind] : LABELS[state]
  return (
    <View className={`sync-status sync-status--${state}`} role='status'>
      <View className='sync-status-mark' aria-hidden='true' />
      <View className='sync-status-copy'>
        <Text className='sync-status-label'>{t(label)}</Text>
        {state === 'error' && failure && (
          <Text className='sync-status-detail'>{t(ERROR_DETAILS[failure.kind])}</Text>
        )}
      </View>
      {state === 'error' && onRetry && (
        <Text className='sync-status-retry' onClick={onRetry}>{t('retrySync')}</Text>
      )}
    </View>
  )
}
