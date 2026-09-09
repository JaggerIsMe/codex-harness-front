import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { nextTick, reactive } from 'vue'
import { useNavigationStore } from '@/stores/navigation'
import { useAgentStore } from '@/stores/agent'
import { getConversations, getConversationStatuses } from '@/api/conversation'
import type { ApiResponse, Conversation, PageResult, Project } from '@/types/domain'

vi.mock('@/api/conversation', () => ({
  getConversations: vi.fn(),
  getConversationStatuses: vi.fn(),
}))
vi.mock('@/stores/project', () => ({ useProjectStore: () => visibleProjects }))
const visibleProjects = reactive({
  visibleProjects: [] as { id: number; provisioningStatus: string }[],
  projects: [] as Project[],
})

function conversation(id: number, title = `Conversation ${id}`): Conversation {
  return {
    id,
    projectId: 3,
    projectName: 'Project',
    deviceId: 1,
    workspaceId: 2,
    title,
    status: 'ACTIVE',
    codexThreadId: `thread-${id}`,
  }
}
function result<T>(data: T): ApiResponse<T> {
  return { status: 'success', code: 200, info: '', data }
}
function page(
  items: Conversation[],
  total: number,
  page = 1,
): ApiResponse<PageResult<Conversation>> {
  return result({ items, total, page, size: 10 })
}
function rows(start: number, count: number) {
  return Array.from({ length: count }, (_, index) => conversation(start + index))
}
let pinia: ReturnType<typeof createPinia>

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  visibleProjects.visibleProjects = []
  visibleProjects.projects = []
  pinia = createPinia()
  setActivePinia(pinia)
  vi.mocked(getConversations).mockResolvedValue(page([], 0))
  vi.mocked(getConversationStatuses).mockResolvedValue(result([]))
})

afterEach(() => {
  disposePinia(pinia)
  vi.useRealTimers()
})

it('loads only the first ten Conversations and appends later pages on demand', async () => {
  vi.mocked(getConversations)
    .mockResolvedValueOnce(page(rows(1, 10), 25))
    .mockResolvedValueOnce(page(rows(11, 10), 25, 2))
    .mockResolvedValueOnce(page(rows(21, 5), 25, 3))
  const store = useNavigationStore()
  await store.load(3)
  expect(getConversations).toHaveBeenCalledExactlyOnceWith(3, expect.any(AbortSignal), {
    page: 1,
    size: 10,
    keyword: '',
  })
  expect(store.conversations[3]).toHaveLength(10)
  expect(store.hasMore(3)).toBe(true)
  await store.loadMore(3)
  expect(store.conversations[3]).toHaveLength(20)
  expect(store.hasMore(3)).toBe(true)
  await store.loadMore(3)
  expect(store.conversations[3]).toHaveLength(25)
  expect(store.hasMore(3)).toBe(false)
  await store.loadMore(3)
  expect(getConversations).toHaveBeenCalledTimes(3)
})

it('serializes load-more requests and retries a failed page without skipping it', async () => {
  vi.mocked(getConversations).mockResolvedValueOnce(page(rows(1, 10), 20))
  const store = useNavigationStore()
  await store.load(3)
  let reject!: (error: Error) => void
  vi.mocked(getConversations).mockImplementationOnce(
    () => new Promise((_resolve, failure) => (reject = failure)),
  )
  const loading = store.loadMore(3)
  await store.loadMore(3)
  expect(getConversations).toHaveBeenCalledTimes(2)
  expect(store.loadingMore[3]).toBe(true)
  reject(new Error('第二页加载失败'))
  await loading
  expect(store.errorsMore[3]).toBe('第二页加载失败')
  expect(store.loadingMore[3]).toBe(false)
  expect(store.conversations[3]).toHaveLength(10)
  vi.mocked(getConversations).mockResolvedValueOnce(page(rows(11, 10), 20, 2))
  await store.loadMore(3)
  expect(getConversations).toHaveBeenLastCalledWith(3, expect.any(AbortSignal), {
    page: 2,
    size: 10,
    keyword: '',
  })
  expect(store.errorsMore[3]).toBe('')
  expect(store.conversations[3]).toHaveLength(20)
})

it('deduplicates overlapping pages and preserves loaded history on a first-page refresh', async () => {
  vi.mocked(getConversations)
    .mockResolvedValueOnce(page(rows(1, 10), 30))
    .mockResolvedValueOnce(page(rows(10, 10), 30, 2))
    .mockResolvedValueOnce(page(rows(1, 10), 30))
  const store = useNavigationStore()
  await store.load(3)
  await store.loadMore(3)
  store.upsert(conversation(70, 'Selected from a direct link'))
  await store.load(3, true, true)
  expect(store.conversations[3]).toHaveLength(20)
  expect(store.conversations[3].some((value) => value.id === 19)).toBe(true)
  expect(store.conversations[3].some((value) => value.id === 70)).toBe(true)
  expect(store.hasMore(3)).toBe(true)
  vi.mocked(getConversations).mockResolvedValueOnce(page(rows(20, 10), 30, 3))
  await store.loadMore(3)
  expect(vi.mocked(getConversations).mock.calls.at(-1)?.[2]?.page).toBe(3)
})

it('cancels obsolete search pages and rejects late responses while retaining activity and read receipts', async () => {
  const store = useNavigationStore()
  const previous = { ...conversation(4), latestTurnId: 7, latestTurnStatus: 'COMPLETED' }
  store.upsert(previous)
  store.markRead(4)
  let resolve!: (value: ApiResponse<PageResult<Conversation>>) => void
  vi.mocked(getConversations).mockImplementationOnce(() => new Promise((done) => (resolve = done)))
  const old = store.load(3)
  const signal = vi.mocked(getConversations).mock.calls[0]![1]!
  visibleProjects.visibleProjects = [{ id: 3, provisioningStatus: 'READY' }]
  vi.mocked(getConversations).mockResolvedValueOnce(page([conversation(8, 'matching title')], 1))
  store.setKeyword(' matching ')
  await vi.advanceTimersByTimeAsync(0)
  expect(signal.aborted).toBe(true)
  expect(store.keyword).toBe('matching')
  expect(store.activity(previous).state).toBe('idle')
  resolve(page(rows(1, 10), 100))
  await old
  expect(store.conversations[3].map((value) => value.id)).toEqual([8])
  expect(store.hasMore(3)).toBe(false)
})

it('repeats an explicit search with the same keyword and replaces stale result membership', async () => {
  visibleProjects.visibleProjects = [{ id: 3, provisioningStatus: 'READY' }]
  vi.mocked(getConversations)
    .mockResolvedValueOnce(page([conversation(4, 'matching previous')], 1))
    .mockResolvedValueOnce(page([conversation(5, 'matching new')], 1))
  const store = useNavigationStore()
  store.setKeyword('matching')
  await vi.advanceTimersByTimeAsync(0)
  const previous = { ...conversation(4), latestTurnId: 7, latestTurnStatus: 'COMPLETED' }
  store.upsert(previous)
  store.markRead(4)
  store.setKeyword(' matching ')
  await vi.advanceTimersByTimeAsync(0)
  expect(getConversations).toHaveBeenCalledTimes(2)
  expect(store.conversations[3].map((value) => value.id)).toEqual([5])
  expect(store.activity(previous).state).toBe('idle')
  store.upsert(previous)
  expect(store.conversations[3].map((value) => value.id)).toEqual([5])
})

it('keeps unmatched creations out of search while preserving authoritative result membership', async () => {
  const store = useNavigationStore()
  store.setKeyword('matching')
  let resolve!: (value: ApiResponse<PageResult<Conversation>>) => void
  vi.mocked(getConversations).mockImplementationOnce(() => new Promise((done) => (resolve = done)))
  const loading = store.load(3)
  store.upsert(conversation(4, 'renamed outside search'))
  store.upsert(conversation(5, 'another unrelated Conversation'))
  resolve(page([conversation(4, 'matching old title'), conversation(6, 'matching result')], 2))
  await loading
  expect(store.conversations[3].map((value) => value.id)).toEqual([4, 6])
  expect(store.conversations[3][0]?.title).toBe('renamed outside search')
  store.upsert(conversation(7, 'matching new Conversation'))
  expect(store.conversations[3].map((value) => value.id)).toEqual([7, 4, 6])
})

it('retains server matches across status refreshes even when matching project metadata is not cached', async () => {
  const store = useNavigationStore()
  store.setKeyword('workspace path')
  vi.mocked(getConversations).mockResolvedValueOnce(page([conversation(4)], 1))
  await store.load(3)
  expect(store.conversations[3].map((value) => value.id)).toEqual([4])
  const completed = { ...conversation(4), latestTurnId: 7, latestTurnStatus: 'COMPLETED' }
  vi.mocked(getConversationStatuses).mockResolvedValueOnce(result([completed]))
  store.startListening()
  await vi.advanceTimersByTimeAsync(15200)
  expect(store.conversations[3].map((value) => value.id)).toEqual([4])
  expect(store.activity(completed).state).toBe('completed')
  store.upsert({ ...completed, title: 'Updated title' })
  expect(store.conversations[3][0]?.title).toBe('Updated title')
  store.setKeyword('another query')
  store.upsert(completed)
  expect(store.conversations[3]).toBeUndefined()
})

it.each(['projectName', 'deviceName', 'deviceCode', 'workspaceName', 'rootPath'] as const)(
  'admits new Conversations when the project %s matches the server query',
  (field) => {
    visibleProjects.projects = [
      {
        id: 3,
        projectName: 'Project',
        provisioningStatus: 'READY',
        status: 'ACTIVE',
        isolationMode: 'WORKTREE',
        deviceId: 1,
        deviceCode: 'device-1',
        deviceName: 'Device',
        deviceStatus: 'ONLINE',
        workspaceId: 2,
        workspaceName: 'Workspace',
        rootPath: 'D:/workspace',
        workspaceStatus: 'READY',
        conversationCount: 0,
        createdAt: '',
        [field]: 'Matching metadata',
      },
    ]
    const store = useNavigationStore()
    store.setKeyword('matching')
    store.upsert(conversation(4, 'Unrelated title'))
    expect(store.conversations[3].map((value) => value.id)).toEqual([4])
    store.upsert({ ...conversation(5, 'Unrelated title'), projectId: 9 })
    expect(store.conversations[9]).toBeUndefined()
  },
)

it('loads newly visible project first pages and keeps off-search Conversation statuses current', async () => {
  const store = useNavigationStore()
  const previous = { ...conversation(4), latestTurnId: 7, latestTurnStatus: 'COMPLETED' }
  store.upsert(previous)
  store.markRead(4)
  store.startListening()
  store.setKeyword('matching')
  expect(getConversations).not.toHaveBeenCalled()
  vi.mocked(getConversations).mockResolvedValueOnce(page([conversation(6, 'matching result')], 1))
  visibleProjects.visibleProjects = [{ id: 3, provisioningStatus: 'READY' }]
  await nextTick()
  await vi.advanceTimersByTimeAsync(0)
  expect(store.conversations[3].map((value) => value.id)).toEqual([6])
  vi.mocked(getConversationStatuses).mockResolvedValue(
    result([{ ...previous, latestTurnId: 8, latestTurnStatus: 'FAILED' }]),
  )
  await vi.advanceTimersByTimeAsync(15200)
  expect(store.activity(previous).state).toBe('error')
  expect(store.conversations[3].map((value) => value.id)).toEqual([6])
  expect(getConversations).toHaveBeenCalledTimes(1)
  expect(vi.mocked(getConversationStatuses).mock.calls[0]![1]).toContain(4)
})

it('reconciles known Conversations in batches of at most one hundred without fetching more pages', async () => {
  const store = useNavigationStore()
  const known = rows(1, 205)
  known.forEach((value) => store.upsert(value))
  store.startListening()
  await vi.advanceTimersByTimeAsync(15200)
  expect(getConversations).not.toHaveBeenCalled()
  expect(vi.mocked(getConversationStatuses).mock.calls.map((call) => call[1].length)).toEqual([
    100, 100, 5,
  ])
  expect(store.conversations[3]).toHaveLength(205)
})

it('ignores stale status responses after a newer Turn event', async () => {
  const store = useNavigationStore()
  const running = { ...conversation(4), latestTurnId: 8, latestTurnStatus: 'RUNNING' }
  store.upsert(running)
  let resolve!: (value: ApiResponse<Conversation[]>) => void
  vi.mocked(getConversationStatuses).mockImplementationOnce(
    () => new Promise((done) => (resolve = done)),
  )
  store.startListening()
  const agent = useAgentStore()
  agent.connectionState = 'CONNECTED'
  await vi.advanceTimersByTimeAsync(200)
  agent.lastEvent = { type: 'TURN_COMPLETED', payload: { conversationId: 4, turnId: 8 } }
  agent.eventRevision++
  resolve(result([running]))
  await vi.advanceTimersByTimeAsync(0)
  expect(store.activity(running).state).toBe('completed')
})

it('aborts both page and status requests on reset and ignores all late responses', async () => {
  const store = useNavigationStore()
  store.upsert(conversation(4))
  let resolvePage!: (value: ApiResponse<PageResult<Conversation>>) => void
  let resolveStatus!: (value: ApiResponse<Conversation[]>) => void
  vi.mocked(getConversations).mockImplementationOnce(
    () => new Promise((done) => (resolvePage = done)),
  )
  vi.mocked(getConversationStatuses).mockImplementationOnce(
    () => new Promise((done) => (resolveStatus = done)),
  )
  const loading = store.load(3)
  store.startListening()
  useAgentStore().connectionState = 'CONNECTED'
  await vi.advanceTimersByTimeAsync(200)
  const pageSignal = vi.mocked(getConversations).mock.calls[0]![1]!
  const statusSignal = vi.mocked(getConversationStatuses).mock.calls[0]![2]!
  store.reset()
  expect(pageSignal.aborted).toBe(true)
  expect(statusSignal.aborted).toBe(true)
  resolvePage(page([conversation(4)], 1))
  resolveStatus(result([conversation(4)]))
  await loading
  await vi.advanceTimersByTimeAsync(0)
  expect(store.conversations).toEqual({})
  expect(store.loadingMore).toEqual({})
  expect(store.activity(conversation(4)).state).toBe('idle')
  expect(vi.getTimerCount()).toBe(0)
})
