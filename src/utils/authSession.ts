import router from '@/router/index.js'
import { removeAccessToken, isCurrentCredential, type AuthSession } from './auth'
import { withAuthLock } from './authLock'

export type SessionEndReason = 'session-replaced' | 'session-expired'

export function sessionEndMessage(reason: unknown): string | null {
  if (reason === 'session-replaced') return '账号已在其他位置登录，请重新登录。'
  if (reason === 'session-expired') return '登录已失效，请重新登录。'
  return null
}

/** Ignore failures from an earlier login, including duplicate invalidation signals. */
export function invalidateAuthSession(
  session: AuthSession,
  reason: SessionEndReason,
): Promise<boolean> {
  return withAuthLock(
    async () => isCurrentCredential(session) && invalidateAuthSessionLocked(session, reason),
  )
}
/** Caller already owns the cross-tab authentication lock. */
export function invalidateAuthSessionLocked(
  session: AuthSession,
  reason: SessionEndReason,
): boolean {
  if (!session.token || !removeAccessToken(session)) return false
  window.dispatchEvent(new Event('harness:unauthorized'))
  // A protected request may finish after the user enters activation or account recovery.
  if (router.currentRoute.value.meta?.publicFlow) return true
  void router.replace({
    name: 'login',
    query: {
      ...(router.currentRoute.value.name === 'login'
        ? {}
        : { redirect: router.currentRoute.value.fullPath }),
      reason,
    },
  })
  return true
}
