import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope, ref, nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useOrchestration } from '@/composables/useOrchestration'
import { getOrchestration, listOrchestrations, orchestrationAvailable } from '@/api/orchestration'
import type { Orchestration } from '@/types/orchestration'
vi.mock('@/api/orchestration', () => ({
  getOrchestration: vi.fn(),
  listOrchestrations: vi.fn(),
  orchestrationAvailable: vi.fn(),
}))
vi.mock('@/stores/agent', () => ({ useAgentStore: () => ({ eventRevision: 0, lastEvent: null }) }))
const response = <T>(data: T) => ({ status: 'success' as const, code: 200, info: '', data })
let scope: ReturnType<typeof effectScope>
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  scope = effectScope()
  vi.mocked(orchestrationAvailable).mockResolvedValue(response(true))
  vi.mocked(listOrchestrations).mockResolvedValue(response([]))
})
afterEach(() => {
  scope.stop()
  vi.useRealTimers()
})
it('cancels stale requests on route change and prevents cross-project details', async () => {
  const project = ref(1),
    selected = ref('10')
  let resolveOld!: (value: ReturnType<typeof response<Orchestration>>) => void
  const old = new Promise<ReturnType<typeof response<Orchestration>>>((resolve) => {
    resolveOld = resolve
  })
  vi.mocked(getOrchestration).mockReturnValueOnce(old)
  vi.mocked(getOrchestration).mockResolvedValue(response({ id: 20, projectId: 2 } as Orchestration))
  const state = scope.run(() => useOrchestration(project, selected))!
  await flushPromises()
  const signal = vi.mocked(getOrchestration).mock.calls[0]![2]!
  project.value = 2
  selected.value = '20'
  await nextTick()
  expect(signal.aborted).toBe(true)
  resolveOld(response({ id: 10, projectId: 1 } as Orchestration))
  await flushPromises()
  expect(state.current.value?.projectId).toBe(2)
})
it('stops periodic refreshes and aborts HTTP requests on disposal', async () => {
  const state = scope.run(() => useOrchestration(ref(1), ref('')))!
  await flushPromises()
  expect(state.enabled.value).toBe(true)
  const count = vi.mocked(orchestrationAvailable).mock.calls.length
  scope.stop()
  await vi.advanceTimersByTimeAsync(30000)
  expect(orchestrationAvailable).toHaveBeenCalledTimes(count)
})
it('does not query execution tables when feature is unavailable', async () => {
  vi.mocked(orchestrationAvailable).mockResolvedValue(response(false))
  const state = scope.run(() => useOrchestration(ref(1), ref('10')))!
  await flushPromises()
  expect(state.enabled.value).toBe(false)
  expect(getOrchestration).not.toHaveBeenCalled()
  expect(listOrchestrations).not.toHaveBeenCalled()
})
