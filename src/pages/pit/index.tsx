import { useEffect, useRef, useState } from 'react'
import { Button, View, Text, Input, Textarea, Image } from '@tarojs/components'
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
  BALL_OPTIONS,
  AUTO_OPTIONS,
  ROLE_OPTIONS
} from '../../types/pit'
import { submitPitEntry, fetchPitEntry } from '../../supabase/pit'
import { useAuth } from '../../auth/AuthContext'
import { uploadRobotPhoto, robotPhotoUrl } from '../../supabase/photos'
import { CURRENT_SEASON, findEvent, eventLabel } from '../../data/events'
import { useActiveEvent } from '../../data/ActiveEventContext'
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
  const explicitEvent = useRef(false)
  const eventLocked = useRef(false)
  const { userId, profile } = useAuth()
  const { activeEvent, offline: activeEventOffline } = useActiveEvent()
  const scoutName = profile ? profileLabel(profile) : ''

  const [eventCode, setEventCode] = useState(activeEvent.code)
  const [teamNumber, setTeamNumber] = useState('')
  const [data, setData] = useState<PitData>(emptyPitData())
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  useEffect(() => {
    let active = true
    setPhotoUrls([])
    const paths = data.photoPaths ?? (data.photoPath ? [data.photoPath] : [])
    Promise.all(paths.map((path) => robotPhotoUrl(path))).then((urls) => {
      if (active) setPhotoUrls(urls)
    }).catch(() => { if (active) setPhotoError('Photo unavailable. Check your connection.') })
    return () => { active = false }
  }, [data.photoPaths, data.photoPath])
  const [scoutedBy, setScoutedBy] = useState<string | null>(null)
  const [originalScoutName, setOriginalScoutName] = useState<string | null>(null)

  useLoad((options) => {
    // Opened from a card in the Pit tab. Pit questions are BIOBUZZ-only.
    if (options?.eventCode) {
      const code = decodeURIComponent(options.eventCode)
      if (findEvent(code).code === code && findEvent(code).season === CURRENT_SEASON) {
        explicitEvent.current = true
        setEventCode(code)
      }
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

  const formStarted = !!teamNumber.trim() || JSON.stringify(data) !== JSON.stringify(emptyPitData())
  useEffect(() => {
    if (formStarted) eventLocked.current = true
    if (!explicitEvent.current && !eventLocked.current) setEventCode(activeEvent.code)
  }, [activeEvent.code, formStarted])

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
        if (outcome.status === 'error') {
          Taro.showToast({
            title: t('未能同步；数据仍在本机 Sync failed — data remains local'),
            icon: 'none'
          })
          return
        }

        Taro.showToast({
          title:
            outcome.status === 'synced'
              ? t("已提交 Submitted ✓")
              : t("已保存，联网后自动上传 Saved — uploads when back online"),
          icon: outcome.status === 'synced' ? 'success' : 'none'
        })

        setTimeout(() => {
          Taro.reLaunch({ url: '/pages/index/index' }).catch(() => {})
        }, 1200)
      }
    })
  }

  const hasTeam = !!teamNumber.trim()
  return (
    <View className='scout-page'>
      <AppHeader title={t("Pit Scouting")} showBack />

      <View className='page-content'>
        <View className='header-card'>
          <View className='event-context-row'>
            <Text className='event-badge'>{t('当前赛事 Active event')}: {eventLabel(findEvent(eventCode))}</Text>
            {activeEventOffline && <Text className='event-offline'>{t('离线缓存 Offline cache')}</Text>}
          </View>
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
          <View className='photo-row'>
            {photoUrls.map((url, index) => <View className='photo-tile' key={`${index}-${url}`}>
                <Image className='photo-tile__image' src={url} mode='aspectFill' />
                <Button className='photo-remove' aria-label='Remove photo' onClick={(event) => {
                  event.stopPropagation()
                  const paths = data.photoPaths ?? (data.photoPath ? [data.photoPath] : [])
                  patch({ photoPaths: paths.filter((_, pathIndex) => pathIndex !== index), photoPath: undefined })
                }}><View className='photo-remove__mark' /></Button>
            </View>)}
            <Button className={`photo-upload ${photoUrls.length ? 'photo-upload--compact' : ''}`} disabled={!userId || photoBusy} loading={photoBusy} onClick={async () => {
              if (!userId || photoBusy) return
              setPhotoBusy(true)
              setPhotoError('')
              try {
                const photoPath = await uploadRobotPhoto(userId)
                const paths = data.photoPaths ?? (data.photoPath ? [data.photoPath] : [])
                patch({ photoPaths: [...paths, photoPath], photoPath: undefined })
              } catch (error) {
                setPhotoError(error instanceof Error ? error.message : 'Photo upload cancelled or unavailable.')
              } finally { setPhotoBusy(false) }
            }}>
              <View className='photo-upload__icon-wrap'><View className='photo-upload__camera' /></View>
              <Text className='photo-upload__title'>{t('上传机器人照片 Upload a robot photo')}</Text>
              <Text className='photo-upload__hint'>{t('点击此处上传 Click here to upload')}</Text>
            </Button>
          </View>
          {!!photoError && <Text>{t(photoError)}</Text>}
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

        {hasTeam && <Text className='save-hint'>{t('已自动备份 Auto-saved ✓')}</Text>}

        <View className={`submit-btn ${hasTeam ? '' : 'disabled'}`} onClick={handleSubmit}>{t("提交 Submit")}</View>
      </View>
    </View>
  )
}
