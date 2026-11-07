import { useEffect, useState } from 'react'
import { Button, Picker, View, Text, Input, Textarea, Image } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { translate as t } from '../../i18n'
import { useLanguage } from '../../i18n/LanguageContext'
import AppHeader from '../../components/AppHeader'
import { profileLabel } from '../../types/scouting'
import {
  PitData,
  PitEntry,
  AutoAction,
  emptyPitData,
  pitEntryStorageKey,
  pitBackupKey,
  DRIVETRAIN_OPTIONS,
  BALL_OPTIONS,
  AUTO_OPTIONS,
  ROLE_OPTIONS
} from '../../types/pit'
import { submitPitEntry, fetchPitEntry } from '../../supabase/pit'
import { useAuth } from '../../auth/AuthContext'
import { uploadRobotPhoto, robotPhotoUrl } from '../../supabase/photos'
import { CURRENT_EVENT_CODE, CURRENT_SEASON, findEvent, eventLabel } from '../../data/events'
import { readImportedEvents, syncImportedEvents } from '../../data/ftcScout'
import './index.scss'

// Single-choice chips. Tapping the selected chip again clears the answer, so a
// mis-tap can go back to "not asked yet".
function ChoiceField<T extends string>({ label, options, value, onChange }: {
  label: string
  options: { value: T; label: string }[]
  value: T | ''
  onChange: (v: T | '') => void
}) {
  useLanguage()
  return (
    <View className='field-row'>
      <Text className='field-label'>{label}</Text>
      <View className='chip-row'>
        {options.map((opt) => (
          <View
            key={opt.value}
            className={`chip ${value === opt.value ? 'active' : ''}`}
            onClick={() => onChange(value === opt.value ? '' : opt.value)}
          >
            {t(opt.label)}
          </View>
        ))}
      </View>
    </View>
  )
}

export default function PitScouting() {
  useLanguage()
  const { userId, profile } = useAuth()
  const scoutName = profile ? profileLabel(profile) : ''

  const [eventCode, setEventCode] = useState(CURRENT_EVENT_CODE)
  const [teamNumber, setTeamNumber] = useState('')
  const [data, setData] = useState<PitData>(emptyPitData())
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  useEffect(() => {
    let active = true
    setPhotoUrl('')
    if (data.photoPath) robotPhotoUrl(data.photoPath).then((url) => {
      if (active) setPhotoUrl(url)
    }).catch(() => { if (active) setPhotoError('Photo unavailable. Check your connection.') })
    return () => { active = false }
  }, [data.photoPath])
  const [scoutedBy, setScoutedBy] = useState<string | null>(null)
  const [originalScoutName, setOriginalScoutName] = useState<string | null>(null)

  useLoad((options) => {
    // Opened from a card in the Pit tab. Pit questions are BIOBUZZ-only.
    if (options?.eventCode) {
      const code = decodeURIComponent(options.eventCode)
      if (findEvent(code).code === code && findEvent(code).season === CURRENT_SEASON) setEventCode(code)
    }
    if (options?.teamNumber) setTeamNumber(decodeURIComponent(options.teamNumber))
  })

  const applyLoaded = (saved: Partial<PitEntry>) => {
    setData({ ...emptyPitData(), ...(saved.data ?? {}) })
    setScoutedBy(saved.scoutedBy ?? null)
    setOriginalScoutName(saved.scoutName ?? null)
  }

  // Typing a team number pulls up what we already know about them: this
  // device's draft, then its submitted copy, then the shared table. A team
  // with nothing saved starts blank rather than keeping the previous team's
  // answers.
  useEffect(() => {
    if (!userId) return
    const team = teamNumber.trim()
    if (!team) return
    const local =
      Taro.getStorageSync(pitBackupKey(userId, eventCode, team)) ||
      Taro.getStorageSync(pitEntryStorageKey(userId, eventCode, team))
    if (local) {
      applyLoaded(local)
      return
    }
    applyLoaded({})
    let cancelled = false
    fetchPitEntry(userId, eventCode, team).then((remote) => {
      if (!cancelled && remote) applyLoaded(remote)
    })
    return () => {
      cancelled = true
    }
  }, [eventCode, teamNumber, userId])

  const currentEntry = (): PitEntry => ({
    eventCode,
    teamNumber: teamNumber.trim(),
    data,
    scoutName: originalScoutName ?? scoutName,
    scoutedBy: scoutedBy ?? userId,
    updatedAt: Date.now()
  })

  // Draft backup on every change, same safety net as the match form. A blank
  // form isn't worth saving — typing "417" would otherwise leave empty drafts
  // behind for teams "4" and "41".
  useEffect(() => {
    const team = teamNumber.trim()
    if (!team || !userId) return
    if (JSON.stringify(data) === JSON.stringify(emptyPitData())) return
    Taro.setStorageSync(pitBackupKey(userId, eventCode, team), currentEntry())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const patch = (p: Partial<PitData>) => setData((prev) => ({ ...prev, ...p }))

  const toggleAuto = (action: AutoAction) =>
    setData((prev) => ({
      ...prev,
      autoActions: prev.autoActions.includes(action)
        ? prev.autoActions.filter((a) => a !== action)
        : [...prev.autoActions, action]
    }))

  const handleSubmit = () => {
    const team = teamNumber.trim()
    if (!team) {
      Taro.showToast({ title: t("请先填写队号 Enter Team #"), icon: 'none' })
      return
    }
    if (!userId) {
      Taro.showToast({ title: t("请先登录 Sign in to submit"), icon: 'none' })
      return
    }
    Taro.showModal({
      title: t("确认提交 Confirm submit"),
      content: t('submitPit', { team }),
      confirmText: t("提交"),
      cancelText: t("取消"),
      success: async (res) => {
        if (!res.confirm) return

        const entry = currentEntry()
        Taro.setStorageSync(pitEntryStorageKey(userId, eventCode, team), entry)

        const outcome = await submitPitEntry(entry)
        if (outcome === 'rejected') {
          Taro.showToast({
            title: t("未能提交：账号无权限，请重新登录 Rejected — sign in again"),
            icon: 'none'
          })
          return
        }

        Taro.showToast({
          title:
            outcome === 'synced'
              ? t("已提交 Submitted ✓")
              : t("已保存，联网后自动上传 Saved — uploads when back online"),
          icon: outcome === 'synced' ? 'success' : 'none'
        })

        setTimeout(() => {
          Taro.reLaunch({ url: '/pages/index/index' }).catch(() => {})
        }, 1200)
      }
    })
  }

  const hasTeam = !!teamNumber.trim()
  const [importedEvents, setImportedEvents] = useState(readImportedEvents)
  useEffect(() => {
    if (!userId) return
    let active = true
    syncImportedEvents().then((events) => { if (active) setImportedEvents(events) }).catch(() => {})
    return () => { active = false }
  }, [userId])
  const roster = importedEvents.find((event) => event.code === eventCode)?.teams ?? []
  const openPit = (code: string, team = '') => {
    Taro.redirectTo({ url: `/pages/pit/index?eventCode=${encodeURIComponent(code)}&teamNumber=${encodeURIComponent(team)}` })
      .catch(() => Taro.showToast({ title: t("Could not open pit profile"), icon: 'none' }))
  }

  return (
    <View className='scout-page'>
      <AppHeader title={t("Pit Scouting")} showBack />

      <View className='page-content'>
        <View className='header-card'>
          <Text className='event-badge'>{eventLabel(findEvent(eventCode))}</Text>
          {importedEvents.length > 0 && (
            <Picker textProps={{ okText: t('Confirm'), cancelText: t('Cancel') }} mode='selector' range={[t("Practice"), ...importedEvents.map((event) => event.name)]}
              onChange={(e) => openPit(importedEvents[Number(e.detail.value) - 1]?.code ?? CURRENT_EVENT_CODE)}
            >
              <Button size='mini'>{t("选择赛事 Choose event")}</Button>
            </Picker>
          )}
          {roster.length > 0 && (
            <Picker textProps={{ okText: t('Confirm'), cancelText: t('Cancel') }} mode='selector' range={roster}
              onChange={(e) => {
                const team = roster[Number(e.detail.value)]
                if (team) openPit(eventCode, team)
              }}
            >
              <Button size='mini'>{t("选择队伍 Choose team")}</Button>
            </Picker>
          )}
          <View className='field-row'>
            <Text className='field-label'>{t("队号 Team #")}</Text>
            <Input
              className='field-input'
              value={teamNumber}
              placeholder='417'
              // @ts-expect-error h5-only DOM attribute, prevents browser autofill from injecting saved values
              autoComplete='off'
              onInput={(e) => setTeamNumber(e.detail.value)}
            />
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
          <Text className='section-title'>{t("机器人 Robot")}</Text>
          {photoUrl && <Image src={photoUrl} mode='aspectFit' style={{ width: '100%', height: '240px' }} />}
          <Button size='mini' disabled={!userId || photoBusy} loading={photoBusy} onClick={async () => {
            if (!userId || photoBusy) return
            setPhotoBusy(true)
            setPhotoError('')
            try {
              const photoPath = await uploadRobotPhoto(userId)
              patch({ photoPath })
            } catch (error) {
              setPhotoError(error instanceof Error ? error.message : 'Photo upload cancelled or unavailable.')
            } finally { setPhotoBusy(false) }
          }}
          >{t("机器人照片 Add / replace robot photo")}</Button>
          {data.photoPath && <Button size='mini' onClick={() => patch({ photoPath: undefined })}>{t("移除照片 Remove photo")}</Button>}
          {!!photoError && <Text>{t(photoError)}</Text>}
          <ChoiceField
            label={t("底盘 Drivetrain")}
            options={DRIVETRAIN_OPTIONS}
            value={data.drivetrain}
            onChange={(v) => patch({ drivetrain: v })}
          />
          <ChoiceField
            label={t("射入蜂巢 Shoots into hive")}
            options={BALL_OPTIONS}
            value={data.hiveBalls}
            onChange={(v) => patch({ hiveBalls: v })}
          />
          <ChoiceField
            label={t("放入花朵 Scores flowers")}
            options={BALL_OPTIONS}
            value={data.flowerBalls}
            onChange={(v) => patch({ flowerBalls: v })}
          />
          <ChoiceField
            label={t("颜色分拣 Rejects opponent nectar")}
            options={[
              { value: 'yes', label: t("能 Yes") },
              { value: 'no', label: t("不能 No") }
            ]}
            value={data.colorSort === null ? '' : data.colorSort ? 'yes' : 'no'}
            onChange={(v) => patch({ colorSort: v === '' ? null : v === 'yes' })}
          />
        </View>

        <View className='section-card'>
          <Text className='section-title'>{t("策略 Strategy")}</Text>
          <View className='field-row'>
            <Text className='field-label'>{t("自动阶段 Auto (可多选 multi-select)")}</Text>
            <View className='chip-row'>
              {AUTO_OPTIONS.map((opt) => (
                <View
                  key={opt.value}
                  className={`chip ${data.autoActions.includes(opt.value) ? 'active' : ''}`}
                  onClick={() => toggleAuto(opt.value)}
                >
                  {t(opt.label)}
                </View>
              ))}
            </View>
          </View>
          <ChoiceField
            label={t("擅长角色 Preferred role")}
            options={ROLE_OPTIONS}
            value={data.role}
            onChange={(v) => patch({ role: v })}
          />
        </View>

        <View className='section-card'>
          <Text className='section-title'>{t("备注 Notes")}</Text>
          <View className='field-row'>
            <Textarea
              className='field-textarea'
              value={data.notes}
              placeholder={t("机构、稳定性、配合意向等 Mechanisms, reliability, alliance fit…")}
              onInput={(e) => patch({ notes: e.detail.value })}
            />
          </View>
        </View>

        <Text className='save-hint'>
          {hasTeam ? t("已自动备份 Auto-saved as backup ✓") : t("Enter Team # to start")}
        </Text>

        <View className={`submit-btn ${hasTeam ? '' : 'disabled'}`} onClick={handleSubmit}>{t("提交 Submit")}</View>
      </View>
    </View>
  )
}
