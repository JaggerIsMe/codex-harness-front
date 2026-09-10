import { onScopeDispose, ref } from 'vue'
import axios from 'axios'
import { ApiError } from '@/api/request'

export function useEmailRequest() {
  const busy = ref(false)
  const error = ref('')
  const errorCode = ref<number>()
  const remaining = ref(0)
  let active: AbortController | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  function clearCooldown() {
    if (timer) clearInterval(timer)
    timer = undefined
    remaining.value = 0
  }
  function startCooldown(seconds: number) {
    clearCooldown()
    if (!Number.isFinite(seconds) || seconds <= 0) return
    const deadline = Date.now() + Math.ceil(seconds) * 1000
    remaining.value = Math.ceil(seconds)
    timer = setInterval(() => {
      remaining.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      if (!remaining.value) clearCooldown()
    }, 1000)
  }
  function cancel() {
    active?.abort()
    active = undefined
    busy.value = false
    error.value = ''
    errorCode.value = undefined
  }
  async function run<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
    if (busy.value) return undefined
    const controller = new AbortController()
    active = controller
    busy.value = true
    error.value = ''
    errorCode.value = undefined
    try {
      const result = await operation(controller.signal)
      return controller.signal.aborted ? undefined : result
    } catch (cause) {
      if (controller.signal.aborted || axios.isCancel(cause)) return undefined
      error.value = cause instanceof Error ? cause.message : '请求失败，请稍后重试'
      if (cause instanceof ApiError) {
        errorCode.value = cause.code
        if (cause.retryAfterSeconds) startCooldown(cause.retryAfterSeconds)
      }
      return undefined
    } finally {
      if (active === controller) {
        active = undefined
        busy.value = false
      }
    }
  }
  onScopeDispose(() => {
    cancel()
    clearCooldown()
  })
  return { busy, error, errorCode, remaining, run, cancel, startCooldown, clearCooldown }
}
