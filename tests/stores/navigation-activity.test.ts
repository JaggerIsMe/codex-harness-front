import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { useNavigationStore } from '@/stores/navigation'
import { useAgentStore } from '@/stores/agent'
import { getConversations, getConversationStatuses } from '@/api/conversation'
import { getProject } from '@/api/project'
import type { ApiResponse, Conversation, RealtimeEvent } from '@/types/domain'

vi.mock('@/api/conversation', () => ({
  getConversations: vi.fn(),
  getConversationStatuses: vi.fn(),
}))
vi.mock('@/api/project', () => ({ getProject: vi.fn(), getProjects: vi.fn() }))
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
const completed = { ...conversation, latestTurnId: 7, latestTurnStatus: 'COMPLETED' }
const running = { ...conversation, latestTurnId: 8, latestTurnStatus: 'RUNNING' }
const result = (data: Conversation[]): ApiResponse<Conversation[]> => ({
  status: 'success',
  code: 200,
  info: '',
  data,
})
let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.resetAllMocks()
  pinia = createPinia()
  setActivePinia(pinia)
  vi.mocked(getConversations).mockResolvedValue(result([]))
  vi.mocked(getConversationStatuses).mockResolvedValue(result([]))
  vi.mocked(getProject).mockRejectedValue(new Error('Project metadata is outside this fixture'))
})
afterEach(() => {
  disposePinia(pinia)
  vi.restoreAllMocks()
  vi.useRealTimers()
})
function publish(event: RealtimeEvent) {
  const agent = useAgentStore()
  agent.lastEvent = event
  agent.eventRevision++
}
function turn(type: string, conversationId = 4, turnId = 8) {
  publish({ type, payload: { conversationId, turnId } })
}

it('restores running, completed, failed and incomplete results from one list request', async () => {
  const values = [
    conversation,
    { ...running, id: 5 },
    { ...completed, id: 6 },
    { ...completed, id: 7, latestTurnStatus: 'FAILED', latestTurnFailureMessage: '启动超时' },
    { ...completed, id: 8, latestTurnHasIncompleteMessage: true },
    { ...completed, id: 9, latestTurnStatus: 'INTERRUPTED', latestTurnHasIncompleteMessage: true },
  ]
  vi.mocked(getConversations).mockResolvedValue(result(values))
  const store = useNavigationStore()
  await store.load(3)
  expect(values.map((value) => store.activity(value).state)).toEqual([
    'idle',
    'running',
    'completed',
    'error',
    'error',
    'idle',
  ])
  expect(store.activity(values[3]).label).toBe('启动超时')
  expect(getConversations).toHaveBeenCalledTimes(1)
})

it('tracks multiple conversations without a mounted conversation page', () => {
  const store = useNavigationStore()
  const other = { ...conversation, id: 5 }
  store.upsert(conversation)
  store.upsert(other)
  store.startListening()
  store.startListening()
  turn('TURN_STARTED')
  turn('TURN_STARTED', 5, 9)
  expect(store.activity(conversation).state).toBe('running')
  expect(store.activity(other).state).toBe('running')
  turn('TURN_COMPLETED')
  turn('TURN_FAILED', 5, 9)
  expect(store.activity(conversation).state).toBe('completed')
  expect(store.activity(other).state).toBe('error')
})

it('does not let old Turn events or stale list responses replace a newer result', async () => {
  let resolve!: (data: ApiResponse<Conversation[]>) => void
  vi.mocked(getConversations).mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const store = useNavigationStore()
  store.upsert(completed)
  store.startListening()
  const request = store.load(3, true)
  turn('TURN_STARTED', 4, 9)
  turn('TURN_COMPLETED', 4, 8)
  resolve(result([completed]))
  await request
  expect(store.activity(conversation).state).toBe('running')
  turn('TURN_COMPLETED', 4, 9)
  turn('TURN_STARTED', 4, 9)
  store.upsert({ ...running, latestTurnId: 9 })
  expect(store.activity(conversation).state).toBe('completed')
})

it('reconciles a terminal event during the first page request without reloading the list', async () => {
  let resolve!: (data: ApiResponse<Conversation[]>) => void
  vi.mocked(getConversations).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const store = useNavigationStore()
  store.startListening()
  const request = store.load(3)
  vi.mocked(getConversationStatuses).mockResolvedValue(result([completed]))
  publish({ type: 'TURN_COMPLETED', payload: { projectId: 3, conversationId: 4, turnId: 7 } })
  await vi.advanceTimersByTimeAsync(200)
  resolve(result([conversation]))
  await request
  await vi.advanceTimersByTimeAsync(200)
  expect(getConversations).toHaveBeenCalledTimes(1)
  expect(getConversationStatuses).toHaveBeenCalledTimes(1)
  expect(store.activity(conversation).state).toBe('completed')
})

it('marks only running conversations on disconnect and reconciles missed completion on reconnect', async () => {
  const store = useNavigationStore()
  const other = { ...completed, id: 5 }
  store.upsert(running)
  store.upsert(other)
  store.startListening()
  const agent = useAgentStore()
  agent.connectionState = 'CONNECTED'
  agent.connectionState = 'DISCONNECTED'
  expect(store.activity(conversation).state).toBe('error')
  expect(store.activity(other).state).toBe('completed')
  agent.connectionState = 'CONNECTING'
  expect(store.activity(conversation).state).toBe('error')
  vi.mocked(getConversationStatuses).mockResolvedValue(
    result([{ ...running, latestTurnStatus: 'COMPLETED' }, other]),
  )
  agent.connectionState = 'CONNECTED'
  await vi.advanceTimersByTimeAsync(200)
  expect(store.activity(conversation).state).toBe('completed')
})

it('reconciles persisted command timeouts without needing a terminal WebSocket event', async () => {
  const store = useNavigationStore()
  store.upsert({ ...running, latestTurnStatus: 'CREATED' })
  store.startListening()
  vi.mocked(getConversationStatuses).mockResolvedValue(
    result([{ ...running, latestTurnStatus: 'FAILED', latestTurnFailureMessage: '指令响应超时' }]),
  )
  await vi.advanceTimersByTimeAsync(15200)
  expect(store.activity(conversation)).toEqual({ state: 'error', label: '指令响应超时' })
  expect(store.loading[3]).not.toBe(true)
})

it('does not infer failure from long silent execution or request the list per token', async () => {
  const store = useNavigationStore()
  store.upsert(running)
  store.startListening()
  for (let i = 1; i <= 300; i++)
    publish({
      type: 'MESSAGE_UPDATED',
      payload: { conversationId: 4, turnId: 8, cursor: i, patches: [] },
    })
  await vi.advanceTimersByTimeAsync(1000)
  expect(getConversations).not.toHaveBeenCalled()
  vi.mocked(getConversationStatuses).mockResolvedValue(result([running]))
  await vi.advanceTimersByTimeAsync(60000)
  expect(store.activity(conversation).state).toBe('running')
})

it('handles correlated Thread and Turn failures and Device offline independently', () => {
  const store = useNavigationStore()
  const initializing = { ...conversation, id: 5, codexThreadId: '' }
  const otherDevice = { ...running, id: 6, deviceId: 2, latestTurnId: 10 }
  store.upsert(running)
  store.upsert(initializing)
  store.upsert(otherDevice)
  store.startListening()
  publish({ type: 'ERROR', correlationId: 5, payload: { commandType: 'START_THREAD' } })
  expect(store.activity(initializing).state).toBe('error')
  publish({ type: 'ERROR', correlationId: 10, payload: { commandType: 'START_TURN' } })
  expect(store.activity(otherDevice).state).toBe('error')
  store.upsert({ ...completed, id: 7, deviceId: 1 })
  publish({ type: 'DEVICE_OFFLINE', deviceId: 1 })
  expect(store.activity(conversation).state).toBe('error')
  expect(store.activity({ ...completed, id: 7 }).state).toBe('completed')
})

it('preserves request errors through list refresh and clears them on recovery or a new Turn', async () => {
  const store = useNavigationStore()
  store.markIssue(4, '消息读取失败')
  store.upsert(completed)
  expect(store.activity(conversation).state).toBe('error')
  vi.mocked(getConversations).mockResolvedValue(result([completed]))
  await store.load(3, true)
  expect(store.activity(conversation).state).toBe('error')
  store.clearIssue(4, 'message')
  expect(store.activity(conversation).state).toBe('completed')
  store.markIssue(4, '发送失败', 'send')
  expect(store.activity(conversation).state).toBe('error')
  store.recordTurn(4, { id: 8, status: 'CREATED' })
  expect(store.activity(conversation).state).toBe('running')
})

it('recovers a failed status reconciliation without clearing message reception errors', async () => {
  const store = useNavigationStore()
  store.upsert(running)
  store.startListening()
  vi.mocked(getConversationStatuses).mockRejectedValueOnce(new Error('network'))
  useAgentStore().connectionState = 'CONNECTED'
  await vi.advanceTimersByTimeAsync(200)
  expect(store.activity(conversation).state).toBe('error')
  vi.mocked(getConversationStatuses).mockResolvedValue(result([running]))
  publish({ type: 'REGISTER' })
  await vi.advanceTimersByTimeAsync(200)
  expect(store.activity(conversation).state).toBe('running')
})

it('releases global listeners, timers and pending requests on reset', async () => {
  let resolve!: (data: ApiResponse<Conversation[]>) => void
  vi.mocked(getConversations).mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const store = useNavigationStore()
  store.upsert(running)
  store.startListening()
  const request = store.load(3, true)
  const signal = vi.mocked(getConversations).mock.calls[0][1]!
  turn('TURN_COMPLETED')
  store.reset()
  expect(signal.aborted).toBe(true)
  resolve(result([completed]))
  await request
  turn('TURN_FAILED')
  await vi.advanceTimersByTimeAsync(30000)
  expect(store.conversations).toEqual({})
  expect(store.activity(conversation).state).toBe('idle')
  expect(getConversations).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it('clears transient reception errors after a complete persisted reply without reopening its view', async () => {
  const store = useNavigationStore()
  store.upsert(running)
  store.markIssue(4, '实时缓存暂不可用', 'message', 8)
  vi.mocked(getConversations).mockResolvedValue(
    result([{ ...running, latestTurnStatus: 'COMPLETED', latestTurnHasIncompleteMessage: false }]),
  )
  await store.load(3, true, true)
  expect(store.activity(conversation).state).toBe('completed')
})

it('does not apply old message snapshot health to a newer Turn', () => {
  const store = useNavigationStore()
  store.upsert(running)
  store.markIssue(4, '旧回复不完整', 'message', 7)
  expect(store.activity(conversation).state).toBe('running')
  store.markIssue(4, '新回复读取失败', 'message', 8)
  store.clearIssue(4, 'message', 7)
  store.clearIssue(4, 'message', null)
  expect(store.activity(conversation).state).toBe('error')
  store.clearIssue(4, 'message', 8)
  expect(store.activity(conversation).state).toBe('running')
})

it('does not expand a project when a background snapshot updates a conversation', () => {
  const store = useNavigationStore()
  store.upsert(running)
  store.expanded[3] = false
  store.upsert({ ...running, latestTurnStatus: 'COMPLETED' })
  expect(store.expanded[3]).toBe(false)
})

it('acknowledges completed and failed notifications without changing their execution state', () => {
  const store = useNavigationStore()
  const failed = { ...running, id: 5, latestTurnStatus: 'FAILED' }
  store.upsert(completed)
  store.upsert(failed)
  store.markRead(4, 7)
  expect(store.activity(completed).state).toBe('idle')
  expect(store.unreadKey(4)).toBeNull()
  expect(store.activity(failed).state).toBe('error')
  store.markRead(5, 8)
  expect(store.activity(failed).state).toBe('idle')
  expect(store.activity(failed).label).toBe('回复异常')
  store.recordTurn(5, { id: 8, status: 'RUNNING' })
  expect(store.activity(failed).state).toBe('idle')
})

it('keeps running indicators and announces the next Turn after an earlier result was read', () => {
  const store = useNavigationStore()
  store.upsert(completed)
  store.markRead(4)
  store.recordTurn(4, { id: 8, status: 'RUNNING' })
  store.markRead(4)
  expect(store.activity(conversation).state).toBe('running')
  expect(store.unreadKey(4)).toBeNull()
  store.recordTurn(4, { id: 8, status: 'COMPLETED' })
  expect(store.activity(conversation).state).toBe('completed')
  store.markRead(4, 7)
  expect(store.activity(conversation).state).toBe('completed')
  store.markRead(4, 8)
  expect(store.activity(conversation).state).toBe('idle')
})

it('does not recreate read dots when snapshots or duplicate terminal events arrive', async () => {
  const store = useNavigationStore()
  store.startListening(1)
  store.upsert(completed)
  store.markRead(4)
  vi.mocked(getConversations).mockResolvedValue(result([completed]))
  await store.load(3, true)
  turn('TURN_COMPLETED', 4, 7)
  expect(store.activity(conversation).state).toBe('idle')
  store.upsert({ ...completed, id: 5, latestTurnStatus: 'FAILED' })
  store.markRead(5)
  store.upsert({
    ...completed,
    id: 5,
    latestTurnStatus: 'FAILED',
    latestTurnFailureMessage: 'Detailed error received later',
  })
  expect(store.activity({ ...conversation, id: 5 }).state).toBe('idle')
})

it('restores read receipts after reload and keeps them separate for each signed-in user', () => {
  const store = useNavigationStore()
  store.startListening(1)
  store.upsert(completed)
  store.markRead(4)
  store.reset()
  store.startListening(1)
  store.upsert(completed)
  expect(store.activity(conversation).state).toBe('idle')
  store.reset()
  store.startListening(2)
  store.upsert(completed)
  expect(store.activity(conversation).state).toBe('completed')
})

it('allows recurring errors to notify again without restoring a previously read completion dot', () => {
  const store = useNavigationStore()
  store.upsert(completed)
  store.markRead(4)
  store.markIssue(4, 'Send failed', 'send')
  expect(store.activity(conversation).state).toBe('error')
  store.markRead(4)
  store.markIssue(4, 'Send failed', 'send')
  expect(store.activity(conversation).state).toBe('idle')
  store.clearIssue(4, 'send')
  expect(store.activity(conversation).state).toBe('idle')
  store.markIssue(4, 'Send failed', 'send')
  expect(store.activity(conversation).state).toBe('error')
})

it('can read a connection failure and notifies again only after recovery and another disconnection', () => {
  const store = useNavigationStore()
  store.startListening(1)
  store.upsert(running)
  const agent = useAgentStore()
  agent.connectionState = 'CONNECTED'
  agent.connectionState = 'DISCONNECTED'
  store.markRead(4)
  expect(store.activity(conversation).state).toBe('idle')
  store.upsert(running)
  expect(store.activity(conversation).state).toBe('idle')
  agent.connectionState = 'CONNECTED'
  expect(store.activity(conversation).state).toBe('running')
  agent.connectionState = 'DISCONNECTED'
  expect(store.activity(conversation).state).toBe('error')
})

it('keeps reading usable when storage is blocked or contains malformed data', () => {
  const store = useNavigationStore()
  localStorage.setItem('harness.conversation-read.v1:1', '{broken')
  store.startListening(1)
  store.upsert(completed)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Storage denied')
  })
  expect(() => store.markRead(4)).not.toThrow()
  expect(store.activity(conversation).state).toBe('idle')
})

it('receives read acknowledgements from another browser tab for the same account', () => {
  const store = useNavigationStore()
  store.startListening(1)
  store.upsert(completed)
  const key = store.unreadKey(4)!
  localStorage.setItem('harness.conversation-read.v1:1', JSON.stringify({ '4': [key] }))
  window.dispatchEvent(new StorageEvent('storage', { key: 'harness.conversation-read.v1:1' }))
  expect(store.activity(conversation).state).toBe('idle')
})
