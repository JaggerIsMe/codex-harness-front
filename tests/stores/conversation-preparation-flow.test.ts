import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useAgentStore } from '@/stores/agent'
import { useAuthStore } from '@/stores/auth'
import { useConversationStore } from '@/stores/conversation'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectStore } from '@/stores/project'
import { setAccessToken, removeAccessToken } from '@/utils/auth'
import * as conversationApi from '@/api/conversation'
import { getSocketTicket } from '@/api/auth'
import type {
  ApiResponse,
  Conversation,
  Message,
  MessageState,
  Project,
  RealtimeEvent,
  Turn,
} from '@/types/domain'

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
vi.mock('@/api/auth', () => ({
  getSocketTicket: vi.fn(),
  getProfile: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}))
vi.mock('@/api/agent', () => ({
  getDevices: vi.fn(),
  getDeviceWorkspaceRoots: vi.fn(),
  getDeviceWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
}))
vi.mock('@/api/project', () => ({ getProject: vi.fn(), getProjects: vi.fn() }))

// Use the real Agent socket listeners and frame parser; only the transport is replaced.
class TestSocket extends EventTarget {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 3
  static instances: TestSocket[] = []
  readyState = TestSocket.CONNECTING

  constructor(_url: string) {
    super()
    TestSocket.instances.push(this)
  }

  open() {
    this.readyState = TestSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  receive(frame: RealtimeEvent) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(frame) }))
  }

  close() {
    this.readyState = TestSocket.CLOSED
    this.dispatchEvent(new CloseEvent('close', { code: 1000 }))
  }
}

// Intentionally omit all latestTurn fields, as on the previous backend release.
const conversation: Conversation = {
  id: 4,
  projectId: 3,
  projectName: 'Project',
  deviceId: 1,
  workspaceId: 2,
  title: 'Expert preparation regression',
  status: 'ACTIVE',
  codexThreadId: 'thread',
}
const project: Project = {
  id: 3,
  projectName: 'Project',
  provisioningStatus: 'READY',
  status: 'ACTIVE',
  isolationMode: 'WORKSPACE',
  deviceId: 1,
  deviceCode: 'test-device',
  deviceName: 'Test Device',
  deviceStatus: 'ONLINE',
  workspaceId: 2,
  workspaceName: 'Workspace',
  rootPath: 'D:/test-project',
  workspaceStatus: 'READY',
  conversationCount: 1,
  createdAt: '',
}
let pinia: ReturnType<typeof createPinia>
let backendTurn: Turn | null
let backendState: MessageState
let nextTurnId = 7

type ConversationFailureState = ReturnType<typeof useConversationStore> & { turnError: string }

function result<T>(data: T): ApiResponse<T> {
  return { status: 'success', code: 200, info: '', data }
}

function answer(cursor: number, content: string): RealtimeEvent {
  return {
    type: 'MESSAGE_UPDATED',
    deviceId: 1,
    payload: {
      conversationId: 4,
      turnId: 7,
      cursor,
      patches: [
        {
          operation: cursor === 1 ? 'REPLACE' : 'APPEND',
          baseRevision: cursor - 1,
          message: {
            id: 10,
            turnId: 7,
            sequenceNo: 2,
            messageKey: 'turn-7/answer',
            revision: cursor,
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

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', TestSocket)
  TestSocket.instances = []
  pinia = createPinia()
  setActivePinia(pinia)
  setAccessToken('unit-test-token')
  useAuthStore().user = {
    id: 1,
    username: 'test-user',
    displayName: 'Test User',
    roles: [],
    permissions: ['workspace:use'],
    mustChangePassword: false,
  }
  backendTurn = null
  nextTurnId = 7
  backendState = {
    messages: [],
    turnId: null,
    cursor: 0,
    hasMore: false,
    degraded: false,
    resetRequired: false,
    updates: [],
  }
  vi.mocked(getSocketTicket).mockResolvedValue(
    result({ ticket: 'unit-test-ticket', expiresInSeconds: 60 }),
  )
  vi.mocked(conversationApi.getConversations).mockResolvedValue(result([conversation]))
  vi.mocked(conversationApi.getConversation).mockResolvedValue(result(conversation))
  vi.mocked(conversationApi.getActiveTurn).mockImplementation(async () =>
    result(backendTurn ? { ...backendTurn } : null),
  )
  vi.mocked(conversationApi.getConversationMessageState).mockImplementation(async () =>
    result({ ...backendState, messages: backendState.messages.map((message) => ({ ...message })) }),
  )
  vi.mocked(conversationApi.getConversationApprovals).mockResolvedValue(result([]))
  vi.mocked(conversationApi.startTurn).mockImplementation(async () => {
    backendTurn = { id: nextTurnId, status: 'CREATED', preparationPhase: 'EXPERT_SKILLS' }
    backendState = { ...backendState, turnId: nextTurnId }
    return result({ ...backendTurn })
  })
})

afterEach(() => {
  disposePinia(pinia)
  removeAccessToken()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function openAndSend() {
  useProjectStore().projects = [project]
  const navigation = useNavigationStore()
  navigation.startListening()
  const store = useConversationStore()
  store.startListening()
  const agent = useAgentStore()
  await agent.connect()
  const socket = TestSocket.instances[0]!
  socket.open()
  await nextTick()
  await store.openConversation(3, 4)
  await store.startNewTurn({ message: 'Please reply after preparing the Expert Skills' })
  expect(store.currentTurn).toMatchObject({ status: 'CREATED', preparationPhase: 'EXPERT_SKILLS' })
  expect(navigation.activity(conversation).state).toBe('running')
  expect(agent.connectionState).toBe('CONNECTED')
  return { store, navigation, agent, socket }
}

it('leaves Expert Skill preparation and receives the complete reply with both real store listeners', async () => {
  const { store, navigation, agent, socket } = await openAndSend()
  navigation.expanded[3] = false
  socket.receive({ type: 'SKILL_INSTALL_RESULT', deviceId: 1, payload: { conversationId: 4 } })
  backendTurn = { id: 7, status: 'RUNNING', preparationPhase: null, codexTurnId: 'codex-turn' }
  socket.receive({
    type: 'TURN_STARTED',
    deviceId: 1,
    payload: { conversationId: 4, turnId: 7, codexTurnId: 'codex-turn' },
  })
  expect(store.currentTurn?.status).toBe('RUNNING')
  expect(store.currentTurn?.preparationPhase).not.toBe('EXPERT_SKILLS')
  socket.receive(answer(1, 'Expert Skills ready. '))
  socket.receive(answer(2, 'Here is the reply.'))
  await vi.advanceTimersByTimeAsync(60)
  expect(store.messages[0]?.content).toBe('Expert Skills ready. Here is the reply.')

  const completed: Message = { ...store.messages[0]!, status: 'COMPLETED', streaming: false }
  backendState = { ...backendState, messages: [completed], cursor: 2 }
  backendTurn = null
  socket.receive({ type: 'TURN_COMPLETED', payload: { conversationId: 4, turnId: 7 } })
  await vi.advanceTimersByTimeAsync(250)
  expect(store.isTurnActive).toBe(false)
  expect(store.messages[0]?.content).toBe('Expert Skills ready. Here is the reply.')
  expect(navigation.activity(conversation).state).toBe('completed')
  expect(navigation.expanded[3]).toBe(false)
  expect(agent.eventRevision).toBe(5)
})

it('keeps Turn start and every streamed fragment arriving while an older preparation snapshot is pending', async () => {
  const { store, navigation, socket } = await openAndSend()
  let resolveSnapshot!: (value: ApiResponse<MessageState>) => void
  const staleSnapshot = { ...backendState, messages: [] }
  vi.mocked(conversationApi.getConversationMessageState).mockImplementationOnce(
    () => new Promise((resolve) => (resolveSnapshot = resolve)),
  )
  const refreshing = store.refreshCurrent()
  socket.receive({ type: 'SKILL_INSTALL_RESULT', deviceId: 1, payload: { conversationId: 4 } })
  backendTurn = { id: 7, status: 'RUNNING', preparationPhase: null }
  socket.receive({ type: 'TURN_STARTED', payload: { conversationId: 4, turnId: 7 } })
  for (let cursor = 1; cursor <= 300; cursor++) socket.receive(answer(cursor, 'x'))
  resolveSnapshot(result(staleSnapshot))
  await refreshing
  await vi.advanceTimersByTimeAsync(60)
  expect(store.currentTurn?.status).toBe('RUNNING')
  expect(store.currentTurn?.preparationPhase).not.toBe('EXPERT_SKILLS')
  expect(store.messages[0]?.content).toBe('x'.repeat(300))
  expect(navigation.activity(conversation).state).toBe('running')
  expect(store.detailError).toBe('')
})

it('shows a START_TURN failure during Expert Skill preparation and preserves it across legacy snapshots', async () => {
  nextTurnId = 18
  const { store, socket } = await openAndSend()
  const failureState = store as ConversationFailureState
  const message =
    'Codex method failed: thread/resume: thread test-thread already has an active writer'
  const failure = {
    type: 'ERROR',
    deviceId: 1,
    correlationId: '18',
    payload: { commandType: 'START_TURN', errorCode: 'COMMAND_FAILED', message },
  }
  backendTurn = null
  backendState = {
    ...backendState,
    messages: [
      {
        id: 30,
        turnId: 18,
        sequenceNo: 1,
        role: 'USER',
        messageType: 'TEXT',
        content: 'Please reply after preparing the Expert Skills',
        status: 'COMPLETED',
      },
    ],
  }
  socket.receive(failure)
  expect(store.currentTurn?.status).toBe('FAILED')
  expect(failureState.turnError).toBe(message)

  await vi.advanceTimersByTimeAsync(250)
  expect(store.currentTurn?.status).toBe('FAILED')
  expect(store.isTurnActive).toBe(false)
  expect(failureState.turnError).toBe(message)
  expect(store.messages).toHaveLength(1)
  expect(store.messages[0]?.role).toBe('USER')

  await store.refreshCurrent({ silent: true })
  expect(store.currentTurn?.status).toBe('FAILED')
  expect(failureState.turnError).toBe(message)

  nextTurnId = 19
  await store.startNewTurn({ message: 'Retry after resolving the active writer' })
  expect(store.currentTurn?.id).toBe(19)
  expect(failureState.turnError).toBe('')

  socket.receive({ ...failure, correlationId: '19' })
  expect(failureState.turnError).toBe(message)
  vi.mocked(conversationApi.getConversation).mockResolvedValueOnce(
    result({ ...conversation, id: 5 }),
  )
  backendTurn = null
  backendState = { ...backendState, turnId: null, messages: [] }
  await store.openConversation(3, 5)
  expect(failureState.turnError).toBe('')
})
