import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import { useAuth } from './AuthContext'
import './LoginScreen.scss'

export default function LoginScreen() {
  const { signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!username.trim() || !password) {
      setError('请输入用户名和密码 Enter your username and password')
      return
    }
    setBusy(true)
    setError('')
    try {
      await signIn(username, password)
      // AuthProvider redirects into the app once the session lands.
    } catch (err) {
      const message = (err as Error)?.message ?? ''
      setError(
        /invalid login/i.test(message)
          ? '用户名或密码错误 Wrong username or password'
          : `登录失败 Sign-in failed: ${message}`
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <View className='login-page'>
      <View className='login-card'>
        <Text className='login-title'>FTC Scouting</Text>
        <Text className='login-subtitle'>请登录以继续 Sign in to continue</Text>

        <View className='login-field'>
          <Text className='login-label'>用户名 Username</Text>
          <Input
            className='login-input'
            value={username}
            placeholder='your username'
            // @ts-expect-error h5-only DOM attribute
            autoComplete='username'
            onInput={(e) => setUsername(e.detail.value)}
          />
        </View>

        <View className='login-field'>
          <Text className='login-label'>密码 Password</Text>
          <Input
            className='login-input'
            password
            value={password}
            placeholder='••••••'
            // @ts-expect-error h5-only DOM attribute
            autoComplete='current-password'
            onInput={(e) => setPassword(e.detail.value)}
            onConfirm={submit}
          />
        </View>

        {!!error && <Text className='login-error'>{error}</Text>}

        <View className={`login-btn ${busy ? 'busy' : ''}`} onClick={busy ? undefined : submit}>
          {busy ? '登录中… Signing in…' : '登录 Sign In'}
        </View>

        <Text className='login-hint'>
          账号由管理员创建 Accounts are created by your team admin.
        </Text>
      </View>
    </View>
  )
}
