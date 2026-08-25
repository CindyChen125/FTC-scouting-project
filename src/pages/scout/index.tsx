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
  scoutEntryStorageKey,
  scoutBackupKey,
  NOTE_OPTIONS,
  NOTE_OTHER
} from '../../types/scouting'
import { submitScoutEntry, fetchScoutEntry } from '../../supabase/scouting'
import { CURRENT_EVENT_CODE } from '../../data/events'
import './index.scss'

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

// Multi-select notes for Auto/Teleop: tap any number of presets; "其他 Other"
// reveals a free-text input for a custom note.
function NoteMultiField({ tags, text, onChange }: { tags: string[], text: string, onChange: (patch: { noteTags?: string[], noteText?: string }) => void }) {
  const toggle = (opt: string) => {
    const next = tags.includes(opt) ? tags.filter((t) => t !== opt) : [...tags, opt]
    onChange({ noteTags: next })
  }
  const isOther = tags.includes(NOTE_OTHER)
  return (
    <View className='field-row'>
      <Text className='field-label'>备注 Notes (可多选 multi-select)</Text>
      <View className='chip-row'>
        {NOTE_OPTIONS.map((opt) => (
          <View
            key={opt}
            className={`chip ${tags.includes(opt) ? 'active' : ''}`}
            onClick={() => toggle(opt)}
          >
            {opt}
          </View>
        ))}
      </View>
      {isOther && (
        <Input
          className='field-input note-other-input'
          value={text}
          placeholder='请输入 Describe…'
          // @ts-expect-error h5-only DOM attribute, prevents browser autofill from injecting saved values
          autoComplete='off'
          onInput={(e) => onChange({ noteText: e.detail.value })}
        />
      )}
    </View>
  )
}

export default function Index() {
  const [matchId, setMatchId] = useState('')
  const [teamNumber, setTeamNumber] = useState('')
  const [alliance, setAlliance] = useState<Alliance>('red')
  const [scoutName, setScoutName] = useState('')

  const [auto, setAuto] = useState<AutoData>(emptyAuto())
  const [teleop, setTeleop] = useState<TeleopData>(emptyTeleop())
  const [endgame, setEndgame] = useState<EndgameData>(emptyEndgame())
  const [overallNotes, setOverallNotes] = useState('')

  useLoad((options) => {
    console.log('Match scouting page loaded.')
    // Deep-linked from a "My Scouting Data" entry's Edit button.
    if (options?.matchId) setMatchId(decodeURIComponent(options.matchId))
    if (options?.teamNumber) setTeamNumber(decodeURIComponent(options.teamNumber))
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyLoaded = (saved: any) => {
    setAlliance((saved.alliance as Alliance) ?? 'red')
    setScoutName((saved.scoutName as string) ?? '')
    setAuto({ ...emptyAuto(), ...(saved.auto as Partial<AutoData>) })
    setTeleop({ ...emptyTeleop(), ...(saved.teleop as Partial<TeleopData>) })
    setEndgame({ ...emptyEndgame(), ...(saved.endgame as Partial<EndgameData>) })
    setOverallNotes((saved.overallNotes as string) ?? '')
  }

  // Resume from the auto-saved backup (latest working copy) or a previously
  // submitted entry on THIS device. If neither exists locally — e.g. editing
  // an entry another scout submitted from their own device — fall back to
  // the shared Supabase copy. Merge onto empty defaults so older saves
  // (or fields added since) still fill in.
  useEffect(() => {
    if (!matchId || !teamNumber) return
    const local =
      Taro.getStorageSync(scoutBackupKey(matchId, teamNumber)) ||
      Taro.getStorageSync(scoutEntryStorageKey(matchId, teamNumber))
    if (local) {
      applyLoaded(local)
      return
    }
    let cancelled = false
    fetchScoutEntry(matchId, teamNumber).then((remote) => {
      if (!cancelled && remote) applyLoaded(remote)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, teamNumber])

  const currentEntry = () => ({
    eventCode: CURRENT_EVENT_CODE,
    matchId,
    teamNumber,
    alliance,
    scoutName,
    auto,
    teleop,
    endgame,
    overallNotes,
    updatedAt: Date.now()
  })

  // Auto-save a backup on every change so nothing is lost if the app closes
  // mid-match (offline-first). Backups are never shown or uploaded — only a
  // submitted entry appears in "My Scouting Data".
  useEffect(() => {
    if (!matchId || !teamNumber) return
    Taro.setStorageSync(scoutBackupKey(matchId, teamNumber), currentEntry())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, teamNumber, alliance, scoutName, auto, teleop, endgame, overallNotes])

  const handleSubmit = () => {
    if (!matchId || !teamNumber) {
      Taro.showToast({ title: '请先填写场次和队号 Enter Match ID and Team #', icon: 'none' })
      return
    }
    Taro.showModal({
      title: '确认提交 Confirm submit',
      content: `提交场次 ${matchId} · 队 ${teamNumber} 的侦查数据？Submit scouting data for match ${matchId}, team ${teamNumber}?`,
      confirmText: '提交',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          const entry = currentEntry()
          // Local write always succeeds instantly and is the source of truth
          // for this device. The Supabase write shares it with every other
          // scout; if it fails (no signal) the entry is queued in the outbox
          // and retried automatically, so submitting offline never loses data.
          Taro.setStorageSync(scoutEntryStorageKey(matchId, teamNumber), entry)
          submitScoutEntry(entry).catch((err) => {
            console.error('Submission queued — could not reach Supabase yet', err)
          })
          Taro.showToast({ title: '已提交 Submitted ✓', icon: 'success' })
        }
      }
    })
  }

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

      <View className='section-card'>
        <Text className='section-title'>自动阶段 Auto</Text>

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

        <Text className='subsection-title'>进球 Goals scored</Text>
        <View className='two-col'>
          <NumberField label='近点 Near scored' value={auto.nearGoalsMade} onChange={(n) => patchAuto({ nearGoalsMade: n })} />
          <NumberField label='远点 Far scored' value={auto.farGoalsMade} onChange={(n) => patchAuto({ farGoalsMade: n })} />
        </View>

        <NoteMultiField tags={auto.noteTags} text={auto.noteText} onChange={patchAuto} />
      </View>

      <View className='section-card'>
        <Text className='section-title'>手动阶段 Teleop</Text>

        <Text className='subsection-title'>进球 Goals scored</Text>
        <View className='two-col'>
          <NumberField label='近点 Near scored' value={teleop.nearGoalsMade} onChange={(n) => patchTeleop({ nearGoalsMade: n })} />
          <NumberField label='远点 Far scored' value={teleop.farGoalsMade} onChange={(n) => patchTeleop({ farGoalsMade: n })} />
        </View>

        <NoteMultiField tags={teleop.noteTags} text={teleop.noteText} onChange={patchTeleop} />
      </View>

      <View className='section-card'>
        <Text className='section-title'>终局阶段 Endgame</Text>

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
      </View>

      <View className='section-card'>
        <Text className='section-title'>总体备注 Overall notes</Text>
        <View className='field-row'>
          <Textarea
            className='field-textarea'
            value={overallNotes}
            placeholder='对该队的整体印象、配合建议等 Overall impression, alliance fit, strategy notes…'
            onInput={(e) => setOverallNotes(e.detail.value)}
          />
        </View>
      </View>

      <Text className='save-hint'>
        {matchId && teamNumber
          ? '已自动备份 Auto-saved as backup ✓ · 提交后才会进入数据列表 submit to add to My Scouting Data'
          : 'Enter Match ID and Team # to start'}
      </Text>

      <View
        className={`submit-btn ${matchId && teamNumber ? '' : 'disabled'}`}
        onClick={handleSubmit}
      >
        提交 Submit
      </View>
      </View>
    </View>
  )
}
