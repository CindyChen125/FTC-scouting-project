import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import { translate as t } from '../i18n'
import { useLanguage } from '../i18n/LanguageContext'
import { useAuth } from './AuthContext'
import './LoginScreen.scss'

export default function LoginScreen() {
  useLanguage()
  const { signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [serverError, setServerError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!username.trim() || !password) {
      setError('请输入用户名和密码 Enter your username and password')
      return
    }
    setBusy(true)
    setError('')
    setServerError('')
    try {
      await signIn(username, password)
      // AuthProvider redirects into the app once the session lands.
    } catch (err) {
      const message = (err as Error)?.message ?? ''
      setError(
        /invalid login/i.test(message)
          ? '用户名或密码错误 Wrong username or password'
          : 'signInFailed'
      )
      setServerError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View className='login-page'>
      <View className='login-card'>
        <Text className='login-title'>{t("FTC Scouting")}</Text>

        <View className='login-field'>
          <Text className='login-label'>{t("用户名 Username")}</Text>
          <Input
            className='login-input'
            value={username}
            placeholder={t("your username")}
            // @ts-expect-error h5-only DOM attribute
            autoComplete='username'
            onInput={(e) => setUsername(e.detail.value)}
          />
        </View>

        <View className='login-field'>
          <Text className='login-label'>{t("密码 Password")}</Text>
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

        {!!error && <Text className='login-error'>{t(error, { error: t(serverError) })}</Text>}

        <View className={`login-btn ${busy ? 'busy' : ''}`} onClick={busy ? undefined : submit}>
          {busy ? t("登录中… Signing in…") : t("登录 Sign In")}
        </View>

        <Text className='login-hint'>{t('账号由管理员创建。 Accounts: team admin.')}</Text>
      </View>
    </View>
  )
}
