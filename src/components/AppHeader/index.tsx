import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'
import './index.scss'

interface AppHeaderProps {
  title: string
  showBack?: boolean
  onSearch?: () => void
}

export default function AppHeader({ title, showBack = false, onSearch }: AppHeaderProps) {
  const { language, toggleLanguage, t } = useLanguage()
  useEffect(() => { Taro.setNavigationBarTitle({ title }).catch(() => {}) }, [title])
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
            <View className='app-header-back-arrow' aria-hidden='true' />
            <Text className='app-header-back-label'>{t('返回 Back')}</Text>
          </View>
        )}
      </View>

      <Text className='app-header-title'>{title}</Text>

      <View className='app-header-side app-header-side-right'>
        <View className='app-header-icon-btn' onClick={handleSearch}>
          <Text className='app-header-back-label'>{t("Search")}</Text>
        </View>
        <View
          className='app-header-language-btn'
          onClick={toggleLanguage}
          aria-label={language === 'zh' ? 'Switch to English' : '切换到中文'}
          role='button'
        >
          <Text>{language === 'zh' ? 'EN' : '中文'}</Text>
        </View>
      </View>
    </View>
  )
}
