import { afterEach, expect, it } from 'vitest'
import {
  ACCESS_TOKEN_KEY,
  captureAuthSession,
  getAccessToken,
  isCurrentAuthSession,
  readAuthSession,
  setAuthSession,
  updateSessionActivity,
} from '@/utils/auth'
import { withAuthLock } from '@/utils/authLock'
import { sessionCredentials } from '../support/auth'

afterEach(() => localStorage.clear())
it('requires a new login for a legacy bare token without refresh metadata', () => {
  localStorage.setItem(ACCESS_TOKEN_KEY, 'legacy-jwt')
  expect(getAccessToken()).toBeNull()
  expect(readAuthSession()).toBeNull()
  expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull()
})
it('accepts a zero proactive refresh window', () => {
  setAuthSession(sessionCredentials('token', { refreshBeforeSeconds: 0 }))
  expect(readAuthSession()?.refreshBeforeSeconds).toBe(0)
})
it('merges a delayed activity acknowledgement into the latest credential under the same lock', async () => {
  setAuthSession(sessionCredentials('original', { sessionId: 'same-login' }))
  const original = captureAuthSession()
  const deadline = readAuthSession()!.idleExpiresAt + 120
  await withAuthLock(async () => {
    setAuthSession(
      sessionCredentials('renewed', { sessionId: 'same-login', credentialGeneration: 2 }),
      original,
    )
  })
  await withAuthLock(async () =>
    updateSessionActivity(original, {
      idleExpiresAt: deadline,
      sessionExpiresAt: readAuthSession()!.sessionExpiresAt,
    }),
  )
  expect(getAccessToken()).toBe('renewed')
  expect(readAuthSession()?.credentialGeneration).toBe(2)
  expect(readAuthSession()?.idleExpiresAt).toBe(deadline)
  expect(isCurrentAuthSession(original)).toBe(true)
})
