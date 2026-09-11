import { shallowRef } from 'vue'
import { captureAuthSession, isCurrentAuthSession } from '@/utils/auth'

export interface Confirmation {
  id: number
  title: string
  message: string
  warning?: string
  resolve: (value: boolean) => void
}
export const confirmation = shallowRef<Confirmation | null>(null)
let sequence = 0
export function confirmAction(message: string, title: string, warning?: string): Promise<boolean> {
  if (confirmation.value) return Promise.resolve(false)
  const session = captureAuthSession()
  return new Promise((resolve) => {
    confirmation.value = {
      id: ++sequence,
      title,
      message,
      warning,
      resolve: (value) => resolve(value && isCurrentAuthSession(session)),
    }
  })
}
export function finishConfirmation(value: boolean, expected = confirmation.value) {
  if (!expected || confirmation.value !== expected) return
  confirmation.value = null
  expected.resolve(value)
}
