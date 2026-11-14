import { useEffect, useRef } from 'react'
import { Button, Text, View } from '@tarojs/components'
import './index.scss'

type ConfirmDialogProps = {
  title: string
  description: string
  cancelText: string
  confirmText: string
  onCancel: () => void
  onConfirm: () => void
}

export default function ConfirmDialog({
  title,
  description,
  cancelText,
  confirmText,
  onCancel,
  onConfirm
}: ConfirmDialogProps) {
  const panelRef = useRef<any>(null)
  const cancelRef = useRef<any>(null)

  useEffect(() => {
    if (typeof document === 'undefined') return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusTimer = setTimeout(() => cancelRef.current?.focus?.(), 0)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }
      if (event.key !== 'Tab') return

      const controls = panelRef.current?.querySelectorAll?.('button') as NodeListOf<HTMLButtonElement> | undefined
      if (!controls?.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
      previouslyFocused?.focus?.()
    }
  }, [onCancel])

  return (
    <View className='confirm-dialog-backdrop'>
      <View
        ref={panelRef}
        className='confirm-dialog-panel'
        role='dialog'
        aria-modal='true'
        aria-labelledby='match-submit-confirm-title'
        aria-describedby='match-submit-confirm-description'
      >
        <Text id='match-submit-confirm-title' className='confirm-dialog-title'>{title}</Text>
        <Text id='match-submit-confirm-description' className='confirm-dialog-description'>{description}</Text>
        <View className='confirm-dialog-actions'>
          <Button ref={cancelRef} className='confirm-dialog-button confirm-dialog-cancel' onClick={onCancel}>
            {cancelText}
          </Button>
          <Button className='confirm-dialog-button confirm-dialog-confirm' onClick={onConfirm}>
            {confirmText}
          </Button>
        </View>
      </View>
    </View>
  )
}
