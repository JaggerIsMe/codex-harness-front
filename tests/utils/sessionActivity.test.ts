import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getLastSessionActivity, startSessionActivity } from '@/utils/sessionActivity'

let stop: (() => void) | undefined
let now = 0
beforeEach(() => {
  vi.useFakeTimers()
  now = Date.UTC(2026, 8, 10)
  vi.setSystemTime(now)
})
afterEach(() => {
  stop?.()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
function fixture() {
  const sendActivity = vi.fn().mockResolvedValue(undefined)
  const listener = vi.spyOn(window, 'addEventListener')
  let session: { sessionId: string; idleExpiresAt: number; sessionExpiresAt: number } | null = {
    sessionId: 'sid-1',
    idleExpiresAt: now / 1000 + 7200,
    sessionExpiresAt: now / 1000 + 604800,
  }
  stop = startSessionActivity({ getSession: () => session, sendActivity, now: () => Date.now() })
  const pointer = listener.mock.calls.find(([name]) => name === 'pointerdown')![1] as EventListener
  return {
    sendActivity,
    interact: () => pointer({ isTrusted: true } as Event),
    changeSession: (value: typeof session) => {
      session = value
    },
  }
}

it('ignores synthetic activity and passive timers', async () => {
  const context = fixture()
  window.dispatchEvent(new Event('pointerdown'))
  window.dispatchEvent(new Event('focus'))
  await vi.advanceTimersByTimeAsync(3600000)
  expect(context.sendActivity).not.toHaveBeenCalled()
  expect(getLastSessionActivity('sid-1')).toBe(0)
})

it('throttles genuine interaction and stops pinging when interaction stops', async () => {
  const context = fixture()
  context.interact()
  await vi.advanceTimersByTimeAsync(1000)
  context.interact()
  await vi.advanceTimersByTimeAsync(59000)
  expect(context.sendActivity).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(600000)
  expect(context.sendActivity).toHaveBeenCalledTimes(2)
})

it('reports new genuine interaction even after the wall clock rolls backward', async () => {
  const context = fixture()
  context.interact()
  await vi.advanceTimersByTimeAsync(1000)
  vi.setSystemTime(Date.now() - 3 * 3600000)
  context.interact()
  await vi.advanceTimersByTimeAsync(1)
  expect(context.sendActivity).toHaveBeenCalledTimes(2)
})

it('does not send a queued activity for an ended session and cleans timers on disposal', async () => {
  const context = fixture()
  context.interact()
  await vi.advanceTimersByTimeAsync(1000)
  context.interact()
  context.changeSession(null)
  stop?.()
  await vi.advanceTimersByTimeAsync(60000)
  expect(context.sendActivity).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
