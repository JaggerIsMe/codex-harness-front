import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import * as api from '@/api/conversation'
import { useConversationStore } from '@/stores/conversation'
import { useAgentStore } from '@/stores/agent'
import { CanceledError } from 'axios'
import type { ApiResponse, Conversation, Message, RealtimeEvent } from '@/types/domain'

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

function conversation(id = 4, projectId = 3): Conversation {
  return {
    id,
    projectId,
    projectName: `Project ${projectId}`,
    deviceId: 1,
    workspaceId: 2,
    title: `Conversation ${id}`,
    status: 'ACTIVE',
    codexThreadId: `thread-${id}`,
  }
}
function result<T>(data: T): ApiResponse<T> {
  return { status: 'success', code: 200, info: '', data }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
const message: Message = {
  id: 10,
  turnId: 7,
  sequenceNo: 2,
  messageKey: 'answer',
  revision: 1,
  role: 'ASSISTANT',
  messageType: 'TEXT',
  status: 'STREAMING',
  content: 'Initial answer',
}
function publishUpdate() {
  const event: RealtimeEvent = {
    type: 'MESSAGE_UPDATED',
    payload: {
      conversationId: 4,
      turnId: 7,
      cursor: 2,
      patches: [
        {
          operation: 'APPEND',
          baseRevision: 1,
          message: { ...message, revision: 2, content: ' continued' },
        },
      ],
    },
  }
  const agent = useAgentStore()
  agent.lastEvent = event
  agent.eventRevision++
}
let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  pinia = createPinia()
  setActivePinia(pinia)
  vi.mocked(api.getConversations).mockResolvedValue(result([conversation(), conversation(5)]))
  vi.mocked(api.getConversation).mockImplementation(async (projectId, id) =>
    result(conversation(Number(id), Number(projectId))),
  )
  vi.mocked(api.getConversationMessageState).mockResolvedValue(
    result({
      messages: [message],
      turnId: 7,
      cursor: 1,
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

it('retains renamed Conversation and Project names after older detail and list snapshots arrive', async () => {
  const store = useConversationStore()
  await store.openConversation(3, 4)
  const oldDetail = deferred<ApiResponse<Conversation>>()
  const oldList = deferred<ApiResponse<Conversation[]>>()
  vi.mocked(api.getConversation).mockReturnValueOnce(oldDetail.promise)
  vi.mocked(api.getConversations).mockReturnValueOnce(oldList.promise)
  const refreshing = store.refreshCurrent()
  const listing = store.loadConversations(3)
  store.renameConversation({ ...conversation(), title: 'Renamed Conversation' })
  store.renameProject('3', 'Renamed Project')
  oldDetail.resolve(result(conversation()))
  oldList.resolve(result([conversation(), conversation(5)]))
  await Promise.all([refreshing, listing])

  expect(store.currentConversation).toMatchObject({
    title: 'Renamed Conversation',
    projectName: 'Renamed Project',
  })
  expect(store.conversations.find((value) => value.id === 4)).toMatchObject({
    title: 'Renamed Conversation',
    projectName: 'Renamed Project',
  })
  expect(store.conversations.find((value) => value.id === 5)?.projectName).toBe('Renamed Project')
})

it.each(['send', 'interrupt', 'approval'] as const)(
  'preserves the new session %s operation when an old request finishes',
  async (kind) => {
    const old = deferred<never>()
    const current = deferred<never>()
    const operation =
      kind === 'send'
        ? api.startTurn
        : kind === 'interrupt'
          ? api.interruptTurn
          : api.resolveApproval
    vi.mocked(operation).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const store = useConversationStore()
    const prepare = () => {
      store.currentProjectId = 3
      store.currentConversation = conversation()
      store.currentTurn = kind === 'send' ? null : { id: 7, status: 'RUNNING' }
    }
    const start = () => {
      const request =
        kind === 'send'
          ? store.startNewTurn({ message: 'Hello' })
          : kind === 'interrupt'
            ? store.interruptCurrentTurn()
            : store.decideApproval(
                {
                  id: 9,
                  conversationId: 4,
                  turnId: 7,
                  approvalType: 'COMMAND',
                  details: {},
                  status: 'PENDING',
                },
                'APPROVE',
              )
      return request.catch(() => undefined)
    }
    const busy = () =>
      kind === 'send'
        ? store.sending
        : kind === 'interrupt'
          ? store.interrupting
          : store.resolvingId !== null
    prepare()
    const previousRequest = start()
    expect(busy()).toBe(true)
    store.reset()
    prepare()
    const currentRequest = start()
    expect(busy()).toBe(true)
    old.reject(new CanceledError('Old login ended'))
    await previousRequest
    expect(busy()).toBe(true)
    expect(navigation.markIssue).not.toHaveBeenCalled()
    current.reject(new CanceledError('Current request canceled'))
    await currentRequest
    expect(busy()).toBe(false)
  },
)

it('clears the deleted current Conversation and prevents pending deltas or detail requests restoring it', async () => {
  const store = useConversationStore()
  store.startListening()
  await store.openConversation(3, 4)
  publishUpdate()
  const oldDetail = deferred<ApiResponse<Conversation>>()
  vi.mocked(api.getConversation).mockReturnValueOnce(oldDetail.promise)
  const refreshing = store.refreshCurrent()
  const signal = vi.mocked(api.getConversation).mock.calls.at(-1)![2]!
  store.removeConversation('4')
  expect(signal.aborted).toBe(true)
  oldDetail.resolve(result(conversation()))
  await refreshing
  publishUpdate()
  await vi.advanceTimersByTimeAsync(500)

  expect(store.currentConversation).toBeNull()
  expect(store.messages).toEqual([])
  expect(store.approvals).toEqual([])
  expect(store.currentTurn).toBeNull()
  expect(store.conversations).toEqual([])
  expect(vi.getTimerCount()).toBe(0)
})

it('deletes another Conversation while retaining the current stream and rejecting a stale list row', async () => {
  const store = useConversationStore()
  store.startListening()
  await store.loadConversations(3)
  await store.openConversation(3, 4)
  const oldList = deferred<ApiResponse<Conversation[]>>()
  vi.mocked(api.getConversations).mockReturnValueOnce(oldList.promise)
  const listing = store.loadConversations(3)
  store.removeConversation(5)
  publishUpdate()
  oldList.resolve(result([conversation(), conversation(5)]))
  await listing
  await vi.advanceTimersByTimeAsync(60)

  expect(store.currentConversation?.id).toBe(4)
  expect(store.currentTurn?.id).toBe(7)
  expect(store.messages[0]?.content).toBe('Initial answer continued')
  expect(store.conversations.map((value) => value.id)).toEqual([4])
})

it('rejects an initial detail request completed after its Conversation was removed', async () => {
  const oldDetail = deferred<ApiResponse<Conversation>>()
  vi.mocked(api.getConversation).mockReturnValueOnce(oldDetail.promise)
  const store = useConversationStore()
  const opening = store.openConversation(3, 4)
  store.removeConversation(4)
  oldDetail.resolve(result(conversation()))
  await opening

  expect(store.currentConversation).toBeNull()
  expect(store.messages).toEqual([])
  expect(navigation.upsert).not.toHaveBeenCalled()
})

it('removes the active Project and rejects pending Conversation list and detail snapshots', async () => {
  const store = useConversationStore()
  await store.openConversation(3, 4)
  store.removeProject(9)
  expect(store.currentConversation?.id).toBe(4)
  const oldDetail = deferred<ApiResponse<Conversation>>()
  const oldList = deferred<ApiResponse<Conversation[]>>()
  vi.mocked(api.getConversation).mockReturnValueOnce(oldDetail.promise)
  vi.mocked(api.getConversations).mockReturnValueOnce(oldList.promise)
  const refreshing = store.refreshCurrent()
  const listing = store.loadConversations(3)
  store.removeProject('3')
  oldDetail.resolve(result(conversation()))
  oldList.resolve(result([conversation(), conversation(5)]))
  await Promise.all([refreshing, listing])

  expect(store.currentConversation).toBeNull()
  expect(store.currentProjectId).toBeNull()
  expect(store.conversations).toEqual([])
  expect(store.messages).toEqual([])
})
