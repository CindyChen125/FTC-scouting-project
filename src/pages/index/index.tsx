import { View, Text } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import AppHeader from '../../components/AppHeader'
import './index.scss'

export default function Home() {
  useLoad(() => {
    console.log('Home page loaded.')
  })

  const goTo = (url: string) => Taro.navigateTo({ url })

  return (
    <View className='home-page'>
      <AppHeader title='FTC Scouting' />

      <View className='page-content'>
        <View className='home-header'>
          <Text className='home-title'>FTC Scouting</Text>
          <Text className='home-subtitle'>DECODE 2025-2026</Text>
        </View>

        <View className='home-menu'>
          <View className='home-button primary' onClick={() => goTo('/pages/scout/index')}>
            <Text className='home-button-icon'>📝</Text>
            <View className='home-button-text'>
              <Text className='home-button-title'>Start Scouting</Text>
              <Text className='home-button-desc'>Enter match data for a team</Text>
            </View>
          </View>

          <View className='home-button' onClick={() => goTo('/pages/data/index')}>
            <Text className='home-button-icon'>📊</Text>
            <View className='home-button-text'>
              <Text className='home-button-title'>See Current Data</Text>
              <Text className='home-button-desc'>Review saved match entries</Text>
            </View>
          </View>

          <View className='home-button' onClick={() => goTo('/pages/settings/index')}>
            <Text className='home-button-icon'>⚙️</Text>
            <View className='home-button-text'>
              <Text className='home-button-title'>Settings</Text>
              <Text className='home-button-desc'>App preferences and data management</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}
