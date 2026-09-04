import { shallowRef } from 'vue'
export const confirmation = shallowRef<{
  title: string
  message: string
  resolve: (value: boolean) => void
} | null>(null)
export function confirmAction(message: string, title: string): Promise<boolean> {
  if (confirmation.value) return Promise.resolve(false)
  return new Promise((resolve) => {
    confirmation.value = { title, message, resolve }
  })
}
export function finishConfirmation(value: boolean) {
  confirmation.value?.resolve(value)
  confirmation.value = null
}
