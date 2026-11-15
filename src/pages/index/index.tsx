import { useEffect, useMemo, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { translate as t } from '../../i18n'
import { useLanguage } from '../../i18n/LanguageContext'
import AppHeader from '../../components/AppHeader'
import SyncStatus from '../../components/SyncStatus'
import { useAuth } from '../../auth/AuthContext'
import { profileLabel, MatchScoutEntry } from '../../types/scouting'
import { entryEventCode } from '../../data/events'
import { readImportedEvents, syncImportedEvents } from '../../data/ftcScout'
import { useActiveEvent } from '../../data/ActiveEventContext'
import { flushOutbox, pendingCount, subscribeScoutEntries } from '../../supabase/scouting'
import './index.scss'

export default function Home() {
  useLanguage()
  const { profile, isAdmin, userId } = useAuth()
  const { activeEvent, offline: activeEventOffline } = useActiveEvent()
  const [entries, setEntries] = useState<MatchScoutEntry[]>([])
  const [importedEvents, setImportedEvents] = useState(readImportedEvents)
  const [dataMayBePartial, setDataMayBePartial] = useState(false)
  const [queued, setQueued] = useState(pendingCount)

  useLoad(() => console.log('Home page loaded.'))

  useEffect(() => subscribeScoutEntries(
    userId,
    (next) => {
      setEntries(next)
      setDataMayBePartial(false)
      setQueued(pendingCount())
    },
    () => setDataMayBePartial(true)
  ), [userId])

  useEffect(() => {
    let active = true
    syncImportedEvents().then((events) => {
      if (active) setImportedEvents(events)
    }).catch(() => setDataMayBePartial(true))
    if (typeof flushOutbox === 'function') {
      flushOutbox().then(({ pending }) => { if (active) setQueued(pending) })
    }
    return () => { active = false }
  }, [])

  const progress = useMemo(() => {
    const scoped = entries.filter((entry) => entryEventCode(entry) === activeEvent.code)
    const matches = new Set(scoped.map((entry) => entry.matchId.trim()).filter(Boolean))
    const coveredTeams = new Set(scoped.map((entry) => entry.teamNumber.trim()).filter(Boolean))
    const rosterCode = activeEvent.ftcScoutCode ?? activeEvent.code
    const roster = importedEvents.find((event) => event.code === rosterCode)?.teams
    const missing = roster?.length
      ? [...new Set(roster.map((team) => team.trim()).filter(Boolean))].filter((team) => !coveredTeams.has(team))
      : null
    return { matches: matches.size, teams: coveredTeams.size, missing }
  }, [activeEvent, entries, importedEvents])

  const goTo = (url: string) => Taro.navigateTo({ url })
  return (
    <View className='home-page'>
      <AppHeader title={t('FTC Scouting')} />
      <View className='page-content home-content'>
        <View className='home-intro'>
          <View>
            <Text className='home-title'>{t('FTC Scouting')}</Text>
            <Text className='home-subtitle'>{activeEvent.name}{profile ? ` · ${profileLabel(profile)}` : ''}</Text>
          </View>
          {(dataMayBePartial || activeEventOffline) && (
            <View className='home-offline-state'>
              <View className='home-offline-mark' />
              <Text>{t('离线缓存 Offline cache')}</Text>
            </View>
          )}
        </View>

        <View className='mission-panel'>
          <View className='mission-copy'>
            <Text className='mission-title'>{t('readyNextMatch')}</Text>
          </View>
          <View className='mission-action' role='button' onClick={() => goTo('/pages/scout/index')}>
            <Text className='mission-action-title'>{t('Start Scouting')}</Text>
          </View>
        </View>

        <View className='progress-section'>
          <View className='section-heading-row'>
            <View>
              <Text className='dashboard-title'>{t('scoutingProgress')}</Text>
            </View>
            <Text className='active-event-label'>{t('当前赛事 Active event')}: {activeEvent.name}</Text>
          </View>

          <View className='progress-metrics'>
            <View className='progress-metric'>
              <Text className='progress-value'>{progress.matches}</Text>
              <Text className='progress-label'>{t('matchesScouted')}</Text>
            </View>
            <View className='progress-metric'>
              <Text className='progress-value'>{progress.teams}</Text>
              <Text className='progress-label'>{t('teamsCovered')}</Text>
            </View>
            <View className='progress-metric'>
              <Text className='progress-value'>{progress.missing === null ? '—' : progress.missing.length}</Text>
              <Text className='progress-label'>{t('teamsMissingData')}</Text>
            </View>
          </View>

          {progress.missing === null ? (
            <Text className='progress-note'>{t('rosterUnavailable')}</Text>
          ) : progress.missing.length > 0 ? (
            <View className='missing-team-list'>
              <Text className='missing-team-heading'>{t('needsAttention')}</Text>
              <View className='missing-team-chips'>
                {progress.missing.map((team) => <Text key={team} className='missing-team-chip'>{team}</Text>)}
              </View>
            </View>
          ) : (
            <Text className='progress-note progress-note--complete'>{t('allTeamsCovered')}</Text>
          )}

          {dataMayBePartial && (
            <Text className='progress-caveat'>{t('offlineProgressCaveat')}</Text>
          )}
          {queued > 0 && <SyncStatus state='queued' />}
        </View>

        <View className='home-nav-grid'>
          <View className='home-nav-item' onClick={() => goTo('/pages/pit/index')}>
            <Text className='home-nav-title'>{t('赛前侦查 Pit Scouting')}</Text>
          </View>
          <View className='home-nav-item' onClick={() => goTo('/pages/data/index')}>
            <Text className='home-nav-title'>{t('See Current Data')}</Text>
          </View>
          {isAdmin && (
            <View className='home-nav-item' onClick={() => goTo('/pages/admin/index')}>
              <Text className='home-nav-title'>{t('管理员 Admin')}</Text>
            </View>
          )}
          <View className='home-nav-item' onClick={() => goTo('/pages/settings/index')}>
            <Text className='home-nav-title'>{t('Settings')}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
