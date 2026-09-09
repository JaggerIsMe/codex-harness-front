import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia, disposePinia } from 'pinia'
import { useConversationStore } from '@/stores/conversation'
import { useAgentStore } from '@/stores/agent'
import * as api from '@/api/conversation'
import type {
  ApiResponse,
  Conversation,
  Message,
  MessageState,
  RealtimeEvent,
  Turn,
} from '@/types/domain'

const navigation = vi.hoisted(() => ({
  upsert: vi.fn(),
  recordTurn: vi.fn(),
  markIssue: vi.fn(),
  clearIssue: vi.fn(),
}))
vi.mock('@/stores/navigation', () => ({ useNavigationStore: () => navigation }))

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

function snapshot(messages: Message[] = [], overrides: Partial<MessageState> = {}) {
  return result<MessageState>({
    messages,
    turnId: 7,
    cursor: 0,
    hasMore: false,
    degraded: false,
    resetRequired: false,
    updates: [],
    ...overrides,
  })
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

it('records the opened Conversation and its Turn without clearing global state on departure', async () => {
  const store = useConversationStore()
  await store.openConversation(3, 4)
  expect(navigation.upsert).toHaveBeenCalledWith(conversation)
  expect(navigation.recordTurn).toHaveBeenCalledWith(4, { id: 7, status: 'RUNNING' })
  expect(navigation.clearIssue).toHaveBeenCalledWith(4, 'message', 7)

  navigation.clearIssue.mockClear()
  store.clearCurrent()
  expect(navigation.clearIssue).not.toHaveBeenCalled()
})

it('records a newly started Turn for the originating Conversation after switching away', async () => {
  vi.mocked(api.getActiveTurn).mockResolvedValue(result(null))
  const store = useConversationStore()
  await store.openConversation(3, 4)
  let resolveTurn!: (value: ApiResponse<Turn>) => void
  vi.mocked(api.startTurn).mockImplementationOnce(
    () => new Promise((resolve) => (resolveTurn = resolve)),
  )
  const starting = store.startNewTurn({ message: 'Continue' })
  expect(navigation.upsert).toHaveBeenLastCalledWith(conversation)
  expect(navigation.clearIssue).toHaveBeenCalledWith(4, 'send')

  vi.mocked(api.getConversation).mockResolvedValueOnce(result({ ...conversation, id: 5 }))
  await store.openConversation(3, 5)
  const turn: Turn = { id: 8, conversationId: 4, status: 'CREATED' }
  resolveTurn(result(turn))
  await starting

  expect(navigation.recordTurn).toHaveBeenCalledWith(4, turn)
  expect(store.currentConversation?.id).toBe(5)
  expect(store.currentTurn).toBeNull()
  expect(store.sending).toBe(false)
})

it('reports sending failure on the originating Conversation and rethrows after switching away', async () => {
  vi.mocked(api.getActiveTurn).mockResolvedValue(result(null))
  const store = useConversationStore()
  await store.openConversation(3, 4)
  let rejectTurn!: (error: Error) => void
  vi.mocked(api.startTurn).mockImplementationOnce(
    () => new Promise((_resolve, reject) => (rejectTurn = reject)),
  )
  const failure = new Error('Device 当前不可用')
  const starting = store.startNewTurn({ message: 'Continue' })
  const rejection = expect(starting).rejects.toBe(failure)
  vi.mocked(api.getConversation).mockResolvedValueOnce(result({ ...conversation, id: 5 }))
  await store.openConversation(3, 5)
  rejectTurn(failure)
  await rejection

  expect(navigation.markIssue).toHaveBeenCalledWith(4, failure.message, 'send')
  expect(store.currentConversation?.id).toBe(5)
  expect(store.sending).toBe(false)
})

it('clears a previous send issue before retrying and records the accepted Turn', async () => {
  vi.mocked(api.getActiveTurn).mockResolvedValue(result(null))
  const store = useConversationStore()
  await store.openConversation(3, 4)
  const failure = new Error('发送失败')
  vi.mocked(api.startTurn).mockRejectedValueOnce(failure)
  await expect(store.startNewTurn({ message: 'Continue' })).rejects.toBe(failure)
  expect(navigation.markIssue).toHaveBeenCalledWith(4, '发送失败', 'send')

  const turn: Turn = { id: 8, status: 'CREATED' }
  vi.mocked(api.startTurn).mockImplementationOnce(async () => {
    expect(navigation.clearIssue).toHaveBeenLastCalledWith(4, 'send')
    return result(turn)
  })
  await store.startNewTurn({ message: 'Continue' })
  expect(navigation.recordTurn).toHaveBeenCalledWith(4, turn)
})

it('marks degraded snapshots as an issue and clears it after healthy recovery', async () => {
  vi.mocked(api.getConversationMessageState).mockResolvedValueOnce(snapshot([], { degraded: true }))
  const store = useConversationStore()
  await store.openConversation(3, 4)
  expect(navigation.markIssue).toHaveBeenCalledWith(4, store.streamWarning, 'message', 7)
  expect(navigation.clearIssue).not.toHaveBeenCalledWith(4, 'message', 7)

  await store.refreshCurrent()
  expect(navigation.clearIssue).toHaveBeenCalledWith(4, 'message', 7)
  expect(store.streamWarning).toBe('')
})

it('reports only incomplete assistant output in the latest Turn', async () => {
  const incomplete: Message = {
    ...update(1, 'partial').payload!.patches![0].message,
    status: 'INCOMPLETE',
  }
  vi.mocked(api.getConversationMessageState).mockResolvedValueOnce(snapshot([incomplete]))
  const store = useConversationStore()
  await store.openConversation(3, 4)
  expect(navigation.markIssue).toHaveBeenCalledWith(
    4,
    expect.stringContaining('不完整'),
    'message',
    7,
  )

  navigation.markIssue.mockClear()
  vi.mocked(api.getConversationMessageState).mockResolvedValueOnce(
    snapshot([
      { ...incomplete, turnId: 6 },
      { ...incomplete, id: 11, role: 'USER' },
      { ...incomplete, id: 12, status: 'COMPLETED' },
    ]),
  )
  await store.refreshCurrent()
  expect(navigation.markIssue).not.toHaveBeenCalled()
  expect(navigation.clearIssue).toHaveBeenCalledWith(4, 'message', 7)
})

it('uses latest Turn metadata for snapshots when there is no active Turn', async () => {
  vi.mocked(api.getActiveTurn).mockResolvedValue(result(null))
  vi.mocked(api.getConversation).mockResolvedValue(
    result({ ...conversation, latestTurnId: 7, latestTurnStatus: 'COMPLETED' }),
  )
  vi.mocked(api.getConversationMessageState).mockResolvedValue(
    snapshot([{ ...update(1, 'partial').payload!.patches![0].message, status: 'INCOMPLETE' }], {
      turnId: null,
    }),
  )
  const store = useConversationStore()
  await store.openConversation(3, 4)
  expect(navigation.markIssue).toHaveBeenCalledWith(
    4,
    expect.stringContaining('不完整'),
    'message',
    7,
  )
  expect(navigation.recordTurn).toHaveBeenCalledWith(4, { id: 7, status: 'COMPLETED' })
})

it('does not treat an intentionally interrupted latest Turn as incomplete output', async () => {
  vi.mocked(api.getActiveTurn).mockResolvedValue(result(null))
  vi.mocked(api.getConversation).mockResolvedValue(
    result({ ...conversation, latestTurnId: 7, latestTurnStatus: 'INTERRUPTED' }),
  )
  vi.mocked(api.getConversationMessageState).mockResolvedValue(
    snapshot([{ ...update(1, 'partial').payload!.patches![0].message, status: 'INCOMPLETE' }]),
  )
  const store = useConversationStore()
  await store.openConversation(3, 4)
  expect(navigation.markIssue).not.toHaveBeenCalled()
  expect(navigation.clearIssue).toHaveBeenCalledWith(4, 'message', 7)
})

it('reports Conversation loading errors and clears them after a successful retry', async () => {
  const failure = new Error('会话历史加载失败')
  vi.mocked(api.getConversation).mockRejectedValueOnce(failure)
  const store = useConversationStore()
  await store.openConversation(3, 4)
  expect(navigation.markIssue).toHaveBeenCalledWith(4, failure.message, 'message')

  await store.openConversation(3, 4)
  expect(navigation.clearIssue).toHaveBeenCalledWith(4, 'message', 7)
  expect(store.detailError).toBe('')
})

it('ignores loading failures from an aborted Conversation after switching', async () => {
  let rejectOld!: (error: Error) => void
  vi.mocked(api.getConversation).mockImplementationOnce(
    () => new Promise((_resolve, reject) => (rejectOld = reject)),
  )
  const store = useConversationStore()
  const opening = store.openConversation(3, 4)
  vi.mocked(api.getConversation).mockResolvedValueOnce(result({ ...conversation, id: 5 }))
  await store.openConversation(3, 5)
  rejectOld(new Error('Canceled request'))
  await opening
  expect(navigation.markIssue).not.toHaveBeenCalled()
  expect(store.currentConversation?.id).toBe(5)
})

it('does not mark request cancellation as a Conversation or send issue', async () => {
  const cancellation = new DOMException('Aborted', 'AbortError')
  vi.mocked(api.getConversation).mockRejectedValueOnce(cancellation)
  const store = useConversationStore()
  await store.openConversation(3, 4)
  expect(navigation.markIssue).not.toHaveBeenCalled()

  vi.mocked(api.getActiveTurn).mockResolvedValue(result(null))
  await store.openConversation(3, 4)
  vi.mocked(api.startTurn).mockRejectedValueOnce(cancellation)
  await expect(store.startNewTurn({ message: 'Continue' })).rejects.toBe(cancellation)
  expect(navigation.markIssue).not.toHaveBeenCalled()
})

it('explicitly scopes empty snapshots to no Turn instead of changing a newer Turn issue', async () => {
  vi.mocked(api.getActiveTurn).mockResolvedValue(result(null))
  vi.mocked(api.getConversationMessageState).mockResolvedValueOnce(snapshot([], { turnId: null }))
  const store = useConversationStore()
  await store.openConversation(3, 4)
  expect(navigation.clearIssue).toHaveBeenCalledWith(4, 'message', null)

  vi.mocked(api.getConversationMessageState).mockResolvedValueOnce(
    snapshot([], { turnId: null, degraded: true }),
  )
  await store.refreshCurrent()
  expect(navigation.markIssue).toHaveBeenCalledWith(4, store.streamWarning, 'message', null)
})
