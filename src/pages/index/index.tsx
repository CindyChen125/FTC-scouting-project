import { View, Text } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { translate as t } from '../../i18n'
import { useLanguage } from '../../i18n/LanguageContext'
import AppHeader from '../../components/AppHeader'
import { useAuth } from '../../auth/AuthContext'
import { profileLabel } from '../../types/scouting'
import './index.scss'

export default function Home() {
  useLanguage()
  const { profile, isAdmin } = useAuth()

  useLoad(() => {
    console.log('Home page loaded.')
  })

  const goTo = (url: string) => Taro.navigateTo({ url })

  return (
    <View className='home-page'>
      <AppHeader title={t("FTC Scouting")} />

      <View className='page-content'>
        <View className='home-header'>
          <Text className='home-title'>{t("FTC Scouting")}</Text>
          <Text className='home-subtitle'>
            BIOBUZZ 2026-2027{profile ? ` · ${profileLabel(profile)}` : ''}
          </Text>
        </View>

        <View className='home-menu'>
          <View className='home-button primary' onClick={() => goTo('/pages/scout/index')}>
            <View className='home-button-text'>
              <Text className='home-button-title'>{t("Start Scouting")}</Text>
              <Text className='home-button-desc'>{t("Enter match data for a team")}</Text>
            </View>
          </View>

          <View className='home-button' onClick={() => goTo('/pages/pit/index')}>
            <View className='home-button-text'>
              <Text className='home-button-title'>{t("赛前侦查 Pit Scouting")}</Text>
              <Text className='home-button-desc'>{t("Ask a team about their robot, before or between matches")}</Text>
            </View>
          </View>

          <View className='home-button' onClick={() => goTo('/pages/data/index')}>
            <View className='home-button-text'>
              <Text className='home-button-title'>{t("See Current Data")}</Text>
              <Text className='home-button-desc'>{t("Review saved match entries")}</Text>
            </View>
          </View>

          {isAdmin && (
            <View className='home-button' onClick={() => goTo('/pages/admin/index')}>
              <View className='home-button-text'>
                <Text className='home-button-title'>{t("管理员 Admin")}</Text>
                <Text className='home-button-desc'>{t("Manage scouts and see who scouted what")}</Text>
              </View>
            </View>
          )}

          <View className='home-button' onClick={() => goTo('/pages/settings/index')}>
            <View className='home-button-text'>
              <Text className='home-button-title'>{t("Settings")}</Text>
              <Text className='home-button-desc'>{t("App preferences and data management")}</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}
