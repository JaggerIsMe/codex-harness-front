import { effectScope } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { useEmailRequest } from '@/composables/useEmailRequest'
import { ApiError } from '@/api/request'
vi.mock('@/router/index.js', () => ({ default: {} }))
afterEach(() => vi.useRealTimers())

it('uses a server cooldown and releases both timers and requests on disposal', async () => {
  vi.useFakeTimers()
  const scope = effectScope()
  const flow = scope.run(() => useEmailRequest())!
  await flow.run(async () => {
    throw new ApiError('稍后再试', 42921, 60)
  })
  expect(flow.remaining.value).toBe(60)
  vi.advanceTimersByTime(1100)
  expect(flow.remaining.value).toBe(59)
  let signal: AbortSignal | undefined
  let finish: (value: string) => void = () => {}
  const pending = flow.run((current) => {
    signal = current
    return new Promise<string>((resolve) => {
      finish = resolve
    })
  })
  scope.stop()
  expect(signal?.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
  finish('stale result')
  expect(await pending).toBeUndefined()
})

it('cancels old requests without letting their completion clear a newer submission', async () => {
  const scope = effectScope()
  const flow = scope.run(() => useEmailRequest())!
  let first: (value: string) => void = () => {}
  let second: (value: string) => void = () => {}
  const old = flow.run(
    () =>
      new Promise<string>((resolve) => {
        first = resolve
      }),
  )
  flow.cancel()
  const current = flow.run(
    () =>
      new Promise<string>((resolve) => {
        second = resolve
      }),
  )
  first('old')
  expect(await old).toBeUndefined()
  expect(flow.busy.value).toBe(true)
  second('new')
  expect(await current).toBe('new')
  expect(flow.busy.value).toBe(false)
  scope.stop()
})
