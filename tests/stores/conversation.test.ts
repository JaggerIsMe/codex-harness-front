import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia, disposePinia } from 'pinia'
import { useConversationStore } from '@/stores/conversation'
import { useAgentStore } from '@/stores/agent'
import * as api from '@/api/conversation'
import type { ApiResponse, Conversation, RealtimeEvent } from '@/types/domain'

vi.mock('@/api/conversation', () => ({
  getConversations: vi.fn(),
  getConversation: vi.fn(),
  getActiveTurn: vi.fn(),
  getConversationMessageState: vi.fn(),
  getConversationApprovals: vi.fn(),
  interruptTurn: vi.fn(),
  resolveApproval: vi.fn(),
  startTurn: vi.fn(),
}))
vi.mock('@/api/agent', () => ({
  getDevices: vi.fn(),
  getDeviceWorkspaceRoots: vi.fn(),
  getDeviceWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
}))
let pinia: ReturnType<typeof createPinia>
function result<T>(data: T): ApiResponse<T> {
  return { status: 'success', code: 200, info: '', data }
}
const conversation: Conversation = {
  id: 4,
  projectId: 3,
  projectName: 'Project',
  deviceId: 1,
  workspaceId: 2,
  title: 'Conversation',
  status: 'ACTIVE',
  codexThreadId: 'thread',
}
beforeEach(() => {
  vi.useFakeTimers()
  pinia = createPinia()
  setActivePinia(pinia)
  vi.mocked(api.getConversation).mockResolvedValue(result(conversation))
  vi.mocked(api.getConversationMessageState).mockResolvedValue(
    result({
      messages: [],
      turnId: 7,
      cursor: 0,
      hasMore: false,
      degraded: false,
      resetRequired: false,
      updates: [],
    }),
  )
  vi.mocked(api.getConversationApprovals).mockResolvedValue(result([]))
  vi.mocked(api.getActiveTurn).mockResolvedValue(result({ id: 7, status: 'RUNNING' }))
})
afterEach(() => {
  disposePinia(pinia)
  vi.useRealTimers()
})

function publish(event: RealtimeEvent) {
  const agent = useAgentStore()
  agent.lastEvent = event
  agent.eventRevision++
}
it('keeps every frame from a synchronous burst and batches UI updates', async () => {
  const store = useConversationStore()
  store.startListening()
  await store.openConversation(3, 4)
  for (let index = 0; index < 300; index++) publish(update(index + 1, 'x'))
  await vi.advanceTimersByTimeAsync(60)
  expect(store.messages).toHaveLength(1)
  expect(store.messages[0].content).toBe('x'.repeat(300))
})
it('clears pending deltas and watchers when leaving a conversation', async () => {
  const store = useConversationStore()
  store.startListening()
  await store.openConversation(3, 4)
  publish(update(1, 'old'))
  store.stopListening()
  await vi.advanceTimersByTimeAsync(500)
  expect(store.messages).toEqual([])
  expect(store.currentConversation).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})
it('aborts an old request and prevents its result replacing the new conversation', async () => {
  let resolveOld!: (value: ApiResponse<Conversation>) => void
  vi.mocked(api.getConversation).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve
      }),
  )
  const store = useConversationStore()
  const old = store.openConversation(3, 4)
  await store.openConversation(3, 5)
  resolveOld(result({ ...conversation, id: 4, title: 'Stale' }))
  await old
  expect(api.getConversation).toHaveBeenNthCalledWith(1, 3, 4, expect.any(AbortSignal))
  expect(vi.mocked(api.getConversation).mock.calls[0][2]?.aborted).toBe(true)
  expect(store.currentConversation?.title).toBe('Conversation')
})

function update(seq: number, content: string): RealtimeEvent {
  return {
    type: 'MESSAGE_UPDATED',
    payload: {
      conversationId: 4,
      turnId: 7,
      cursor: seq,
      patches: [
        {
          operation: seq === 1 ? 'REPLACE' : 'APPEND',
          baseRevision: seq - 1,
          message: {
            id: 10,
            turnId: 7,
            sequenceNo: 2,
            messageKey: 'answer',
            revision: seq,
            role: 'ASSISTANT',
            messageType: 'TEXT',
            status: 'STREAMING',
            content,
          },
        },
      ],
    },
  }
}
it('buffers frames during initial snapshot loading and ignores already included deltas', async () => {
  let resolveState!: (value: Awaited<ReturnType<typeof api.getConversationMessageState>>) => void
  vi.mocked(api.getConversationMessageState).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveState = resolve
      }),
  )
  const store = useConversationStore()
  store.startListening()
  const opening = store.openConversation(3, 4)
  publish(update(1, 'a'))
  publish(update(2, 'b'))
  resolveState(
    result({
      messages: [{ ...update(1, 'a').payload!.patches![0].message }],
      turnId: 7,
      cursor: 1,
      hasMore: false,
      degraded: false,
      resetRequired: false,
      updates: [],
    }),
  )
  await opening
  await vi.advanceTimersByTimeAsync(60)
  expect(store.messages).toHaveLength(1)
  expect(store.messages[0].content).toBe('ab')
  expect(store.messages[0].revision).toBe(2)
})
it('requests authoritative recovery on a missing sequence instead of concatenating', async () => {
  const store = useConversationStore()
  store.startListening()
  await store.openConversation(3, 4)
  publish(update(2, 'missing base'))
  await vi.advanceTimersByTimeAsync(60)
  expect(store.messages).toEqual([])
  await vi.advanceTimersByTimeAsync(200)
  expect(api.getConversationMessageState).toHaveBeenCalledTimes(2)
})
it('does not duplicate a replacement snapshot or allow stale deltas to overwrite it', async () => {
  const store = useConversationStore()
  store.startListening()
  await store.openConversation(3, 4)
  publish(update(1, 'draft'))
  const completed = update(2, 'final')
  completed.payload!.patches![0].operation = 'REPLACE'
  completed.payload!.patches![0].message.status = 'COMPLETED'
  publish(completed)
  publish(update(1, 'stale'))
  await vi.advanceTimersByTimeAsync(60)
  expect(store.messages).toHaveLength(1)
  expect(store.messages[0].content).toBe('final')
  expect(store.messages[0].streaming).toBe(false)
})
