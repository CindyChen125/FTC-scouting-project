import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

interface AppHeaderProps {
  title: string
  showBack?: boolean
  onSearch?: () => void
}

export default function AppHeader({ title, showBack = false, onSearch }: AppHeaderProps) {
  const handleBack = () => {
    Taro.navigateBack().catch(() => {
      Taro.reLaunch({ url: '/pages/index/index' })
    })
  }

  const handleSearch = () => {
    if (onSearch) {
      onSearch()
      return
    }
    Taro.navigateTo({ url: '/pages/data/index' }).catch(() => {})
  }

  return (
    <View className='app-header'>
      <View className='app-header-side'>
        {showBack && (
          <View className='app-header-back' onClick={handleBack}>
            <Text className='app-header-back-arrow'>‹</Text>
            <Text className='app-header-back-label'>返回 Back</Text>
          </View>
        )}
      </View>

      <Text className='app-header-title'>{title}</Text>

      <View className='app-header-side app-header-side-right'>
        <View className='app-header-icon-btn' onClick={handleSearch}>
          <Text className='app-header-icon'>🔍</Text>
        </View>
      </View>
    </View>
  )
}
