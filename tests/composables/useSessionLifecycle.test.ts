import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { useSessionLifecycle } from '@/composables/useSessionLifecycle'
import { renewAuthSession } from '@/utils/sessionRenewal'
import { recordSessionActivity } from '@/api/auth'
import { getAccessToken, setAuthSession } from '@/utils/auth'
import { sessionCredentials } from '../support/auth'

vi.mock('@/utils/sessionRenewal', () => ({ renewAuthSession: vi.fn() }))
vi.mock('@/api/auth', () => ({ recordSessionActivity: vi.fn() }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ signingOut: false }) }))
const { route } = vi.hoisted(() => ({
  route: {
    meta: { publicFlow: false },
    matched: [{ meta: { requiresAuth: true } }],
  },
}))
vi.mock('vue-router', () => ({ useRoute: () => route }))
let wrapper: VueWrapper | undefined
let now: number
beforeEach(() => {
  vi.useFakeTimers()
  now = Date.UTC(2026, 8, 10)
  vi.setSystemTime(now)
  vi.clearAllMocks()
  route.meta.publicFlow = false
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  setAuthSession(sessionCredentials('current', { expiresAt: now / 1000 + 660 }))
  vi.mocked(renewAuthSession).mockResolvedValue(undefined)
  vi.mocked(recordSessionActivity).mockResolvedValue({
    status: 'success',
    code: 200,
    info: '',
    data: {
      idleExpiresAt: now / 1000 + 7200,
      sessionExpiresAt: now / 1000 + 604800,
    },
  })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  localStorage.clear()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
function start() {
  const listeners = vi.spyOn(window, 'addEventListener')
  wrapper = mount(
    defineComponent({
      setup() {
        useSessionLifecycle()
        return () => null
      },
    }),
  )
  const pointer = listeners.mock.calls.find(([name]) => name === 'pointerdown')![1] as EventListener
  return () => pointer({ isTrusted: true } as Event)
}

it('automatically refreshes at the ten-minute boundary when recent real activity exists', async () => {
  const interact = start()
  await vi.advanceTimersByTimeAsync(59000)
  interact()
  await vi.advanceTimersByTimeAsync(0)
  expect(renewAuthSession).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1000)
  expect(renewAuthSession).toHaveBeenCalledOnce()
  expect(renewAuthSession).toHaveBeenCalledWith(
    expect.objectContaining({ sessionId: 'sid-current' }),
    false,
  )
})

it('does not proactively renew from polling, visibility changes or an inactive background page', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  start()
  window.dispatchEvent(new Event('focus'))
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(120000)
  expect(renewAuthSession).not.toHaveBeenCalled()
  expect(recordSessionActivity).not.toHaveBeenCalled()
})

it('asks the server to verify apparent idle expiry instead of clearing the session locally', async () => {
  localStorage.clear()
  setAuthSession(sessionCredentials('current', { idleExpiresAt: now / 1000 - 1 }))
  start()
  await vi.advanceTimersByTimeAsync(0)
  expect(renewAuthSession).toHaveBeenCalledWith(
    expect.objectContaining({ sessionId: 'sid-current' }),
    true,
  )
  expect(getAccessToken()).toBe('current')
})

it('removes the automatic refresh timer and user activity listeners on unmount', async () => {
  start()
  await vi.advanceTimersByTimeAsync(0)
  const removeWindow = vi.spyOn(window, 'removeEventListener')
  const removeDocument = vi.spyOn(document, 'removeEventListener')
  wrapper!.unmount()
  wrapper = undefined
  expect(vi.getTimerCount()).toBe(0)
  expect(removeWindow).toHaveBeenCalledWith('pointerdown', expect.any(Function))
  expect(removeWindow).toHaveBeenCalledWith('focus', expect.any(Function))
  expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  await vi.advanceTimersByTimeAsync(7200000)
  expect(renewAuthSession).not.toHaveBeenCalled()
})

it('pauses expired-session checks and activity pings during public account flows', async () => {
  localStorage.clear()
  setAuthSession(sessionCredentials('current', { idleExpiresAt: now / 1000 - 1 }))
  route.meta.publicFlow = true
  const interact = start()
  interact()
  window.dispatchEvent(new Event('focus'))
  await vi.advanceTimersByTimeAsync(120000)
  expect(renewAuthSession).not.toHaveBeenCalled()
  expect(recordSessionActivity).not.toHaveBeenCalled()
  expect(getAccessToken()).toBe('current')
})
