import { createContext, useContext, useEffect, useState, PropsWithChildren } from 'react'
import { View, Text } from '@tarojs/components'
import type { Session } from '@supabase/supabase-js'
import { translate as t } from '../i18n'
import { useLanguage } from '../i18n/LanguageContext'
import { supabase, usernameToEmail } from '../supabase/config'
import { withTimeout } from '../supabase/timeout'
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
  useLanguage()
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadProfile = async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null)
      setIsOwner(false)
      return
    }

    // A signed-in session keeps working until its token expires, so deleting
    // or deactivating someone doesn't cut them off on its own. Their writes
    // are refused by RLS either way, but the app has to notice and sign them
    // out rather than leave them in a broken half-signed-in state.
    //
    // Crucially this only acts on a *definitive* answer from the server. A
    // scout with no signal must stay signed in — being logged out at a venue
    // would be far worse than the problem this solves.
    try {
      const [{ data, error }, { data: owner, error: ownerError }] = await Promise.all([
        withTimeout(
          supabase
            .from('profiles')
            .select('user_id, username, display_name, role, is_active')
            .eq('user_id', userId)
            .maybeSingle()
        ),
        withTimeout(supabase.rpc('is_owner'))
      ])
      if (error) throw error
      if (ownerError) throw ownerError

      if (!data || !data.is_active) {
        // No row (account deleted) or deactivated — note that a deactivated
        // user also can't read profiles at all, so both land here.
        await supabase.auth.signOut()
        setProfile(null)
        setIsOwner(false)
        return
      }

      setProfile({
        userId: data.user_id,
        username: data.username,
        displayName: data.display_name ?? '',
        role: (data.role as UserRole) ?? 'scout',
        isActive: !!data.is_active
      })
      setIsOwner(owner === true)
    } catch {
      // Couldn't reach the server. Keep whatever profile we already have and
      // stay signed in — this is the offline case, not a revoked account.
    }
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
    setIsOwner(false)
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
        isAdmin: isOwner && !!profile?.isActive,
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
          <Text>{t("载入中… Loading…")}</Text>
        </View>
      )}
    </AuthContext.Provider>
  )
}
