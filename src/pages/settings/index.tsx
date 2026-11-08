import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { translate as t } from '../../i18n'
import { useLanguage } from '../../i18n/LanguageContext'
import AppHeader from '../../components/AppHeader'
import RangeSlider from '../../components/RangeSlider'
import { FONT_SCALE_MAX, FONT_SCALE_MIN, FONT_SCALE_STEP, useTheme } from '../../theme/ThemeContext'
import { useAuth } from '../../auth/AuthContext'
import { profileLabel } from '../../types/scouting'
import './index.scss'

export default function Settings() {
  useLanguage()
  const { theme, setTheme, fontScalePercent, setFontScalePercent } = useTheme()
  const { profile, isAdmin, signOut, changePassword } = useAuth()

  // Taro's H5 showModal has no `editable` support, so anything needing typed
  // input has to be an inline field rather than a prompt dialog.
  const [newPassword, setNewPassword] = useState('')

  const submitPassword = async () => {
    if (newPassword.trim().length < 6) {
      Taro.showToast({ title: t("密码至少6位 Password min 6"), icon: 'none' })
      return
    }
    try {
      await changePassword(newPassword.trim())
      setNewPassword('')
      Taro.showToast({ title: t("已更新 Password updated ✓"), icon: 'success' })
    } catch (err) {
      Taro.showToast({ title: t((err as Error).message), icon: 'none' })
    }
  }

  const confirmSignOut = () => {
    Taro.showModal({
      title: t("退出登录 Sign out"),
      content: t("本机已保存的数据会保留。Data saved on this device is kept."),
      confirmText: t("退出"),
      cancelText: t("取消"),
      success: (res) => {
        if (res.confirm) signOut()
      }
    })
  }

  const clearAllData = () => {
    Taro.showModal({
      title: t("Clear all data"),
      content: t("This deletes every locally saved scouting entry on this device. This cannot be undone."),
      confirmColor: '#e05252',
      confirmText: t('Confirm'),
      cancelText: t('Cancel'),
      success: (res) => {
        if (res.confirm) {
          const { keys } = Taro.getStorageInfoSync()
          keys
            .filter((key) => ['scout:', 'backup:', 'pit:', 'pitBackup:'].some((p) => key.startsWith(p)))
            .forEach((key) => Taro.removeStorageSync(key))
          Taro.showToast({ title: t("Data cleared"), icon: 'success' })
        }
      }
    })
  }

  return (
    <View className='settings-page'>
      <AppHeader title={t("Settings")} showBack />

      <View className='page-content'>
        <View className='settings-section'>
          <View className='settings-row'>
            <Text className='settings-label'>{t("账号 Account")}</Text>
            <Text className='settings-value'>
              {profile ? `${profileLabel(profile)} (${profile.username})` : '—'}
              {profile?.role === 'admin' ? t(" · 管理员 Admin") : ''}
            </Text>
          </View>
          {/*
            Only the admin changes their own password here. Scouts' passwords
            are set by the admin from the Admin page, so self-service would
            put a scout's login out of the admin's control.
          */}
          {isAdmin ? (
            <View className='settings-row'>
              <Text className='settings-label'>{t("修改密码 Change password")}</Text>
              <Input
                className='settings-input'
                password
                value={newPassword}
                placeholder={t("新密码 New password (min 6)")}
                // @ts-expect-error h5-only DOM attribute
                autoComplete='new-password'
                onInput={(e) => setNewPassword(e.detail.value)}
                onConfirm={submitPassword}
              />
              <View className='pill-row'>
                <View className='pill' onClick={submitPassword}>{t("保存 Save password")}</View>
                <View className='pill' onClick={confirmSignOut}>{t("退出登录 Sign out")}</View>
              </View>
            </View>
          ) : (
            <View className='settings-row'>
              <Text className='settings-value'>{t('忘记密码请联系管理员。 Password resets: team admin.')}</Text>
              <View className='pill-row'>
                <View className='pill' onClick={confirmSignOut}>{t("退出登录 Sign out")}</View>
              </View>
            </View>
          )}
        </View>

        <View className='settings-section'>
          <View className='settings-row'>
            <Text className='settings-label'>{t("Appearance")}</Text>
            <View className='pill-row'>
              <View className={`pill ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>{t("Light")}</View>
              <View className={`pill ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>{t("Dark")}</View>
            </View>
          </View>
        </View>

        <View className='settings-section'>
          <View className='settings-row'>
            <View className='settings-label-row'>
              <Text className='settings-label'>{t("Font size")}</Text>
              <Text className='settings-value'>{fontScalePercent}%</Text>
            </View>
            <RangeSlider
              min={FONT_SCALE_MIN}
              max={FONT_SCALE_MAX}
              step={FONT_SCALE_STEP}
              value={fontScalePercent}
              onChange={setFontScalePercent}
            />
          </View>
        </View>

        <View className='settings-section'>
          <View className='settings-row'>
            <Text className='settings-label'>{t("Local data")}</Text>
            <View className='danger-button' onClick={clearAllData}>{t("Clear all scouting data")}</View>
            <Text className='settings-note'>{t('Submitted cloud records and queued uploads are kept.')}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
