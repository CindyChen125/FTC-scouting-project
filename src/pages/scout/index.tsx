import { useEffect, useRef, useState } from 'react'
import { Button, View, Text, Input, Picker, Textarea } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { translate as t } from '../../i18n'
import { useLanguage } from '../../i18n/LanguageContext'
import AppHeader from '../../components/AppHeader'
import SyncStatus, { SyncState } from '../../components/SyncStatus'
import {
  Alliance,
  AutoData,
  TeleopData,
  EndgameData,
  BiobuzzEntry,
  emptyAuto,
  emptyTeleop,
  emptyEndgame,
  scoutEntryStorageKey,
  scoutBackupKey,
  profileLabel,
  NOTE_OPTIONS,
  NOTE_OTHER,
  noteTagId,
  noteTagLabel
} from '../../types/scouting'
import { submitScoutEntry, fetchScoutEntry, flushOutbox, pendingCount } from '../../supabase/scouting'
import { useAuth } from '../../auth/AuthContext'
import { CURRENT_EVENT_CODE, CURRENT_SEASON, findEvent, eventLabel } from '../../data/events'
import { importEvent, readImportedEvents, syncImportedEvents, STATIONS, Station } from '../../data/ftcScout'
import { readSelectedEventCode, writeSelectedEventCode } from '../../data/selectedEvent'
import './index.scss'

// Tap-to-count, so a scout can keep their eyes on the robot instead of typing.
function CounterField({ label, value, onChange }: { label: string, value: number, onChange: (n: number) => void }) {
  useLanguage()
  return (
    <View className='field-row'>
      <Text className='field-label'>{t(label)}</Text>
      <View className='counter-line'>
        <View
          className={`counter-btn ${value === 0 ? 'disabled' : ''}`}
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          −1
        </View>
        <Text className='counter-value'>{value}</Text>
        <View className='counter-btn' onClick={() => onChange(value + 1)}>
          +1
        </View>
        {[2, 4].map((step) => (
          <View key={step} className='counter-btn' onClick={() => onChange(value + step)}>+{step}</View>
        ))}
      </View>
    </View>
  )
}

function YesNoField({ label, value, onChange }: { label: string, value: boolean, onChange: (v: boolean) => void }) {
  useLanguage()
  return (
    <View className='field-row'>
      <Text className='field-label'>{t(label)}</Text>
      <View className='pill-row'>
        <View className={`pill ${value ? 'active' : ''}`} onClick={() => onChange(true)}>
          {t('是 Yes')}
        </View>
        <View className={`pill ${!value ? 'active' : ''}`} onClick={() => onChange(false)}>
          {t('否 No')}
        </View>
      </View>
    </View>
  )
}

function TextField({ label, value, onChange, placeholder, numeric = false }: { label: string, value: string, onChange: (s: string) => void, placeholder?: string, numeric?: boolean }) {
  useLanguage()
  return (
    <View className='field-row'>
      <Text className='field-label'>{t(label)}</Text>
      <Input
        className='field-input'
        type={numeric ? 'number' : 'text'}
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
  useLanguage()
  const toggle = (opt: string) => {
    const next = tags.includes(opt) ? tags.filter((tag) => tag !== opt) : [...tags, opt]
    onChange({ noteTags: next })
  }
  const isOther = tags.includes(NOTE_OTHER)
  return (
    <View className='field-row'>
      <Text className='field-label'>{t('备注（可多选） Notes (multi-select)')}</Text>
      <View className='chip-row'>
        {NOTE_OPTIONS.map((opt) => (
          <View
            key={opt}
            className={`chip ${tags.includes(opt) ? 'active' : ''}`}
            onClick={() => toggle(opt)}
          >
            {t(opt)}
          </View>
        ))}
      </View>
      {isOther && (
        <Input
          className='field-input note-other-input'
          value={text}
          placeholder={t('请输入 Describe…')}
          // @ts-expect-error h5-only DOM attribute, prevents browser autofill from injecting saved values
          autoComplete='off'
          onInput={(e) => onChange({ noteText: e.detail.value })}
        />
      )}
    </View>
  )
}

export default function Index() {
  useLanguage()
  const submitLock = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const { userId, profile } = useAuth()
  const scoutName = profile ? profileLabel(profile) : ''

  const [eventCode, setEventCode] = useState(readSelectedEventCode)
  const [importedEvents, setImportedEvents] = useState(readImportedEvents)
  useEffect(() => {
    if (!userId) return
    let active = true
    syncImportedEvents().then((events) => { if (active) setImportedEvents(events) }).catch(() => {})
    return () => { active = false }
  }, [userId])
  const [importCode, setImportCode] = useState('')
  const [importing, setImporting] = useState(false)
  const [station, setStation] = useState<Station>('Red 1')
  const importedEvent = importedEvents.find((event) => event.code === eventCode)
  const schedule = importedEvent?.matches ?? []
  const [matchId, setMatchId] = useState('')
  const scheduleIndex = schedule.findIndex((match) => `Q${match.number}` === matchId)
  const [teamNumber, setTeamNumber] = useState('')
  const [alliance, setAlliance] = useState<Alliance>('red')

  const [auto, setAuto] = useState<AutoData>(emptyAuto())
  const [teleop, setTeleop] = useState<TeleopData>(emptyTeleop())
  const [endgame, setEndgame] = useState<EndgameData>(emptyEndgame())
  const [overallNotes, setOverallNotes] = useState('')
  const [syncState, setSyncState] = useState<SyncState | null>(null)

  useEffect(() => writeSelectedEventCode(eventCode), [eventCode])

  useLoad((options) => {
    console.log('Match scouting page loaded.')
    // Deep-linked from a "My Scouting Data" entry's Edit button. This form
    // only knows the current game, so an older season's event is ignored
    // rather than overwritten with BIOBUZZ-shaped data.
    if (options?.eventCode) {
      const code = decodeURIComponent(options.eventCode)
      if (findEvent(code).code === code && findEvent(code).season === CURRENT_SEASON) setEventCode(code)
    }
    if (options?.matchId) setMatchId(decodeURIComponent(options.matchId))
    if (options?.teamNumber) setTeamNumber(decodeURIComponent(options.teamNumber))
    const selected = STATIONS.find((s) => s === decodeURIComponent(options?.station ?? ''))
    if (selected) {
      setStation(selected)
      setAlliance(selected.startsWith('Red') ? 'red' : 'blue')
    }
  })

  // The author of a loaded entry, preserved so editing someone else's work
  // doesn't reassign it to the editor.
  const [scoutedBy, setScoutedBy] = useState<string | null>(null)
  const [originalScoutName, setOriginalScoutName] = useState<string | null>(null)
  const [loadedIdentity, setLoadedIdentity] = useState('')
  const identity = `${userId}:${eventCode}:${matchId}:${teamNumber}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyLoaded = (saved: any) => {
    setAlliance((saved.alliance as Alliance) ?? 'red')
    setScoutedBy((saved.scoutedBy as string) ?? null)
    setOriginalScoutName((saved.scoutName as string) ?? null)
    setAuto({ ...emptyAuto(), ...(saved.auto as Partial<AutoData>), noteTags: (saved.auto?.noteTags ?? []).map(noteTagLabel) })
    setTeleop({ ...emptyTeleop(), ...(saved.teleop as Partial<TeleopData>), noteTags: (saved.teleop?.noteTags ?? []).map(noteTagLabel) })
    setEndgame({ ...emptyEndgame(), ...(saved.endgame as Partial<EndgameData>) })
    setOverallNotes((saved.overallNotes as string) ?? '')
  }

  // Resume from the auto-saved backup (latest working copy) or a previously
  // submitted entry on THIS device. If neither exists locally — e.g. editing
  // an entry another scout submitted from their own device — fall back to
  // the shared Supabase copy. Merge onto empty defaults so older saves
  // (or fields added since) still fill in.
  useEffect(() => {
    if (!matchId || !teamNumber || !userId) return
    const local =
      Taro.getStorageSync(scoutBackupKey(userId, eventCode, matchId, teamNumber)) ||
      Taro.getStorageSync(scoutEntryStorageKey(userId, eventCode, matchId, teamNumber))
    if (local && (!local.scoutedBy || local.scoutedBy === userId)) {
      applyLoaded(local)
      setLoadedIdentity(identity)
      return
    }
    let cancelled = false
    fetchScoutEntry(userId, eventCode, matchId, teamNumber).then((remote) => {
      if (!cancelled) {
        applyLoaded(remote ?? { alliance })
        setLoadedIdentity(identity)
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventCode, matchId, teamNumber, userId])

  const currentEntry = (): BiobuzzEntry => ({
    observationKey: userId ?? undefined,
    eventCode,
    matchId,
    teamNumber,
    alliance,
    // On a new entry this scout is the author; when editing an existing one the
    // original author is kept. The database enforces this too — the client's
    // value is ignored on update — but keeping it right here means the local
    // copy and the outbox agree with what the server will store.
    scoutName: originalScoutName ?? scoutName,
    scoutedBy: scoutedBy ?? userId,
    auto: { ...auto, noteTags: auto.noteTags.map(noteTagId) },
    teleop: { ...teleop, noteTags: teleop.noteTags.map(noteTagId) },
    endgame,
    overallNotes,
    updatedAt: Date.now()
  })

  // Auto-save a backup on every change so nothing is lost if the app closes
  // mid-match (offline-first). Backups are never shown or uploaded — only a
  // submitted entry appears in "My Scouting Data".
  useEffect(() => {
    if (!matchId || !teamNumber || !userId || loadedIdentity !== identity) return
    Taro.setStorageSync(
      scoutBackupKey(userId, eventCode, matchId, teamNumber),
      currentEntry()
    )
    setSyncState('local')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventCode, matchId, teamNumber, userId, alliance, scoutName, auto, teleop, endgame, overallNotes, loadedIdentity, identity])

  const handleSubmit = async () => {
    if (submitLock.current) return
    if (loadedIdentity !== identity) {
      Taro.showToast({ title: t("Loading this match…"), icon: 'none' })
      return
    }
    if (!matchId || !teamNumber) {
      Taro.showToast({ title: t("请先填写场次和队号 Enter Match ID and Team #"), icon: 'none' })
      return
    }
    if (!userId) {
      Taro.showToast({ title: t("请先登录 Sign in to submit"), icon: 'none' })
      return
    }
    submitLock.current = true
    try {
    const res = await Taro.showModal({
      title: t("确认提交 Confirm submit"),
      content: t('submitMatch', { match: matchId, team: teamNumber }),
      confirmText: t("提交"),
      cancelText: t("取消")
    })
        if (!res.confirm) return
        setSubmitting(true)

        const entry = currentEntry()
        // The local write always succeeds and keeps the data on this device.
        Taro.setStorageSync(
          scoutEntryStorageKey(userId, eventCode, matchId, teamNumber),
          entry
        )
        setSyncState('local')

        // Report what actually happened. Announcing success before the write
        // resolved meant a scout whose account had been removed saw "已提交
        // Submitted ✓" for entries the server was rejecting.
        const outcome = await submitScoutEntry(entry)
        if (outcome === 'rejected') {
          setSyncState('error')
          // Stay on the form so the scout actually sees why it failed.
          Taro.showToast({
            title: t("未能提交：账号无权限，请重新登录 Rejected — sign in again"),
            icon: 'none'
          })
          return
        }

        setSyncState(outcome === 'synced' ? 'synced' : 'queued')

        Taro.showToast({
          title:
            outcome === 'synced'
              ? t("已提交 Submitted ✓")
              : t("已保存，联网后自动上传 Saved — uploads when back online"),
          icon: outcome === 'synced' ? 'success' : 'none'
        })

        // Keep the selected station and schedule available between matches.
        if (scheduleIndex >= 0) return

        // Back to the home screen, ready for the next match. reLaunch rather
        // than navigateBack because this page can be opened either from home
        // or from an entry's Edit button, and "back" should mean home either
        // way. The delay lets the toast be read first.
        await new Promise((resolve) => setTimeout(resolve, 1200))
        await Taro.reLaunch({ url: '/pages/index/index' })
    } catch {
      setSyncState('error')
      Taro.showToast({ title: t("无法完成操作 Could not complete the action"), icon: 'none' })
    } finally {
      submitLock.current = false
      setSubmitting(false)
    }
  }

  const retrySync = async () => {
    setSyncState('queued')
    try {
      const remaining = await flushOutbox()
      setSyncState(remaining === 0 ? 'synced' : 'error')
    } catch {
      setSyncState('error')
    }
  }

  const patchAuto = (patch: Partial<AutoData>) => setAuto((prev) => ({ ...prev, ...patch }))
  const patchTeleop = (patch: Partial<TeleopData>) => setTeleop((prev) => ({ ...prev, ...patch }))
  const patchEndgame = (patch: Partial<EndgameData>) => setEndgame((prev) => ({ ...prev, ...patch }))

  const openScheduledMatch = (index: number, position = station, code = eventCode) => {
    const match = importedEvents.find((event) => event.code === code)?.matches[index]
    const team = match?.teams[position] ?? ''
    const query = `eventCode=${encodeURIComponent(code)}&station=${encodeURIComponent(position)}`
    const matchQuery = match ? `&matchId=Q${match.number}&teamNumber=${team}` : ''
    Taro.redirectTo({ url: `/pages/scout/index?${query}${matchQuery}` }).catch(() => {
      Taro.showToast({ title: t("Could not open match"), icon: 'none' })
    })
  }

  const loadSchedule = async () => {
    if (importing) return
    setImporting(true)
    try {
      const event = await importEvent(importCode)
      setImportedEvents(readImportedEvents())
      Taro.showToast({ title: t('importedMatches', { count: event.matches.length }), icon: 'none' })
    } catch (error) {
      Taro.showToast({ title: t(error instanceof Error ? error.message : 'Event import failed'), icon: 'none' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <View className='scout-page'>
      <AppHeader title={t('开始侦查 Start Scouting')} showBack />

      <View className='page-content'>
      <View className='header-card'>
        <Text className='event-badge'>{eventLabel(findEvent(eventCode))}</Text>
        <TextField label={t("FTCScout 赛事代码 Event code")} value={importCode} onChange={setImportCode} placeholder={t("Event code")} />
        <Button size='mini' loading={importing} disabled={importing || !importCode.trim()} onClick={loadSchedule}>{t("导入或刷新赛事 Import / refresh")}</Button>
        {importedEvents.length > 0 && (
          <Picker textProps={{ okText: t('Confirm'), cancelText: t('Cancel') }} mode='selector' range={[t("Practice"), ...importedEvents.map((event) => event.name)]}
            onChange={(e) => {
              const event = importedEvents[Number(e.detail.value) - 1]
              openScheduledMatch(0, station, event?.code ?? CURRENT_EVENT_CODE)
            }}
          >
            <Button size='mini'>{t("选择赛事 Choose event")}</Button>
          </Picker>
        )}
        {schedule.length > 0 && (
          <View className='field-row'>
            <Picker textProps={{ okText: t('Confirm'), cancelText: t('Cancel') }} mode='selector' range={STATIONS.map((position) => t(position))} value={STATIONS.indexOf(station)}
              onChange={(e) => {
                const position = STATIONS[Number(e.detail.value)]
                if (position && position !== station) openScheduledMatch(Math.max(scheduleIndex, 0), position)
              }}
            >
              <Button size='mini'>{t('位置 Station:')} {t(station)}</Button>
            </Picker>
            <Picker textProps={{ okText: t('Confirm'), cancelText: t('Cancel') }} mode='selector' range={schedule.map((match) => `Q${match.number}`)}
              onChange={(e) => openScheduledMatch(Number(e.detail.value))}
            >
              <Button size='mini'>{t('matchSchedule', { matches: schedule.length, teams: importedEvent?.teams?.length ?? 0 })}</Button>
            </Picker>
            <Button size='mini' disabled={scheduleIndex >= schedule.length - 1} onClick={() => openScheduledMatch(scheduleIndex + 1)}>{t("下一场 Next match")}</Button>
            {schedule[scheduleIndex]?.redScore !== undefined && schedule[scheduleIndex]?.blueScore !== undefined && (
              <Text>{t('officialScore', { red: schedule[scheduleIndex].redScore!, blue: schedule[scheduleIndex].blueScore! })}</Text>
            )}
          </View>
        )}
        <View className='two-col'>
          <TextField
            label={t("比赛场次 Match #")}
            value={matchId.replace(/^Q/i, '')}
            onChange={(value) => {
              const number = value.replace(/\D/g, '')
              setMatchId(number ? `Q${number}` : '')
            }}
            placeholder='12'
            numeric
          />
          <TextField label={t("队号 Team #")} value={teamNumber} onChange={setTeamNumber} placeholder='417' />
        </View>
        <View className='field-row'>
          <Text className='field-label'>{t("联盟 Alliance")}</Text>
          <View className='pill-row'>
            <View className={`pill ${alliance === 'red' ? 'active' : ''}`} onClick={() => setAlliance('red')}>{t("Red")}</View>
            <View className={`pill ${alliance === 'blue' ? 'active' : ''}`} onClick={() => setAlliance('blue')}>{t("Blue")}</View>
          </View>
        </View>
        <View className='field-row'>
          <Text className='field-label'>{t("侦查员 Scout")}</Text>
          <Text className='scout-identity'>
            {originalScoutName && originalScoutName !== scoutName
              ? t('editedScout', { author: originalScoutName, editor: scoutName })
              : scoutName || '—'}
          </Text>
        </View>
      </View>

      <View className='section-card'>
        <Text className='section-title'>{t('自动阶段 Auto')}</Text>

        <YesNoField label={t("远离 Leave (离开场地边墙 off the wall)")} value={auto.leave} onChange={(v) => patchAuto({ leave: v })} />
        <CounterField label={t("射入蜂房 Balls into hive")} value={auto.cellBalls} onChange={(n) => patchAuto({ cellBalls: n })} />
        <CounterField label={t("联盟蜂巢翻转 Alliance hive tips (整个联盟 whole alliance)")} value={auto.allianceTips} onChange={(n) => patchAuto({ allianceTips: n })} />
        <YesNoField label={t("自动停泊装载区 Auto park in loading zone")} value={auto.park} onChange={(v) => patchAuto({ park: v })} />

        <NoteMultiField tags={auto.noteTags} text={auto.noteText} onChange={patchAuto} />
      </View>

      <View className='section-card'>
        <Text className='section-title'>{t('手动阶段 Teleop')}</Text>

        <Text className='subsection-title'>{t('射入蜂房 Balls into hive')}</Text>
        <View className='two-col'>
          <CounterField label={t("花粉 Pollen")} value={teleop.cellPollen} onChange={(n) => patchTeleop({ cellPollen: n })} />
          <CounterField label={t("花蜜 Nectar")} value={teleop.cellNectar} onChange={(n) => patchTeleop({ cellNectar: n })} />
        </View>
        <CounterField label={t("联盟蜂巢翻转 Alliance hive tips (整个联盟 whole alliance)")} value={teleop.allianceTips} onChange={(n) => patchTeleop({ allianceTips: n })} />

        <Text className='subsection-title'>{t('放入花朵 Balls into flowers')}</Text>
        <View className='two-col'>
          <CounterField label={t("花粉 Pollen")} value={endgame.flowerPollen} onChange={(n) => patchEndgame({ flowerPollen: n })} />
          <CounterField label={t("花蜜 Nectar")} value={endgame.flowerNectar} onChange={(n) => patchEndgame({ flowerNectar: n })} />
        </View>
        <YesNoField label={t("停泊装载区 Park in loading zone")} value={endgame.park} onChange={(v) => patchEndgame({ park: v })} />

        <NoteMultiField tags={teleop.noteTags} text={teleop.noteText} onChange={patchTeleop} />
        <Text className='subsection-title'>{t('裁判判罚（全场） Referee-called fouls (whole match)')}</Text>
        <CounterField label={t("小犯规 Minor fouls")} value={teleop.minorFouls ?? 0} onChange={(n) => patchTeleop({ minorFouls: n })} />
        <CounterField label={t("大犯规 Major fouls")} value={teleop.majorFouls ?? 0} onChange={(n) => patchTeleop({ majorFouls: n })} />
      </View>

      <View className='section-card'>
        <Text className='section-title'>{t('总体备注 Overall notes')}</Text>
        <View className='field-row'>
          <Textarea
            className='field-textarea'
            value={overallNotes}
            placeholder={t("对该队的整体印象、配合建议等 Overall impression, alliance fit, strategy notes…")}
            onInput={(e) => setOverallNotes(e.detail.value)}
          />
        </View>
      </View>

      <Text className='save-hint'>
        {matchId && teamNumber
          ? t("已自动备份 Auto-saved as backup ✓ · 提交后才会进入数据列表 submit to add to My Scouting Data")
          : t("Enter Match # and Team # to start")}
      </Text>

      {matchId && teamNumber && syncState && (
        <SyncStatus state={syncState} onRetry={syncState === 'error' && pendingCount() > 0 ? retrySync : undefined} />
      )}

      <Button
        className='submit-btn'
        disabled={submitting || !matchId || !teamNumber}
        loading={submitting}
        onClick={handleSubmit}
      >
        {submitting ? t('提交中 Saving…') : t('提交 Submit')}
      </Button>
      </View>
    </View>
  )
}
