import type {
  Device,
  Workspace,
  WorkspaceRoot,
  Id,
  RealtimeEvent,
  WorkspaceInput,
} from '@/types/domain'
import { parseRealtimeEvent } from '../utils/realtime'
import { computed, ref, onScopeDispose } from 'vue'
import { defineStore } from 'pinia'
import {
  createWorkspace as requestWorkspaceCreation,
  getDevices,
  getDeviceWorkspaceRoots,
  getDeviceWorkspaces,
} from '../api/agent.ts'
import { getAccessToken } from '../utils/auth.ts'
import { getSocketTicket } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
const RECONNECT_DELAY = 3000

function getClientSocketUrl(token: string) {
  const configured = import.meta.env.VITE_WS_BASE_URL
  if (configured) {
    const base = configured.replace(/\/$/, '')
    return `${base}/ws/client?ticket=${encodeURIComponent(token)}`
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/client?ticket=${encodeURIComponent(token)}`
}

export const useAgentStore = defineStore('agent', () => {
  const devices = ref<Device[]>([])
  const workspacesByDevice = ref<Record<string, Workspace[]>>({})
  const workspaceRootsByDevice = ref<Record<string, WorkspaceRoot[]>>({})
  const connectionState = ref<'CONNECTED' | 'CONNECTING' | 'DISCONNECTED'>('DISCONNECTED')
  const lastEvent = ref<RealtimeEvent | null>(null)
  const eventRevision = ref(0)
  let socket: WebSocket | null = null
  let reconnectTimer: number | null = null
  let intentionallyClosed = false
  let removeListeners: (() => void) | null = null
  let ticketController: AbortController | null = null
  let revision = 0
  function reset() {
    disconnect()
    revision += 1
    devices.value = []
    workspacesByDevice.value = {}
    workspaceRootsByDevice.value = {}
    lastEvent.value = null
    eventRevision.value = 0
  }

  const onlineDeviceCount = computed(
    () => devices.value.filter((item) => item.status === 'ONLINE').length,
  )
  const workspaceCount = computed(() =>
    Object.values(workspacesByDevice.value).reduce((total, items) => total + items.length, 0),
  )

  async function loadDevices() {
    const version = revision
    const result = await getDevices()
    if (version !== revision) return []
    devices.value = result?.data || []
    return devices.value
  }

  async function loadWorkspaces(deviceId: Id) {
    const version = revision
    const result = await getDeviceWorkspaces(deviceId)
    if (version !== revision) return []
    workspacesByDevice.value = {
      ...workspacesByDevice.value,
      [deviceId]: result?.data || [],
    }
    return workspacesByDevice.value[deviceId]
  }

  async function loadAllWorkspaces() {
    if (!devices.value.length) await loadDevices()
    await Promise.all(devices.value.map((device) => loadWorkspaces(device.id)))
    return workspacesByDevice.value
  }

  async function loadWorkspaceRoots(deviceId: Id) {
    const version = revision
    const result = await getDeviceWorkspaceRoots(deviceId)
    if (version !== revision) return []
    workspaceRootsByDevice.value = {
      ...workspaceRootsByDevice.value,
      [deviceId]: result?.data || [],
    }
    return workspaceRootsByDevice.value[deviceId]
  }

  async function createWorkspace(deviceId: Id, data: WorkspaceInput) {
    const result = await requestWorkspaceCreation(deviceId, data)
    await loadWorkspaces(deviceId)
    return result?.data
  }

  function scheduleReconnect() {
    if (intentionallyClosed || reconnectTimer) return
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      connect()
    }, RECONNECT_DELAY)
  }

  async function connect() {
    const token = getAccessToken()
    if (
      !token ||
      ticketController ||
      !useAuthStore().can('workspace:use') ||
      socket?.readyState === WebSocket.OPEN ||
      socket?.readyState === WebSocket.CONNECTING
    )
      return
    intentionallyClosed = false
    connectionState.value = 'CONNECTING'
    const controller = new AbortController()
    ticketController = controller
    let ticket: string
    try {
      const result = await getSocketTicket(controller.signal)
      ticket = result.data.ticket
    } catch {
      if (!controller.signal.aborted) {
        connectionState.value = 'DISCONNECTED'
        scheduleReconnect()
      }
      return
    } finally {
      if (ticketController === controller) ticketController = null
    }
    if (controller.signal.aborted || intentionallyClosed || getAccessToken() !== token) return
    const connection = new WebSocket(getClientSocketUrl(ticket))
    socket = connection
    const onOpen = () => {
      if (socket === connection) connectionState.value = 'CONNECTED'
    }
    const onMessage = (event: MessageEvent<string>) => {
      if (socket !== connection) return
      const parsed = parseRealtimeEvent(event.data)
      if (!parsed) return
      lastEvent.value = parsed
      eventRevision.value += 1
      if (!useAuthStore().can('device:manage')) return
      if (['REGISTER', 'HEARTBEAT', 'DEVICE_OFFLINE'].includes(parsed.type))
        void loadDevices().catch(() => {})
      if (
        parsed.deviceId &&
        ['REGISTER', 'WORKSPACES_CHANGED', 'WORKSPACE_CREATE_RESULT'].includes(parsed.type)
      )
        void loadWorkspaces(parsed.deviceId).catch(() => {})
      if (parsed.deviceId && parsed.type === 'REGISTER')
        void loadWorkspaceRoots(parsed.deviceId).catch(() => {})
    }
    const onClose = (event: CloseEvent) => {
      if (socket !== connection) return
      removeListeners?.()
      socket = null
      connectionState.value = 'DISCONNECTED'
      if (event.code === 1008)
        void useAuthStore()
          .loadProfile()
          .then(() => connect())
          .catch(() => {})
      else scheduleReconnect()
    }
    const onError = () => {
      if (socket === connection) connection.close()
    }
    connection.addEventListener('open', onOpen)
    connection.addEventListener('message', onMessage)
    connection.addEventListener('close', onClose)
    connection.addEventListener('error', onError)
    removeListeners = () => {
      connection.removeEventListener('open', onOpen)
      connection.removeEventListener('message', onMessage)
      connection.removeEventListener('close', onClose)
      connection.removeEventListener('error', onError)
      removeListeners = null
    }
  }

  function disconnect() {
    intentionallyClosed = true
    ticketController?.abort()
    ticketController = null
    if (reconnectTimer) window.clearTimeout(reconnectTimer)
    reconnectTimer = null
    removeListeners?.()
    socket?.close()
    socket = null
    connectionState.value = 'DISCONNECTED'
  }

  onScopeDispose(disconnect)

  return {
    devices,
    workspacesByDevice,
    workspaceRootsByDevice,
    connectionState,
    lastEvent,
    eventRevision,
    onlineDeviceCount,
    workspaceCount,
    loadDevices,
    loadWorkspaces,
    loadAllWorkspaces,
    loadWorkspaceRoots,
    createWorkspace,
    connect,
    disconnect,
    reset,
  }
})
