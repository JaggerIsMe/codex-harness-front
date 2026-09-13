import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope, reactive, nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useStepConversation } from '@/composables/useStepConversation'
import {
  getConversationMessageState,
  getConversationApprovals,
  resolveApproval,
} from '@/api/conversation'
import { useAgentStore } from '@/stores/agent'
import type { Approval, Message, MessageState, RealtimeEvent } from '@/types/domain'
vi.mock('@/api/conversation', () => ({
  getConversationMessageState: vi.fn(),
  getConversationApprovals: vi.fn(),
  resolveApproval: vi.fn(),
}))
vi.mock('@/stores/agent', () => ({ useAgentStore: vi.fn() }))
const response = <T>(data: T) => ({ status: 'success' as const, code: 200, info: '', data })
const message = (id: number, content = `message ${id}`): Message => ({
  id,
  turnId: 7,
  sequenceNo: id,
  role: 'USER',
  messageType: 'TEXT',
  content,
})
const snapshot = (messages: Message[], hasMore = false): MessageState => ({
  messages,
  hasMore,
  turnId: 7,
  cursor: 0,
  degraded: false,
  resetRequired: false,
  updates: [],
})
let scope: ReturnType<typeof effectScope>
let agent: { eventRevision: number; lastEvent: RealtimeEvent | null; connectionState: string }
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  scope = effectScope()
  agent = reactive({ eventRevision: 0, lastEvent: null, connectionState: 'CONNECTED' })
  vi.mocked(useAgentStore).mockReturnValue(agent as ReturnType<typeof useAgentStore>)
  vi.mocked(getConversationApprovals).mockResolvedValue(response([]))
  vi.mocked(getConversationMessageState).mockResolvedValue(response(snapshot([message(3)], true)))
})
afterEach(() => {
  scope.stop()
  vi.useRealTimers()
})
it('preserves older history while refreshing the current snapshot without duplicate messages', async () => {
  const state = scope.run(() => useStepConversation(2, 6))!
  await flushPromises()
  vi.mocked(getConversationMessageState).mockResolvedValueOnce(
    response(snapshot([message(1), message(2)])),
  )
  await state.loadOlder()
  expect(getConversationMessageState).toHaveBeenLastCalledWith(2, 6, expect.any(AbortSignal), 3)
  vi.mocked(getConversationMessageState).mockResolvedValueOnce(
    response(snapshot([message(3, 'updated'), message(4)], true)),
  )
  await state.refresh()
  expect(state.displayMessages.value.map((m) => m.content)).toEqual([
    'message 1',
    'message 2',
    'updated',
    'message 4',
  ])
  expect(state.hasMore.value).toBe(false)
})
it('aborts on close and ignores late responses without restarting timers', async () => {
  let finish!: (value: ReturnType<typeof response<MessageState>>) => void
  vi.mocked(getConversationMessageState).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const state = scope.run(() => useStepConversation(2, 6))!
  const signal = vi.mocked(getConversationMessageState).mock.calls[0]![2]!
  scope.stop()
  expect(signal.aborted).toBe(true)
  finish(response(snapshot([message(1)])))
  await flushPromises()
  await vi.advanceTimersByTimeAsync(30000)
  expect(state.displayMessages.value).toEqual([])
  expect(getConversationMessageState).toHaveBeenCalledTimes(1)
})
it('batches matching socket events and refreshes after reconnect', async () => {
  scope.run(() => useStepConversation(2, 6))
  await flushPromises()
  agent.lastEvent = { type: 'MESSAGE_UPDATED', payload: { conversationId: 9 } } as RealtimeEvent
  agent.eventRevision++
  await nextTick()
  await vi.advanceTimersByTimeAsync(400)
  expect(getConversationMessageState).toHaveBeenCalledTimes(1)
  for (let i = 0; i < 20; i++) {
    agent.lastEvent = { type: 'MESSAGE_UPDATED', payload: { conversationId: 6 } } as RealtimeEvent
    agent.eventRevision++
    await nextTick()
  }
  await vi.advanceTimersByTimeAsync(400)
  expect(getConversationMessageState).toHaveBeenCalledTimes(2)
  agent.connectionState = 'DISCONNECTED'
  await nextTick()
  agent.connectionState = 'CONNECTED'
  await nextTick()
  await vi.advanceTimersByTimeAsync(400)
  expect(getConversationMessageState).toHaveBeenCalledTimes(3)
})
it('submits a structured approval once and does not revive it from a stale response', async () => {
  const approval: Approval = {
    id: 8,
    conversationId: 6,
    turnId: 7,
    approvalType: 'MCP_TOOL_CALL',
    details: {},
    status: 'PENDING',
  }
  vi.mocked(getConversationApprovals).mockResolvedValue(response([approval]))
  const state = scope.run(() => useStepConversation(2, 6))!
  await flushPromises()
  let finish!: (value: ReturnType<typeof response<Approval>>) => void
  vi.mocked(resolveApproval).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const answers = { scope: { answers: ['本次操作'] } }
  const decision = state.decide(approval, 'ACCEPT', answers)
  await state.decide(approval, 'ACCEPT', answers)
  finish(response({ ...approval, status: 'ACCEPTED' }))
  await decision
  expect(resolveApproval).toHaveBeenCalledExactlyOnceWith(8, 'ACCEPT', answers)
  expect(state.approvals.value).toEqual([])
})
