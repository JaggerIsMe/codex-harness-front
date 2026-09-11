import { setAccessToken, sessionCredentials } from '../support/auth'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { useAgentStore } from '@/stores/agent'
import { useAuthStore } from '@/stores/auth'
import * as authApi from '@/api/auth'
import { getAccessToken, captureAuthSession, readAuthSession, setAuthSession } from '@/utils/auth'
import type { ApiResponse, User } from '@/types/domain'

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('@/router/index.js', () => ({
  default: {
    currentRoute: { value: { name: 'projects', fullPath: '/projects', meta: {} } },
    replace,
  },
}))
vi.mock('@/api/auth', () => ({
  getSocketTicket: vi.fn(),
  getProfile: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  refreshSession: vi.fn(),
}))
vi.mock('@/api/agent.ts', () => ({
  getDevices: vi.fn(),
  getDeviceWorkspaceRoots: vi.fn(),
  getDeviceWorkspaces: vi.fn(),
}))

class Socket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static instances: Socket[] = []
  readyState = Socket.CONNECTING
  listeners = new Map<string, (event: Event) => void>()
  close = vi.fn(() => {
    this.readyState = 3
  })
  constructor(readonly url: string) {
    Socket.instances.push(this)
  }
  addEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.set(type, listener)
  }
  removeEventListener(type: string) {
    this.listeners.delete(type)
  }
  emit(type: string, event: Event) {
    this.listeners.get(type)?.(event)
  }
  open() {
    this.readyState = Socket.OPEN
    this.emit('open', new Event('open'))
  }
  end(code: number) {
    this.readyState = 3
    this.emit('close', new CloseEvent('close', { code }))
  }
}
const user: User = {
  id: 1,
  email: 'user@example.com',
  displayName: 'User',
  activated: true,
  mustChangePassword: false,
  roles: [],
  permissions: ['workspace:use'],
}
const envelope = <T>(data: T): ApiResponse<T> => ({ status: 'success', code: 200, info: '', data })
let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  vi.stubGlobal('WebSocket', Socket)
  Socket.instances = []
  setActivePinia((pinia = createPinia()))
  setAccessToken('old-token')
  useAuthStore().user = user
  vi.mocked(authApi.getSocketTicket).mockResolvedValue(
    envelope({ ticket: 'ticket', expiresInSeconds: 30 }),
  )
})
afterEach(() => {
  disposePinia(pinia)
  localStorage.clear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it.each([
  [4001, 'session-replaced'],
  [1008, 'session-expired'],
] as const)('ends the current session on close %s and stops reconnecting', async (code, reason) => {
  const agent = useAgentStore()
  await agent.connect()
  Socket.instances[0]!.open()
  Socket.instances[0]!.end(code)
  await vi.advanceTimersByTimeAsync(12000)
  expect(useAuthStore().token).toBeNull()
  expect(agent.connectionState).toBe('DISCONNECTED')
  expect(authApi.getSocketTicket).toHaveBeenCalledTimes(1)
  expect(replace).toHaveBeenCalledOnce()
  expect(replace).toHaveBeenCalledWith({ name: 'login', query: { redirect: '/projects', reason } })
})

it('reconnects after a temporary registry outage without removing the session', async () => {
  const agent = useAgentStore()
  await agent.connect()
  Socket.instances[0]!.end(1013)
  await vi.advanceTimersByTimeAsync(3000)
  expect(useAuthStore().token).toBe('old-token')
  expect(authApi.getSocketTicket).toHaveBeenCalledTimes(2)
  expect(Socket.instances).toHaveLength(2)
  expect(replace).not.toHaveBeenCalled()
})

it('retains the session when ticket issuance temporarily fails', async () => {
  vi.mocked(authApi.getSocketTicket).mockRejectedValueOnce({ code: 50322 })
  const agent = useAgentStore()
  await agent.connect()
  await vi.advanceTimersByTimeAsync(3000)
  expect(useAuthStore().token).toBe('old-token')
  expect(Socket.instances).toHaveLength(1)
  expect(replace).not.toHaveBeenCalled()
})

it('ignores an old socket close and frame after a new login is installed', async () => {
  const auth = useAuthStore()
  const agent = useAgentStore()
  await agent.connect()
  const oldSocket = Socket.instances[0]!
  const lateClose = oldSocket.listeners.get('close')!
  const lateMessage = oldSocket.listeners.get('message')!
  setAccessToken('new-token')
  auth.synchronize()
  auth.user = user
  await agent.connect()
  Socket.instances[1]!.open()
  lateClose(new CloseEvent('close', { code: 4001 }))
  lateMessage(new MessageEvent('message', { data: '{"type":"MESSAGE_UPDATED"}' }))
  expect(auth.token).toBe('new-token')
  expect(agent.connectionState).toBe('CONNECTED')
  expect(agent.lastEvent).toBeNull()
  expect(oldSocket.close).toHaveBeenCalledOnce()
  expect(replace).not.toHaveBeenCalled()
})

it('ignores a replaced signal when another tab has changed storage before its event arrives', async () => {
  const agent = useAgentStore()
  await agent.connect()
  localStorage.setItem('harness_auth_session', JSON.stringify(sessionCredentials('new-tab-token')))
  Socket.instances[0]!.end(4001)
  await vi.advanceTimersByTimeAsync(6000)
  expect(getAccessToken()).toBe('new-tab-token')
  expect(replace).not.toHaveBeenCalled()
})

it('cancels a scheduled reconnect immediately when logout starts', async () => {
  const agent = useAgentStore()
  await agent.connect()
  Socket.instances[0]!.end(1006)
  vi.mocked(authApi.logout).mockResolvedValue(envelope(undefined))
  await useAuthStore().signOut()
  await vi.advanceTimersByTimeAsync(6000)
  expect(authApi.getSocketTicket).toHaveBeenCalledTimes(1)
  expect(agent.connectionState).toBe('DISCONNECTED')
})

it('does not create a socket from a ticket issued for the old session', async () => {
  let issue!: (value: ApiResponse<{ ticket: string; expiresInSeconds: number }>) => void
  vi.mocked(authApi.getSocketTicket).mockReturnValueOnce(
    new Promise((resolve) => {
      issue = resolve
    }),
  )
  const agent = useAgentStore()
  const connecting = agent.connect()
  setAccessToken('new-token')
  useAuthStore().synchronize()
  issue(envelope({ ticket: 'old-ticket', expiresInSeconds: 30 }))
  await connecting
  expect(Socket.instances).toHaveLength(0)
  expect(agent.connectionState).toBe('DISCONNECTED')
})

it('renews an expired socket credential and reconnects without resetting cached workspaces', async () => {
  const agent = useAgentStore()
  agent.workspacesByDevice = { 1: [] }
  const source = readAuthSession()!
  vi.mocked(authApi.refreshSession).mockResolvedValueOnce(
    envelope(
      sessionCredentials('renewed', { sessionId: source.sessionId, credentialGeneration: 2 }),
    ),
  )
  await agent.connect()
  Socket.instances[0]!.end(4002)
  await vi.advanceTimersByTimeAsync(0)
  expect(authApi.refreshSession).toHaveBeenCalledOnce()
  expect(getAccessToken()).toBe('renewed')
  expect(agent.workspacesByDevice).toEqual({ 1: [] })
  expect(Socket.instances).toHaveLength(2)
  expect(replace).not.toHaveBeenCalled()
})

it('does not invalidate a renewed login when the old connection closes with 1008', async () => {
  const agent = useAgentStore()
  await agent.connect()
  const old = Socket.instances[0]!
  const delayedClose = old.listeners.get('close')!
  const session = captureAuthSession()
  setAuthSession(
    sessionCredentials('renewed', { sessionId: session.sessionId!, credentialGeneration: 2 }),
    session,
  )
  await vi.advanceTimersByTimeAsync(0)
  delayedClose(new CloseEvent('close', { code: 1008 }))
  await vi.advanceTimersByTimeAsync(0)
  expect(getAccessToken()).toBe('renewed')
  expect(replace).not.toHaveBeenCalled()
  expect(authApi.refreshSession).not.toHaveBeenCalled()
})

it('keeps an intentionally disconnected page offline when another tab renews credentials', async () => {
  const agent = useAgentStore()
  await agent.connect()
  agent.disconnect()
  const source = captureAuthSession()
  setAuthSession(
    sessionCredentials('renewed', {
      sessionId: source.sessionId!,
      credentialGeneration: 2,
    }),
    source,
  )
  await vi.advanceTimersByTimeAsync(6000)
  expect(authApi.getSocketTicket).toHaveBeenCalledOnce()
  expect(agent.connectionState).toBe('DISCONNECTED')
})

it('does not reconnect when the page unmounts while an expired socket is refreshing', async () => {
  let complete!: (value: ApiResponse<ReturnType<typeof sessionCredentials>>) => void
  vi.mocked(authApi.refreshSession).mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve
    }),
  )
  const agent = useAgentStore()
  const source = captureAuthSession()
  await agent.connect()
  Socket.instances[0]!.end(4002)
  await vi.advanceTimersByTimeAsync(0)
  expect(authApi.refreshSession).toHaveBeenCalledOnce()
  agent.disconnect()
  complete(
    envelope(
      sessionCredentials('renewed', {
        sessionId: source.sessionId!,
        credentialGeneration: 2,
      }),
    ),
  )
  await vi.advanceTimersByTimeAsync(6000)
  expect(authApi.getSocketTicket).toHaveBeenCalledOnce()
  expect(agent.connectionState).toBe('DISCONNECTED')
})
