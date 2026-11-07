import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { translate as t, dateTime } from '../../i18n'
import { useLanguage } from '../../i18n/LanguageContext'
import AppHeader from '../../components/AppHeader'
import { MatchScoutEntry } from '../../types/scouting'
import { subscribeScoutEntry } from '../../supabase/scouting'
import { useAuth } from '../../auth/AuthContext'
import { fetchProfiles } from '../../supabase/admin'
import { findEvent, eventLabel, entryEventCode, CURRENT_SEASON } from '../../data/events'
import { gameForEntry } from '../../games'
import './index.scss'

function DetailRow({ label, value }: { label: string, value: string }) {
  useLanguage()
  return (
    <View className='detail-row'>
      <Text className='detail-label'>{label}</Text>
      <Text className='detail-value'>{value}</Text>
    </View>
  )
}

export default function EntryDetail() {
  useLanguage()
  const { userId } = useAuth()
  const [eventCode, setEventCode] = useState('')
  const [matchId, setMatchId] = useState('')
  const [teamNumber, setTeamNumber] = useState('')
  const [observationKey, setObservationKey] = useState('')
  const [entry, setEntry] = useState<MatchScoutEntry | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [names, setNames] = useState<Record<string, string>>({})

  useLoad((options) => {
    if (options?.eventCode) setEventCode(decodeURIComponent(options.eventCode))
    if (options?.matchId) setMatchId(decodeURIComponent(options.matchId))
    if (options?.teamNumber) setTeamNumber(decodeURIComponent(options.teamNumber))
    if (options?.observationKey) setObservationKey(decodeURIComponent(options.observationKey))
  })

  // Live-subscribed so this view reflects an edit immediately (this device
  // or any other scout's) rather than showing stale data.
  useEffect(() => {
    if (!eventCode || !matchId || !teamNumber) return
    const unsubscribe = subscribeScoutEntry(userId, eventCode, matchId, teamNumber, (loadedEntry) => {
      setEntry(loadedEntry)
      setLoaded(true)
    }, undefined, observationKey)
    return unsubscribe
  }, [userId, eventCode, matchId, teamNumber, observationKey])

  // Resolve user ids to current display names, so a renamed scout shows their
  // new name rather than the one snapshotted when they submitted.
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

  const goEdit = () => {
    Taro.navigateTo({
      url: `/pages/scout/index?eventCode=${encodeURIComponent(eventCode)}&matchId=${encodeURIComponent(matchId)}&teamNumber=${encodeURIComponent(teamNumber)}`
    })
  }

  if (!entry) {
    return (
      <View className='entry-detail-page'>
        <AppHeader title={t("Match Detail")} showBack />
        <View className='page-content'>
          <Text className='empty-state'>{loaded ? t("Entry not found.") : t("Loading…")}</Text>
        </View>
      </View>
    )
  }

  const event = findEvent(entryEventCode(entry))
  // Only the current game's form exists, so past seasons' entries are view-only.
  const editable = event.season === CURRENT_SEASON && entry.scoutedBy === userId
  const game = gameForEntry(entry)

  return (
    <View className='entry-detail-page'>
      <AppHeader title={t("Match Detail")} showBack />

      <View className='page-content'>
        <View className='header-card'>
          <View className='detail-header-row'>
            <Text className='detail-title'>{entry.matchId} · {t('teamNumber', { number: entry.teamNumber })}</Text>
            {editable && <View className='edit-btn' onClick={goEdit}>{t("Edit")}</View>}
          </View>
          <Text className={`entry-alliance ${entry.alliance}`}>{t(entry.alliance === 'red' ? 'Red' : 'Blue')}</Text>

          <DetailRow label={t("赛事 Event")} value={`${eventLabel(event)} · ${game.name}`} />
          <DetailRow
            label={t("侦查员 Scout")}
            value={(entry.scoutedBy && names[entry.scoutedBy]) || entry.scoutName || '—'}
          />
          {!!entry.lastEditedBy && entry.lastEditedBy !== entry.scoutedBy && (
            <DetailRow
              label={t("最后编辑 Edited by")}
              value={names[entry.lastEditedBy] || '—'}
            />
          )}
          <DetailRow label={t("更新时间 Updated")} value={dateTime(entry.updatedAt)} />
        </View>

        {game.detailSections(entry).map((section) => (
          <View className='section-card' key={t(section.title)}>
            <Text className='section-title'>{t(section.title)}</Text>
            {section.rows.map((row) => (
              <DetailRow key={row.label} label={t(row.label)} value={row.value} />
            ))}
          </View>
        ))}

        <View className='section-card'>
          <Text className='section-title'>{t("总体备注 Overall notes")}</Text>
          <Text className='detail-notes-block'>{entry.overallNotes || '—'}</Text>
        </View>
      </View>
    </View>
  )
}
