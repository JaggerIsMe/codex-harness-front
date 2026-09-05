import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import * as api from '@/api/artifact'
import { useConversationArtifacts } from '@/composables/useConversationArtifacts'
import type { ApiResponse, Conversation, ConversationArtifact, RealtimeEvent } from '@/types/domain'

const agent = reactive({
  eventRevision: 0,
  lastEvent: null as RealtimeEvent | null,
  connectionState: 'DISCONNECTED',
})
vi.mock('@/stores/agent', () => ({ useAgentStore: () => agent }))
vi.mock('@/api/artifact', () => ({ getArtifacts: vi.fn() }))
const scopes: ReturnType<typeof effectScope>[] = []
const artifact: ConversationArtifact = {
  id: '9',
  turnId: '7',
  fileName: '报告.txt',
  sizeBytes: 5,
  mediaType: 'application/octet-stream',
  sha256: 'abc',
  status: 'READY',
  errorMessage: null,
}
const conversation = (id: number): Conversation => ({
  id,
  projectId: 2,
  deviceId: 4,
  workspaceId: 5,
  projectName: 'demo',
  title: 'Conversation',
  status: 'ACTIVE',
  codexThreadId: 'thread',
})
const result = (rows: ConversationArtifact[]): ApiResponse<ConversationArtifact[]> => ({
  status: 'success',
  code: 200,
  info: '',
  data: rows,
})
function create() {
  const current = ref<Conversation | null>(conversation(3))
  const scope = effectScope()
  scopes.push(scope)
  return { current, scope, state: scope.run(() => useConversationArtifacts(() => current.value))! }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  agent.eventRevision = 0
  agent.lastEvent = null
  agent.connectionState = 'DISCONNECTED'
  vi.mocked(api.getArtifacts).mockResolvedValue(result([artifact]))
})
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.useRealTimers()
})
it('restores historical artifacts and refreshes after matching events or reconnect', async () => {
  const { state } = create()
  await flushPromises()
  expect(state.rows.value).toEqual([artifact])
  agent.lastEvent = { type: 'ARTIFACT_CHANGED', payload: { conversationId: '99' } }
  agent.eventRevision++
  await flushPromises()
  expect(api.getArtifacts).toHaveBeenCalledTimes(1)
  vi.mocked(api.getArtifacts).mockResolvedValue(result([{ ...artifact, status: 'FAILED' }]))
  agent.lastEvent = { type: 'ARTIFACT_CHANGED', payload: { conversationId: '3' } }
  agent.eventRevision++
  await flushPromises()
  expect(state.rows.value[0]!.status).toBe('FAILED')
  agent.connectionState = 'CONNECTED'
  await flushPromises()
  expect(api.getArtifacts).toHaveBeenCalledTimes(3)
})
it('discovers missed first publication through bounded polling and stops on disposal', async () => {
  vi.mocked(api.getArtifacts).mockResolvedValueOnce(result([]))
  const { state, scope } = create()
  await flushPromises()
  expect(state.rows.value).toEqual([])
  await vi.advanceTimersByTimeAsync(15000)
  expect(state.rows.value).toEqual([artifact])
  const signal = vi.mocked(api.getArtifacts).mock.calls[0]![2]!
  scope.stop()
  expect(signal.aborted).toBe(true)
  await vi.advanceTimersByTimeAsync(60000)
  agent.eventRevision++
  expect(api.getArtifacts).toHaveBeenCalledTimes(2)
})
it('aborts old Conversation requests and ignores late results after switching', async () => {
  let resolve!: (value: ApiResponse<ConversationArtifact[]>) => void
  vi.mocked(api.getArtifacts).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const { current, state } = create()
  const signal = vi.mocked(api.getArtifacts).mock.calls[0]![2]!
  vi.mocked(api.getArtifacts).mockResolvedValue(result([]))
  current.value = conversation(4)
  await nextTick()
  expect(signal.aborted).toBe(true)
  await flushPromises()
  resolve(result([artifact]))
  await flushPromises()
  expect(state.rows.value).toEqual([])
  expect(state.loading.value).toBe(false)
})
it('shows errors and restores the durable list on explicit retry', async () => {
  vi.mocked(api.getArtifacts).mockRejectedValueOnce(new Error('forbidden'))
  const { state } = create()
  await flushPromises()
  expect(state.error.value).toBe('forbidden')
  expect(state.rows.value).toEqual([])
  await state.reload()
  expect(state.error.value).toBe('')
  expect(state.rows.value).toEqual([artifact])
})
