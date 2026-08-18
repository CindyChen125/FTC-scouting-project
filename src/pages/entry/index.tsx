import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import AppHeader from '../../components/AppHeader'
import { MatchScoutEntry, NOTE_OTHER } from '../../types/scouting'
import { subscribeScoutEntry } from '../../firebase/scouting'
import { findEvent } from '../../data/events'
import './index.scss'

function DetailRow({ label, value }: { label: string, value: string }) {
  return (
    <View className='detail-row'>
      <Text className='detail-label'>{label}</Text>
      <Text className='detail-value'>{value}</Text>
    </View>
  )
}

const parkStatusLabel = (status: string) =>
  status === 'partial' ? '半停 Partial' : status === 'full' ? '全停 Full' : '未停靠 None'

const formatNotes = (tags: string[], text: string) => {
  if (!tags || tags.length === 0) return '—'
  return tags.map((t) => (t === NOTE_OTHER && text ? `${t}: ${text}` : t)).join('、')
}

export default function EntryDetail() {
  const [matchId, setMatchId] = useState('')
  const [teamNumber, setTeamNumber] = useState('')
  const [entry, setEntry] = useState<MatchScoutEntry | null>(null)
  const [loaded, setLoaded] = useState(false)

  useLoad((options) => {
    if (options?.matchId) setMatchId(decodeURIComponent(options.matchId))
    if (options?.teamNumber) setTeamNumber(decodeURIComponent(options.teamNumber))
  })

  // Live-subscribed so this view reflects an edit immediately (this device
  // or any other scout's) rather than showing stale data.
  useEffect(() => {
    if (!matchId || !teamNumber) return
    const unsubscribe = subscribeScoutEntry(matchId, teamNumber, (loadedEntry) => {
      setEntry(loadedEntry)
      setLoaded(true)
    })
    return unsubscribe
  }, [matchId, teamNumber])

  const goEdit = () => {
    Taro.navigateTo({
      url: `/pages/scout/index?matchId=${encodeURIComponent(matchId)}&teamNumber=${encodeURIComponent(teamNumber)}`
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

  const eventName = entry.eventCode ? findEvent(entry.eventCode).name : undefined

  return (
    <View className='entry-detail-page'>
      <AppHeader title='Match Detail' showBack />

      <View className='page-content'>
        <View className='header-card'>
          <View className='detail-header-row'>
            <Text className='detail-title'>{entry.matchId} · Team {entry.teamNumber}</Text>
            <View className='edit-btn' onClick={goEdit}>✏️ Edit</View>
          </View>
          <Text className={`entry-alliance ${entry.alliance}`}>{entry.alliance}</Text>

          {eventName && <DetailRow label='赛事 Event' value={eventName} />}
          <DetailRow label='侦查员 Scout' value={entry.scoutName || '—'} />
          <DetailRow label='更新时间 Updated' value={new Date(entry.updatedAt).toLocaleString()} />
        </View>

        <View className='section-card'>
          <Text className='section-title'>自动阶段 Auto</Text>
          <DetailRow label='是否离开起始线 Left starting line' value={entry.auto.leftStart ? 'Yes' : 'No'} />
          <DetailRow label='近点 Near scored' value={String(entry.auto.nearGoalsMade)} />
          <DetailRow label='远点 Far scored' value={String(entry.auto.farGoalsMade)} />
          <DetailRow label='备注 Notes' value={formatNotes(entry.auto.noteTags, entry.auto.noteText)} />
        </View>

        <View className='section-card'>
          <Text className='section-title'>手动阶段 Teleop</Text>
          <DetailRow label='近点 Near scored' value={String(entry.teleop.nearGoalsMade)} />
          <DetailRow label='远点 Far scored' value={String(entry.teleop.farGoalsMade)} />
          <DetailRow label='备注 Notes' value={formatNotes(entry.teleop.noteTags, entry.teleop.noteText)} />
        </View>

        <View className='section-card'>
          <Text className='section-title'>终局阶段 Endgame</Text>
          <DetailRow label='是否有抬升机构 Has lift mechanism' value={entry.endgame.hasLift ? 'Yes' : 'No'} />
          <DetailRow label='停靠 Park status' value={parkStatusLabel(entry.endgame.parkStatus)} />
        </View>

        <View className='section-card'>
          <Text className='section-title'>总体备注 Overall notes</Text>
          <Text className='detail-notes-block'>{entry.overallNotes || '—'}</Text>
        </View>
      </View>
    </View>
  )
}
