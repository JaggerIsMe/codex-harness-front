import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { useNavigationStore } from '@/stores/navigation'
import { useAgentStore } from '@/stores/agent'
import { getConversations, getConversationStatuses } from '@/api/conversation'
import type { ApiResponse, Conversation, RealtimeEvent } from '@/types/domain'

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

const conversation: Conversation = {
  id: 4,
  projectId: 3,
  projectName: 'Project',
  deviceId: 1,
  workspaceId: 2,
  title: 'Conversation',
  status: 'ACTIVE',
  codexThreadId: 'thread',
  latestTurnId: 8,
  latestTurnStatus: 'CREATED',
  lastActivityAt: '2026-09-10T08:00:00',
}
const result = (data: Conversation[]): ApiResponse<Conversation[]> => ({
  status: 'success',
  code: 200,
  info: '',
  data,
})
let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  pinia = createPinia()
  setActivePinia(pinia)
  vi.mocked(getConversations).mockResolvedValue(result([]))
  vi.mocked(getConversationStatuses).mockResolvedValue(result([]))
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
function turn(type: string, turnId = 8) {
  publish({ type, payload: { conversationId: 4, turnId } })
}

it('promotes explicit Conversation use while silent refresh only forwards authoritative activity', () => {
  const store = useNavigationStore()
  store.upsert(conversation)
  expect(projectStore.promoteProject).toHaveBeenCalledExactlyOnceWith(3)
  expect(projectStore.updateConversationActivity).toHaveBeenCalledExactlyOnceWith(
    3,
    '2026-09-10T08:00:00',
  )
  projectStore.promoteProject.mockClear()
  store.upsert(conversation, { promote: false })
  store.upsert({ ...conversation, lastActivityAt: null }, { promote: false })
  expect(projectStore.promoteProject).not.toHaveBeenCalled()
  expect(projectStore.updateConversationActivity).toHaveBeenLastCalledWith(3, null)
})

it('restores Project activity from list and reconnect status responses without promoting their arrival order', async () => {
  const store = useNavigationStore()
  vi.mocked(getConversations).mockResolvedValueOnce(result([conversation]))
  await store.load(3)
  expect(projectStore.updateConversationActivity).toHaveBeenCalledExactlyOnceWith(
    3,
    '2026-09-10T08:00:00',
  )
  projectStore.updateConversationActivity.mockClear()
  vi.mocked(getConversationStatuses).mockResolvedValueOnce(
    result([{ ...conversation, lastActivityAt: '2026-09-10T08:10:00' }]),
  )
  store.startListening()
  useAgentStore().connectionState = 'CONNECTED'
  await vi.advanceTimersByTimeAsync(200)
  expect(projectStore.updateConversationActivity).toHaveBeenCalledExactlyOnceWith(
    3,
    '2026-09-10T08:10:00',
  )
  expect(projectStore.promoteProject).not.toHaveBeenCalled()
})

it('rejects a late snapshot before forwarding its activity timestamp', async () => {
  const store = useNavigationStore()
  store.upsert(conversation, { promote: false })
  let resolve!: (value: ApiResponse<Conversation[]>) => void
  vi.mocked(getConversations).mockReturnValueOnce(new Promise((done) => (resolve = done)))
  const loading = store.load(3)
  store.startListening()
  turn('TURN_STARTED', 9)
  projectStore.updateConversationActivity.mockClear()
  resolve(result([{ ...conversation, lastActivityAt: '2026-09-10T08:05:00' }]))
  await loading
  expect(projectStore.updateConversationActivity).not.toHaveBeenCalled()
  expect(store.notificationTurnId(4)).toBe(9)
})

it('promotes new Turn phases promptly without repeated tokens or stale events stealing the top Project', () => {
  const store = useNavigationStore()
  store.upsert(conversation, { promote: false })
  store.startListening()
  turn('TURN_STARTED')
  expect(projectStore.promoteProject.mock.calls).toEqual([[3]])
  turn('TURN_STARTED')
  turn('TURN_COMPLETED', 7)
  for (let index = 0; index < 30; index++) turn('MESSAGE_UPDATED')
  expect(projectStore.promoteProject.mock.calls).toEqual([[3]])
  store.upsert({ ...conversation, id: 14, projectId: 13 })
  for (let index = 0; index < 30; index++) turn('MESSAGE_UPDATED')
  expect(projectStore.promoteProject.mock.calls).toEqual([[3], [13]])
  turn('TURN_COMPLETED')
  turn('TURN_COMPLETED')
  turn('MESSAGE_UPDATED')
  turn('TURN_STARTED')
  expect(projectStore.promoteProject.mock.calls).toEqual([[3], [13], [3]])
  turn('MESSAGE_UPDATED', 9)
  turn('MESSAGE_UPDATED', 9)
  expect(projectStore.promoteProject.mock.calls).toEqual([[3], [13], [3], [3]])
})

it('promotes a failed start once and ignores repeated or obsolete command errors', () => {
  const store = useNavigationStore()
  store.upsert(conversation, { promote: false })
  store.startListening()
  const failure: RealtimeEvent = {
    type: 'ERROR',
    correlationId: 8,
    payload: { commandType: 'START_TURN', message: 'Start failed' },
  }
  publish(failure)
  publish(failure)
  publish({ ...failure, correlationId: 7 })
  expect(projectStore.promoteProject.mock.calls).toEqual([[3]])
  expect(store.activity(conversation).state).toBe('error')
})

it('discovers an unknown Conversation through bounded status lookup and uses its server activity', async () => {
  const store = useNavigationStore()
  store.startListening()
  vi.mocked(getConversationStatuses).mockResolvedValueOnce(
    result([{ ...conversation, latestTurnStatus: 'COMPLETED' }]),
  )
  publish({ type: 'TURN_COMPLETED', payload: { projectId: 3, conversationId: 4, turnId: 8 } })
  await vi.advanceTimersByTimeAsync(200)
  expect(getConversationStatuses).toHaveBeenCalledExactlyOnceWith(3, [4], expect.any(AbortSignal))
  expect(getConversations).not.toHaveBeenCalled()
  expect(projectStore.updateConversationActivity).toHaveBeenCalledExactlyOnceWith(
    3,
    '2026-09-10T08:00:00',
  )
  expect(projectStore.promoteProject).not.toHaveBeenCalled()
})
