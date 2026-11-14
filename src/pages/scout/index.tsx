import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, View, Text, Input, Textarea } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { translate as t } from '../../i18n'
import { useLanguage } from '../../i18n/LanguageContext'
import AppHeader from '../../components/AppHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import SyncStatus, { SyncState } from '../../components/SyncStatus'
import {
  Alliance,
  FoulCategory,
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
  noteTagLabel,
  foulCategoryFor,
  foulCategoryLabel
} from '../../types/scouting'
import { submitScoutEntry, fetchScoutEntry, flushOutbox, pendingCount, type SubmitOutcome } from '../../supabase/scouting'
import {
  classifySyncFailure,
  reportDevelopmentError,
  storageFailure,
  type SyncFailure
} from '../../supabase/timeout'
import { useAuth } from '../../auth/AuthContext'
import { CURRENT_SEASON, findEvent, eventLabel } from '../../data/events'
import { useActiveEvent } from '../../data/ActiveEventContext'
import './index.scss'

// Tap-to-count, so a scout can keep their eyes on the robot instead of typing.
function CounterField({ label, value, onChange, steps = [1, 2, 4] }: {
  label: string
  value: number
  onChange: (n: number) => void
  steps?: number[]
}) {
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
        {steps.map((step) => (
          <View key={step} className='counter-btn' onClick={() => onChange(value + step)}>+{step}</View>
        ))}
      </View>
    </View>
  )
}

const FOUL_OPTIONS: FoulCategory[] = ['none', 'few', 'many']

function FoulCategoryField({ value, onChange }: { value: FoulCategory, onChange: (v: FoulCategory) => void }) {
  useLanguage()
  return (
    <View className='field-row'>
      <Text className='field-label'>{t('裁判判罚（全场） Referee-called fouls (whole match)')}</Text>
      <View className='foul-choice-row'>
        {FOUL_OPTIONS.map((option) => (
          <View
            key={option}
            className={`foul-choice ${value === option ? 'active' : ''}`}
            role='button'
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {t(foulCategoryLabel(option))}
          </View>
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
  const confirmationResolver = useRef<((confirmed: boolean) => void) | null>(null)
  const explicitEvent = useRef(false)
  const eventLocked = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const { userId, profile } = useAuth()
  const { activeEvent, offline: activeEventOffline } = useActiveEvent()
  const scoutName = profile ? profileLabel(profile) : ''

  const [eventCode, setEventCode] = useState(activeEvent.code)
  const [matchId, setMatchId] = useState('')
  const [teamNumber, setTeamNumber] = useState('')
  const [alliance, setAlliance] = useState<Alliance>('red')

  const [auto, setAuto] = useState<AutoData>(emptyAuto())
  const [teleop, setTeleop] = useState<TeleopData>(emptyTeleop())
  const [endgame, setEndgame] = useState<EndgameData>(emptyEndgame())
  const [overallNotes, setOverallNotes] = useState('')
  const [syncState, setSyncState] = useState<SyncState | null>(null)
  const [syncFailure, setSyncFailure] = useState<SyncFailure | undefined>()

  const formStarted = !!matchId || !!teamNumber || !!overallNotes ||
    auto.leave || auto.cellBalls > 0 || auto.allianceTips > 0 || auto.park || auto.noteTags.length > 0 || !!auto.noteText ||
    teleop.cellPollen > 0 || teleop.cellNectar > 0 || teleop.allianceTips > 0 || teleop.noteTags.length > 0 || !!teleop.noteText ||
    foulCategoryFor(teleop) !== 'none' ||
    endgame.flowerPollen > 0 || endgame.flowerNectar > 0 || endgame.park

  useEffect(() => {
    if (formStarted) eventLocked.current = true
    if (!explicitEvent.current && !eventLocked.current) setEventCode(activeEvent.code)
  }, [activeEvent.code, formStarted])

  useLoad((options) => {
    console.log('Match scouting page loaded.')
    // Deep-linked from a "My Scouting Data" entry's Edit button. This form
    // only knows the current game, so an older season's event is ignored
    // rather than overwritten with BIOBUZZ-shaped data.
    if (options?.eventCode) {
      const code = decodeURIComponent(options.eventCode)
      if (findEvent(code).code === code && findEvent(code).season === CURRENT_SEASON) {
        explicitEvent.current = true
        setEventCode(code)
      }
    }
    if (options?.matchId) setMatchId(decodeURIComponent(options.matchId))
    if (options?.teamNumber) setTeamNumber(decodeURIComponent(options.teamNumber))
  })

  // The author of a loaded entry, preserved so editing someone else's work
  // doesn't reassign it to the editor.
  const [scoutedBy, setScoutedBy] = useState<string | null>(null)
  const [originalScoutName, setOriginalScoutName] = useState<string | null>(null)
  const [loadedIdentity, setLoadedIdentity] = useState('')
  const identity = `${userId}:${eventCode}:${matchId}:${teamNumber}`

  const requestSubmitConfirmation = useCallback(() => new Promise<boolean>((resolve) => {
    confirmationResolver.current = resolve
    setConfirmationOpen(true)
  }), [])

  const settleSubmitConfirmation = useCallback((confirmed: boolean) => {
    const resolve = confirmationResolver.current
    if (!resolve) return
    confirmationResolver.current = null
    setConfirmationOpen(false)
    resolve(confirmed)
  }, [])

  useEffect(() => () => {
    confirmationResolver.current?.(false)
    confirmationResolver.current = null
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyLoaded = (saved: any) => {
    setAlliance((saved.alliance as Alliance) ?? 'red')
    setScoutedBy((saved.scoutedBy as string) ?? null)
    setOriginalScoutName((saved.scoutName as string) ?? null)
    setAuto({ ...emptyAuto(), ...(saved.auto as Partial<AutoData>), noteTags: (saved.auto?.noteTags ?? []).map(noteTagLabel) })
    setTeleop({
      ...emptyTeleop(),
      ...(saved.teleop as Partial<TeleopData>),
      foulCategory: foulCategoryFor(saved.teleop ?? {}),
      noteTags: (saved.teleop?.noteTags ?? []).map(noteTagLabel)
    })
    setEndgame({ ...emptyEndgame(), ...(saved.endgame as Partial<EndgameData>) })
    setOverallNotes((saved.overallNotes as string) ?? '')
  }

  // Resume from the auto-saved backup (latest working copy) or a previously
  // submitted entry on THIS device. If neither exists locally — e.g. editing
  // an entry another scout submitted from their own device — fall back to
  // the shared Supabase copy. Merge onto empty defaults so older saves
  // (or fields added since) still fill in.
  useEffect(() => {
    if (!matchId || !teamNumber || !userId) {
      setLoadedIdentity('')
      return
    }
    const local =
      Taro.getStorageSync(scoutBackupKey(userId, eventCode, matchId, teamNumber)) ||
      Taro.getStorageSync(scoutEntryStorageKey(userId, eventCode, matchId, teamNumber))
    if (local && (!local.scoutedBy || local.scoutedBy === userId)) {
      applyLoaded(local)
      setLoadedIdentity(identity)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      fetchScoutEntry(userId, eventCode, matchId, teamNumber).then((remote) => {
        if (!cancelled) {
          applyLoaded(remote ?? { alliance })
          setLoadedIdentity(identity)
        }
      })
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(timer)
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
    try {
      Taro.setStorageSync(
        scoutBackupKey(userId, eventCode, matchId, teamNumber),
        currentEntry()
      )
      setSyncFailure(undefined)
      setSyncState('local')
    } catch (error) {
      reportDevelopmentError('match-scout:draft-save', error)
      setSyncFailure(storageFailure(error, 'Could not save the draft on this device'))
      setSyncState('error')
    }
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
      const confirmed = await requestSubmitConfirmation()
      if (!confirmed) return
      setSubmitting(true)

      let entry: BiobuzzEntry
      try {
        entry = currentEntry()
        // Save the exact submitted snapshot before attempting the network.
        // If storage is unavailable, the live form stays intact and no false
        // claim is made that an offline-safe copy exists.
        Taro.setStorageSync(
          scoutEntryStorageKey(userId, eventCode, matchId, teamNumber),
          entry
        )
        setSyncFailure(undefined)
        setSyncState('local')
      } catch (error) {
        reportDevelopmentError('match-scout:local-save', error)
        setSyncFailure(storageFailure(error, 'Could not save the submitted copy on this device'))
        setSyncState('error')
        Taro.showToast({
          title: t('无法在本机保存；表单仍保留 Could not save locally — form remains open'),
          icon: 'none'
        })
        return
      }

      let outcome: SubmitOutcome
      try {
        outcome = await submitScoutEntry(entry)
      } catch (error) {
        // submitScoutEntry normally returns a classified outcome. This catch
        // protects against unexpected synchronous/client-storage exceptions;
        // the submitted snapshot above remains available for another attempt.
        reportDevelopmentError('match-scout:submit', error)
        setSyncFailure(classifySyncFailure(error))
        setSyncState('error')
        Taro.showToast({
          title: t('提交中断；本机副本已保留 Submission interrupted — local copy retained'),
          icon: 'none'
        })
        return
      }
      setSyncFailure(outcome.failure)
      if (outcome.status === 'error') {
        setSyncState('error')
        Taro.showToast({
          title: t('未能同步；数据仍在本机 Sync failed — data remains local'),
          icon: 'none'
        })
        return
      }

      setSyncState(outcome.status === 'synced' ? 'synced' : 'queued')

      Taro.showToast({
        title:
          outcome.status === 'synced'
            ? t("已提交 Submitted ✓")
            : t("已保存，联网后自动上传 Saved — uploads when back online"),
        icon: outcome.status === 'synced' ? 'success' : 'none'
      })

      // Navigation happens after the write and has its own error boundary. A
      // browser routing failure cannot downgrade a confirmed server sync.
      await new Promise((resolve) => setTimeout(resolve, 1200))
      try {
        await Taro.reLaunch({ url: '/pages/index/index' })
      } catch (error) {
        reportDevelopmentError('match-scout:navigation', error)
        Taro.showToast({
          title: t('已同步，但无法返回首页 Synced, but could not return home'),
          icon: 'none'
        })
      }
    } finally {
      submitLock.current = false
      setSubmitting(false)
    }
  }

  const retrySync = async () => {
    setSyncState('queued')
    try {
      const result = await flushOutbox()
      setSyncFailure(result.failure)
      setSyncState(result.pending === 0 ? 'synced' : result.failure?.kind === 'network' ? 'queued' : 'error')
    } catch (error) {
      reportDevelopmentError('match-scout:retry', error)
      setSyncFailure(classifySyncFailure(error))
      setSyncState('error')
    }
  }

  const patchAuto = (patch: Partial<AutoData>) => setAuto((prev) => ({ ...prev, ...patch }))
  const patchTeleop = (patch: Partial<TeleopData>) => setTeleop((prev) => ({ ...prev, ...patch }))
  const patchEndgame = (patch: Partial<EndgameData>) => setEndgame((prev) => ({ ...prev, ...patch }))

  return (
    <View className='scout-page'>
      <AppHeader title={t('开始侦查 Start Scouting')} showBack />

      <View className='page-content'>
      <View className='header-card'>
        <View className='event-context-row'>
          <Text className='event-badge'>{t('当前赛事 Active event')}: {eventLabel(findEvent(eventCode))}</Text>
          {activeEventOffline && <Text className='event-offline'>{t('离线缓存 Offline cache')}</Text>}
        </View>
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
          <TextField
            label={t("队号 Team #")}
            value={teamNumber}
            onChange={(value) => setTeamNumber(value.replace(/\D/g, ''))}
            placeholder='417'
            numeric
          />
        </View>
        <View className='field-row'>
          <Text className='field-label'>{t("联盟 Alliance")}</Text>
          <View className='pill-row'>
            <View className={`pill alliance-option red ${alliance === 'red' ? 'selected' : ''}`} onClick={() => setAlliance('red')}>{t("Red")}</View>
            <View className={`pill alliance-option blue ${alliance === 'blue' ? 'selected' : ''}`} onClick={() => setAlliance('blue')}>{t("Blue")}</View>
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
        <CounterField label={t("联盟蜂巢翻转 Alliance hive tips (整个联盟 whole alliance)")} value={auto.allianceTips} onChange={(n) => patchAuto({ allianceTips: n })} steps={[1]} />
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
        <CounterField label={t("联盟蜂巢翻转 Alliance hive tips (整个联盟 whole alliance)")} value={teleop.allianceTips} onChange={(n) => patchTeleop({ allianceTips: n })} steps={[1]} />

        <Text className='subsection-title'>{t('放入花朵 Balls into flowers')}</Text>
        <View className='two-col'>
          <CounterField label={t("花粉 Pollen")} value={endgame.flowerPollen} onChange={(n) => patchEndgame({ flowerPollen: n })} />
          <CounterField label={t("花蜜 Nectar")} value={endgame.flowerNectar} onChange={(n) => patchEndgame({ flowerNectar: n })} />
        </View>
        <YesNoField label={t("停泊装载区 Park in loading zone")} value={endgame.park} onChange={(v) => patchEndgame({ park: v })} />

        <NoteMultiField tags={teleop.noteTags} text={teleop.noteText} onChange={patchTeleop} />
        <FoulCategoryField value={foulCategoryFor(teleop)} onChange={(foulCategory) => patchTeleop({ foulCategory })} />
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

      {matchId && teamNumber && <Text className='save-hint'>{t('已自动备份 Auto-saved ✓')}</Text>}

      {matchId && teamNumber && syncState && (
        <SyncStatus state={syncState} failure={syncFailure} onRetry={syncState === 'error' && pendingCount() > 0 ? retrySync : undefined} />
      )}

      <Button
        className='submit-btn'
        disabled={submitting || confirmationOpen || !matchId || !teamNumber}
        loading={submitting}
        onClick={handleSubmit}
      >
        {submitting ? t('提交中 Saving…') : t('提交 Submit')}
      </Button>
      </View>
      {confirmationOpen && (
        <ConfirmDialog
          title={t('确认提交 Confirm submit')}
          description={t('submitMatch', { match: matchId, team: teamNumber })}
          cancelText={t('取消')}
          confirmText={t('提交')}
          onCancel={() => settleSubmitConfirmation(false)}
          onConfirm={() => settleSubmitConfirmation(true)}
        />
      )}
    </View>
  )
}
