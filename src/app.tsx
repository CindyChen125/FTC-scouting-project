import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import { ThemeProvider } from './theme/ThemeContext'

import './app.scss'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    console.log('App launched.')
  })

  // children 是将要会渲染的页面
  return <ThemeProvider>{children}</ThemeProvider>
}

export default App
