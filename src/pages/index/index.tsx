import { useEffect, useMemo, useState } from 'react'
import { Picker, Text, View } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { translate as t } from '../../i18n'
import { useLanguage } from '../../i18n/LanguageContext'
import AppHeader from '../../components/AppHeader'
import SyncStatus from '../../components/SyncStatus'
import { useAuth } from '../../auth/AuthContext'
import { profileLabel, MatchScoutEntry } from '../../types/scouting'
import { EVENTS, entryEventCode, eventLabel, findEvent } from '../../data/events'
import { readImportedEvents, syncImportedEvents } from '../../data/ftcScout'
import { readSelectedEventCode, writeSelectedEventCode } from '../../data/selectedEvent'
import { flushOutbox, pendingCount, subscribeScoutEntries } from '../../supabase/scouting'
import './index.scss'

export default function Home() {
  useLanguage()
  const { profile, isAdmin, userId } = useAuth()
  const [entries, setEntries] = useState<MatchScoutEntry[]>([])
  const [eventCode, setEventCode] = useState(readSelectedEventCode)
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
      flushOutbox().then((count) => { if (active) setQueued(count) })
    }
    return () => { active = false }
  }, [])

  useEffect(() => writeSelectedEventCode(eventCode), [eventCode])

  const eventOptions = useMemo(() => {
    const byCode = new Map(EVENTS.map((event) => [event.code, { code: event.code, name: eventLabel(event) }]))
    importedEvents.forEach((event) => byCode.set(event.code, { code: event.code, name: event.name }))
    if (!byCode.has(eventCode)) byCode.set(eventCode, { code: eventCode, name: eventLabel(findEvent(eventCode)) })
    return [...byCode.values()]
  }, [eventCode, importedEvents])

  const progress = useMemo(() => {
    const scoped = entries.filter((entry) => entryEventCode(entry) === eventCode)
    const matches = new Set(scoped.map((entry) => entry.matchId.trim()).filter(Boolean))
    const coveredTeams = new Set(scoped.map((entry) => entry.teamNumber.trim()).filter(Boolean))
    const roster = importedEvents.find((event) => event.code === eventCode)?.teams
    const missing = roster?.length
      ? [...new Set(roster.map((team) => team.trim()).filter(Boolean))].filter((team) => !coveredTeams.has(team))
      : null
    return { matches: matches.size, teams: coveredTeams.size, missing }
  }, [entries, eventCode, importedEvents])

  const goTo = (url: string) => Taro.navigateTo({ url })
  const currentEventIndex = Math.max(0, eventOptions.findIndex((event) => event.code === eventCode))

  return (
    <View className='home-page'>
      <AppHeader title={t('FTC Scouting')} />
      <View className='page-content home-content'>
        <View className='home-intro'>
          <View>
            <Text className='home-title'>{t('FTC Scouting')}</Text>
            <Text className='home-subtitle'>{`BIOBUZZ 2026–2027${profile ? ` · ${profileLabel(profile)}` : ''}`}</Text>
          </View>
          <View className='home-system-state'>
            <View className='home-live-mark' />
            <Text>{dataMayBePartial ? '本机数据 / Device data' : '赛事工作台 / Event workspace'}</Text>
          </View>
        </View>

        <View className='mission-panel'>
          <View className='mission-copy'>
            <Text className='mission-title'>{t('readyNextMatch')}</Text>
            <Text className='mission-desc'>{t('missionDescription')}</Text>
          </View>
          <View className='mission-action' role='button' onClick={() => goTo('/pages/scout/index')}>
            <Text className='mission-action-title'>{t('Start Scouting')}</Text>
            <Text className='mission-action-meta'>{t('openMatchForm')}</Text>
          </View>
        </View>

        <View className='progress-section'>
          <View className='section-heading-row'>
            <View>
              <Text className='dashboard-title'>{t('scoutingProgress')}</Text>
              <Text className='dashboard-subtitle'>{t('submittedEntriesOnly')}</Text>
            </View>
            <Picker
              textProps={{ okText: t('Confirm'), cancelText: t('Cancel') }}
              mode='selector'
              range={eventOptions.map((event) => event.name)}
              value={currentEventIndex}
              onChange={(event) => setEventCode(eventOptions[Number(event.detail.value)]?.code ?? eventCode)}
            >
              <View className='event-compact-picker'>
                <Text>{eventOptions[currentEventIndex]?.name ?? eventCode}</Text>
                <View className='picker-caret' aria-hidden='true' />
              </View>
            </Picker>
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
            <Text className='home-nav-desc'>{t('Ask a team about their robot, before or between matches')}</Text>
          </View>
          <View className='home-nav-item' onClick={() => goTo('/pages/data/index')}>
            <Text className='home-nav-title'>{t('See Current Data')}</Text>
            <Text className='home-nav-desc'>{t('Review saved match entries')}</Text>
          </View>
          {isAdmin && (
            <View className='home-nav-item' onClick={() => goTo('/pages/admin/index')}>
              <Text className='home-nav-title'>{t('管理员 Admin')}</Text>
              <Text className='home-nav-desc'>{t('Manage scouts and see who scouted what')}</Text>
            </View>
          )}
          <View className='home-nav-item' onClick={() => goTo('/pages/settings/index')}>
            <Text className='home-nav-title'>{t('Settings')}</Text>
            <Text className='home-nav-desc'>{t('App preferences and data management')}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
