import { useCallback, useEffect, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
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
  Taro.showToast({ title, icon })

export default function Admin() {
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
        <AppHeader title='Admin' showBack />
        <View className='page-content'>
          <Text className='empty-state'>仅管理员可见 Admins only.</Text>
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
      toast('用户名必填，密码至少6位 Username required, password min 6')
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
      '已创建 Scout created ✓'
    ).then(() => {
      setNewUsername('')
      setNewDisplayName('')
      setNewPassword('')
    })
  }

  const openEditor = (member: Profile, kind: 'rename' | 'password') => {
    setEditing({ userId: member.userId, kind })
    setDraft(kind === 'rename' ? profileLabel(member) : '')
  }

  const closeEditor = () => {
    setEditing(null)
    setDraft('')
  }

  const saveEditor = (member: Profile) => {
    const value = draft.trim()
    if (editing?.kind === 'rename') {
      if (!value) {
        toast('名字不能为空 Name required')
        return
      }
      run(() => setProfileDisplayName(member.userId, value), '已更新 Renamed ✓').then(closeEditor)
    } else {
      if (value.length < 6) {
        toast('密码至少6位 Password min 6')
        return
      }
      run(() => resetScoutPassword(member.userId, value), '密码已重置 Password reset ✓').then(
        closeEditor
      )
    }
  }

  const confirmDelete = (member: Profile) => {
    Taro.showModal({
      title: '删除账号 Delete account',
      content: `永久删除 ${profileLabel(member)}？他们提交的数据会保留，但不再显示姓名。Permanently delete this account? Their submitted entries stay, but lose the name link.`,
      confirmText: '删除',
      cancelText: '取消',
      confirmColor: '#e05252',
      success: (res) => {
        if (res.confirm) run(() => deleteScout(member.userId), '已删除 Deleted ✓')
      }
    })
  }

  return (
    <View className='admin-page'>
      <AppHeader title='Admin' showBack />

      <View className='page-content'>
        <View className='section-card'>
          <Text className='section-title'>添加侦查员 Add scout</Text>
          <View className='field-row'>
            <Text className='field-label'>用户名 Username</Text>
            <Input
              className='field-input'
              value={newUsername}
              placeholder='e.g. alice'
              // @ts-expect-error h5-only DOM attribute
              autoComplete='off'
              onInput={(e) => setNewUsername(e.detail.value)}
            />
          </View>
          <View className='field-row'>
            <Text className='field-label'>显示名 Display name</Text>
            <Input
              className='field-input'
              value={newDisplayName}
              placeholder='e.g. Alice Wang'
              // @ts-expect-error h5-only DOM attribute
              autoComplete='off'
              onInput={(e) => setNewDisplayName(e.detail.value)}
            />
          </View>
          <View className='field-row'>
            <Text className='field-label'>初始密码 Starting password</Text>
            <Input
              className='field-input'
              value={newPassword}
              placeholder='min 6 characters'
              // @ts-expect-error h5-only DOM attribute
              autoComplete='off'
              onInput={(e) => setNewPassword(e.detail.value)}
            />
          </View>
          <View className={`admin-btn ${busy ? 'busy' : ''}`} onClick={busy ? undefined : addScout}>
            添加 Add scout
          </View>
          <Text className='admin-hint'>
            把用户名和密码给队员，他们可以在设置里自行修改密码。
            Give them the username and password — they can change it in Settings.
          </Text>
        </View>

        <View className='section-card'>
          <Text className='section-title'>队员 Members ({members.length})</Text>

          {members.map((member) => (
            <View className='member-row' key={member.userId}>
              <View className='member-head'>
                <Text className='member-name'>
                  {profileLabel(member)}
                  {member.userId === userId ? '（你 you）' : ''}
                </Text>
                <Text className={`member-badge ${member.role}`}>
                  {member.role === 'admin' ? '管理员 Admin' : '侦查员 Scout'}
                </Text>
              </View>
              <Text className='member-meta'>
                @{member.username} · {counts[member.userId] ?? 0} 场 matches
                {member.isActive ? '' : ' · 已停用 deactivated'}
              </Text>

              {editing?.userId === member.userId && (
                <View className='member-editor'>
                  <Input
                    className='field-input'
                    value={draft}
                    password={editing.kind === 'password'}
                    placeholder={
                      editing.kind === 'rename' ? '新的显示名 New display name' : '新密码 New password (min 6)'
                    }
                    // @ts-expect-error h5-only DOM attribute
                    autoComplete='off'
                    onInput={(e) => setDraft(e.detail.value)}
                    onConfirm={() => saveEditor(member)}
                  />
                  <View className='member-actions'>
                    <View className='chip primary' onClick={() => saveEditor(member)}>保存 Save</View>
                    <View className='chip' onClick={closeEditor}>取消 Cancel</View>
                  </View>
                </View>
              )}

              <View className='member-actions'>
                <View className='chip' onClick={() => openEditor(member, 'rename')}>重命名 Rename</View>
                <View className='chip' onClick={() => openEditor(member, 'password')}>重置密码 Password</View>
                <View
                  className='chip'
                  onClick={() =>
                    run(
                      () => setProfileActive(member.userId, !member.isActive),
                      member.isActive ? '已停用 Deactivated ✓' : '已启用 Reactivated ✓'
                    )
                  }
                >
                  {member.isActive ? '停用 Deactivate' : '启用 Reactivate'}
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
                      '角色已更新 Role updated ✓'
                    )
                  }
                >
                  {member.role === 'admin' ? '降为侦查员 Make scout' : '设为管理员 Make admin'}
                </View>
                {member.userId !== userId && (
                  <View className='chip danger' onClick={() => confirmDelete(member)}>
                    删除 Delete
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}
