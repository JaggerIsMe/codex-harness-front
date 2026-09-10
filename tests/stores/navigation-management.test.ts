import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { getConversations, getConversationStatuses } from '@/api/conversation'
import { useNavigationStore } from '@/stores/navigation'
import { useAgentStore } from '@/stores/agent'
import type { ApiResponse, Conversation, PageResult } from '@/types/domain'

const projectStore = vi.hoisted(() => ({
  projects: [],
  visibleProjects: [],
  promoteProject: vi.fn(),
  updateConversationActivity: vi.fn(),
}))
vi.mock('@/stores/project', () => ({ useProjectStore: () => projectStore }))
vi.mock('@/api/conversation', () => ({
  getConversations: vi.fn(),
  getConversationStatuses: vi.fn(),
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
    latestTurnId: id + 10,
    latestTurnStatus: 'COMPLETED',
  }
}
function result<T>(data: T): ApiResponse<T> {
  return { status: 'success', code: 200, info: '', data }
}
function page(
  items: Conversation[],
  total = items.length,
  page = 1,
): ApiResponse<PageResult<Conversation>> {
  return result({ items, total, page, size: 10 })
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}
function publishRefresh(projectId = 3, conversationId = 4) {
  const agent = useAgentStore()
  agent.lastEvent = { type: 'THREAD_STARTED', payload: { projectId, conversationId } }
  agent.eventRevision++
}
let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  localStorage.clear()
  pinia = createPinia()
  setActivePinia(pinia)
  vi.mocked(getConversations).mockResolvedValue(page([conversation(), conversation(5)]))
  vi.mocked(getConversationStatuses).mockResolvedValue(result([]))
})
afterEach(() => {
  disposePinia(pinia)
  vi.useRealTimers()
})

it('retains renamed Conversation and Project names when earlier pages and status snapshots arrive', async () => {
  const store = useNavigationStore()
  await store.load(3)
  store.startListening()
  const oldList = deferred<ApiResponse<PageResult<Conversation>>>()
  const oldStatuses = deferred<ApiResponse<Conversation[]>>()
  vi.mocked(getConversations).mockReturnValueOnce(oldList.promise)
  vi.mocked(getConversationStatuses).mockReturnValueOnce(oldStatuses.promise)
  const listing = store.load(3, true)
  publishRefresh()
  await vi.advanceTimersByTimeAsync(200)
  expect(getConversationStatuses).toHaveBeenCalledTimes(1)
  store.renameConversation({ ...conversation(), title: 'Renamed Conversation' })
  store.renameProject('3', 'Renamed Project')
  oldList.resolve(page([conversation(), conversation(5)]))
  oldStatuses.resolve(result([conversation(), conversation(5)]))
  await listing
  await vi.advanceTimersByTimeAsync(0)

  expect(store.conversations[3]?.find((value) => value.id === 4)).toMatchObject({
    title: 'Renamed Conversation',
    projectName: 'Renamed Project',
  })
  expect(store.conversations[3]?.find((value) => value.id === 5)?.projectName).toBe(
    'Renamed Project',
  )
  expect(store.notificationTurnId(4)).toBe(14)
})

it('removes a Conversation from pages and notifications while preserving other Conversations', async () => {
  const store = useNavigationStore()
  await store.load(3)
  store.startListening()
  const oldList = deferred<ApiResponse<PageResult<Conversation>>>()
  const oldStatuses = deferred<ApiResponse<Conversation[]>>()
  vi.mocked(getConversations).mockReturnValueOnce(oldList.promise)
  vi.mocked(getConversationStatuses).mockReturnValueOnce(oldStatuses.promise)
  const listing = store.load(3, true)
  publishRefresh()
  await vi.advanceTimersByTimeAsync(200)
  expect(store.unreadKey(4)).not.toBeNull()
  store.removeConversation('3', '4')
  oldList.resolve(page([conversation(), conversation(5)]))
  oldStatuses.resolve(result([conversation(), conversation(5)]))
  await listing
  await vi.advanceTimersByTimeAsync(0)
  store.upsert(conversation())

  expect(store.conversations[3]?.map((value) => value.id)).toEqual([5])
  expect(store.notificationTurnId(4)).toBeNull()
  expect(store.unreadKey(4)).toBeNull()
  expect(store.notificationTurnId(5)).toBe(15)
  expect(store.unreadKey(5)).not.toBeNull()
})

it('excludes a deleted Conversation returned on a pending later page', async () => {
  const store = useNavigationStore()
  vi.mocked(getConversations).mockResolvedValueOnce(page([conversation()], 12))
  await store.load(3)
  const oldPage = deferred<ApiResponse<PageResult<Conversation>>>()
  vi.mocked(getConversations).mockReturnValueOnce(oldPage.promise)
  const loadingMore = store.loadMore(3)
  store.removeConversation(3, 5)
  oldPage.resolve(page([conversation(5), conversation(6)], 12, 2))
  await loadingMore

  expect(store.conversations[3]?.some((value) => value.id === 5)).toBe(false)
  expect(store.conversations[3]?.some((value) => value.id === 4)).toBe(true)
})

it('removes a Project and cancels pending list and status requests without affecting another Project', async () => {
  const store = useNavigationStore()
  await store.load(3)
  store.upsert(conversation(9, 8))
  store.startListening()
  const oldList = deferred<ApiResponse<PageResult<Conversation>>>()
  const oldStatuses = deferred<ApiResponse<Conversation[]>>()
  vi.mocked(getConversations).mockReturnValueOnce(oldList.promise)
  vi.mocked(getConversationStatuses).mockReturnValueOnce(oldStatuses.promise)
  const listing = store.load(3, true)
  publishRefresh()
  await vi.advanceTimersByTimeAsync(200)
  const listSignal = vi.mocked(getConversations).mock.calls.at(-1)![1]!
  const statusSignal = vi.mocked(getConversationStatuses).mock.calls.at(-1)![2]!
  store.removeProject('3')
  expect(listSignal.aborted).toBe(true)
  expect(statusSignal.aborted).toBe(true)
  oldList.resolve(page([conversation(), conversation(5)]))
  oldStatuses.resolve(result([conversation(), conversation(5)]))
  await listing
  await vi.advanceTimersByTimeAsync(0)
  store.upsert(conversation())

  expect(store.conversations[3]).toBeUndefined()
  expect(store.hasMore(3)).toBe(false)
  expect(store.notificationTurnId(4)).toBeNull()
  expect(store.notificationTurnId(5)).toBeNull()
  expect(store.conversations[8]?.map((value) => value.id)).toEqual([9])
  expect(store.notificationTurnId(9)).toBe(19)
})
