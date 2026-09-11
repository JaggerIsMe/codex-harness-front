import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { renewAuthSession } from '@/utils/sessionRenewal'
import { withAuthLock } from '@/utils/authLock'
import {
  captureAuthSession,
  getAccessToken,
  isCurrentAuthSession,
  isCurrentCredential,
  readAuthSession,
  setAuthSession,
} from '@/utils/auth'
import { refreshSession } from '@/api/auth'
import { ApiError } from '@/api/request'
import { sessionCredentials } from '../support/auth'
import type { ApiResponse, SessionCredentials } from '@/types/domain'

const { replace, route } = vi.hoisted(() => ({
  replace: vi.fn(),
  route: {
    name: 'projects',
    fullPath: '/projects',
    meta: { publicFlow: false },
  },
}))
vi.mock('@/router/index.js', () => ({
  default: { currentRoute: { value: route }, replace },
}))
vi.mock('@/api/auth', () => ({ refreshSession: vi.fn() }))
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn() } }))
const envelope = (data: SessionCredentials): ApiResponse<SessionCredentials> => ({
  status: 'success',
  code: 200,
  info: '',
  data,
})
function renewed(generation = 2) {
  return sessionCredentials(`token-${generation}`, {
    sessionId: 'sid-current',
    credentialGeneration: generation,
  })
}
beforeEach(() => {
  vi.resetAllMocks()
  route.meta.publicFlow = false
  setAuthSession(
    sessionCredentials('token-1', {
      sessionId: 'sid-current',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    }),
  )
})
afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

it('shares one refresh and preserves the login identity while rotating its credential', async () => {
  vi.mocked(refreshSession).mockResolvedValueOnce(envelope(renewed()))
  const source = captureAuthSession()
  await Promise.all([renewAuthSession(source), renewAuthSession(source), renewAuthSession(source)])
  expect(refreshSession).toHaveBeenCalledTimes(1)
  expect(getAccessToken()).toBe('token-2')
  expect(isCurrentAuthSession(source)).toBe(true)
  expect(isCurrentCredential(source)).toBe(false)
  await renewAuthSession(source, true)
  expect(refreshSession).toHaveBeenCalledTimes(1)
})

it('does not restore an old login from a late refresh response', async () => {
  let complete!: (response: ApiResponse<SessionCredentials>) => void
  vi.mocked(refreshSession).mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve
    }),
  )
  const pending = renewAuthSession()
  const rejected = expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' })
  await vi.waitFor(() => expect(refreshSession).toHaveBeenCalledOnce())
  setAuthSession(sessionCredentials('another-login'))
  complete(envelope(renewed()))
  await rejected
  expect(getAccessToken()).toBe('another-login')
})

it('retries a rotation conflict once and never rolls credentials backward', async () => {
  vi.mocked(refreshSession)
    .mockRejectedValueOnce(new ApiError('Refresh conflict', 40922))
    .mockResolvedValueOnce(envelope(renewed()))
  await renewAuthSession()
  expect(refreshSession).toHaveBeenCalledTimes(2)
  const source = captureAuthSession()
  expect(setAuthSession(renewed(1), source)).toBe(false)
  expect(readAuthSession()?.credentialGeneration).toBe(2)
})

it('bounds repeated refresh conflicts without deleting a still recoverable session', async () => {
  vi.mocked(refreshSession).mockRejectedValue(new ApiError('Refresh conflict', 40922))
  await expect(renewAuthSession()).rejects.toMatchObject({ code: 40922 })
  expect(refreshSession).toHaveBeenCalledTimes(2)
  expect(getAccessToken()).toBe('token-1')
  expect(replace).not.toHaveBeenCalled()
})

it('preserves credentials on Redis outages and ends a server-revoked session', async () => {
  vi.mocked(refreshSession)
    .mockRejectedValueOnce(new ApiError('Unavailable', 50322))
    .mockRejectedValueOnce(new ApiError('Replaced', 40121))
  await expect(renewAuthSession()).rejects.toMatchObject({ code: 50322 })
  expect(getAccessToken()).toBe('token-1')
  await expect(renewAuthSession()).rejects.toMatchObject({ code: 40121 })
  expect(getAccessToken()).toBeNull()
  expect(replace).toHaveBeenCalledOnce()
})

it('lets the server verify apparent local idle expiry instead of trusting the client clock', async () => {
  localStorage.clear()
  setAuthSession(
    sessionCredentials('token-1', {
      sessionId: 'sid-current',
      idleExpiresAt: Math.floor(Date.now() / 1000) - 30,
    }),
  )
  vi.mocked(refreshSession).mockResolvedValueOnce(envelope(renewed()))
  await renewAuthSession(captureAuthSession(), true)
  expect(getAccessToken()).toBe('token-2')
  expect(replace).not.toHaveBeenCalled()
})

it('blocks credential mutations when Web Locks are unavailable', async () => {
  vi.stubGlobal('navigator', { locks: undefined })
  const mutation = vi.fn(async () => setAuthSession(sessionCredentials('unsafe')))
  await expect(withAuthLock(mutation)).rejects.toThrow('HTTPS 或 localhost')
  await expect(renewAuthSession()).rejects.toThrow('HTTPS 或 localhost')
  expect(mutation).not.toHaveBeenCalled()
  expect(refreshSession).not.toHaveBeenCalled()
  expect(getAccessToken()).toBe('token-1')
})

it('clears a revoked session without navigating away from a newly opened public account flow', async () => {
  let fail!: (error: ApiError) => void
  vi.mocked(refreshSession).mockReturnValueOnce(
    new Promise((_, reject) => {
      fail = reject
    }),
  )
  const pending = renewAuthSession()
  const rejected = expect(pending).rejects.toMatchObject({ code: 401 })
  await vi.waitFor(() => expect(refreshSession).toHaveBeenCalledOnce())
  route.meta.publicFlow = true
  fail(new ApiError('Expired', 401))
  await rejected
  expect(getAccessToken()).toBeNull()
  expect(replace).not.toHaveBeenCalled()
})

it('skips early rotation when the access token already reaches the absolute login limit', async () => {
  localStorage.clear()
  const deadline = Math.floor(Date.now() / 1000) + 30
  setAuthSession(
    sessionCredentials('last-credential', {
      expiresAt: deadline,
      sessionExpiresAt: deadline,
      idleExpiresAt: deadline,
    }),
  )
  await renewAuthSession()
  expect(refreshSession).not.toHaveBeenCalled()
  vi.mocked(refreshSession).mockRejectedValueOnce(new ApiError('Absolute expiry', 401))
  await expect(renewAuthSession(captureAuthSession(), true)).rejects.toMatchObject({ code: 401 })
  expect(refreshSession).toHaveBeenCalledOnce()
  expect(getAccessToken()).toBeNull()
})
