import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import { ThemeProvider } from './theme/ThemeContext'
import { AuthProvider } from './auth/AuthContext'
import { LanguageProvider } from './i18n/LanguageContext'
import { ActiveEventProvider } from './data/ActiveEventContext'

import './app.scss'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    console.log('App launched.')
  })

  // children 是将要会渲染的页面
  return (
    <LanguageProvider><ThemeProvider><AuthProvider><ActiveEventProvider>
      {children}
    </ActiveEventProvider></AuthProvider></ThemeProvider></LanguageProvider>
  )
}

export default App
