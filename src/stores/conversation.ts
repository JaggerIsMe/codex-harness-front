import type {
  Conversation,
  Turn,
  Message,
  Approval,
  Id,
  Decision,
  RealtimeEvent,
  TurnInput,
} from '@/types/domain'
import { createDeltaBuffer } from '../utils/deltaBuffer'
import { applyMessagePatches } from '../utils/messageStream'
import { computed, ref, watch, onScopeDispose } from 'vue'
import { defineStore } from 'pinia'
import {
  getActiveTurn,
  getConversation,
  getConversationApprovals,
  getConversationMessageState,
  getConversations,
  interruptTurn,
  resolveApproval,
  startTurn,
} from '../api/conversation.ts'
import { useAgentStore } from './agent.ts'
const ACTIVE_TURN_STATUSES = ['CREATED', 'RUNNING', 'WAITING_APPROVAL']
const TERMINAL_EVENT_STATUSES: Record<string, string> = {
  TURN_COMPLETED: 'COMPLETED',
  TURN_FAILED: 'FAILED',
  TURN_INTERRUPTED: 'INTERRUPTED',
}

export const useConversationStore = defineStore('conversation', () => {
  const agentStore = useAgentStore()
  const conversations = ref<Conversation[]>([])
  const currentConversation = ref<Conversation | null>(null)
  const messages = ref<Message[]>([])
  const approvals = ref<Approval[]>([])
  const currentTurn = ref<Turn | null>(null)
  const listLoading = ref(false)
  const loading = ref(false)
  const sending = ref(false)
  const interrupting = ref(false)
  const resolvingId = ref<Id | null>(null)
  const currentProjectId = ref<number | null>(null)
  let openRevision = 0
  let realtimeRefreshTimer: number | null = null
  let listRevision = 0
  const hasMoreMessages = ref(false)
  const loadingOlder = ref(false)
  const streamWarning = ref('')
  let streamTurnId: Id | null = null
  let streamCursor = 0
  let restoring = false
  let openingConversationId: number | null = null
  let deferredFrames: RealtimeEvent[] = []
  let deferredBytes = 0
  let restoreOverflow = false
  let olderController: AbortController | null = null
  let requestController: AbortController | null = null
  let realtimeStop: (() => void) | null = null
  const listError = ref('')
  const detailError = ref('')
  const deltaBuffer = createDeltaBuffer<RealtimeEvent>((events) => {
    let batch = messages.value
    for (const event of events) batch = appendRealtimeMessage(event, batch)
    messages.value = batch
  })

  function clearCurrent() {
    ++openRevision
    restoring = false
    openingConversationId = null
    deferredFrames = []
    deferredBytes = 0
    restoreOverflow = false
    streamCursor = 0
    streamTurnId = null
    hasMoreMessages.value = false
    streamWarning.value = ''
    olderController?.abort()
    olderController = null
    loadingOlder.value = false
    requestController?.abort()
    requestController = null
    deltaBuffer.clear()
    if (realtimeRefreshTimer) window.clearTimeout(realtimeRefreshTimer)
    realtimeRefreshTimer = null
    currentConversation.value = null
    messages.value = []
    approvals.value = []
    currentTurn.value = null
    detailError.value = ''
    loading.value = false
  }

  function startListening() {
    if (realtimeStop) return
    const stopFrames = watch(
      () => agentStore.eventRevision,
      () => applyRealtimeEvent(agentStore.lastEvent),
      { flush: 'sync' },
    )
    const stopConnection = watch(
      () => agentStore.connectionState,
      (state) => {
        if (state === 'CONNECTED') scheduleRealtimeRefresh()
      },
    )
    realtimeStop = () => {
      stopFrames()
      stopConnection()
    }
  }

  function stopListening() {
    realtimeStop?.()
    realtimeStop = null
    clearCurrent()
  }
  function reset() {
    stopListening()
    listRevision += 1
    currentProjectId.value = null
    conversations.value = []
    listError.value = ''
    listLoading.value = false
    sending.value = false
    interrupting.value = false
    resolvingId.value = null
  }

  const pendingApprovals = computed(() =>
    approvals.value.filter((item) => item.status === 'PENDING'),
  )
  const isTurnActive = computed(() =>
    ACTIVE_TURN_STATUSES.includes(currentTurn.value?.status || ''),
  )
  const canInterrupt = computed(() =>
    ['RUNNING', 'WAITING_APPROVAL'].includes(currentTurn.value?.status || ''),
  )
  const canStartTurn = computed(
    () =>
      currentConversation.value?.status === 'ACTIVE' &&
      Boolean(currentConversation.value.codexThreadId) &&
      !isTurnActive.value,
  )

  function upsertConversation(value: Conversation | null) {
    if (!value) return
    conversations.value = [
      value,
      ...conversations.value.filter((item) => String(item.id) !== String(value.id)),
    ].slice(0, 100)
  }

  function activateProject(projectId: Id) {
    const id = Number(projectId)
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('INVALID_PROJECT_ID')
    if (String(currentProjectId.value || '') === String(id)) return id
    clearCurrent()
    currentProjectId.value = id
    conversations.value = []
    currentConversation.value = null
    messages.value = []
    approvals.value = []
    currentTurn.value = null
    openRevision += 1
    return id
  }

  async function loadConversations(projectId: Id) {
    const id = activateProject(projectId)
    const revision = ++listRevision
    listLoading.value = true
    listError.value = ''
    try {
      const result = await getConversations(id)
      if (id !== currentProjectId.value || revision !== listRevision) return []
      conversations.value = result?.data || []
      return conversations.value
    } catch (error) {
      if (id === currentProjectId.value && revision === listRevision)
        listError.value = error instanceof Error ? error.message : '会话列表加载失败'
      return []
    } finally {
      if (revision === listRevision) listLoading.value = false
    }
  }

  async function openConversation(
    projectId: Id,
    conversationId: Id,
    options: { silent?: boolean } = {},
  ) {
    const activeProjectId = activateProject(projectId)
    const id = Number(conversationId)
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('INVALID_CONVERSATION_ID')
    if (String(currentConversation.value?.id) !== String(id)) clearCurrent()
    requestController?.abort()
    const controller = new AbortController()
    requestController = controller
    const revision = ++openRevision
    restoring = true
    openingConversationId = id
    deferredFrames = []
    deferredBytes = 0
    restoreOverflow = false
    deltaBuffer.clear()
    olderController?.abort()
    detailError.value = ''
    if (!options.silent) {
      loading.value = true
    }
    try {
      const [conversationResult, messageResult, approvalResult, turnResult] = await Promise.all([
        getConversation(activeProjectId, id, controller.signal),
        getConversationMessageState(activeProjectId, id, controller.signal),
        getConversationApprovals(activeProjectId, id, controller.signal),
        getActiveTurn(activeProjectId, id, controller.signal),
      ])
      if (revision !== openRevision) return null
      deltaBuffer.clear()
      currentConversation.value = conversationResult?.data || null
      const snapshot = messageResult.data
      const firstSequence = snapshot.messages[0]?.sequenceNo ?? 0
      const older = messages.value.filter((message) => message.sequenceNo < firstSequence)
      messages.value = [...older, ...snapshot.messages]
      streamCursor = snapshot.cursor
      streamTurnId = snapshot.turnId
      hasMoreMessages.value = snapshot.hasMore
      streamWarning.value = snapshot.degraded
        ? '实时缓存暂不可用，当前显示数据库检查点，内容可能不完整。'
        : ''
      approvals.value = approvalResult?.data || []
      currentTurn.value = turnResult?.data || null
      upsertConversation(currentConversation.value)
      restoring = false
      const frames = deferredFrames
      deferredFrames = []
      deferredBytes = 0
      for (const frame of frames) applyRealtimeEvent(frame)
      if (restoreOverflow) scheduleRealtimeRefresh()
      return currentConversation.value
    } catch (error) {
      if (controller.signal.aborted || revision !== openRevision) return null
      detailError.value = error instanceof Error ? error.message : '会话加载失败'
      return null
    } finally {
      if (revision === openRevision) {
        loading.value = false
        restoring = false
        openingConversationId = null
        deferredFrames = []
      }
    }
  }

  async function refreshCurrent(options = { silent: true }) {
    if (!currentConversation.value) return null
    if (loading.value) return null
    return openConversation(currentProjectId.value!, currentConversation.value.id, options)
  }

  async function startNewTurn(input: TurnInput) {
    if (!canStartTurn.value || sending.value) return null
    sending.value = true
    const conversationId = currentConversation.value!.id
    const projectId = currentProjectId.value!
    try {
      const result = await startTurn(projectId, conversationId, input)
      if (currentConversation.value?.id !== conversationId || currentProjectId.value !== projectId)
        return null
      currentTurn.value = result?.data || null
      await refreshCurrent({ silent: true })
      return currentTurn.value
    } finally {
      sending.value = false
    }
  }

  async function interruptCurrentTurn() {
    if (!currentConversation.value || !canInterrupt.value || interrupting.value) return
    interrupting.value = true
    try {
      await interruptTurn(
        currentProjectId.value!,
        currentConversation.value.id,
        currentTurn.value!.id,
      )
    } finally {
      interrupting.value = false
    }
  }

  async function decideApproval(approval: Approval, decision: Decision) {
    if (!approval || resolvingId.value) return
    resolvingId.value = approval.id
    try {
      await resolveApproval(approval.id, decision)
      await refreshCurrent({ silent: true })
    } finally {
      resolvingId.value = null
    }
  }

  function matchesCurrentConversation(event: RealtimeEvent | null) {
    if (!event || !currentConversation.value) return false
    if (event.type === 'DEVICE_OFFLINE') {
      return String(event.deviceId) === String(currentConversation.value.deviceId)
    }
    const conversationId = event.payload?.conversationId
    if (conversationId) return String(conversationId) === String(currentConversation.value.id)
    if (event.type === 'ERROR' && event.payload?.commandType === 'START_THREAD') {
      return String(event.correlationId) === String(currentConversation.value.id)
    }
    if (event.type === 'ERROR' && event.payload?.commandType === 'START_TURN') {
      return String(event.correlationId) === String(currentTurn.value?.id)
    }
    return false
  }

  function scheduleRealtimeRefresh() {
    if (realtimeRefreshTimer) return
    realtimeRefreshTimer = window.setTimeout(async () => {
      realtimeRefreshTimer = null
      try {
        await refreshCurrent({ silent: true })
      } catch {
        // REST 拦截器已统一提示；WebSocket 后续事件仍可触发下一次同步。
      }
    }, 200)
  }

  function appendRealtimeMessage(event: RealtimeEvent, batch: Message[]): Message[] {
    const payload = event.payload
    if (!payload?.patches || payload.cursor == null || payload.turnId == null) return batch
    if (String(streamTurnId) !== String(payload.turnId)) {
      if (payload.cursor !== 1) {
        scheduleRealtimeRefresh()
        return batch
      }
      streamTurnId = payload.turnId
      streamCursor = 0
    }
    if (payload.cursor <= streamCursor) return batch
    if (payload.cursor !== streamCursor + 1) {
      scheduleRealtimeRefresh()
      return batch
    }
    const updated = applyMessagePatches(batch, payload.patches)
    if (!updated) {
      scheduleRealtimeRefresh()
      return batch
    }
    streamCursor = payload.cursor
    return updated
  }

  async function loadOlderMessages() {
    if (!currentConversation.value || !hasMoreMessages.value || loadingOlder.value || restoring)
      return
    const revision = openRevision
    const controller = new AbortController()
    olderController = controller
    loadingOlder.value = true
    try {
      const before = Math.min(...messages.value.map((m) => m.sequenceNo))
      const result = await getConversationMessageState(
        currentProjectId.value!,
        currentConversation.value.id,
        controller.signal,
        before,
      )
      if (revision !== openRevision || controller.signal.aborted) return
      const ids = new Set(messages.value.map((m) => String(m.id)))
      messages.value = [
        ...result.data.messages.filter((m) => !ids.has(String(m.id))),
        ...messages.value,
      ].sort((a, b) => a.sequenceNo - b.sequenceNo)
      hasMoreMessages.value = result.data.hasMore
    } catch (error) {
      if (!controller.signal.aborted && revision === openRevision)
        detailError.value = error instanceof Error ? error.message : '历史消息加载失败'
    } finally {
      if (olderController === controller) {
        loadingOlder.value = false
        olderController = null
      }
    }
  }

  function applyRealtimeEvent(event: RealtimeEvent | null) {
    if (!event) return
    if (
      restoring &&
      (String(event.payload?.conversationId) === String(openingConversationId) ||
        matchesCurrentConversation(event))
    ) {
      const bytes = JSON.stringify(event).length
      if (restoreOverflow || deferredFrames.length >= 512 || deferredBytes + bytes > 2097152) {
        restoreOverflow = true
        deferredFrames = []
        deferredBytes = 0
      } else {
        deferredFrames.push(event)
        deferredBytes += bytes
      }
      return
    }
    if (!matchesCurrentConversation(event)) return
    if (event.type !== 'MESSAGE_UPDATED') deltaBuffer.flush()
    const turnId = event.payload?.turnId
    if (turnId && event.type === 'MESSAGE_UPDATED') {
      deltaBuffer.push(event)
      return
    } else if (turnId && event.type === 'TURN_STARTED') {
      currentTurn.value = {
        id: Number(turnId),
        status: 'RUNNING',
        codexTurnId: event.payload?.codexTurnId,
      }
    } else if (turnId && event.type === 'APPROVAL_REQUIRED') {
      currentTurn.value = { ...currentTurn.value, id: Number(turnId), status: 'WAITING_APPROVAL' }
    } else if (turnId && TERMINAL_EVENT_STATUSES[event.type]) {
      currentTurn.value = {
        ...currentTurn.value,
        id: Number(turnId),
        status: TERMINAL_EVENT_STATUSES[event.type],
      }
    } else if (event.type === 'DEVICE_OFFLINE' && isTurnActive.value && currentTurn.value) {
      currentTurn.value = { ...currentTurn.value, status: 'FAILED' }
    }
    scheduleRealtimeRefresh()
  }

  onScopeDispose(stopListening)

  return {
    reset,
    startListening,
    stopListening,
    clearCurrent,
    listError,
    hasMoreMessages,
    loadingOlder,
    loadOlderMessages,
    streamWarning,
    detailError,
    conversations,
    currentConversation,
    messages,
    approvals,
    currentTurn,
    currentProjectId,
    listLoading,
    loading,
    sending,
    interrupting,
    resolvingId,
    pendingApprovals,
    isTurnActive,
    canInterrupt,
    canStartTurn,
    upsertConversation,
    activateProject,
    loadConversations,
    openConversation,
    refreshCurrent,
    startNewTurn,
    interruptCurrentTurn,
    decideApproval,
  }
})
