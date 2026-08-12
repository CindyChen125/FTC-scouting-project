import { useMemo, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import AppHeader from '../../components/AppHeader'
import { MatchScoutEntry } from '../../types/scouting'
import './index.scss'

export default function CurrentData() {
  const [entries, setEntries] = useState<MatchScoutEntry[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

  const loadEntries = () => {
    const { keys } = Taro.getStorageInfoSync()
    const loaded = keys
      .filter((key) => key.startsWith('scout:'))
      .map((key) => Taro.getStorageSync(key) as MatchScoutEntry)
      .filter(Boolean)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    setEntries(loaded)
  }

  // Re-scan storage every time this page becomes visible so newly saved entries show up.
  useDidShow(() => {
    loadEntries()
  })

  const visibleEntries = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(
      (entry) => entry.matchId.toLowerCase().includes(q) || entry.teamNumber.toLowerCase().includes(q)
    )
  }, [entries, query])

  return (
    <View className='data-page'>
      <AppHeader title='Current Data' showBack onSearch={() => setSearchOpen((open) => !open)} />

      <View className='page-content'>
      {searchOpen && (
        <Input
          className='search-input'
          value={query}
          placeholder='Search by match or team #'
          // @ts-expect-error h5-only DOM attribute, prevents browser autofill from injecting saved values
          autoComplete='off'
          onInput={(e) => setQuery(e.detail.value)}
        />
      )}

      {visibleEntries.length === 0 && (
        <Text className='empty-state'>
          {entries.length === 0 ? 'No scouting data saved yet.' : 'No entries match your search.'}
        </Text>
      )}

      {visibleEntries.map((entry) => (
        <View className='entry-card' key={`${entry.matchId}-${entry.teamNumber}`}>
          <View className='entry-header'>
            <Text className='entry-title'>{entry.matchId} · Team {entry.teamNumber}</Text>
            <Text className={`entry-alliance ${entry.alliance}`}>{entry.alliance}</Text>
          </View>
          <Text className='entry-meta'>Scout: {entry.scoutName || '—'}</Text>
          <Text className='entry-meta'>Updated: {new Date(entry.updatedAt).toLocaleString()}</Text>

          <View className='entry-stats'>
            <View className='entry-stat'>
              <Text className='entry-stat-label'>Auto goals</Text>
              <Text className='entry-stat-value'>
                {entry.auto.nearGoalsMade + entry.auto.farGoalsMade}/{entry.auto.nearGoalsAttempted + entry.auto.farGoalsAttempted}
              </Text>
            </View>
            <View className='entry-stat'>
              <Text className='entry-stat-label'>Teleop goals</Text>
              <Text className='entry-stat-value'>
                {entry.teleop.nearGoalsMade + entry.teleop.farGoalsMade}/{entry.teleop.nearGoalsAttempted + entry.teleop.farGoalsAttempted}
              </Text>
            </View>
            <View className='entry-stat'>
              <Text className='entry-stat-label'>Endgame</Text>
              <Text className='entry-stat-value'>{entry.endgame.parkStatus}</Text>
            </View>
          </View>
        </View>
      ))}
      </View>
    </View>
  )
}
