import { StrategyBoard, StrategyPhase } from './annotations'
import { StrategyDetails } from './strategyRecord'
import { StrategyTimeline, ROBOT_IDS } from './timeline'
import { FIELD_IN, TILE_IN, FRAME, HIVE_CENTERS, HIVE_CELL_CENTER_OFFSET_IN,
  HIVE_CELL_DEPTH_IN, HIVE_CELL_WIDTH_IN, FLOWERS, GARDENS, LOADING_ZONES } from './fieldGeometry'

type ExportInput = { board: StrategyBoard; timeline: StrategyTimeline;
  details: StrategyDetails; phase: StrategyPhase }
const SIZE = 1200
const EDGE = 110
const TOP = 140
const FIELD_PX = 980
const scale = FIELD_PX / FIELD_IN
const x = (value: number) => EDGE + value * scale
const y = (value: number) => TOP + value * scale

export function renderStrategyImage(input: ExportInput): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable')
  const { board, timeline, details, phase } = input
  const plan = board[phase]
  const routes = timeline[phase]
  ctx.fillStyle = '#f6f8fb'; ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.fillStyle = '#132238'; ctx.font = 'bold 30px sans-serif'
  ctx.fillText(details.name.trim() || 'BIOBUZZ Strategy', EDGE, 49)
  ctx.fillStyle = '#52677e'; ctx.font = '20px sans-serif'
  ctx.fillText(`${details.eventCode || 'BIOBUZZ'}${details.matchNumber ? ` · ${details.matchNumber}` : ''} · ${phase === 'auto' ? 'Autonomous / 自动阶段' : 'TeleOp / 手动阶段'}`, EDGE, 83)
  ctx.fillStyle = '#fff'; ctx.fillRect(EDGE, TOP, FIELD_PX, FIELD_PX)
  ctx.fillStyle = 'rgba(169,61,73,.045)'; ctx.fillRect(EDGE, TOP, FIELD_PX / 2, FIELD_PX)
  ctx.fillStyle = 'rgba(36,95,189,.045)'; ctx.fillRect(EDGE + FIELD_PX / 2, TOP, FIELD_PX / 2, FIELD_PX)
  ctx.strokeStyle = '#c7d0da'; ctx.lineWidth = 1
  for (let inch = TILE_IN; inch < FIELD_IN; inch += TILE_IN) {
    ctx.beginPath(); ctx.moveTo(x(inch), TOP); ctx.lineTo(x(inch), TOP + FIELD_PX); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(EDGE, y(inch)); ctx.lineTo(EDGE + FIELD_PX, y(inch)); ctx.stroke()
  }
  ctx.lineWidth = 4; ctx.strokeStyle = '#263b55'; ctx.strokeRect(EDGE, TOP, FIELD_PX, FIELD_PX)
  for (const zone of LOADING_ZONES) {
    ctx.fillStyle = zone.id === 'red' ? 'rgba(169,61,73,.19)' : 'rgba(36,95,189,.19)'
    ctx.fillRect(x(zone.x), y(zone.y), zone.width * scale, zone.height * scale)
    ctx.strokeStyle = zone.id === 'red' ? '#a93d49' : '#245fbd'; ctx.lineWidth = 2
    ctx.strokeRect(x(zone.x), y(zone.y), zone.width * scale, zone.height * scale)
  }
  for (const garden of GARDENS) {
    ctx.fillStyle = garden.id === 'red' ? '#a93d49' : '#245fbd'
    ctx.fillRect(x(garden.x), y(garden.y), garden.width * scale, garden.height * scale)
  }
  ctx.fillStyle = '#e4e8ed'; ctx.fillRect(x(FRAME.x), y(FRAME.y), FRAME.width * scale, FRAME.height * scale)
  ctx.strokeStyle = '#687381'; ctx.lineWidth = 4
  ctx.strokeRect(x(FRAME.x), y(FRAME.y), FRAME.width * scale, FRAME.height * scale)
  ctx.fillStyle = '#344354'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'
  ctx.fillText('HIVE FRAME / 蜂巢支架', x(72), y(72) + 5)
  for (const alliance of ['red', 'blue'] as const) for (const side of ['top', 'bottom'] as const) {
    const center = HIVE_CENTERS[alliance]
    const cy = center.y + (side === 'top' ? -HIVE_CELL_CENTER_OFFSET_IN : HIVE_CELL_CENTER_OFFSET_IN)
    const left = x(center.x - HIVE_CELL_WIDTH_IN / 2), right = x(center.x + HIVE_CELL_WIDTH_IN / 2)
    const upper = y(cy - HIVE_CELL_DEPTH_IN / 2), lower = y(cy + HIVE_CELL_DEPTH_IN / 2)
    const points = side === 'top' ? [[left, upper + 8], [x(center.x), upper], [right, upper + 8], [right, lower], [left, lower]] :
      [[left, upper], [right, upper], [right, lower - 8], [x(center.x), lower], [left, lower - 8]]
    ctx.beginPath(); points.forEach(([px, py], index) => index ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath()
    ctx.fillStyle = alliance === 'red' ? '#ad4651' : '#376cbb'; ctx.fill()
    ctx.strokeStyle = alliance === 'red' ? '#711f2b' : '#173e80'; ctx.lineWidth = 3; ctx.stroke()
  }
  for (const flower of FLOWERS) {
    ctx.beginPath(); ctx.arc(x(flower.x), y(flower.y), 11, 0, Math.PI * 2)
    ctx.fillStyle = '#dba940'; ctx.fill(); ctx.strokeStyle = '#6b5217'; ctx.lineWidth = 3; ctx.stroke()
    ctx.beginPath(); ctx.arc(x(flower.x), y(flower.y), 5, 0, Math.PI * 2)
    ctx.fillStyle = '#3f4851'; ctx.fill()
  }
  for (const id of ROBOT_IDS) {
    const robot = plan.robots.find((item) => item.id === id)
    if (!robot) continue
    const points = routes[id] ?? []
    if (points.length) {
      ctx.beginPath(); ctx.moveTo(x(robot.x), y(robot.y))
      points.forEach((point) => ctx.lineTo(x(point.x), y(point.y)))
      ctx.strokeStyle = robot.alliance === 'red' ? '#a93d49' : '#245fbd'
      ctx.lineWidth = 6; ctx.setLineDash([12, 7]); ctx.stroke(); ctx.setLineDash([])
      points.forEach((point, index) => {
        ctx.beginPath(); ctx.arc(x(point.x), y(point.y), 12, 0, Math.PI * 2)
        ctx.fillStyle = robot.alliance === 'red' ? '#a93d49' : '#245fbd'; ctx.fill()
        ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText(String(index + 1), x(point.x), y(point.y) + 5)
      })
    }
  }
  for (const annotation of plan.annotations) {
    const points = annotation.points
    if (!points.length) continue
    ctx.strokeStyle = annotation.color; ctx.fillStyle = annotation.color
    ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    if (annotation.kind === 'text') {
      ctx.font = 'bold 19px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(annotation.text || 'Text', x(points[0].x), y(points[0].y))
      continue
    }
    ctx.beginPath(); ctx.moveTo(x(points[0].x), y(points[0].y))
    if (annotation.kind === 'curve' && points.length >= 3) {
      ctx.quadraticCurveTo(x(points[1].x), y(points[1].y), x(points[2].x), y(points[2].y))
    } else points.slice(1).forEach((point) => ctx.lineTo(x(point.x), y(point.y)))
    ctx.stroke()
    if (annotation.kind === 'arrow' && points.length >= 2) {
      const last = points[points.length - 1], previous = points[points.length - 2]
      const angle = Math.atan2(last.y - previous.y, last.x - previous.x)
      ctx.beginPath(); ctx.moveTo(x(last.x), y(last.y))
      ctx.lineTo(x(last.x) - 20 * Math.cos(angle - Math.PI / 6), y(last.y) - 20 * Math.sin(angle - Math.PI / 6))
      ctx.moveTo(x(last.x), y(last.y))
      ctx.lineTo(x(last.x) - 20 * Math.cos(angle + Math.PI / 6), y(last.y) - 20 * Math.sin(angle + Math.PI / 6))
      ctx.stroke()
    }
  }
  for (const robot of plan.robots) {
    ctx.save(); ctx.translate(x(robot.x), y(robot.y)); ctx.rotate(robot.heading * Math.PI / 180)
    ctx.fillStyle = robot.alliance === 'red' ? '#b83f4d' : '#2864bb'
    ctx.strokeStyle = robot.alliance === 'red' ? '#73202c' : '#153c79'
    ctx.lineWidth = 4
    ctx.fillRect(-robot.width * scale / 2, -robot.length * scale / 2, robot.width * scale, robot.length * scale)
    ctx.strokeRect(-robot.width * scale / 2, -robot.length * scale / 2, robot.width * scale, robot.length * scale)
    ctx.beginPath(); ctx.moveTo(0, -robot.length * scale / 2 - 14)
    ctx.lineTo(-9, -robot.length * scale / 2 - 1); ctx.lineTo(9, -robot.length * scale / 2 - 1); ctx.closePath()
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(robot.number || robot.id.toUpperCase(), x(robot.x), y(robot.y) + 7)
  }
  ctx.fillStyle = '#52677e'; ctx.font = '16px sans-serif'; ctx.textAlign = 'left'
  ctx.fillText('RED / 红方', EDGE, SIZE - 26)
  ctx.textAlign = 'right'; ctx.fillText('BLUE / 蓝方', SIZE - EDGE, SIZE - 26)
  return canvas
}

export function downloadStrategyImage(input: ExportInput): void {
  const canvas = renderStrategyImage(input)
  const link = document.createElement('a')
  const name = (input.details.name || 'biobuzz-strategy').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 70)
  link.download = `${name}-${input.phase}.png`
  link.href = canvas.toDataURL('image/png')
  document.body.appendChild(link)
  link.click()
  link.remove()
}
