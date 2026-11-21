import { useEffect, useRef, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import AppHeader from '../../components/AppHeader'
import { useAuth } from '../../auth/AuthContext'
import { useLanguage } from '../../i18n/LanguageContext'
import {
  TILE_IN, FRAME, FLOWERS, GARDENS, HIVE_CENTERS,
  HIVE_CELL_CENTER_OFFSET_IN, HIVE_CELL_DEPTH_IN, HIVE_CELL_WIDTH_IN,
  LOADING_ZONES, FieldRobot, clampRobotToField,
  fieldPercent, initialRobots, screenDeltaToInches
} from '../../strategy/fieldGeometry'
import { readWorkspace } from '../../strategy/offlineStrategy'
import './index.scss'

type Point = { x: number; y: number }
type Drag = { robot: FieldRobot; start: Point }
type Alliance = 'red' | 'blue'
type HiveFlipped = Record<Alliance, boolean>
const storageKey = (userId: string) => `strategy-simple-robots:${userId}`
const hiveStorageKey = (userId: string) => `strategy-simple-hives:${userId}`
const pointer = (event: any): Point | null => {
  const point = event.touches?.[0] ?? event.changedTouches?.[0] ?? event
  return typeof point?.clientX === 'number' ? { x: point.clientX, y: point.clientY } : null
}
const rectStyle = (x: number, y: number, width: number, height: number) => ({
  left: fieldPercent(x), top: fieldPercent(y), width: fieldPercent(width), height: fieldPercent(height)
})
const restoredRobots = (value: unknown): FieldRobot[] | null => {
  if (!Array.isArray(value) || value.length !== 4) return null
  const defaults = initialRobots()
  if (!defaults.every((robot) => value.some((item) => item?.id === robot.id &&
    Number.isFinite(item.x) && Number.isFinite(item.y)))) return null
  return defaults.map((robot) => {
    const saved = value.find((item) => item.id === robot.id)
    return clampRobotToField({ ...robot, x: saved.x, y: saved.y, number: saved.number || robot.number })
  })
}

// The full planning interface is retained in StrategyFull.tsx for future recovery.
export default function StrategySandbox() {
  const { t } = useLanguage()
  const { userId } = useAuth()
  const [robots, setRobots] = useState<FieldRobot[]>(initialRobots)
  const [hiveFlipped, setHiveFlipped] = useState<HiveFlipped>({ red: false, blue: false })
  const robotsRef = useRef(robots)
  robotsRef.current = robots
  const [viewport, setViewport] = useState({ width: 360, height: 400 })
  const drag = useRef<Drag | null>(null)
  const boardSize = Math.max(1, Math.min(viewport.width - 24, viewport.height - 24, 720))

  useEffect(() => {
    if (!userId) return
    try {
      const saved = restoredRobots(Taro.getStorageSync(storageKey(userId)))
      const earlier = restoredRobots(readWorkspace(userId)?.snapshot.board.auto.robots)
      const next = saved ?? earlier ?? initialRobots()
      robotsRef.current = next
      setRobots(next)
      const savedHives = Taro.getStorageSync(hiveStorageKey(userId))
      setHiveFlipped({ red: savedHives?.red === true, blue: savedHives?.blue === true })
    } catch {
      const next = initialRobots()
      robotsRef.current = next
      setRobots(next)
      setHiveFlipped({ red: false, blue: false })
    }
  }, [userId])

  useEffect(() => {
    const measure = () => Taro.createSelectorQuery().select('#strategy-viewport')
      .boundingClientRect((box: any) => {
        if (box?.width && box?.height) setViewport({ width: box.width, height: box.height })
      }).exec()
    measure()
    Taro.onWindowResize?.(measure)
    return () => Taro.offWindowResize?.(measure)
  }, [])

  const begin = (event: any, robot: FieldRobot) => {
    const start = pointer(event)
    if (!start) return
    event.stopPropagation?.()
    drag.current = { robot, start }
  }
  const move = (event: any) => {
    const active = drag.current
    const point = pointer(event)
    if (!active || !point) return
    event.preventDefault?.()
    const dx = screenDeltaToInches(point.x - active.start.x, boardSize, 1)
    const dy = screenDeltaToInches(point.y - active.start.y, boardSize, 1)
    const next = robotsRef.current.map((robot) => robot.id === active.robot.id
      ? clampRobotToField({ ...robot, x: active.robot.x + dx, y: active.robot.y + dy }) : robot)
    robotsRef.current = next
    setRobots(next)
  }
  const end = () => {
    if (!drag.current) return
    drag.current = null
    if (userId) {
      try { Taro.setStorageSync(storageKey(userId), robotsRef.current) } catch { /* Dragging still works without local storage. */ }
    }
  }
  const toggleHive = (alliance: Alliance) => {
    const next = { ...hiveFlipped, [alliance]: !hiveFlipped[alliance] }
    setHiveFlipped(next)
    if (userId) {
      try { Taro.setStorageSync(hiveStorageKey(userId), next) } catch { /* The toggle still works for this session. */ }
    }
  }

  return (
    <View className='strategy-page strategy-simple'>
      <AppHeader title={t('策略沙盘 Strategy Sandbox')} showBack />
      <View className='page-content strategy-content'>
        <View className='strategy-main'>
          <View id='strategy-viewport' className='strategy-viewport'
            onTouchMove={move} onTouchEnd={end} onTouchCancel={end}
            {...({ onMouseMove: move, onMouseUp: end, onMouseLeave: end } as any)}>
            <View className='strategy-field' style={{
              width: `${boardSize}px`, height: `${boardSize}px`, transform: 'translate(-50%, -50%)'
            }}>
              <View className='strategy-half strategy-half-red' />
              <View className='strategy-half strategy-half-blue' />
              {Array.from({ length: 5 }, (_, i) => <View key={`v${i}`} className='strategy-tile-line strategy-tile-line-v'
                style={{ left: fieldPercent((i + 1) * TILE_IN) }} />)}
              {Array.from({ length: 5 }, (_, i) => <View key={`h${i}`} className='strategy-tile-line strategy-tile-line-h'
                style={{ top: fieldPercent((i + 1) * TILE_IN) }} />)}
              {LOADING_ZONES.map((zone) => <View key={zone.id} className={`strategy-zone strategy-zone-${zone.id}`}
                style={rectStyle(zone.x, zone.y, zone.width, zone.height)} />)}
              {GARDENS.map((zone) => <View key={zone.id} className={`strategy-garden strategy-garden-${zone.id}`}
                style={rectStyle(zone.x, zone.y, zone.width, zone.height)} />)}
              <View className='strategy-frame' style={rectStyle(FRAME.x, FRAME.y, FRAME.width, FRAME.height)}>
                <Text className='strategy-frame-label'>{t('蜂巢支架 Hive frame')}</Text>
              </View>
              {(['red', 'blue'] as const).flatMap((alliance) => (['top', 'bottom'] as const).map((side) => {
                const center = HIVE_CENTERS[alliance]
                const y = center.y + (side === 'top' ? -HIVE_CELL_CENTER_OFFSET_IN : HIVE_CELL_CENTER_OFFSET_IN)
                const defaultUp = (alliance === 'red' && side === 'bottom') || (alliance === 'blue' && side === 'top')
                const up = hiveFlipped[alliance] ? !defaultUp : defaultUp
                return <View key={`${alliance}-${side}`} role='button' tabIndex={0}
                  aria-label={t(alliance === 'red' ? '切换红方蜂巢方向 Toggle red hive direction' : '切换蓝方蜂巢方向 Toggle blue hive direction')}
                  onClick={() => toggleHive(alliance)}
                  {...({ onKeyDown: (event: any) => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault?.(); toggleHive(alliance) }
                  } } as any)}
                  className={`strategy-cell strategy-cell-${alliance} ${up ? 'strategy-cell-up' : 'strategy-cell-bottom'}`}
                  style={{ left: fieldPercent(center.x), top: fieldPercent(y),
                    width: fieldPercent(HIVE_CELL_WIDTH_IN), height: fieldPercent(HIVE_CELL_DEPTH_IN) }}>
                  <Text className='strategy-cell-label'>{up ? t('朝上 UP') : t('朝下 DOWN')}</Text>
                </View>
              }))}
              {FLOWERS.map((flower) => <View key={flower.id} className={`strategy-flower strategy-flower-${flower.id}`}
                style={{ left: fieldPercent(flower.x), top: fieldPercent(flower.y) }}><View className='strategy-flower-ring' /></View>)}
              {robots.map((robot) => <View key={robot.id} role='button'
                aria-label={t('拖动机器人 Drag robot') + ` ${robot.number || robot.id.toUpperCase()}`}
                className={`strategy-robot strategy-robot-${robot.alliance}`}
                style={{ left: fieldPercent(robot.x), top: fieldPercent(robot.y),
                  width: fieldPercent(robot.width), height: fieldPercent(robot.length),
                  transform: 'translate(-50%, -50%)' }}
                onTouchStart={(event) => begin(event, robot)}
                {...({ onMouseDown: (event: any) => begin(event, robot) } as any)}>
                <Text className='strategy-robot-number'>
                  {robot.number || robot.id.toUpperCase()}
                </Text>
              </View>)}
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}
