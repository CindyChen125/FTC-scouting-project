import { Button, Text, View } from '@tarojs/components'
import { LANGUAGES, LANGUAGE_NAMES } from '../../i18n'
import { useLanguage } from '../../i18n/LanguageContext'
import './index.scss'

export default function LanguagePicker() {
  const { language, setLanguage, t } = useLanguage()
  return (
    <View className='language-picker'>
      <Text className='language-picker-label'>{t('Language')}</Text>
      <View className='language-options'>
        {LANGUAGES.map((option, index) => (
          <Button key={option} size='mini' className={language === option ? 'selected' : ''}
            aria-pressed={language === option} onClick={() => setLanguage(option)}
          >{LANGUAGE_NAMES[index]}</Button>
        ))}
      </View>
    </View>
  )
}
