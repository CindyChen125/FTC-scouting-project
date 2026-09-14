import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import AppHeader from '../../components/AppHeader'
import { MatchScoutEntry } from '../../types/scouting'
import { subscribeScoutEntry } from '../../supabase/scouting'
import { useAuth } from '../../auth/AuthContext'
import { fetchProfiles } from '../../supabase/admin'
import { findEvent, entryEventCode, CURRENT_SEASON } from '../../data/events'
import { gameForEntry } from '../../games'
import './index.scss'

function DetailRow({ label, value }: { label: string, value: string }) {
  return (
    <View className='detail-row'>
      <Text className='detail-label'>{label}</Text>
      <Text className='detail-value'>{value}</Text>
    </View>
  )
}

export default function EntryDetail() {
  const { userId } = useAuth()
  const [eventCode, setEventCode] = useState('')
  const [matchId, setMatchId] = useState('')
  const [teamNumber, setTeamNumber] = useState('')
  const [entry, setEntry] = useState<MatchScoutEntry | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [names, setNames] = useState<Record<string, string>>({})

  useLoad((options) => {
    if (options?.eventCode) setEventCode(decodeURIComponent(options.eventCode))
    if (options?.matchId) setMatchId(decodeURIComponent(options.matchId))
    if (options?.teamNumber) setTeamNumber(decodeURIComponent(options.teamNumber))
  })

  // Live-subscribed so this view reflects an edit immediately (this device
  // or any other scout's) rather than showing stale data.
  useEffect(() => {
    if (!eventCode || !matchId || !teamNumber) return
    const unsubscribe = subscribeScoutEntry(userId, eventCode, matchId, teamNumber, (loadedEntry) => {
      setEntry(loadedEntry)
      setLoaded(true)
    })
    return unsubscribe
  }, [userId, eventCode, matchId, teamNumber])

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
        <AppHeader title='Match Detail' showBack />
        <View className='page-content'>
          <Text className='empty-state'>{loaded ? 'Entry not found.' : 'Loading…'}</Text>
        </View>
      </View>
    )
  }

  const event = findEvent(entryEventCode(entry))
  // Only the current game's form exists, so past seasons' entries are view-only.
  const editable = event.season === CURRENT_SEASON
  const game = gameForEntry(entry)

  return (
    <View className='entry-detail-page'>
      <AppHeader title='Match Detail' showBack />

      <View className='page-content'>
        <View className='header-card'>
          <View className='detail-header-row'>
            <Text className='detail-title'>{entry.matchId} · Team {entry.teamNumber}</Text>
            {editable && <View className='edit-btn' onClick={goEdit}>✏️ Edit</View>}
          </View>
          <Text className={`entry-alliance ${entry.alliance}`}>{entry.alliance}</Text>

          <DetailRow label='赛事 Event' value={`${event.name} · ${game.name}`} />
          <DetailRow
            label='侦查员 Scout'
            value={(entry.scoutedBy && names[entry.scoutedBy]) || entry.scoutName || '—'}
          />
          {!!entry.lastEditedBy && entry.lastEditedBy !== entry.scoutedBy && (
            <DetailRow
              label='最后编辑 Edited by'
              value={names[entry.lastEditedBy] || '—'}
            />
          )}
          <DetailRow label='更新时间 Updated' value={new Date(entry.updatedAt).toLocaleString()} />
        </View>

        {game.detailSections(entry).map((section) => (
          <View className='section-card' key={section.title}>
            <Text className='section-title'>{section.title}</Text>
            {section.rows.map((row) => (
              <DetailRow key={row.label} label={row.label} value={row.value} />
            ))}
          </View>
        ))}

        <View className='section-card'>
          <Text className='section-title'>总体备注 Overall notes</Text>
          <Text className='detail-notes-block'>{entry.overallNotes || '—'}</Text>
        </View>
      </View>
    </View>
  )
}
