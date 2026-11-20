import { FIELD_IN, FieldRobot, initialRobots, clamp } from './fieldGeometry'

export type StrategyPhase = 'auto' | 'teleop'
export type AnnotationTool = 'select' | 'pen' | 'line' | 'arrow' | 'curve' | 'eraser' | 'text'
export type DrawingKind = Exclude<AnnotationTool, 'select' | 'eraser'>
export interface FieldPoint { x: number; y: number }
export interface Annotation {
  id: string
  kind: DrawingKind
  color: string
  points: FieldPoint[]
  text?: string
}
export interface PhasePlan { robots: FieldRobot[]; annotations: Annotation[] }
export interface StrategyBoard { auto: PhasePlan; teleop: PhasePlan }

export const createStrategyBoard = (): StrategyBoard => ({
  auto: { robots: initialRobots(), annotations: [] },
  teleop: { robots: initialRobots(), annotations: [] }
})
export const clampPoint = (point: FieldPoint): FieldPoint => ({
  x: clamp(point.x, 0, FIELD_IN), y: clamp(point.y, 0, FIELD_IN)
})
export const translated = (annotation: Annotation, dx: number, dy: number): Annotation => {
  if (!annotation.points.length) return annotation
  const xs = annotation.points.map((point) => point.x)
  const ys = annotation.points.map((point) => point.y)
  const allowedX = clamp(dx, -Math.min(...xs), FIELD_IN - Math.max(...xs))
  const allowedY = clamp(dy, -Math.min(...ys), FIELD_IN - Math.max(...ys))
  return { ...annotation, points: annotation.points.map((point) => ({
    x: point.x + allowedX, y: point.y + allowedY
  })) }
}
export const withPoint = (annotation: Annotation, index: number, point: FieldPoint): Annotation => ({
  ...annotation,
  points: annotation.points.map((current, i) => i === index ? clampPoint(point) : current)
})
export const curvePoints = (start: FieldPoint, end: FieldPoint): FieldPoint[] => [
  start,
  clampPoint({ x: (start.x + end.x) / 2 - (end.y - start.y) * 0.22,
    y: (start.y + end.y) / 2 + (end.x - start.x) * 0.22 }),
  end
]
export const distanceToSegment = (point: FieldPoint, start: FieldPoint, end: FieldPoint): number => {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length2 = dx * dx + dy * dy
  const fraction = length2 ? clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / length2, 0, 1) : 0
  return Math.hypot(point.x - start.x - fraction * dx, point.y - start.y - fraction * dy)
}
export const sampledPoints = (annotation: Annotation): FieldPoint[] => {
  if (annotation.kind !== 'curve' || annotation.points.length < 3) return annotation.points
  const [start, control, end] = annotation.points
  return Array.from({ length: 21 }, (_, i) => {
    const t = i / 20
    const a = (1 - t) ** 2
    const b = 2 * (1 - t) * t
    const c = t ** 2
    return { x: a * start.x + b * control.x + c * end.x,
      y: a * start.y + b * control.y + c * end.y }
  })
}
export const hitAnnotation = (annotation: Annotation, point: FieldPoint, tolerance: number): boolean => {
  if (annotation.kind === 'text') {
    const anchor = annotation.points[0]
    if (!anchor) return false
    const width = Math.min(80, Math.max(8, (annotation.text?.length ?? 0) * 2.5))
    return point.x >= anchor.x - tolerance && point.x <= anchor.x + width + tolerance &&
      point.y >= anchor.y - 4 - tolerance && point.y <= anchor.y + tolerance
  }
  const points = sampledPoints(annotation)
  return points.some((current, index) => index > 0 && distanceToSegment(point, points[index - 1], current) <= tolerance)
}
export const topAnnotationAt = (annotations: Annotation[], point: FieldPoint, tolerance: number) =>
  [...annotations].reverse().find((annotation) => hitAnnotation(annotation, point, tolerance))

// Drawing coordinates stay in inches. The canvas receives one uniform pixel/inch scale.
export function renderAnnotations(ctx: any, annotations: Annotation[], selectedId: string | null,
  draft: Annotation | null, boardPixels: number) {
  const scale = boardPixels / FIELD_IN
  ctx.clearRect(0, 0, boardPixels, boardPixels)
  const drawOne = (annotation: Annotation, selected: boolean) => {
    const points = annotation.points
    if (!points.length) return
    const toX = (point: FieldPoint) => point.x * scale
    const toY = (point: FieldPoint) => point.y * scale
    ctx.setStrokeStyle(annotation.color)
    ctx.setFillStyle(annotation.color)
    ctx.setLineWidth(selected ? 4 : 3)
    ctx.setLineCap?.('round')
    ctx.setLineJoin?.('round')
    if (annotation.kind === 'text') {
      ctx.setFontSize?.(14)
      ctx.fillText(annotation.text || 'Text', toX(points[0]), toY(points[0]))
    } else if (points.length > 1) {
      ctx.beginPath()
      ctx.moveTo(toX(points[0]), toY(points[0]))
      if (annotation.kind === 'curve' && points.length >= 3) {
        ctx.quadraticCurveTo(toX(points[1]), toY(points[1]), toX(points[2]), toY(points[2]))
      } else {
        points.slice(1).forEach((point) => ctx.lineTo(toX(point), toY(point)))
      }
      ctx.stroke()
      if (annotation.kind === 'arrow') {
        const end = points[points.length - 1]
        const before = points[points.length - 2]
        const angle = Math.atan2(end.y - before.y, end.x - before.x)
        const size = 10
        ctx.beginPath()
        ctx.moveTo(toX(end), toY(end))
        ctx.lineTo(toX(end) - size * Math.cos(angle - Math.PI / 6), toY(end) - size * Math.sin(angle - Math.PI / 6))
        ctx.moveTo(toX(end), toY(end))
        ctx.lineTo(toX(end) - size * Math.cos(angle + Math.PI / 6), toY(end) - size * Math.sin(angle + Math.PI / 6))
        ctx.stroke()
      }
    }
    if (selected) {
      const handles = annotation.kind === 'pen' ? [points[0], points[points.length - 1]] : points
      handles.forEach((point) => {
        ctx.beginPath()
        ctx.setFillStyle('#ffffff')
        ctx.setStrokeStyle(annotation.color)
        ctx.setLineWidth(2)
        ctx.arc(toX(point), toY(point), 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      })
    }
  }
  annotations.forEach((annotation) => drawOne(annotation, annotation.id === selectedId))
  if (draft) drawOne(draft, false)
  ctx.draw()
}
