import { useEffect, useState } from 'react'
import { View, Text, Input, Textarea } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import AppHeader from '../../components/AppHeader'
import {
  Alliance,
  ParkStatus,
  AutoData,
  TeleopData,
  EndgameData,
  emptyAuto,
  emptyTeleop,
  emptyEndgame,
  scoutEntryStorageKey
} from '../../types/scouting'
import './index.scss'

type Tab = 'auto' | 'teleop' | 'endgame'

function NumberField({ label, value, onChange }: { label: string, value: number, onChange: (n: number) => void }) {
  return (
    <View className='field-row'>
      <Text className='field-label'>{label}</Text>
      <Input
        className='field-input'
        type='digit'
        value={String(value)}
        onInput={(e) => onChange(Number(e.detail.value) || 0)}
      />
    </View>
  )
}

function TextField({ label, value, onChange, placeholder }: { label: string, value: string, onChange: (s: string) => void, placeholder?: string }) {
  return (
    <View className='field-row'>
      <Text className='field-label'>{label}</Text>
      <Input
        className='field-input'
        value={value}
        placeholder={placeholder}
        // @ts-expect-error h5-only DOM attribute, prevents browser autofill from injecting saved values
        autoComplete='off'
        onInput={(e) => onChange(e.detail.value)}
      />
    </View>
  )
}

function NotesField({ value, onChange }: { value: string, onChange: (s: string) => void }) {
  return (
    <View className='field-row'>
      <Text className='field-label'>备注 Notes (disconnect / malfunction / etc.)</Text>
      <Textarea
        className='field-textarea'
        value={value}
        placeholder='e.g. robot disconnected at 0:45, resumed at 0:52'
        onInput={(e) => onChange(e.detail.value)}
      />
    </View>
  )
}

export default function Index() {
  const [matchId, setMatchId] = useState('')
  const [teamNumber, setTeamNumber] = useState('')
  const [alliance, setAlliance] = useState<Alliance>('red')
  const [scoutName, setScoutName] = useState('')

  const [tab, setTab] = useState<Tab>('auto')
  const [auto, setAuto] = useState<AutoData>(emptyAuto())
  const [teleop, setTeleop] = useState<TeleopData>(emptyTeleop())
  const [endgame, setEndgame] = useState<EndgameData>(emptyEndgame())

  useLoad(() => {
    console.log('Match scouting page loaded.')
  })

  // Load any previously saved entry for this match+team so a scout can resume mid-match.
  useEffect(() => {
    if (!matchId || !teamNumber) return
    const key = scoutEntryStorageKey(matchId, teamNumber)
    const saved = Taro.getStorageSync(key)
    if (saved) {
      setAlliance(saved.alliance ?? 'red')
      setScoutName(saved.scoutName ?? scoutName)
      setAuto(saved.auto ?? emptyAuto())
      setTeleop(saved.teleop ?? emptyTeleop())
      setEndgame(saved.endgame ?? emptyEndgame())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, teamNumber])

  // Persist on every change so nothing is lost if the app closes mid-match (offline-first).
  useEffect(() => {
    if (!matchId || !teamNumber) return
    const key = scoutEntryStorageKey(matchId, teamNumber)
    Taro.setStorageSync(key, {
      matchId,
      teamNumber,
      alliance,
      scoutName,
      auto,
      teleop,
      endgame,
      updatedAt: Date.now()
    })
  }, [matchId, teamNumber, alliance, scoutName, auto, teleop, endgame])

  const patchAuto = (patch: Partial<AutoData>) => setAuto((prev) => ({ ...prev, ...patch }))
  const patchTeleop = (patch: Partial<TeleopData>) => setTeleop((prev) => ({ ...prev, ...patch }))
  const patchEndgame = (patch: Partial<EndgameData>) => setEndgame((prev) => ({ ...prev, ...patch }))

  return (
    <View className='scout-page'>
      <AppHeader title='Start Scouting' showBack />

      <View className='page-content'>
      <View className='header-card'>
        <View className='two-col'>
          <TextField label='比赛场次 Match ID' value={matchId} onChange={setMatchId} placeholder='Q12' />
          <TextField label='队号 Team #' value={teamNumber} onChange={setTeamNumber} placeholder='417' />
        </View>
        <View className='field-row'>
          <Text className='field-label'>联盟 Alliance</Text>
          <View className='pill-row'>
            <View className={`pill ${alliance === 'red' ? 'active' : ''}`} onClick={() => setAlliance('red')}>Red</View>
            <View className={`pill ${alliance === 'blue' ? 'active' : ''}`} onClick={() => setAlliance('blue')}>Blue</View>
          </View>
        </View>
        <TextField label='侦查员 Scout Name' value={scoutName} onChange={setScoutName} placeholder='your name' />
      </View>

      <View className='tab-bar'>
        <View className={`tab-item ${tab === 'auto' ? 'active' : ''}`} onClick={() => setTab('auto')}>Auto</View>
        <View className={`tab-item ${tab === 'teleop' ? 'active' : ''}`} onClick={() => setTab('teleop')}>Teleop</View>
        <View className={`tab-item ${tab === 'endgame' ? 'active' : ''}`} onClick={() => setTab('endgame')}>Endgame</View>
      </View>

      {tab === 'auto' && (
        <View className='section-card'>
          <Text className='section-title'>Autonomous</Text>

          <View className='field-row'>
            <Text className='field-label'>是否离开起始线 Left starting line</Text>
            <View className='pill-row'>
              <View
                className={`pill ${auto.leftStart ? 'active' : ''}`}
                onClick={() => patchAuto({ leftStart: true })}
              >
                Yes
              </View>
              <View
                className={`pill ${!auto.leftStart ? 'active' : ''}`}
                onClick={() => patchAuto({ leftStart: false })}
              >
                No
              </View>
            </View>
          </View>

          <View className='field-row'>
            <Text className='field-label'>自动路线 Auto route (describe path)</Text>
            <Textarea
              className='field-textarea'
              value={auto.routeNote}
              placeholder='e.g. starts left, drives to far goal, shoots 3, returns'
              onInput={(e) => patchAuto({ routeNote: e.detail.value })}
            />
          </View>

          <Text className='subsection-title'>进球 Goals scored</Text>
          <View className='two-col'>
            <NumberField label='近点 Near scored' value={auto.nearGoalsMade} onChange={(n) => patchAuto({ nearGoalsMade: n })} />
            <NumberField label='远点 Far scored' value={auto.farGoalsMade} onChange={(n) => patchAuto({ farGoalsMade: n })} />
          </View>

          <NumberField label='图案个数 Pattern count' value={auto.patternCount} onChange={(n) => patchAuto({ patternCount: n })} />

          <NotesField value={auto.notes} onChange={(s) => patchAuto({ notes: s })} />
        </View>
      )}

      {tab === 'teleop' && (
        <View className='section-card'>
          <Text className='section-title'>Teleop</Text>

          <Text className='subsection-title'>进球 Goals scored</Text>
          <View className='two-col'>
            <NumberField label='近点 Near scored' value={teleop.nearGoalsMade} onChange={(n) => patchTeleop({ nearGoalsMade: n })} />
            <NumberField label='远点 Far scored' value={teleop.farGoalsMade} onChange={(n) => patchTeleop({ farGoalsMade: n })} />
          </View>

          <NumberField label='图案个数 Pattern count' value={teleop.patternCount} onChange={(n) => patchTeleop({ patternCount: n })} />

          <Text className='subsection-title'>节奏 Cycle speed</Text>
          <View className='two-col'>
            <NumberField label='总循环数 Total cycles' value={teleop.totalCycles} onChange={(n) => patchTeleop({ totalCycles: n })} />
            <NumberField label='平均每循环秒数 Avg cycle time (sec)' value={teleop.avgCycleTimeSec} onChange={(n) => patchTeleop({ avgCycleTimeSec: n })} />
          </View>

          <Text className='subsection-title'>判罚 Penalties</Text>
          <View className='two-col'>
            <NumberField label='造对方判罚 Drawn on opponent' value={teleop.penaltiesDrawn} onChange={(n) => patchTeleop({ penaltiesDrawn: n })} />
            <NumberField label='自身被判罚 Committed by them' value={teleop.penaltiesCommitted} onChange={(n) => patchTeleop({ penaltiesCommitted: n })} />
          </View>

          <NotesField value={teleop.notes} onChange={(s) => patchTeleop({ notes: s })} />
        </View>
      )}

      {tab === 'endgame' && (
        <View className='section-card'>
          <Text className='section-title'>Endgame</Text>

          <View className='field-row'>
            <Text className='field-label'>是否有抬升机构 Has lift mechanism</Text>
            <View className='pill-row'>
              <View
                className={`pill ${endgame.hasLift ? 'active' : ''}`}
                onClick={() => patchEndgame({ hasLift: true })}
              >
                Yes
              </View>
              <View
                className={`pill ${!endgame.hasLift ? 'active' : ''}`}
                onClick={() => patchEndgame({ hasLift: false })}
              >
                No
              </View>
            </View>
          </View>

          <View className='field-row'>
            <Text className='field-label'>停靠 Park status</Text>
            <View className='pill-row'>
              {(['none', 'partial', 'full'] as ParkStatus[]).map((status) => (
                <View
                  key={status}
                  className={`pill ${endgame.parkStatus === status ? 'active' : ''}`}
                  onClick={() => patchEndgame({ parkStatus: status })}
                >
                  {status === 'none' ? '未停靠' : status === 'partial' ? '半停' : '全停'}
                </View>
              ))}
            </View>
          </View>

          <NumberField label='停靠用时 Time to park (sec)' value={endgame.parkTimeSec} onChange={(n) => patchEndgame({ parkTimeSec: n })} />

          <NotesField value={endgame.notes} onChange={(s) => patchEndgame({ notes: s })} />
        </View>
      )}

      <Text className='save-hint'>
        {matchId && teamNumber ? 'Saved locally as you type ✓' : 'Enter Match ID and Team # to start saving'}
      </Text>
      </View>
    </View>
  )
}
