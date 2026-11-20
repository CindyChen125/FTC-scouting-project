import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import AppHeader from '../../components/AppHeader'
import StrategyScenarioPanel from './StrategyScenarioPanel'
import StrategyTimelinePanel from './StrategyTimelinePanel'
import StrategyScoutingPanel from './StrategyScoutingPanel'
import StrategyRoomPanel from './StrategyRoomPanel'
import { StrategyDetails, StrategyRecord, emptyStrategyDetails } from '../../strategy/strategyRecord'
import { StrategySnapshot } from '../../strategy/collaboration'
import { useStrategyRoom } from '../../strategy/useStrategyRoom'
import { cachedStrategy, readPendingRoom, readWorkspace, saveWorkspace } from '../../strategy/offlineStrategy'
import { downloadStrategyImage } from '../../strategy/exportImage'
import { useAuth } from '../../auth/AuthContext'
import { useLanguage } from '../../i18n/LanguageContext'
import {
  FIELD_IN, TILE_IN, FRAME, FLOWERS, GARDENS, HIVE_CENTERS,
  HIVE_CELL_CENTER_OFFSET_IN, HIVE_CELL_DEPTH_IN, HIVE_CELL_WIDTH_IN,
  LOADING_ZONES, FieldRobot, RobotId, clamp, clampRobotToField,
  fieldPercent, initialRobots, normalizeHeading, screenDeltaToInches
} from '../../strategy/fieldGeometry'
import {
  Annotation, AnnotationTool, DrawingKind, FieldPoint, StrategyBoard, StrategyPhase,
  clampPoint, createStrategyBoard, curvePoints, renderAnnotations,
  topAnnotationAt, translated, withPoint
} from '../../strategy/annotations'
import {
  StrategyTimeline, Waypoint, ROBOT_IDS, addWaypoint, analyzeTimeline, changeWaypoint,
  durationForPhase, emptyTimeline, normalizeTimeline, removeWaypoint, reorderWaypoint, robotsAtTime, warningsAtTime
} from '../../strategy/timeline'
import './index.scss'

type Point = { x: number; y: number }
type Gesture =
  | { kind: 'robot'; start: Point; robot: FieldRobot; before: Snapshot }
  | { kind: 'pan'; start: Point; pan: Point }
  | { kind: 'pinch'; distance: number; zoom: number }
  | { kind: 'annotation'; start: FieldPoint; annotation: Annotation; before: Snapshot; handle?: number }
  | { kind: 'waypoint'; waypoint: Waypoint; robotId: RobotId; before: Snapshot }
  | { kind: 'draw'; start: FieldPoint; tool: DrawingKind }
type Snapshot = { board: StrategyBoard; timeline: StrategyTimeline }
type History = { past: Snapshot[]; future: Snapshot[] }
const COLORS = [
  { name: 'red', value: '#a93d49' }, { name: 'blue', value: '#245fbd' },
  { name: 'green', value: '#26734d' }, { name: 'yellow', value: '#986816' },
  { name: 'neutral', value: '#263b55' }
] as const
type BoardTool = AnnotationTool | 'waypoint'
const TOOLS: BoardTool[] = ['select', 'waypoint', 'pen', 'line', 'arrow', 'curve', 'eraser', 'text']
const TOOL_LABELS: Record<BoardTool, string> = {
  select: '选择 Select', pen: '画笔 Pen', line: '直线 Line', arrow: '箭头 Arrow',
  curve: '曲线路径 Curved path', eraser: '橡皮擦 Eraser', text: '文字 Text',
  waypoint: '路径点 Waypoint'
}
const pointer = (event: any): Point | null => {
  const p = event.touches?.[0] ?? event.changedTouches?.[0] ?? event
  return typeof p?.clientX === 'number' ? { x: p.clientX, y: p.clientY } : null
}
const touchDistance = (event: any): number | null => {
  const touches = event.touches
  if (!touches || touches.length < 2) return null
  return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
}
const rectStyle = (x: number, y: number, width: number, height: number) => ({
  left: fieldPercent(x), top: fieldPercent(y), width: fieldPercent(width), height: fieldPercent(height)
})

export default function StrategySandbox() {
  const { t } = useLanguage()
  const { userId, profile } = useAuth()
  const [board, setBoard] = useState(createStrategyBoard)
  const boardRef = useRef(board)
  boardRef.current = board
  const [timeline, setTimeline] = useState(emptyTimeline)
  const timelineRef = useRef(timeline)
  timelineRef.current = timeline
  const [strategyDetails, setStrategyDetails] = useState<StrategyDetails>(emptyStrategyDetails)
  const [activeRecord, setActiveRecord] = useState<StrategyRecord | null>(null)
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [localSaveError, setLocalSaveError] = useState(false)
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [presentation, setPresentation] = useState(false)
  const [exportError, setExportError] = useState('')
  const applyRemoteRef = useRef<(state: StrategySnapshot, remote: StrategyRecord,
    previous: StrategyRecord | null) => void>(() => {})
  const room = useStrategyRoom(activeRecord, userId, profile?.displayName || profile?.username || '',
    () => ({ board: boardRef.current, timeline: timelineRef.current }),
    (state, remote, previous) => applyRemoteRef.current(state, remote, previous), setActiveRecord)
  const [phase, setPhase] = useState<StrategyPhase>('auto')
  const [tool, setTool] = useState<BoardTool>('select')
  const [color, setColor] = useState(COLORS[4].value as string)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Annotation | null>(null)
  const draftRef = useRef<Annotation | null>(null)
  const serial = useRef(0)
  const [history, setHistory] = useState<History>({ past: [], future: [] })
  const historyRef = useRef(history)
  const plan = board[phase]
  const robots = plan.robots
  const selectedAnnotation = plan.annotations.find((annotation) => annotation.id === selectedAnnotationId)
  const [selectedId, setSelectedId] = useState<RobotId>('red1')
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [warningsEnabled, setWarningsEnabled] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [viewport, setViewport] = useState({ width: 360, height: 400, left: 0, top: 0 })
  const viewportOrigin = useRef({ left: 0, top: 0 })
  const gesture = useRef<Gesture | null>(null)
  const selected = robots.find((robot) => robot.id === selectedId)!
  const routes = timeline[phase]
  const duration = durationForPhase(routes)
  const displayRobots = useMemo(() => robotsAtTime(robots, routes, time), [robots, routes, time])
  const timelineWarnings = useMemo(() => analyzeTimeline(robots, routes), [robots, routes])
  const currentWarnings = useMemo(() => warningsAtTime(robots, routes, time), [robots, routes, time])
  const boardSize = Math.min(viewport.width - 24, viewport.height - 24, 720)

  useEffect(() => {
    if (!playing) return
    let previous = Date.now()
    const timer = setInterval(() => {
      const now = Date.now()
      const delta = (now - previous) / 1000 * speed
      previous = now
      setTime((value) => Math.min(duration, value + delta))
    }, 33)
    return () => clearInterval(timer)
  }, [playing, speed, duration])

  useEffect(() => { setTime((value) => Math.min(value, duration)) }, [duration])
  useEffect(() => { if (playing && time >= duration) setPlaying(false) }, [playing, time, duration])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])

  useEffect(() => {
    if (!userId) { setWorkspaceReady(false); return }
    const stored = readWorkspace(userId)
    if (stored) {
      const record = stored.recordId ? cachedStrategy(userId, stored.recordId) : null
      const pending = record && readPendingRoom(userId, record.id)
      const restored = record && !pending && !record.id.startsWith('local-') ?
        { board: record.board, timeline: normalizeTimeline(record.timeline) } : stored.snapshot
      boardRef.current = restored.board
      timelineRef.current = restored.timeline
      setBoard(restored.board)
      setTimeline(restored.timeline)
      setStrategyDetails(stored.details)
      setActiveRecord(record)
    }
    setWorkspaceReady(true)
  }, [userId])

  useEffect(() => {
    if (!userId || !workspaceReady) return
    const saved = saveWorkspace(userId, { recordId: activeRecord?.id ?? null,
      details: strategyDetails, snapshot: { board, timeline }, savedAt: new Date().toISOString() })
    setLocalSaveError(!saved)
  }, [userId, workspaceReady, activeRecord?.id, strategyDetails, board, timeline])

  useEffect(() => {
    const measure = () => Taro.createSelectorQuery().select('#strategy-viewport').boundingClientRect((box: any) => {
      if (box?.width) {
        viewportOrigin.current = { left: box.left ?? 0, top: box.top ?? 0 }
        setViewport({ width: box.width, height: box.height, left: box.left ?? 0, top: box.top ?? 0 })
      }
    }).exec()
    measure()
    const onResize = () => measure()
    Taro.onWindowResize?.(onResize)
    return () => Taro.offWindowResize?.(onResize)
  }, [presentation])

  useEffect(() => {
    const ctx = Taro.createCanvasContext?.('strategy-annotations')
    if (ctx) renderAnnotations(ctx, plan.annotations, selectedAnnotationId, draft, boardSize)
  }, [plan.annotations, selectedAnnotationId, draft, boardSize, phase])

  const showState = (next: Snapshot) => {
    boardRef.current = next.board; timelineRef.current = next.timeline
    setBoard(next.board); setTimeline(next.timeline)
  }
  const setHistoryValue = (next: History) => { historyRef.current = next; setHistory(next) }
  const snapshot = (): Snapshot => ({ board: boardRef.current, timeline: timelineRef.current })
  const remember = (before: Snapshot) => {
    if (JSON.stringify(before) === JSON.stringify(snapshot())) return
    setHistoryValue({ past: [...historyRef.current.past, before].slice(-60), future: [] })
    room.queueChanges(before, snapshot())
  }
  const commit = (next: Snapshot) => { const before = snapshot(); showState(next); remember(before) }
  const commitBoard = (next: StrategyBoard) => commit({ board: next, timeline: timelineRef.current })
  const commitRoutes = (next: typeof routes) => commit({ board: boardRef.current,
    timeline: { ...timelineRef.current, [phase]: next } })
  const replacePlan = (source: StrategyBoard, change: Partial<StrategyBoard[StrategyPhase]>): StrategyBoard => ({
    ...source, [phase]: { ...source[phase], ...change }
  })
  const updateAnnotation = (id: string, patch: Partial<Annotation>) => commitBoard(replacePlan(boardRef.current, {
    annotations: boardRef.current[phase].annotations.map((annotation) => annotation.id === id ? { ...annotation, ...patch } : annotation)
  }))
  const undo = () => {
    const past = historyRef.current.past
    if (!past.length) return
    const previous = past[past.length - 1]
    const before = snapshot()
    setHistoryValue({ past: past.slice(0, -1), future: [before, ...historyRef.current.future] })
    showState(previous)
    room.queueChanges(before, previous)
    setSelectedAnnotationId(null)
  }
  const redo = () => {
    const future = historyRef.current.future
    if (!future.length) return
    const before = snapshot()
    setHistoryValue({ past: [...historyRef.current.past, before], future: future.slice(1) })
    showState(future[0])
    room.queueChanges(before, future[0])
    setSelectedAnnotationId(null)
  }

  const updateRobot = (id: RobotId, patch: Partial<FieldRobot>) =>
    commitBoard(replacePlan(boardRef.current, { robots: boardRef.current[phase].robots.map((robot) =>
      robot.id === id ? clampRobotToField({ ...robot, ...patch }) : robot) }))
  const setRobotNumber = (id: RobotId, number: string) => {
    const next = { ...boardRef.current }
    for (const strategyPhase of ['auto', 'teleop'] as const) {
      next[strategyPhase] = { ...next[strategyPhase], robots: next[strategyPhase].robots.map((robot) =>
        robot.id === id ? { ...robot, number } : robot) }
    }
    commitBoard(next)
    const alliance = id.startsWith('red') ? 'redTeams' : 'blueTeams'
    const index = id.endsWith('1') ? 0 : 1
    setStrategyDetails((old) => ({ ...old, [alliance]: old[alliance].map((team, i) => i === index ? number : team) as [string, string] }))
  }
  const setAllianceTeam = (alliance: 'redTeams' | 'blueTeams', index: 0 | 1, number: string) => {
    const id = `${alliance === 'redTeams' ? 'red' : 'blue'}${index + 1}` as RobotId
    setRobotNumber(id, number)
  }

  const rawFieldPoint = (point: Point): FieldPoint => ({
    x: 72 + (point.x - viewportOrigin.current.left - viewport.width / 2 - pan.x) * FIELD_IN / (boardSize * zoom),
    y: 72 + (point.y - viewportOrigin.current.top - viewport.height / 2 - pan.y) * FIELD_IN / (boardSize * zoom)
  })
  const fieldPoint = (point: Point): FieldPoint => clampPoint(rawFieldPoint(point))
  const waypointPoint = (point: Point): FieldPoint => {
    const raw = rawFieldPoint(point)
    return { x: clamp(raw.x, -24, FIELD_IN + 24), y: clamp(raw.y, -24, FIELD_IN + 24) }
  }

  const deleteAnnotation = (id: string) => {
    commitBoard(replacePlan(boardRef.current, { annotations: boardRef.current[phase].annotations.filter((item) => item.id !== id) }))
    if (selectedAnnotationId === id) setSelectedAnnotationId(null)
  }
  const freshId = () => `annotation-${Date.now()}-${++serial.current}`
  const beginWaypoint = (event: any, robotId: RobotId, waypoint: Waypoint) => {
    if (presentation) return
    event.stopPropagation?.()
    setPlaying(false)
    setSelectedId(robotId)
    setSelectedWaypointId(waypoint.id)
    room.setEditing(`waypoint:${phase}:${robotId}:${waypoint.id}`)
    gesture.current = { kind: 'waypoint', waypoint, robotId, before: snapshot() }
  }

  const begin = (event: any, robot?: FieldRobot) => {
    if (presentation) return
    if (!robot) {
      const rect = event.currentTarget?.getBoundingClientRect?.()
      if (rect) viewportOrigin.current = { left: rect.left, top: rect.top }
    }
    const distance = touchDistance(event)
    if (distance) { gesture.current = { kind: 'pinch', distance, zoom }; return }
    const start = pointer(event)
    if (!start) return
    if (robot) {
      setSelectedId(robot.id)
      if (tool !== 'select') { if (tool === 'waypoint') event.stopPropagation?.(); return }
      event.stopPropagation?.()
      if (robot.locked || time > 0 || playing) return
      setSelectedAnnotationId(null)
      room.setEditing(`robot:${phase}:${robot.id}`)
      gesture.current = { kind: 'robot', start, robot, before: snapshot() }
      return
    }
    if (tool === 'waypoint') {
      const selectedRobot = boardRef.current[phase].robots.find((item) => item.id === selectedId)!
      const next = addWaypoint(timelineRef.current[phase], selectedRobot, waypointPoint(start), time,
        `waypoint-${Date.now()}-${++serial.current}`)
      if (next !== timelineRef.current[phase]) {
        commitRoutes(next)
        setSelectedWaypointId(next[selectedId][next[selectedId].length - 1].id)
        setPlaying(false)
      }
      return
    }
    const at = fieldPoint(start)
    const tolerance = Math.max(3, screenDeltaToInches(10, boardSize, zoom))
    const hit = topAnnotationAt(boardRef.current[phase].annotations, at, tolerance)
    if (tool === 'eraser') { if (hit) deleteAnnotation(hit.id); return }
    if (tool === 'text') {
      const annotation: Annotation = { id: freshId(), kind: 'text', color, points: [at], text: t('编辑文字 Edit text') }
      commitBoard(replacePlan(boardRef.current, { annotations: [...boardRef.current[phase].annotations, annotation] }))
      setSelectedAnnotationId(annotation.id)
      setTool('select')
      return
    }
    if (tool === 'select') {
      if (hit) {
        setSelectedAnnotationId(hit.id)
        const handle = selectedAnnotationId === hit.id
          ? hit.points.findIndex((point) => Math.hypot(point.x - at.x, point.y - at.y) <= tolerance)
          : -1
        gesture.current = { kind: 'annotation', start: at, annotation: hit, before: snapshot(),
          handle: handle >= 0 ? handle : undefined }
        room.setEditing(`annotation:${phase}:${hit.id}`)
        return
      }
      setSelectedAnnotationId(null)
      gesture.current = { kind: 'pan', start, pan }
      return
    }
    const annotation: Annotation = { id: freshId(), kind: tool, color, points: [at, at] }
    draftRef.current = annotation
    room.setEditing(`annotation:${phase}:${annotation.id}`)
    setDraft(annotation)
    gesture.current = { kind: 'draw', start: at, tool }
  }

  const move = (event: any) => {
    const active = gesture.current
    if (active?.kind === 'pinch') {
      const distance = touchDistance(event)
      if (distance) { event.preventDefault?.(); changeZoom(active.zoom * distance / active.distance) }
      return
    }
    const point = pointer(event)
    if (!active || !point) return
    event.preventDefault?.()
    if (active.kind === 'draw') {
      const at = fieldPoint(point)
      const current = draftRef.current
      if (!current) return
      let points: FieldPoint[]
      if (active.tool === 'pen') {
        const last = current.points[current.points.length - 1]
        if (Math.hypot(last.x - at.x, last.y - at.y) < 0.6) return
        points = [...current.points, at]
      } else if (active.tool === 'curve') points = curvePoints(active.start, at)
      else points = [active.start, at]
      draftRef.current = { ...current, points }
      setDraft(draftRef.current)
      return
    }
    if (active.kind === 'waypoint') {
      const at = waypointPoint(point)
      const next = changeWaypoint(active.before.timeline[phase], active.robotId, active.waypoint.id, at)
      showState({ board: active.before.board,
        timeline: { ...active.before.timeline, [phase]: next } })
      return
    }
    if (active.kind === 'annotation') {
      const at = fieldPoint(point)
      const next = active.handle !== undefined
        ? withPoint(active.annotation, active.handle, at)
        : translated(active.annotation, at.x - active.start.x, at.y - active.start.y)
      showState({ board: replacePlan(active.before.board, { annotations: active.before.board[phase].annotations.map((item) =>
        item.id === active.annotation.id ? next : item) }), timeline: active.before.timeline })
      return
    }
    const dx = point.x - active.start.x
    const dy = point.y - active.start.y
    if (active.kind === 'pan') {
      setPan({ x: active.pan.x + dx, y: active.pan.y + dy })
    } else if (active.kind === 'robot') {
      showState({ board: replacePlan(active.before.board, { robots: active.before.board[phase].robots.map((robot) =>
        robot.id === active.robot.id ? clampRobotToField({ ...robot,
          x: active.robot.x + screenDeltaToInches(dx, boardSize, zoom),
          y: active.robot.y + screenDeltaToInches(dy, boardSize, zoom)
        }) : robot) }), timeline: active.before.timeline })
    }
  }
  const end = () => {
    const active = gesture.current
    if (active?.kind === 'draw' && draftRef.current) {
      const annotation = draftRef.current
      const points = annotation.points
      if (points.length >= 2 && Math.hypot(points[0].x - points[points.length - 1].x,
        points[0].y - points[points.length - 1].y) >= 0.5) {
        commitBoard(replacePlan(boardRef.current, { annotations: [...boardRef.current[phase].annotations, annotation] }))
        setSelectedAnnotationId(annotation.id)
      }
      draftRef.current = null
      setDraft(null)
    } else if (active?.kind === 'robot' || active?.kind === 'annotation' || active?.kind === 'waypoint') remember(active.before)
    gesture.current = null
    room.setEditing(null)
  }
  const changeZoom = (next: number) => setZoom(clamp(Math.round(next * 100) / 100, 0.65, 3))
  const wheel = (event: any) => {
    if (!event?.deltaY) return
    event.preventDefault?.()
    changeZoom(zoom * (event.deltaY > 0 ? 0.9 : 1.1))
  }
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }) }
  const setDimension = (key: 'width' | 'length', raw: string) => {
    const value = Number(raw)
    if (Number.isFinite(value) && value > 0) updateRobot(selectedId, { [key]: clamp(value, 1, 24) })
  }
  const resetBoard = async () => {
    const result = await Taro.showModal({
      title: t('重置当前阶段 Reset current phase'),
      content: t('这会清除当前阶段的图形并恢复机器人位置。 This clears drawings and restores robot positions in the current phase.'),
      confirmText: t('重置 Reset'), cancelText: t('取消 Cancel')
    })
    if (!result.confirm) return
    commit({ board: replacePlan(boardRef.current, { robots: initialRobots(), annotations: [] }),
      timeline: { ...timelineRef.current, [phase]: emptyTimeline()[phase] } })
    setSelectedAnnotationId(null)
    setSelectedWaypointId(null)
  }
  const switchPhase = (next: StrategyPhase) => {
    end()
    setSelectedAnnotationId(null)
    setSelectedWaypointId(null)
    setTime(0)
    setPlaying(false)
    setPhase(next)
  }
  const replaceScenario = (next: StrategyBoard, nextTimeline: StrategyTimeline) => {
    gesture.current = null
    draftRef.current = null
    setDraft(null)
    setSelectedAnnotationId(null)
    setSelectedId('red1')
    setSelectedWaypointId(null)
    setPhase('auto')
    setTime(0)
    setPlaying(false)
    room.setEditing(null)
    showState({ board: next, timeline: nextTimeline })
    setHistoryValue({ past: [], future: [] })
    resetView()
  }
  applyRemoteRef.current = (state, remote, previous) => {
    showState(state)
    setHistoryValue({ past: [], future: [] })
    if (previous) setStrategyDetails((old) => ({
      name: old.name === previous.name ? remote.name : old.name,
      eventCode: old.eventCode === previous.eventCode ? remote.eventCode : old.eventCode,
      matchNumber: old.matchNumber === previous.matchNumber ? remote.matchNumber : old.matchNumber,
      redTeams: JSON.stringify(old.redTeams) === JSON.stringify(previous.redTeams) ? remote.redTeams : old.redTeams,
      blueTeams: JSON.stringify(old.blueTeams) === JSON.stringify(previous.blueTeams) ? remote.blueTeams : old.blueTeams
    }))
  }
  const addSelectedWaypoint = () => {
    const next = addWaypoint(timelineRef.current[phase], selected, { x: selected.x, y: selected.y }, time,
      `waypoint-${Date.now()}-${++serial.current}`)
    if (next === timelineRef.current[phase]) return
    commitRoutes(next)
    setSelectedWaypointId(next[selectedId][next[selectedId].length - 1].id)
    setPlaying(false)
  }
  const editWaypoint = (robotId: RobotId, id: string, patch: Partial<Omit<Waypoint, 'id'>>) => {
    commitRoutes(changeWaypoint(timelineRef.current[phase], robotId, id, patch))
    setPlaying(false)
  }
  const moveWaypointOrder = (robotId: RobotId, id: string, direction: -1 | 1) => {
    commitRoutes(reorderWaypoint(timelineRef.current[phase], robotId, id, direction))
    setPlaying(false)
  }
  const deleteWaypoint = (robotId: RobotId, id: string) => {
    commitRoutes(removeWaypoint(timelineRef.current[phase], robotId, id))
    if (selectedWaypointId === id) setSelectedWaypointId(null)
    setPlaying(false)
  }
  const scrub = (next: number) => { setPlaying(false); setTime(clamp(next, 0, duration)) }
  const startPlayback = () => { if (time >= duration) setTime(0); setPlaying(true) }
  const restartPlayback = () => { setPlaying(false); setTime(0) }
  const exportImage = () => {
    try { downloadStrategyImage({ board: boardRef.current, timeline: timelineRef.current,
      details: strategyDetails, phase }); setExportError('') }
    catch (problem) { setExportError(problem instanceof Error ? problem.message : String(problem)) }
  }

  return (
    <View className={`strategy-page ${presentation ? 'strategy-presentation' : ''}`}>
      <AppHeader title={t('策略沙盘 Strategy Sandbox')} showBack />
      <View className='page-content strategy-content'>
        <View className='strategy-heading'>
          <View>
            <Text className='strategy-title'>{t('策略沙盘 Strategy Sandbox')}</Text>
            <Text className='strategy-subtitle'>{t('准确比例场地图 · 拖动机器人布局 Accurate-scale field · Drag robots to plan')}</Text>
          </View>
          <Text className='strategy-measure'>{t('144 × 144 in · 6 × 6 tiles')}</Text>
        </View>
        <View className='strategy-presentation-bar'>
          <Text className='strategy-connection-status'>{!online || room.status === 'offline' ?
            t('离线：更改保存在本机，联网后同步 Offline: edits saved locally and synced on reconnect') :
            room.pending ? t('待同步 {count} 项 Pending sync: {count}', { count: room.pending }) :
              t('在线 Online')}</Text>
          <View className='strategy-presentation-actions'>
            <View className='strategy-action strategy-action-text' role='button' onClick={exportImage}><Text>{t('导出图片 Export PNG')}</Text></View>
            <View className='strategy-action strategy-action-text' role='button' onClick={() => setPresentation((value) => !value)}><Text>{presentation ? t('退出展示模式 Exit presentation') : t('展示模式 Presentation mode')}</Text></View>
          </View>
        </View>
        {localSaveError && <Text className='strategy-scout-warning'>{t('本机存储失败；请勿关闭页面 Local storage failed; keep this page open')}</Text>}
        {!!exportError && <Text className='strategy-scout-warning'>{exportError}</Text>}

        <View className='strategy-layout'>
          <View className='strategy-main'>
            <View className='strategy-phase-tabs'>
              <View className={`strategy-phase-tab ${phase === 'auto' ? 'active' : ''}`} onClick={() => switchPhase('auto')}><Text>{t('自动阶段 Autonomous')}</Text></View>
              <View className={`strategy-phase-tab ${phase === 'teleop' ? 'active' : ''}`} onClick={() => switchPhase('teleop')}><Text>{t('手动阶段 TeleOp')}</Text></View>
            </View>
            <View className='strategy-draw-tools'>
              {TOOLS.map((item) => <View key={item} className={`strategy-tool ${tool === item ? 'active' : ''}`}
                role='button' onClick={() => { end(); setTool(item) }}><Text>{t(TOOL_LABELS[item])}</Text></View>)}
            </View>
            <View className='strategy-color-row'>
              <Text>{t('画笔颜色 Drawing color')}</Text>
              {COLORS.map((item) => <View key={item.name} className={`strategy-color ${color === item.value ? 'active' : ''}`}
                style={{ backgroundColor: item.value }} role='button' aria-label={t(item.name)} onClick={() => setColor(item.value)} />)}
            </View>
            <View className='strategy-toolbar'>
              <View className='strategy-toolbar-group'>
                <View className='strategy-action' role='button' onClick={() => changeZoom(zoom / 1.25)}><Text>−</Text></View>
                <Text className='strategy-zoom'>{Math.round(zoom * 100)}%</Text>
                <View className='strategy-action' role='button' onClick={() => changeZoom(zoom * 1.25)}><Text>+</Text></View>
              </View>
              <View className='strategy-action strategy-action-text' role='button' onClick={resetView}><Text>{t('适配场地 Fit field')}</Text></View>
              <View className='strategy-action strategy-action-text' role='button' onClick={() => commitBoard(replacePlan(boardRef.current, { robots: initialRobots() }))}><Text>{t('重置机器人 Reset robots')}</Text></View>
              <View className={`strategy-action strategy-action-text ${history.past.length ? '' : 'disabled'}`} role='button' onClick={undo}><Text>{t('撤销 Undo')}</Text></View>
              <View className={`strategy-action strategy-action-text ${history.future.length ? '' : 'disabled'}`} role='button' onClick={redo}><Text>{t('重做 Redo')}</Text></View>
              <View className='strategy-action strategy-action-text' role='button' onClick={resetBoard}><Text>{t('重置画板 Reset board')}</Text></View>
            </View>

            <View id='strategy-viewport' className='strategy-viewport'
              onTouchStart={(event) => begin(event)} onTouchMove={move} onTouchEnd={end} onTouchCancel={end}
              {...({ onMouseDown: (event: any) => begin(event), onMouseMove: move, onMouseUp: end, onMouseLeave: end, onWheel: wheel } as any)}
            >
              <View className='strategy-field' style={{
                width: `${boardSize}px`, height: `${boardSize}px`,
                transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
              }}>
                <View className='strategy-half strategy-half-red' />
                <View className='strategy-half strategy-half-blue' />
                {Array.from({ length: 5 }, (_, i) => (
                  <View key={`v${i}`} className='strategy-tile-line strategy-tile-line-v' style={{ left: fieldPercent((i + 1) * TILE_IN) }} />
                ))}
                {Array.from({ length: 5 }, (_, i) => (
                  <View key={`h${i}`} className='strategy-tile-line strategy-tile-line-h' style={{ top: fieldPercent((i + 1) * TILE_IN) }} />
                ))}
                {LOADING_ZONES.map((zone) => <View key={zone.id} className={`strategy-zone strategy-zone-${zone.id}`} style={rectStyle(zone.x, zone.y, zone.width, zone.height)} />)}
                {GARDENS.map((zone) => <View key={zone.id} className={`strategy-garden strategy-garden-${zone.id}`} style={rectStyle(zone.x, zone.y, zone.width, zone.height)} />)}
                <View className='strategy-frame' style={rectStyle(FRAME.x, FRAME.y, FRAME.width, FRAME.height)}>
                  <Text className='strategy-frame-label'>{t('蜂巢支架 Hive frame')}</Text>
                </View>
                {(['red', 'blue'] as const).flatMap((alliance) => (['top', 'bottom'] as const).map((side) => {
                  const center = HIVE_CENTERS[alliance]
                  const y = center.y + (side === 'top' ? -HIVE_CELL_CENTER_OFFSET_IN : HIVE_CELL_CENTER_OFFSET_IN)
                  const up = (alliance === 'red' && side === 'bottom') || (alliance === 'blue' && side === 'top')
                  return <View key={`${alliance}-${side}`} className={`strategy-cell strategy-cell-${alliance} strategy-cell-${side} ${up ? 'strategy-cell-up' : ''}`}
                    style={{ left: fieldPercent(center.x), top: fieldPercent(y), width: fieldPercent(HIVE_CELL_WIDTH_IN), height: fieldPercent(HIVE_CELL_DEPTH_IN) }}>
                    <Text className='strategy-cell-label'>{up ? t('朝上 UP') : t('朝下 DOWN')}</Text>
                  </View>
                }))}
                {FLOWERS.map((flower) => <View key={flower.id} className={`strategy-flower strategy-flower-${flower.id}`} style={{ left: fieldPercent(flower.x), top: fieldPercent(flower.y) }}><View className='strategy-flower-ring' /></View>)}
                {ROBOT_IDS.flatMap((id) => {
                  const robot = robots.find((item) => item.id === id)!
                  const path = [{ x: robot.x, y: robot.y }, ...routes[id]]
                  return path.slice(1).map((point, index) => {
                    const from = path[index]
                    const dx = point.x - from.x
                    const dy = point.y - from.y
                    return <View key={`${id}-segment-${index}`} className={`strategy-route-segment strategy-route-${robot.alliance}`}
                      style={{ left: fieldPercent(from.x), top: fieldPercent(from.y), width: fieldPercent(Math.hypot(dx, dy)),
                        transform: `rotate(${Math.atan2(dy, dx)}rad)` }} />
                  })
                })}
                <Canvas canvasId='strategy-annotations' className='strategy-annotation-canvas'
                  width={String(boardSize)} height={String(boardSize)} style={{ width: `${boardSize}px`, height: `${boardSize}px` }} />
                {displayRobots.map((robot) => <View key={robot.id}
                  className={`strategy-robot strategy-robot-${robot.alliance} ${selectedId === robot.id ? 'strategy-robot-selected' : ''} ${robot.locked ? 'strategy-robot-locked' : ''} ${warningsEnabled && currentWarnings.some((warning) => warning.robots.includes(robot.id)) ? 'strategy-robot-warning' : ''}`}
                  style={{ left: fieldPercent(robot.x), top: fieldPercent(robot.y), width: fieldPercent(robot.width), height: fieldPercent(robot.length), transform: `translate(-50%, -50%) rotate(${robot.heading}deg)` }}
                  onTouchStart={(event) => begin(event, robot)} onClick={() => setSelectedId(robot.id)}
                  {...({ onMouseDown: (event: any) => begin(event, robot) } as any)}>
                  <View className='strategy-robot-front' />
                  <Text className='strategy-robot-number' style={{ transform: `rotate(${-robot.heading}deg)` }}>{robot.number || robot.id.toUpperCase()}</Text>
                </View>)}
                {ROBOT_IDS.flatMap((id) => (routes[id] ?? []).map((waypoint, index) => <View key={waypoint.id}
                  className={`strategy-waypoint strategy-waypoint-${id.startsWith('red') ? 'red' : 'blue'} ${selectedWaypointId === waypoint.id ? 'active' : ''}`}
                  style={{ left: fieldPercent(waypoint.x), top: fieldPercent(waypoint.y) }}
                  onTouchStart={(event) => beginWaypoint(event, id, waypoint)}
                  {...({ onMouseDown: (event: any) => beginWaypoint(event, id, waypoint) } as any)}
                  onClick={() => { setSelectedId(id); setSelectedWaypointId(waypoint.id) }}><Text>{index + 1}</Text></View>))}
              </View>
            </View>
            <View className='strategy-orientation'><Text>{t('左：红方 Red left')}</Text><Text>{t('上：计分侧 Scoring side · 下：观众侧 Audience side')}</Text><Text>{t('右：蓝方 Blue right')}</Text></View>
            <Text className='strategy-caveat'>{t('花朵中心与蜂房俯视轮廓按 FIRST 图示标注，位置为标称值；请勿用作机器人精密定位。 Flower centers and cell footprints follow nominal FIRST diagrams; do not use for precision robot localization.')}</Text>
          </View>

          <View className='strategy-panel'>
            {selectedAnnotation && <View className='strategy-annotation-editor'>
              <Text className='strategy-panel-title'>{t('选中标注 Selected annotation')}</Text>
              <Text className='strategy-help'>{t('拖动标注移动；拖动圆形控制点修改路径。 Drag the annotation to move it; drag round handles to reshape it.')}</Text>
              {selectedAnnotation.kind === 'text' && <View className='strategy-control'><Text>{t('标注文字 Annotation text')}</Text><Input value={selectedAnnotation.text ?? ''} maxlength={80}
                onInput={(event) => updateAnnotation(selectedAnnotation.id, { text: event.detail.value })} /></View>}
              <View className='strategy-color-row'>
                <Text>{t('标注颜色 Annotation color')}</Text>
                {COLORS.map((item) => <View key={item.name} className={`strategy-color ${selectedAnnotation.color === item.value ? 'active' : ''}`}
                  style={{ backgroundColor: item.value }} role='button' aria-label={t(item.name)}
                  onClick={() => updateAnnotation(selectedAnnotation.id, { color: item.value })} />)}
              </View>
              <View className='strategy-action strategy-action-text strategy-delete' onClick={() => deleteAnnotation(selectedAnnotation.id)}><Text>{t('删除选中标注 Delete selected')}</Text></View>
            </View>}
            <Text className='strategy-panel-title'>{t('机器人 Robot')}</Text>
            <View className='strategy-robot-tabs'>
              {robots.map((robot) => <View key={robot.id} className={`strategy-robot-tab strategy-robot-tab-${robot.alliance} ${robot.id === selectedId ? 'active' : ''}`} onClick={() => setSelectedId(robot.id)}><Text>{robot.number || robot.id.toUpperCase()}</Text></View>)}
            </View>
            <View className='strategy-control'><Text>{t('队号 Team number')}</Text><Input value={selected.number} maxlength={6} onInput={(event) => setRobotNumber(selectedId, event.detail.value)} /></View>
            <View className='strategy-dimensions'>
              <View className='strategy-control'><Text>{t('宽度 Width (in)')}</Text><Input type='number' value={String(selected.width)} onInput={(event) => setDimension('width', event.detail.value)} /></View>
              <View className='strategy-control'><Text>{t('长度 Length (in)')}</Text><Input type='number' value={String(selected.length)} onInput={(event) => setDimension('length', event.detail.value)} /></View>
            </View>
            <Text className='strategy-help'>{t('默认 16 × 16 英寸为可修改的规划假设，并非统一机器人尺寸。 Default 16 × 16 in is an editable planning assumption, not a universal size.')}</Text>
            <View className='strategy-control'><Text>{t('朝向 Heading (degrees)')}</Text><Input type='number' value={String(Math.round(selected.heading))} onInput={(event) => {
              const next = Number(event.detail.value)
              if (Number.isFinite(next)) updateRobot(selectedId, { heading: normalizeHeading(next) })
            }} /></View>
            <View className='strategy-turn-row'>
              <View className='strategy-action strategy-action-text' onClick={() => updateRobot(selectedId, { heading: normalizeHeading(selected.heading - 15) })}><Text>↶ 15°</Text></View>
              <View className='strategy-action strategy-action-text' onClick={() => updateRobot(selectedId, { heading: normalizeHeading(selected.heading + 15) })}><Text>15° ↷</Text></View>
            </View>
            <View className='strategy-action strategy-action-text strategy-lock' onClick={() => updateRobot(selectedId, { locked: !selected.locked })}><Text>{selected.locked ? t('解锁机器人 Unlock robot') : t('锁定机器人 Lock robot')}</Text></View>
            <Text className='strategy-help'>{t('选择工具中可拖动机器人或平移空白处；滚轮、双指或按钮缩放。 In Select, drag robots or pan empty field; use scroll, pinch, or buttons to zoom.')}</Text>
            <Text className='strategy-coordinate'>{t('中心坐标 Center: {x}, {y} in', { x: selected.x.toFixed(1), y: selected.y.toFixed(1) })}</Text>
          </View>
        </View>
        <StrategyTimelinePanel phase={phase} robots={robots} routes={routes} selectedId={selectedId}
          selectedWaypointId={selectedWaypointId} onSelectWaypoint={(id, waypointId) => { setSelectedId(id); setSelectedWaypointId(waypointId) }}
          time={time} duration={duration} playing={playing} speed={speed} warningsEnabled={warningsEnabled}
          warnings={timelineWarnings} currentWarnings={currentWarnings}
          onPlay={startPlayback} onPause={() => setPlaying(false)} onRestart={restartPlayback} onScrub={scrub}
          onSpeed={setSpeed} onToggleWarnings={() => setWarningsEnabled((value) => !value)}
          onAdd={addSelectedWaypoint} onChange={editWaypoint} onReorder={moveWaypointOrder} onRemove={deleteWaypoint} />
        <StrategyRoomPanel record={activeRecord} room={room} currentUserId={userId} />
        <StrategyScoutingPanel details={strategyDetails} robots={robots} selectedId={selectedId} />
        <StrategyScenarioPanel board={board} timeline={timeline} details={strategyDetails}
          onDetailsChange={setStrategyDetails} onTeamChange={setAllianceTeam} onReplaceScenario={replaceScenario}
          onCurrentChange={setActiveRecord} liveRecord={activeRecord} roomPending={room.pending} />
      </View>
    </View>
  )
}
