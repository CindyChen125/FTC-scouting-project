import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import AppHeader from '../../components/AppHeader'
import RangeSlider from '../../components/RangeSlider'
import { FONT_SCALE_MAX, FONT_SCALE_MIN, FONT_SCALE_STEP, useTheme } from '../../theme/ThemeContext'
import { useAuth } from '../../auth/AuthContext'
import { profileLabel } from '../../types/scouting'
import './index.scss'

export default function Settings() {
  const { theme, setTheme, fontScalePercent, setFontScalePercent } = useTheme()
  const { profile, isAdmin, signOut, changePassword } = useAuth()

  // Taro's H5 showModal has no `editable` support, so anything needing typed
  // input has to be an inline field rather than a prompt dialog.
  const [newPassword, setNewPassword] = useState('')

  const submitPassword = async () => {
    if (newPassword.trim().length < 6) {
      Taro.showToast({ title: '密码至少6位 Password min 6', icon: 'none' })
      return
    }
    try {
      await changePassword(newPassword.trim())
      setNewPassword('')
      Taro.showToast({ title: '已更新 Password updated ✓', icon: 'success' })
    } catch (err) {
      Taro.showToast({ title: (err as Error).message, icon: 'none' })
    }
  }

  const confirmSignOut = () => {
    Taro.showModal({
      title: '退出登录 Sign out',
      content: '本机已保存的数据会保留。Data saved on this device is kept.',
      confirmText: '退出',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) signOut()
      }
    })
  }

  const clearAllData = () => {
    Taro.showModal({
      title: 'Clear all data',
      content: 'This deletes every locally saved scouting entry on this device. This cannot be undone.',
      confirmColor: '#e05252',
      success: (res) => {
        if (res.confirm) {
          const { keys } = Taro.getStorageInfoSync()
          keys
            .filter((key) => key.startsWith('scout:') || key.startsWith('backup:'))
            .forEach((key) => Taro.removeStorageSync(key))
          Taro.showToast({ title: 'Data cleared', icon: 'success' })
        }
      }
    })
  }

  return (
    <View className='settings-page'>
      <AppHeader title='Settings' showBack />

      <View className='page-content'>
        <View className='settings-section'>
          <View className='settings-row'>
            <Text className='settings-label'>账号 Account</Text>
            <Text className='settings-value'>
              {profile ? `${profileLabel(profile)} (${profile.username})` : '—'}
              {profile?.role === 'admin' ? ' · 管理员 Admin' : ''}
            </Text>
          </View>
          {/*
            Only the admin changes their own password here. Scouts' passwords
            are set by the admin from the Admin page, so self-service would
            put a scout's login out of the admin's control.
          */}
          {isAdmin ? (
            <View className='settings-row'>
              <Text className='settings-label'>修改密码 Change password</Text>
              <Input
                className='settings-input'
                password
                value={newPassword}
                placeholder='新密码 New password (min 6)'
                // @ts-expect-error h5-only DOM attribute
                autoComplete='new-password'
                onInput={(e) => setNewPassword(e.detail.value)}
                onConfirm={submitPassword}
              />
              <View className='pill-row'>
                <View className='pill' onClick={submitPassword}>保存 Save password</View>
                <View className='pill' onClick={confirmSignOut}>退出登录 Sign out</View>
              </View>
            </View>
          ) : (
            <View className='settings-row'>
              <Text className='settings-value'>
                忘记密码请联系管理员 Forgot your password? Ask your team admin to reset it.
              </Text>
              <View className='pill-row'>
                <View className='pill' onClick={confirmSignOut}>退出登录 Sign out</View>
              </View>
            </View>
          )}
        </View>

        <View className='settings-section'>
          <View className='settings-row'>
            <Text className='settings-label'>Appearance</Text>
            <View className='pill-row'>
              <View className={`pill ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>
                ☀️ Light
              </View>
              <View className={`pill ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>
                🌙 Dark
              </View>
            </View>
          </View>
        </View>

        <View className='settings-section'>
          <View className='settings-row'>
            <View className='settings-label-row'>
              <Text className='settings-label'>Font size</Text>
              <Text className='settings-value'>{fontScalePercent}%</Text>
            </View>
            <RangeSlider
              min={FONT_SCALE_MIN}
              max={FONT_SCALE_MAX}
              step={FONT_SCALE_STEP}
              value={fontScalePercent}
              onChange={setFontScalePercent}
            />
            <Text className='settings-note'>Adjusts text size across the whole app.</Text>
          </View>
        </View>

        <View className='settings-section'>
          <View className='settings-row'>
            <Text className='settings-label'>Local data</Text>
            <View className='danger-button' onClick={clearAllData}>Clear all scouting data</View>
            <Text className='settings-note'>Data is currently stored only on this device. No cloud sync yet.</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
