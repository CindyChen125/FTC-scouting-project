import { createContext, useContext, useEffect, useState, PropsWithChildren } from 'react'
import { View, Text } from '@tarojs/components'
import type { Session } from '@supabase/supabase-js'
import { supabase, usernameToEmail } from '../supabase/config'
import { Profile, UserRole } from '../types/scouting'
import LoginScreen from './LoginScreen'

interface AuthValue {
  session: Session | null
  profile: Profile | null
  /** True until the stored session has been read — pages should wait on this. */
  loading: boolean
  isAdmin: boolean
  userId: string | null
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  changePassword: (password: string) => Promise<void>
  reloadProfile: () => Promise<void>
}

const AuthContext = createContext<AuthValue>({
  session: null,
  profile: null,
  loading: true,
  isAdmin: false,
  userId: null,
  signIn: async () => {},
  signOut: async () => {},
  changePassword: async () => {},
  reloadProfile: async () => {}
})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('user_id, username, display_name, role, is_active')
      .eq('user_id', userId)
      .single()
    setProfile(
      data
        ? {
            userId: data.user_id,
            username: data.username,
            displayName: data.display_name ?? '',
            role: (data.role as UserRole) ?? 'scout',
            isActive: !!data.is_active
          }
        : null
    )
  }

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      loadProfile(data.session?.user?.id).finally(() => {
        if (active) setLoading(false)
      })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return
      setSession(next)
      loadProfile(next?.user?.id)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = async (username: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password
    })
    if (error) throw error
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }

  const changePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        isAdmin: profile?.role === 'admin' && profile.isActive,
        userId: session?.user?.id ?? null,
        signIn,
        signOut,
        changePassword,
        reloadProfile: () => loadProfile(session?.user?.id)
      }}
    >
      {/*
        Gating by overlay rather than redirecting: Taro's H5 hash router let a
        signed-out visitor land straight on a page URL before any redirect
        fired, and replacing `children` outright breaks Taro ("no page
        instance found") because the page component must still mount. So the
        page renders underneath and a full-screen login covers it. Nothing
        sensitive is exposed either way — every table is closed to callers
        without a session, so the page beneath simply has no data to show.
      */}
      {children}
      {!loading && !session && (
        <View className='auth-overlay'>
          <LoginScreen />
        </View>
      )}
      {loading && (
        <View className='auth-overlay auth-loading'>
          <Text>载入中… Loading…</Text>
        </View>
      )}
    </AuthContext.Provider>
  )
}
