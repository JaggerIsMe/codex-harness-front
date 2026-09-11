import { onScopeDispose, watch } from 'vue'
import { useRoute } from 'vue-router'
import { recordSessionActivity } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import {
  AUTH_SESSION_KEY,
  CREDENTIALS_CHANGED,
  captureAuthSession,
  readAuthSession,
  updateSessionActivity,
} from '@/utils/auth'
import { supportsAuthLock, withAuthLock } from '@/utils/authLock'
import { renewAuthSession } from '@/utils/sessionRenewal'
import { startSessionActivity, getLastSessionActivity } from '@/utils/sessionActivity'

export function useSessionLifecycle() {
  const auth = useAuthStore()
  const route = useRoute()
  let stopped = false
  let timer: number | null = null
  let checking = false
  const isProtectedPage = () =>
    !route.meta.publicFlow && route.matched.some((record) => record.meta.requiresAuth)
  const stopActivity = startSessionActivity({
    getSession: () =>
      auth.signingOut || !supportsAuthLock() || !isProtectedPage() ? null : readAuthSession(),
    sendActivity: async () => {
      const source = captureAuthSession()
      const result = await recordSessionActivity(source)
      await withAuthLock(async () => updateSessionActivity(source, result.data))
    },
  })
  async function check() {
    if (stopped || checking) return
    if (timer) window.clearTimeout(timer)
    timer = null
    checking = true
    try {
      const session = readAuthSession()
      if (!session || auth.signingOut || !supportsAuthLock() || !isProtectedPage()) return
      const seconds = Date.now() / 1000
      const needsVerification = seconds >= Math.min(session.idleExpiresAt, session.sessionExpiresAt)
      if (
        needsVerification ||
        (document.visibilityState === 'visible' &&
          session.expiresAt < session.sessionExpiresAt &&
          getLastSessionActivity(session.sessionId) >= Date.now() - 60000 &&
          seconds >= session.expiresAt - session.refreshBeforeSeconds)
      )
        await renewAuthSession(captureAuthSession(), needsVerification)
    } catch {
      /* Requests and explicit actions surface errors; temporary outages keep the session. */
    } finally {
      checking = false
      if (!stopped) {
        const current = readAuthSession()
        const now = Date.now()
        const deadlines = current
          ? [
              (current.expiresAt - current.refreshBeforeSeconds) * 1000,
              current.idleExpiresAt * 1000,
              current.sessionExpiresAt * 1000,
            ].filter((deadline) => deadline > now)
          : []
        const delay = Math.max(1000, Math.min(now + 60000, ...deadlines) - now)
        timer = window.setTimeout(check, delay)
      }
    }
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === AUTH_SESSION_KEY) void check()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(CREDENTIALS_CHANGED, check)
  window.addEventListener('harness:activity', check)
  window.addEventListener('focus', check)
  document.addEventListener('visibilitychange', check)
  watch(isProtectedPage, check)
  void check()
  onScopeDispose(() => {
    stopped = true
    if (timer) window.clearTimeout(timer)
    stopActivity()
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CREDENTIALS_CHANGED, check)
    window.removeEventListener('harness:activity', check)
    window.removeEventListener('focus', check)
    document.removeEventListener('visibilitychange', check)
  })
}
