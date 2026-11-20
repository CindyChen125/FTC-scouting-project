import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useAuth } from '../../auth/AuthContext'
import { useLanguage } from '../../i18n/LanguageContext'
import { StrategyBoard, createStrategyBoard } from '../../strategy/annotations'
import { StrategyTimeline, emptyTimeline, normalizeTimeline } from '../../strategy/timeline'
import {
  StrategyDetails, StrategyDraft, StrategyRecord, emptyStrategyDetails,
  strategyFingerprint
} from '../../strategy/strategyRecord'
import {
  createStrategy, deleteStrategy, getStrategy, listStrategies, renameStrategy, updateStrategy
} from '../../supabase/strategies'
import { classifySyncFailure, safeErrorMessage } from '../../supabase/timeout'
import { applyObjectPatch } from '../../strategy/collaboration'
import { cacheStrategies, cacheStrategy, cachedStrategy, readCachedStrategies, readPendingRoom,
  readWorkspace, removeCachedStrategy, readPendingSaves, queuePendingSave, clearPendingSave } from '../../strategy/offlineStrategy'

type Props = { board: StrategyBoard; timeline: StrategyTimeline; details: StrategyDetails;
  onDetailsChange: Dispatch<SetStateAction<StrategyDetails>>;
  onTeamChange: (alliance: 'redTeams' | 'blueTeams', index: 0 | 1, value: string) => void;
  onReplaceScenario: (board: StrategyBoard, timeline: StrategyTimeline) => void;
  onCurrentChange?: (record: StrategyRecord | null) => void;
  liveRecord?: StrategyRecord | null;
  roomPending?: number }

const asDraft = (details: StrategyDetails, board: StrategyBoard,
  timeline: StrategyTimeline): StrategyDraft => ({ ...details, board, timeline })

const copyName = (name: string) => `${name.slice(0, 93).trim()} (copy)`

export default function StrategyScenarioPanel({ board, timeline, details,
  onDetailsChange: setDetails, onTeamChange, onReplaceScenario,
  onCurrentChange, liveRecord, roomPending = 0 }: Props) {
  const { t } = useLanguage()
  const { userId, isAdmin } = useAuth()
  const [current, setCurrent] = useState<StrategyRecord | null>(null)
  const [scenarios, setScenarios] = useState<StrategyRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [pendingConflict, setPendingConflict] = useState<string | null>(null)
  const syncInFlight = useRef(false)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const savedFingerprint = useRef(strategyFingerprint(asDraft(emptyStrategyDetails(), createStrategyBoard(), emptyTimeline())))
  const draft = asDraft(details, board, timeline)
  const dirty = strategyFingerprint(draft) !== savedFingerprint.current
  const canEdit = !current || current.createdBy === userId || isAdmin
  const updateCurrent = (next: StrategyRecord | null) => { setCurrent(next); onCurrentChange?.(next) }

  useEffect(() => {
    if (!liveRecord) return
    if (current?.id !== liveRecord.id) {
      setCurrent(liveRecord)
      savedFingerprint.current = strategyFingerprint(asDraft(liveRecord, liveRecord.board,
        normalizeTimeline(liveRecord.timeline)))
      return
    }
    if (liveRecord.revision === current.revision &&
      JSON.stringify(liveRecord.objectRevisions) === JSON.stringify(current.objectRevisions)) return
    setCurrent(liveRecord)
    savedFingerprint.current = strategyFingerprint(asDraft(liveRecord, liveRecord.board,
      normalizeTimeline(liveRecord.timeline)))
  }, [liveRecord, current])

  const refresh = async () => {
    if (!userId) return
    const rows = await listStrategies()
    const cached = cacheStrategies(userId, rows)
    setScenarios(cached ? readCachedStrategies(userId) : rows)
  }
  useEffect(() => {
    if (!userId) return
    let active = true
    setScenarios(readCachedStrategies(userId))
    listStrategies().then((rows) => {
      if (active) {
        const cached = cacheStrategies(userId, rows)
        setScenarios(cached ? readCachedStrategies(userId) : rows)
      }
    }).catch((error) => {
      if (active) setNotice(`${t('正在显示本机缓存 Showing cached scenarios')} · ${safeErrorMessage(error)}`)
    })
    return () => { active = false }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    setPendingCount(readPendingSaves(userId).length)
    let active = true
    const sync = async () => {
      if (syncInFlight.current || roomPending || (typeof navigator !== 'undefined' && !navigator.onLine)) return
      syncInFlight.current = true
      try {
      for (const pending of readPendingSaves(userId)) {
        try {
          const saved = pending.recordId.startsWith('local-') ?
            await createStrategy(pending.draft, pending.sourceStrategyId ?? null) :
            await updateStrategy({ ...(cachedStrategy(userId, pending.recordId) ?? current)!,
              id: pending.recordId, revision: pending.baseRevision }, pending.draft)
          cacheStrategy(userId, saved)
          clearPendingSave(userId, pending.recordId)
          if (pending.recordId.startsWith('local-')) removeCachedStrategy(userId, pending.recordId)
          if (!active) return
          setPendingCount(readPendingSaves(userId).length)
          if (current?.id === pending.recordId) {
            updateCurrent(saved)
            savedFingerprint.current = strategyFingerprint(asDraft(saved, saved.board, normalizeTimeline(saved.timeline)))
          }
          setPendingConflict(null)
          setNotice(t('离线场景已同步 Offline scenario synced'))
          await refresh()
        } catch (problem) {
          if (problem instanceof Error && problem.name === 'StrategyConflictError') {
            if (active) setPendingConflict(pending.recordId)
          } else if (active && classifySyncFailure(problem).kind !== 'network') {
            setNotice(safeErrorMessage(problem))
          }
          return
        }
      }
      } finally { syncInFlight.current = false }
    }
    sync()
    const timer = setInterval(sync, 15000)
    if (typeof window !== 'undefined') window.addEventListener('online', sync)
    return () => { active = false; clearInterval(timer); if (typeof window !== 'undefined') window.removeEventListener('online', sync) }
  }, [userId, roomPending, current?.id, current?.revision])

  useEffect(() => {
    if (!userId || !current?.id.startsWith('local-')) return
    const pending = readPendingSaves(userId).find((item) => item.recordId === current.id)
    if (pending) queuePendingSave(userId, { ...pending, draft, savedAt: new Date().toISOString() })
  }, [userId, current?.id, details, board, timeline])

  const run = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setNotice('')
    try { await work() } catch (error) { setNotice(safeErrorMessage(error)) }
    finally { setBusy(false) }
  }
  const confirmDiscard = async () => {
    if (!dirty) return true
    const result = await Taro.showModal({
      title: t('未保存的更改 Unsaved changes'),
      content: t('继续会丢弃当前未保存的更改。 Continuing will discard your unsaved changes.'),
      confirmText: t('继续 Continue'), cancelText: t('取消 Cancel')
    })
    return result.confirm
  }
  const load = (record: StrategyRecord) => run(async () => {
    if (!await confirmDiscard()) return
    let fromCache = false
    try {
      if (record.id.startsWith('local-')) {
        record = userId ? cachedStrategy(userId, record.id) ?? record : record
        fromCache = true
      } else {
        record = await getStrategy(record.id)
        if (userId) cacheStrategy(userId, record)
      }
    }
    catch (problem) {
      const cached = userId && cachedStrategy(userId, record.id)
      if (!cached) throw problem
      record = cached
      fromCache = true
    }
    const nextDetails: StrategyDetails = {
      name: record.name, eventCode: record.eventCode, matchNumber: record.matchNumber,
      redTeams: record.redTeams, blueTeams: record.blueTeams
    }
    const pending = userId ? readPendingRoom(userId, record.id) : null
    const pendingScenario = userId ? readPendingSaves(userId).find((item) => item.recordId === record.id) : null
    const workspace = userId ? readWorkspace(userId) : null
    const nextTimeline = normalizeTimeline(record.timeline)
    const base = { board: record.board, timeline: nextTimeline }
    const local = pendingScenario && record.id.startsWith('local-') ?
      { board: pendingScenario.draft.board, timeline: normalizeTimeline(pendingScenario.draft.timeline) } :
      pending && workspace?.recordId === record.id ? workspace.snapshot :
        pending?.queue.reduce(applyObjectPatch, base) ?? base
    updateCurrent(record)
    setDetails(pendingScenario && record.id.startsWith('local-') ? pendingScenario.draft :
      workspace?.recordId === record.id ? workspace.details : nextDetails)
    onReplaceScenario(local.board, local.timeline)
    savedFingerprint.current = strategyFingerprint(asDraft(nextDetails, record.board, nextTimeline))
    setNotice(fromCache ? t('已载入本机缓存；联网后将同步 Cached copy loaded; sync resumes online') :
      t('场景已载入 Scenario loaded'))
  })
  const save = () => run(async () => {
    if (!userId) throw new Error(t('请先登录 Sign in to save'))
    if (!canEdit) throw new Error(t('只有创建者可以保存此场景 Only the creator can save this scenario'))
    const queue = () => {
      const localId = current?.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const existing = readPendingSaves(userId).find((item) => item.recordId === localId)
      if (!queuePendingSave(userId, { recordId: localId, baseRevision: current?.revision ?? 0,
        sourceStrategyId: existing?.sourceStrategyId,
        draft, savedAt: new Date().toISOString() })) throw new Error(t('本机存储失败；请勿关闭页面 Local storage failed; keep this page open'))
      if (!current) {
        const now = new Date().toISOString()
        const local: StrategyRecord = { ...draft, id: localId, revision: 0, objectRevisions: {},
          sourceStrategyId: null, createdAt: now, updatedAt: now, createdBy: userId, updatedBy: userId }
        cacheStrategy(userId, local)
        updateCurrent(local)
      }
      setPendingCount(readPendingSaves(userId).length)
      savedFingerprint.current = strategyFingerprint(draft)
      setNotice(t('已保存在本机；联网后自动同步 Saved locally; syncs automatically when online'))
    }
    if (current?.id.startsWith('local-') || roomPending ||
      (typeof navigator !== 'undefined' && !navigator.onLine)) { queue(); return }
    let saved: StrategyRecord
    try { saved = current ? await updateStrategy(current, draft) : await createStrategy(draft) }
    catch (problem) {
      if (classifySyncFailure(problem).kind !== 'network') throw problem
      queue(); return
    }
    if (userId) cacheStrategy(userId, saved)
    updateCurrent(saved)
    setDetails({ name: saved.name, eventCode: saved.eventCode, matchNumber: saved.matchNumber,
      redTeams: saved.redTeams, blueTeams: saved.blueTeams })
    savedFingerprint.current = strategyFingerprint(asDraft(saved, saved.board, normalizeTimeline(saved.timeline)))
    await refresh()
    setNotice(t('已保存到团队数据库 Saved to team database'))
  })
  const resolvePending = (mine: boolean) => run(async () => {
    if (!userId || !pendingConflict) return
    const pending = readPendingSaves(userId).find((item) => item.recordId === pendingConflict)
    if (!pending) { setPendingConflict(null); return }
    const latest = await getStrategy(pending.recordId)
    if (mine) {
      const saved = await updateStrategy(latest, pending.draft)
      cacheStrategy(userId, saved)
      if (current?.id === pending.recordId) {
        updateCurrent(saved)
        savedFingerprint.current = strategyFingerprint(asDraft(saved, saved.board, normalizeTimeline(saved.timeline)))
      }
      setNotice(t('已保留本机版本 Kept local version'))
    } else {
      cacheStrategy(userId, latest)
      if (current?.id === pending.recordId) {
        updateCurrent(latest)
        setDetails({ name: latest.name, eventCode: latest.eventCode, matchNumber: latest.matchNumber,
          redTeams: latest.redTeams, blueTeams: latest.blueTeams })
        onReplaceScenario(latest.board, normalizeTimeline(latest.timeline))
        savedFingerprint.current = strategyFingerprint(asDraft(latest, latest.board, normalizeTimeline(latest.timeline)))
      }
      setNotice(t('已采用团队版本 Used team version'))
    }
    clearPendingSave(userId, pending.recordId)
    setPendingCount(readPendingSaves(userId).length)
    setPendingConflict(null)
    await refresh()
  })
  const saveAsNew = () => run(async () => {
    if (!userId) throw new Error(t('请先登录 Sign in to save'))
    if (!details.name.trim()) throw new Error(t('请输入策略名称 Enter a strategy name'))
    const copy = { ...draft, name: copyName(details.name) }
    let saved: StrategyRecord
    try { saved = await createStrategy(copy, current?.id ?? null) }
    catch (problem) {
      if (classifySyncFailure(problem).kind !== 'network') throw problem
      const id = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
      if (!queuePendingSave(userId, { recordId: id, baseRevision: 0, draft: copy,
        sourceStrategyId: current?.id.startsWith('local-') ? null : current?.id,
        savedAt: new Date().toISOString() })) throw new Error(t('本机存储失败；请勿关闭页面 Local storage failed; keep this page open'))
      const now = new Date().toISOString()
      saved = { ...copy, id, revision: 0, objectRevisions: {}, sourceStrategyId: current?.id ?? null,
        createdAt: now, updatedAt: now, createdBy: userId, updatedBy: userId }
      cacheStrategy(userId, saved)
      updateCurrent(saved)
      setDetails({ name: saved.name, eventCode: saved.eventCode, matchNumber: saved.matchNumber,
        redTeams: saved.redTeams, blueTeams: saved.blueTeams })
      savedFingerprint.current = strategyFingerprint(copy)
      setPendingCount(readPendingSaves(userId).length)
      setNotice(t('已保存在本机；联网后自动同步 Saved locally; syncs automatically when online'))
      return
    }
    if (userId) cacheStrategy(userId, saved)
    updateCurrent(saved)
    setDetails({ name: saved.name, eventCode: saved.eventCode, matchNumber: saved.matchNumber,
      redTeams: saved.redTeams, blueTeams: saved.blueTeams })
    savedFingerprint.current = strategyFingerprint(asDraft(saved, saved.board, normalizeTimeline(saved.timeline)))
    await refresh()
    setNotice(t('新场景已保存 New scenario saved'))
  })
  const newStrategy = () => run(async () => {
    if (!await confirmDiscard()) return
    const nextBoard = createStrategyBoard()
    const nextTimeline = emptyTimeline()
    const nextDetails = emptyStrategyDetails()
    updateCurrent(null)
    setDetails(nextDetails)
    onReplaceScenario(nextBoard, nextTimeline)
    savedFingerprint.current = strategyFingerprint(asDraft(nextDetails, nextBoard, nextTimeline))
    setNotice(t('新建未保存的策略 Started a new unsaved strategy'))
  })
  const resetCurrent = () => run(async () => {
    const result = await Taro.showModal({
      title: t('重置当前场景 Reset current scenario'),
      content: t('恢复当前场景上次保存的内容？ Restore the last saved version of this scenario?'),
      confirmText: t('重置 Reset'), cancelText: t('取消 Cancel')
    })
    if (!result.confirm) return
    if (current) {
      const latest = (await listStrategies()).find((record) => record.id === current.id)
      if (!latest) throw new Error(t('场景已不存在 Scenario no longer exists'))
      const nextDetails: StrategyDetails = { name: latest.name, eventCode: latest.eventCode,
        matchNumber: latest.matchNumber, redTeams: latest.redTeams, blueTeams: latest.blueTeams }
      updateCurrent(latest)
      setDetails(nextDetails)
      const nextTimeline = normalizeTimeline(latest.timeline)
      onReplaceScenario(latest.board, nextTimeline)
      savedFingerprint.current = strategyFingerprint(asDraft(nextDetails, latest.board, nextTimeline))
    } else {
      const nextBoard = createStrategyBoard()
      const nextTimeline = emptyTimeline()
      const nextDetails = emptyStrategyDetails()
      setDetails(nextDetails)
      onReplaceScenario(nextBoard, nextTimeline)
      savedFingerprint.current = strategyFingerprint(asDraft(nextDetails, nextBoard, nextTimeline))
    }
    setNotice(t('场景已重置 Scenario reset'))
  })
  const duplicate = (record: StrategyRecord) => run(async () => {
    if (!userId) throw new Error(t('请先登录 Sign in to save'))
    const copied = await createStrategy({ ...record, name: copyName(record.name) }, record.id)
    await refresh()
    setNotice(t('场景已复制 Scenario duplicated'))
    if (await confirmDiscard()) {
      const nextDetails: StrategyDetails = { name: copied.name, eventCode: copied.eventCode,
        matchNumber: copied.matchNumber, redTeams: copied.redTeams, blueTeams: copied.blueTeams }
      updateCurrent(copied)
      setDetails(nextDetails)
      const nextTimeline = normalizeTimeline(copied.timeline)
      onReplaceScenario(copied.board, nextTimeline)
      savedFingerprint.current = strategyFingerprint(asDraft(nextDetails, copied.board, nextTimeline))
    }
  })
  const rename = (record: StrategyRecord) => run(async () => {
    const updated = await renameStrategy(record, renameValue)
    setRenameId(null)
    if (current?.id === updated.id) {
      updateCurrent(updated)
      setDetails((old) => ({ ...old, name: updated.name }))
      savedFingerprint.current = strategyFingerprint(asDraft({ name: updated.name,
        eventCode: updated.eventCode, matchNumber: updated.matchNumber,
        redTeams: updated.redTeams, blueTeams: updated.blueTeams }, updated.board, normalizeTimeline(updated.timeline)))
    }
    await refresh()
    setNotice(t('场景已重命名 Scenario renamed'))
  })
  const remove = (record: StrategyRecord) => run(async () => {
    const result = await Taro.showModal({
      title: t('删除场景 Delete scenario'),
      content: t('确定永久删除这个场景？ Delete this scenario permanently?'),
      confirmText: t('删除 Delete'), cancelText: t('取消 Cancel')
    })
    if (!result.confirm) return
    await deleteStrategy(record.id)
    if (userId) removeCachedStrategy(userId, record.id)
    await refresh()
    if (current?.id === record.id) {
      updateCurrent(null)
      savedFingerprint.current = ''
    }
    setNotice(t('场景已删除 Scenario deleted'))
  })
  return <View className='strategy-scenarios'>
    <Text className='strategy-panel-title'>{t('策略场景 Scenarios')}</Text>
    <Text className='strategy-help'>{current ? `${t('当前场景 Current')}: ${current.name}` : t('未保存的新策略 New unsaved strategy')}{dirty ? ` · ${t('未保存 Unsaved')}` : ''}</Text>
    {!!pendingCount && <Text className='strategy-scout-warning'>{t('有 {count} 个场景待同步 {count} scenarios waiting to sync', { count: pendingCount })}</Text>}
    {!!pendingConflict && <View className='strategy-room-conflict'>
      <Text>{t('离线保存与团队版本冲突。请选择保留哪个版本。 Offline save conflicts with the team version. Choose which to keep.')}</Text>
      <View className='strategy-room-actions'>
        <View className='strategy-action strategy-action-text' onClick={() => resolvePending(true)}><Text>{t('保留本机版本 Keep local version')}</Text></View>
        <View className='strategy-action strategy-action-text' onClick={() => resolvePending(false)}><Text>{t('采用团队版本 Use team version')}</Text></View>
      </View>
    </View>}
    <View className='strategy-control'><Text>{t('策略名称 Strategy name')}</Text><Input value={details.name} maxlength={100} onInput={(event) => setDetails((old) => ({ ...old, name: event.detail.value }))} /></View>
    <View className='strategy-scenario-meta'>
      <View className='strategy-control'><Text>{t('赛事代码 Event code')}</Text><Input value={details.eventCode} maxlength={100} onInput={(event) => setDetails((old) => ({ ...old, eventCode: event.detail.value }))} /></View>
      <View className='strategy-control'><Text>{t('场次 Match number')}</Text><Input value={details.matchNumber} maxlength={40} onInput={(event) => setDetails((old) => ({ ...old, matchNumber: event.detail.value }))} /></View>
    </View>
    <Text className='strategy-help'>{t('红方队号 Red alliance teams')}</Text>
    <View className='strategy-scenario-meta'>{([0, 1] as const).map((index) => <Input key={`red-${index}`} type='number' value={details.redTeams[index]} maxlength={6} onInput={(event) => onTeamChange('redTeams', index, event.detail.value)} />)}</View>
    <Text className='strategy-help'>{t('蓝方队号 Blue alliance teams')}</Text>
    <View className='strategy-scenario-meta'>{([0, 1] as const).map((index) => <Input key={`blue-${index}`} type='number' value={details.blueTeams[index]} maxlength={6} onInput={(event) => onTeamChange('blueTeams', index, event.detail.value)} />)}</View>
    <View className='strategy-scenario-actions'>
      <View className='strategy-action strategy-action-text' onClick={newStrategy}><Text>{t('新建 New')}</Text></View>
      {canEdit && <View className='strategy-action strategy-action-text' onClick={save}><Text>{t('保存 Save')}</Text></View>}
      <View className='strategy-action strategy-action-text' onClick={saveAsNew}><Text>{t('另存为新场景 Save as new')}</Text></View>
      <View className='strategy-action strategy-action-text' onClick={resetCurrent}><Text>{t('重置当前场景 Reset current scenario')}</Text></View>
    </View>
    {current && !canEdit && <Text className='strategy-help'>{t('你可以协作编辑画板；只有创建者或管理员可修改场景信息。 You can edit the shared board; only its creator or an admin can change scenario details.')}</Text>}
    {busy && <Text className='strategy-help'>{t('处理中… Working…')}</Text>}
    {!!notice && <Text className='strategy-scenario-notice'>{notice}</Text>}
    <Text className='strategy-panel-title strategy-scenario-list-title'>{t('已保存的场景 Saved scenarios')}</Text>
    {!scenarios.length && <Text className='strategy-help'>{t('还没有已保存的场景 No saved scenarios yet')}</Text>}
    {scenarios.map((record) => <View key={record.id} className={`strategy-scenario-row ${current?.id === record.id ? 'active' : ''}`}>
      {renameId === record.id ? <View className='strategy-scenario-rename'>
        <Input value={renameValue} maxlength={100} onInput={(event) => setRenameValue(event.detail.value)} />
        <View className='strategy-action strategy-action-text' onClick={() => rename(record)}><Text>{t('保存 Save')}</Text></View>
        <View className='strategy-action strategy-action-text' onClick={() => setRenameId(null)}><Text>{t('取消 Cancel')}</Text></View>
      </View> : <>
        <Text className='strategy-scenario-name'>{record.name}</Text>
        <Text className='strategy-scenario-detail'>{record.eventCode}{record.matchNumber ? ` · ${record.matchNumber}` : ''} · {new Date(record.updatedAt).toLocaleString()}</Text>
        <View className='strategy-scenario-row-actions'>
          <View className='strategy-action strategy-action-text' onClick={() => load(record)}><Text>{t('载入 Load')}</Text></View>
          <View className='strategy-action strategy-action-text' onClick={() => duplicate(record)}><Text>{t('复制 Duplicate')}</Text></View>
          {(record.createdBy === userId || isAdmin) && <>
            <View className='strategy-action strategy-action-text' onClick={() => { setRenameId(record.id); setRenameValue(record.name) }}><Text>{t('重命名 Rename')}</Text></View>
            <View className='strategy-action strategy-action-text strategy-delete' onClick={() => remove(record)}><Text>{t('删除 Delete')}</Text></View>
          </>}
        </View>
      </>}
    </View>)}
  </View>
}
