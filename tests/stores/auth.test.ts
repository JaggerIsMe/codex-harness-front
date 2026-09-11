import { setAccessToken, sessionCredentials } from '../support/auth'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { useAuthStore } from '@/stores/auth'
import * as api from '@/api/auth'
import {
  AUTH_SESSION_KEY as ACCESS_TOKEN_KEY,
  getAccessToken,
  readAuthSession,
  setAuthSession,
  captureAuthSession,
} from '@/utils/auth'
import { confirmAction, confirmation, finishConfirmation } from '@/lib/confirm'
import type { ApiResponse, LoginResult, User } from '@/types/domain'

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('@/router/index.js', () => ({
  default: {
    currentRoute: { value: { name: 'projects', fullPath: '/projects', meta: {} } },
    replace,
  },
}))
vi.mock('@/api/auth', () => ({ getProfile: vi.fn(), login: vi.fn(), logout: vi.fn() }))

let pinia: ReturnType<typeof createPinia>
const firstUser: User = {
  id: 1,
  email: 'one@example.com',
  displayName: 'One',
  activated: true,
  mustChangePassword: false,
  roles: [],
  permissions: ['workspace:use'],
}
const secondUser: User = { ...firstUser, id: 2, email: 'two@example.com', displayName: 'Two' }
const envelope = <T>(data: T): ApiResponse<T> => ({ status: 'success', code: 200, info: '', data })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
function changedStorage(newValue: string | null) {
  window.dispatchEvent(
    new StorageEvent('storage', { key: ACCESS_TOKEN_KEY, newValue, storageArea: localStorage }),
  )
}
async function signIn(token: string, user = secondUser) {
  vi.mocked(api.login).mockResolvedValueOnce(envelope({ ...sessionCredentials(token), user }))
  await useAuthStore().signIn({ email: user.email, password: 'password' })
}
beforeEach(() => {
  setActivePinia((pinia = createPinia()))
  vi.resetAllMocks()
  setAccessToken('old-token')
})
afterEach(() => {
  finishConfirmation(false)
  disposePinia(pinia)
  localStorage.clear()
})

it('cancels the old account confirmation synchronously and ignores its late close callback', async () => {
  useAuthStore()
  const action = vi.fn()
  const pending = confirmAction('禁用设备？', '确认操作').then((accepted) => {
    if (accepted) action()
  })
  const oldConfirmation = confirmation.value
  await signIn('new-token')
  await pending
  expect(action).not.toHaveBeenCalled()
  expect(confirmation.value).toBeNull()
  const next = confirmAction('新操作？', '确认新操作')
  const current = confirmation.value
  finishConfirmation(false, oldConfirmation)
  expect(confirmation.value).toBe(current)
  finishConfirmation(true, current)
  await expect(next).resolves.toBe(true)
})

it('rejects confirmation when shared storage changed before its event was delivered', async () => {
  const pending = confirmAction('禁用设备？', '确认操作')
  localStorage.setItem(ACCESS_TOKEN_KEY, JSON.stringify(sessionCredentials('new-tab-token')))
  finishConfirmation(true)
  await expect(pending).resolves.toBe(false)
})

it('preserves identity, user data and pending confirmation across a renewal', async () => {
  const auth = useAuthStore()
  auth.user = firstUser
  const source = captureAuthSession()
  const session = readAuthSession()!
  const choice = confirmAction('同一用户的操作？', '确认')
  setAuthSession(
    sessionCredentials('rotated', { sessionId: session.sessionId, credentialGeneration: 2 }),
    source,
  )
  changedStorage('rotated')
  await flushPromises()
  expect(auth.user?.id).toBe(1)
  expect(auth.sessionRevision).toBe(0)
  expect(auth.token).toBe('rotated')
  expect(api.getProfile).not.toHaveBeenCalled()
  expect(confirmation.value).not.toBeNull()
  finishConfirmation(true)
  await expect(choice).resolves.toBe(true)
})

it('keeps the new identity when the previous profile request fails late', async () => {
  const profile = deferred<ApiResponse<User>>()
  vi.mocked(api.getProfile).mockReturnValueOnce(profile.promise)
  const auth = useAuthStore()
  const pending = auth.loadProfile().catch(() => {})
  await signIn('new-token')
  profile.reject(new Error('Expired'))
  await pending
  expect(auth.token).toBe('new-token')
  expect(auth.user?.id).toBe(2)
  expect(auth.profileError).toBe('')
})

it('does not install a late login response over the session created in another tab', async () => {
  const login = deferred<ApiResponse<LoginResult>>()
  vi.mocked(api.login).mockReturnValueOnce(login.promise)
  vi.mocked(api.getProfile).mockResolvedValueOnce(envelope(secondUser))
  const auth = useAuthStore()
  const pending = auth.signIn({ email: firstUser.email, password: 'password' })
  const rejected = expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' })
  await flushPromises()
  localStorage.setItem(ACCESS_TOKEN_KEY, JSON.stringify(sessionCredentials('other-tab-token')))
  changedStorage('other-tab-token')
  await flushPromises()
  login.resolve(
    envelope({
      ...sessionCredentials('late-token'),
      tokenType: 'Bearer',
      expiresInSeconds: 7200,
      user: firstUser,
    }),
  )
  await rejected
  expect(auth.token).toBe('other-tab-token')
  expect(auth.user?.id).toBe(2)
})

it('ignores an earlier login attempt even when the more recent attempt fails', async () => {
  const login = deferred<ApiResponse<LoginResult>>()
  vi.mocked(api.login)
    .mockReturnValueOnce(login.promise)
    .mockRejectedValueOnce(new Error('Invalid password'))
  const auth = useAuthStore()
  const first = auth.signIn({ email: firstUser.email, password: 'password' })
  const rejected = expect(first).rejects.toMatchObject({ code: 'ERR_CANCELED' })
  await flushPromises()
  const second = expect(
    auth.signIn({ email: secondUser.email, password: 'password' }),
  ).rejects.toThrow('Invalid password')
  login.resolve(
    envelope({
      ...sessionCredentials('late-token'),
      tokenType: 'Bearer',
      expiresInSeconds: 7200,
      user: firstUser,
    }),
  )
  await rejected
  await second
  expect(auth.token).toBe('old-token')
})

it('does not reuse an old pending profile for a new session', async () => {
  const oldProfile = deferred<ApiResponse<User>>()
  vi.mocked(api.getProfile)
    .mockReturnValueOnce(oldProfile.promise)
    .mockResolvedValueOnce(envelope(secondUser))
  const auth = useAuthStore()
  const pending = auth.loadProfile()
  await signIn('new-token')
  await auth.loadProfile()
  oldProfile.resolve(envelope(firstUser))
  await pending
  expect(api.getProfile).toHaveBeenCalledTimes(2)
  expect(auth.user?.id).toBe(2)
})

it('keeps credentials and supports retry after a temporary profile failure', async () => {
  vi.mocked(api.getProfile)
    .mockRejectedValueOnce({ code: 50322 })
    .mockResolvedValueOnce(envelope(firstUser))
  const auth = useAuthStore()
  await expect(auth.loadProfile()).rejects.toMatchObject({ code: 50322 })
  expect(auth.token).toBe('old-token')
  expect(getAccessToken()).toBe('old-token')
  expect(auth.profileError).toBeTruthy()
  await auth.loadProfile()
  expect(auth.user?.id).toBe(1)
  expect(auth.profileError).toBe('')
})

it('does not clear a new login when an earlier logout completes', async () => {
  const logout = deferred<ApiResponse<void>>()
  vi.mocked(api.logout).mockReturnValueOnce(logout.promise)
  const auth = useAuthStore()
  const pending = auth.signOut()
  expect(auth.signingOut).toBe(true)
  await flushPromises()
  localStorage.setItem(ACCESS_TOKEN_KEY, JSON.stringify(sessionCredentials('new-token')))
  auth.synchronize()
  auth.user = secondUser
  logout.resolve(envelope(undefined))
  await pending
  expect(auth.token).toBe('new-token')
  expect(auth.user?.id).toBe(2)
  expect(auth.signingOut).toBe(false)
})

it('synchronizes another tab and reloads its user before remounting protected pages', async () => {
  const profile = deferred<ApiResponse<User>>()
  vi.mocked(api.getProfile).mockReturnValueOnce(profile.promise)
  const auth = useAuthStore()
  auth.user = firstUser
  localStorage.setItem(ACCESS_TOKEN_KEY, JSON.stringify(sessionCredentials('other-tab-token')))
  changedStorage('other-tab-token')
  expect(auth.token).toBe('other-tab-token')
  expect(auth.user).toBeNull()
  expect(auth.sessionRevision).toBe(1)
  profile.resolve(envelope(secondUser))
  await flushPromises()
  expect(auth.user?.id).toBe(2)
  expect(replace).toHaveBeenCalledWith({ path: '/projects', force: true })
})

it('reads current storage instead of trusting a delayed removal event', async () => {
  vi.mocked(api.getProfile).mockResolvedValueOnce(envelope(secondUser))
  const auth = useAuthStore()
  localStorage.setItem(ACCESS_TOKEN_KEY, JSON.stringify(sessionCredentials('latest-token')))
  changedStorage(null)
  await flushPromises()
  expect(auth.token).toBe('latest-token')
  expect(auth.user?.id).toBe(2)
})

it('clears a removed shared session without calling the logout API again', async () => {
  const auth = useAuthStore()
  auth.user = firstUser
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  changedStorage(null)
  await flushPromises()
  expect(auth.token).toBeNull()
  expect(auth.user).toBeNull()
  expect(api.logout).not.toHaveBeenCalled()
  expect(replace).toHaveBeenCalledWith({ name: 'login', query: { reason: 'session-expired' } })
})
