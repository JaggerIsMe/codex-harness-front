import { CanceledError } from 'axios'
import { refreshSession } from '@/api/auth'
import { ApiError } from '@/api/request'
import {
  captureAuthSession,
  isCurrentAuthSession,
  isCurrentCredential,
  readAuthSession,
  setAuthSession,
  type AuthSession,
} from './auth'
import { invalidateAuthSessionLocked } from './authSession'
import { withAuthLock } from './authLock'

const refreshing = new Map<string, Promise<void>>()
export function renewAuthSession(
  expected: AuthSession = captureAuthSession(),
  force = false,
): Promise<void> {
  if (!expected.sessionId) return Promise.reject(new CanceledError('登录已结束'))
  const pending = refreshing.get(expected.sessionId)
  if (pending) return pending
  const operation = withAuthLock(async () => {
    if (!isCurrentAuthSession(expected)) throw new CanceledError('登录状态已更新')
    let current = readAuthSession()!
    const now = Date.now() / 1000
    if (
      current.credentialGeneration > expected.credentialGeneration ||
      (!force &&
        (current.expiresAt >= current.sessionExpiresAt ||
          now < current.expiresAt - current.refreshBeforeSeconds))
    )
      return
    const source = captureAuthSession()
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await refreshSession(source.sessionId!)
        if (!isCurrentAuthSession(source)) throw new CanceledError('登录状态已更新')
        if (result.data.sessionId !== source.sessionId)
          throw new ApiError('续期返回了不匹配的登录，请重新登录', 401)
        setAuthSession(result.data, source)
        current = readAuthSession()!
        if (current.credentialGeneration <= source.credentialGeneration)
          throw new ApiError('登录续期未完成，请重试', 40922)
        return
      } catch (error) {
        if (!isCurrentAuthSession(source)) throw new CanceledError('登录状态已更新')
        if (!isCurrentCredential(source)) return
        if (error instanceof ApiError && error.code === 40922 && attempt === 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 200))
          if (!isCurrentAuthSession(source)) throw new CanceledError('登录状态已更新')
          if (!isCurrentCredential(source)) return
          continue
        }
        if (error instanceof ApiError && [401, 40121].includes(error.code || 0))
          invalidateAuthSessionLocked(
            source,
            error.code === 40121 ? 'session-replaced' : 'session-expired',
          )
        throw error
      }
    }
  }).finally(() => {
    if (refreshing.get(expected.sessionId!) === operation) refreshing.delete(expected.sessionId!)
  })
  refreshing.set(expected.sessionId, operation)
  return operation
}
