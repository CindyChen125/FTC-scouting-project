import { useEffect, useRef } from 'react'
import { View } from '@tarojs/components'
import './index.scss'

interface RangeSliderProps {
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}

export default function RangeSlider({ min, max, step, value, onChange }: RangeSliderProps) {
  const trackRef = useRef<HTMLElement | null>(null)
  const draggingRef = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const valueFromClientX = (clientX: number) => {
      const rect = track.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      const raw = min + ratio * (max - min)
      const stepped = Math.round((raw - min) / step) * step + min
      return Math.min(max, Math.max(min, stepped))
    }

    const handleMove = (clientX: number) => onChangeRef.current(valueFromClientX(clientX))

    const onMouseDown = (e: MouseEvent) => {
      draggingRef.current = true
      handleMove(e.clientX)
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      handleMove(e.clientX)
    }
    const onMouseUp = () => {
      draggingRef.current = false
    }
    const onTouchStart = (e: TouchEvent) => {
      draggingRef.current = true
      handleMove(e.touches[0].clientX)
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!draggingRef.current) return
      e.preventDefault()
      handleMove(e.touches[0].clientX)
    }
    const onTouchEnd = () => {
      draggingRef.current = false
    }

    track.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    track.addEventListener('touchstart', onTouchStart, { passive: true })
    track.addEventListener('touchmove', onTouchMove, { passive: false })
    track.addEventListener('touchend', onTouchEnd)

    return () => {
      track.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      track.removeEventListener('touchstart', onTouchStart)
      track.removeEventListener('touchmove', onTouchMove)
      track.removeEventListener('touchend', onTouchEnd)
    }
  }, [min, max, step])

  const percent = ((value - min) / (max - min)) * 100

  return (
    <View className='range-slider' ref={trackRef as any}>
      <View className='range-slider-fill' style={{ width: `${percent}%` }} />
      <View className='range-slider-thumb' style={{ left: `${percent}%` }} />
    </View>
  )
}
