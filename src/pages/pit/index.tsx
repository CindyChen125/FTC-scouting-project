import { useEffect, useState } from 'react'
import { View, Text, Input, Textarea } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
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
import { CURRENT_EVENT_CODE, CURRENT_SEASON, findEvent } from '../../data/events'
import './index.scss'

// Single-choice chips. Tapping the selected chip again clears the answer, so a
// mis-tap can go back to "not asked yet".
function ChoiceField<T extends string>({ label, options, value, onChange }: {
  label: string
  options: { value: T; label: string }[]
  value: T | ''
  onChange: (v: T | '') => void
}) {
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
            {opt.label}
          </View>
        ))}
      </View>
    </View>
  )
}

export default function PitScouting() {
  const { userId, profile } = useAuth()
  const scoutName = profile ? profileLabel(profile) : ''

  const [eventCode, setEventCode] = useState(CURRENT_EVENT_CODE)
  const [teamNumber, setTeamNumber] = useState('')
  const [data, setData] = useState<PitData>(emptyPitData())
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
      Taro.showToast({ title: '请先填写队号 Enter Team #', icon: 'none' })
      return
    }
    if (!userId) {
      Taro.showToast({ title: '请先登录 Sign in to submit', icon: 'none' })
      return
    }
    Taro.showModal({
      title: '确认提交 Confirm submit',
      content: `提交队 ${team} 的赛前侦查？Submit pit scouting for team ${team}?`,
      confirmText: '提交',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return

        const entry = currentEntry()
        Taro.setStorageSync(pitEntryStorageKey(userId, eventCode, team), entry)

        const outcome = await submitPitEntry(entry)
        if (outcome === 'rejected') {
          Taro.showToast({
            title: '未能提交：账号无权限，请重新登录 Rejected — sign in again',
            icon: 'none'
          })
          return
        }

        Taro.showToast({
          title:
            outcome === 'synced'
              ? '已提交 Submitted ✓'
              : '已保存，联网后自动上传 Saved — uploads when back online',
          icon: outcome === 'synced' ? 'success' : 'none'
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
      <AppHeader title='Pit Scouting' showBack />

      <View className='page-content'>
        <View className='header-card'>
          <Text className='event-badge'>{findEvent(eventCode).name}</Text>
          <View className='field-row'>
            <Text className='field-label'>队号 Team #</Text>
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
            <Text className='field-label'>侦查员 Scout</Text>
            <Text className='scout-identity'>
              {originalScoutName && originalScoutName !== scoutName
                ? `${originalScoutName}（由 ${scoutName} 编辑 · edited by you）`
                : scoutName || '—'}
            </Text>
          </View>
        </View>

        <View className='section-card'>
          <Text className='section-title'>机器人 Robot</Text>
          <ChoiceField
            label='底盘 Drivetrain'
            options={DRIVETRAIN_OPTIONS}
            value={data.drivetrain}
            onChange={(v) => patch({ drivetrain: v })}
          />
          <ChoiceField
            label='射入蜂巢 Shoots into hive'
            options={BALL_OPTIONS}
            value={data.hiveBalls}
            onChange={(v) => patch({ hiveBalls: v })}
          />
          <ChoiceField
            label='放入花朵 Scores flowers'
            options={BALL_OPTIONS}
            value={data.flowerBalls}
            onChange={(v) => patch({ flowerBalls: v })}
          />
          <ChoiceField
            label='颜色分拣 Rejects opponent nectar'
            options={[
              { value: 'yes', label: '能 Yes' },
              { value: 'no', label: '不能 No' }
            ]}
            value={data.colorSort === null ? '' : data.colorSort ? 'yes' : 'no'}
            onChange={(v) => patch({ colorSort: v === '' ? null : v === 'yes' })}
          />
        </View>

        <View className='section-card'>
          <Text className='section-title'>策略 Strategy</Text>
          <View className='field-row'>
            <Text className='field-label'>自动阶段 Auto (可多选 multi-select)</Text>
            <View className='chip-row'>
              {AUTO_OPTIONS.map((opt) => (
                <View
                  key={opt.value}
                  className={`chip ${data.autoActions.includes(opt.value) ? 'active' : ''}`}
                  onClick={() => toggleAuto(opt.value)}
                >
                  {opt.label}
                </View>
              ))}
            </View>
          </View>
          <ChoiceField
            label='擅长角色 Preferred role'
            options={ROLE_OPTIONS}
            value={data.role}
            onChange={(v) => patch({ role: v })}
          />
        </View>

        <View className='section-card'>
          <Text className='section-title'>备注 Notes</Text>
          <View className='field-row'>
            <Textarea
              className='field-textarea'
              value={data.notes}
              placeholder='机构、稳定性、配合意向等 Mechanisms, reliability, alliance fit…'
              onInput={(e) => patch({ notes: e.detail.value })}
            />
          </View>
        </View>

        <Text className='save-hint'>
          {hasTeam ? '已自动备份 Auto-saved as backup ✓' : 'Enter Team # to start'}
        </Text>

        <View className={`submit-btn ${hasTeam ? '' : 'disabled'}`} onClick={handleSubmit}>
          提交 Submit
        </View>
      </View>
    </View>
  )
}
