import { useCallback, useEffect, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { translate as t } from '../../i18n'
import { useLanguage } from '../../i18n/LanguageContext'
import AppHeader from '../../components/AppHeader'
import { useAuth } from '../../auth/AuthContext'
import { Profile, UserRole, profileLabel } from '../../types/scouting'
import {
  fetchProfiles,
  fetchScoutCounts,
  createScout,
  resetScoutPassword,
  deleteScout,
  setProfileActive,
  setProfileRole,
  setProfileDisplayName
} from '../../supabase/admin'
import './index.scss'

const toast = (title: string, icon: 'success' | 'none' = 'none') =>
  Taro.showToast({ title: t(title), icon })

export default function Admin() {
  useLanguage()
  const { isAdmin, userId, loading } = useAuth()
  const [members, setMembers] = useState<Profile[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)

  const [newUsername, setNewUsername] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newPassword, setNewPassword] = useState('')

  // Taro's H5 showModal has no `editable` support, so anything needing typed
  // input is an inline field revealed under the member instead of a prompt.
  // Declared here with the other hooks: the non-admin guard below returns
  // early, and a useState after it would run a different number of hooks
  // between renders.
  const [editing, setEditing] = useState<{ userId: string; kind: 'rename' | 'password' } | null>(null)
  const [draft, setDraft] = useState('')

  const reload = useCallback(async () => {
    try {
      const [profiles, entryCounts] = await Promise.all([fetchProfiles(), fetchScoutCounts()])
      setMembers(profiles)
      setCounts(entryCounts)
    } catch (err) {
      toast((err as Error).message)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) reload()
  }, [isAdmin, reload])

  // Guard the page itself. The database enforces this too — every admin action
  // is re-checked server-side — so this is only about not showing controls that
  // would fail.
  if (!loading && !isAdmin) {
    return (
      <View className='admin-page'>
        <AppHeader title={t("Admin")} showBack />
        <View className='page-content'>
          <Text className='empty-state'>{t("仅管理员可见 Admins only.")}</Text>
        </View>
      </View>
    )
  }

  const run = async (work: () => Promise<unknown>, okMessage: string) => {
    setBusy(true)
    try {
      await work()
      await reload()
      toast(okMessage, 'success')
    } catch (err) {
      toast((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const addScout = () => {
    if (!newUsername.trim() || newPassword.length < 6) {
      toast(t("用户名必填，密码至少6位 Username required, password min 6"))
      return
    }
    run(
      () =>
        createScout({
          username: newUsername.trim(),
          displayName: newDisplayName.trim() || newUsername.trim(),
          password: newPassword,
          role: 'scout'
        }),
      t("已创建 Scout created ✓")
    ).then(() => {
      setNewUsername('')
      setNewDisplayName('')
      setNewPassword('')
    })
  }

  // Readable rather than maximally random: these get spoken across a noisy
  // venue, so no characters that are easy to confuse (0/O, 1/l/I).
  const generatePassword = () => {
    const letters = 'abcdefghjkmnpqrstuvwxyz'
    const digits = '23456789'
    let out = ''
    for (let i = 0; i < 5; i++) out += letters[Math.floor(Math.random() * letters.length)]
    for (let i = 0; i < 3; i++) out += digits[Math.floor(Math.random() * digits.length)]
    return out
  }

  const openEditor = (member: Profile, kind: 'rename' | 'password') => {
    setEditing({ userId: member.userId, kind })
    // Prefill a suggestion so a reset is one tap plus Save; it stays visible
    // (not masked) because the admin has to read it out to the scout.
    setDraft(kind === 'rename' ? profileLabel(member) : generatePassword())
  }

  const closeEditor = () => {
    setEditing(null)
    setDraft('')
  }

  const saveEditor = (member: Profile) => {
    const value = draft.trim()
    if (editing?.kind === 'rename') {
      if (!value) {
        toast(t("名字不能为空 Name required"))
        return
      }
      run(() => setProfileDisplayName(member.userId, value), t("已更新 Renamed ✓")).then(closeEditor)
    } else {
      if (value.length < 6) {
        toast(t("密码至少6位 Password min 6"))
        return
      }
      run(() => resetScoutPassword(member.userId, value), t("密码已重置 Password reset ✓")).then(
        closeEditor
      )
    }
  }

  const confirmDelete = (member: Profile) => {
    Taro.showModal({
      title: t("删除账号 Delete account"),
      content: t('deleteAccount', { name: profileLabel(member) }),
      confirmText: t("删除"),
      cancelText: t("取消"),
      confirmColor: '#e05252',
      success: (res) => {
        if (res.confirm) run(() => deleteScout(member.userId), t("已删除 Deleted ✓"))
      }
    })
  }

  return (
    <View className='admin-page'>
      <AppHeader title={t("Admin")} showBack />

      <View className='page-content'>
        <View className='section-card'>
          <Text className='section-title'>{t("添加侦查员 Add scout")}</Text>
          <View className='field-row'>
            <Text className='field-label'>{t("用户名 Username")}</Text>
            <Input
              className='field-input'
              value={newUsername}
              placeholder={t("e.g. alice")}
              // @ts-expect-error h5-only DOM attribute
              autoComplete='off'
              onInput={(e) => setNewUsername(e.detail.value)}
            />
          </View>
          <View className='field-row'>
            <Text className='field-label'>{t("显示名 Display name")}</Text>
            <Input
              className='field-input'
              value={newDisplayName}
              placeholder={t("e.g. Alice Wang")}
              // @ts-expect-error h5-only DOM attribute
              autoComplete='off'
              onInput={(e) => setNewDisplayName(e.detail.value)}
            />
          </View>
          <View className='field-row'>
            <Text className='field-label'>{t("初始密码 Starting password")}</Text>
            <Input
              className='field-input'
              value={newPassword}
              placeholder={t("min 6 characters")}
              // @ts-expect-error h5-only DOM attribute
              autoComplete='off'
              onInput={(e) => setNewPassword(e.detail.value)}
            />
          </View>
          <View className={`admin-btn ${busy ? 'busy' : ''}`} onClick={busy ? undefined : addScout}>{t("添加 Add scout")}</View>
          <Text className='admin-hint'>{t("把用户名和密码给队员。密码只有你能设置 —— 队员忘记了就用下面的「重置密码」重新设一个。 Give them the username and password. Only you can set passwords — if a scout forgets theirs, use 重置密码 below to set a new one (passwords are stored hashed and can never be read back, not even by you).")}</Text>
        </View>

        <View className='section-card'>
          <Text className='section-title'>{t("队员 Members (")}{members.length})</Text>

          {members.map((member) => (
            <View className='member-row' key={member.userId}>
              <View className='member-head'>
                <Text className='member-name'>
                  {profileLabel(member)}
                  {member.userId === userId ? t("（你 you）") : ''}
                </Text>
                <Text className={`member-badge ${member.role}`}>
                  {member.role === 'admin' ? t("管理员 Admin") : t("侦查员 Scout")}
                </Text>
              </View>
              <Text className='member-meta'>
                @{member.username} · {counts[member.userId] ?? 0}{t("场 matches")}{member.isActive ? '' : t(" · 已停用 deactivated")}
              </Text>

              {editing?.userId === member.userId && (
                <View className='member-editor'>
                  <Input
                    className='field-input'
                    value={draft}
                    placeholder={
                      editing.kind === 'rename' ? t("新的显示名 New display name") : t("新密码 New password (min 6)")
                    }
                    // @ts-expect-error h5-only DOM attribute
                    autoComplete='off'
                    onInput={(e) => setDraft(e.detail.value)}
                    onConfirm={() => saveEditor(member)}
                  />
                  {editing.kind === 'password' && (
                    <Text className='admin-hint'>{t("记下这个密码再保存 —— 保存后就看不到了。 Write this down before saving — it can't be shown again.")}</Text>
                  )}
                  <View className='member-actions'>
                    <View className='chip primary' onClick={() => saveEditor(member)}>{t("保存 Save")}</View>
                    {editing.kind === 'password' && (
                      <View className='chip' onClick={() => setDraft(generatePassword())}>{t("换一个 New suggestion")}</View>
                    )}
                    <View className='chip' onClick={closeEditor}>{t("取消 Cancel")}</View>
                  </View>
                </View>
              )}

              <View className='member-actions'>
                <View className='chip' onClick={() => openEditor(member, 'rename')}>{t("重命名 Rename")}</View>
                <View className='chip' onClick={() => openEditor(member, 'password')}>{t("重置密码 Password")}</View>
                <View
                  className='chip'
                  onClick={() =>
                    run(
                      () => setProfileActive(member.userId, !member.isActive),
                      member.isActive ? t("已停用 Deactivated ✓") : t("已启用 Reactivated ✓")
                    )
                  }
                >
                  {member.isActive ? t("停用 Deactivate") : t("启用 Reactivate")}
                </View>
                <View
                  className='chip'
                  onClick={() =>
                    run(
                      () =>
                        setProfileRole(
                          member.userId,
                          (member.role === 'admin' ? 'scout' : 'admin') as UserRole
                        ),
                      t("角色已更新 Role updated ✓")
                    )
                  }
                >
                  {member.role === 'admin' ? t("降为侦查员 Make scout") : t("设为管理员 Make admin")}
                </View>
                {member.userId !== userId && (
                  <View className='chip danger' onClick={() => confirmDelete(member)}>{t("删除 Delete")}</View>
                )}
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}
