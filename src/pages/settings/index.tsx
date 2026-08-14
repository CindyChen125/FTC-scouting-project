import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import AppHeader from '../../components/AppHeader'
import RangeSlider from '../../components/RangeSlider'
import { FONT_SCALE_MAX, FONT_SCALE_MIN, FONT_SCALE_STEP, useTheme } from '../../theme/ThemeContext'
import './index.scss'

export default function Settings() {
  const { theme, setTheme, fontScalePercent, setFontScalePercent } = useTheme()

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
