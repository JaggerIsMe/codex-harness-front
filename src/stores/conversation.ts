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
import { canAdvanceTurn, TERMINAL_TURN_STATUSES } from '@/utils/conversationActivity'
import { computed, ref, watch, onScopeDispose } from 'vue'
import { defineStore } from 'pinia'
import { normalizePageResult } from '@/utils/pagination'
import { isCancel } from 'axios'
import {
  getActiveTurn,
  getConversation,
  getConversationApprovals,
  getConversationMessageState,
  getConversationMessages,
  getConversations,
  interruptTurn,
  resolveApproval,
  startTurn,
} from '../api/conversation.ts'
import { useAgentStore } from './agent.ts'
import { useNavigationStore } from './navigation'
import { mutationKind } from '@/utils/workspaceFileActions'
import { captureAuthSession, isCurrentAuthSession } from '@/utils/auth'
const ACTIVE_TURN_STATUSES = ['CREATED', 'RUNNING', 'WAITING_APPROVAL']
const TERMINAL_EVENT_STATUSES: Record<string, string> = {
  TURN_COMPLETED: 'COMPLETED',
  TURN_FAILED: 'FAILED',
  TURN_INTERRUPTED: 'INTERRUPTED',
}

function isAborted(error: unknown) {
  return (
    isCancel(error) ||
    ((error instanceof Error || error instanceof DOMException) && error.name === 'AbortError')
  )
}

export const useConversationStore = defineStore('conversation', () => {
  const agentStore = useAgentStore()
  const navigation = useNavigationStore()
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
  let resetRevision = 0
  function operationGuard() {
    const revision = resetRevision
    const session = captureAuthSession()
    return () => revision === resetRevision && isCurrentAuthSession(session)
  }
  const hasMoreMessages = ref(false)
  const loadingOlder = ref(false)
  const olderMessagesError = ref('')
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
  let attachmentController: AbortController | null = null
  let realtimeStop: (() => void) | null = null
  const listError = ref('')
  const detailError = ref('')
  const turnError = ref('')
  let nameRevision = 0
  const renamedConversations = new Map<string, { title: string; revision: number }>()
  const renamedProjects = new Map<string, { name: string; revision: number }>()
  const removedConversations = new Set<string>()
  const removedProjects = new Set<string>()
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
    olderMessagesError.value = ''
    requestController?.abort()
    attachmentController?.abort()
    attachmentController = null
    requestController = null
    deltaBuffer.clear()
    if (realtimeRefreshTimer) window.clearTimeout(realtimeRefreshTimer)
    realtimeRefreshTimer = null
    currentConversation.value = null
    messages.value = []
    approvals.value = []
    currentTurn.value = null
    detailError.value = ''
    turnError.value = ''
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
    resetRevision += 1
    stopListening()
    listRevision += 1
    currentProjectId.value = null
    conversations.value = []
    listError.value = ''
    listLoading.value = false
    sending.value = false
    interrupting.value = false
    resolvingId.value = null
    renamedConversations.clear()
    renamedProjects.clear()
    removedConversations.clear()
    removedProjects.clear()
  }

  const pendingApprovals = computed(() =>
    approvals.value.filter((item) => item.status === 'PENDING'),
  )
  const isTurnActive = computed(() =>
    ACTIVE_TURN_STATUSES.includes(currentTurn.value?.status || ''),
  )
  const canInterrupt = computed(() =>
    ['CREATED', 'RUNNING', 'WAITING_APPROVAL'].includes(currentTurn.value?.status || ''),
  )
  const canStartTurn = computed(
    () =>
      currentConversation.value?.status === 'ACTIVE' &&
      Boolean(currentConversation.value.codexThreadId) &&
      !isTurnActive.value,
  )

  function upsertConversation(value: Conversation | null) {
    if (!value || isRemoved(value)) return
    conversations.value = [
      value,
      ...conversations.value.filter((item) => String(item.id) !== String(value.id)),
    ]
  }

  function isRemoved(value: Conversation) {
    return (
      removedConversations.has(String(value.id)) || removedProjects.has(String(value.projectId))
    )
  }
  function retainNames(value: Conversation, before: number) {
    const conversation = renamedConversations.get(String(value.id))
    const project = renamedProjects.get(String(value.projectId))
    return {
      ...value,
      ...(conversation && conversation.revision > before ? { title: conversation.title } : {}),
      ...(project && project.revision > before ? { projectName: project.name } : {}),
    }
  }
  function renameConversation(value: Conversation) {
    if (isRemoved(value)) return
    renamedConversations.set(String(value.id), { title: value.title, revision: ++nameRevision })
    conversations.value = conversations.value.map((item) =>
      String(item.id) === String(value.id) ? { ...item, title: value.title } : item,
    )
    if (String(currentConversation.value?.id) === String(value.id))
      currentConversation.value = { ...currentConversation.value!, title: value.title }
  }
  function renameProject(projectId: Id, projectName: string) {
    renamedProjects.set(String(projectId), { name: projectName, revision: ++nameRevision })
    conversations.value = conversations.value.map((item) =>
      String(item.projectId) === String(projectId) ? { ...item, projectName } : item,
    )
    if (String(currentConversation.value?.projectId) === String(projectId))
      currentConversation.value = { ...currentConversation.value!, projectName }
  }
  function removeConversation(conversationId: Id) {
    const id = String(conversationId)
    removedConversations.add(id)
    renamedConversations.delete(id)
    if (String(currentConversation.value?.id) === id || String(openingConversationId) === id)
      clearCurrent()
    conversations.value = conversations.value.filter((item) => String(item.id) !== id)
  }
  function removeProject(projectId: Id) {
    const id = String(projectId)
    removedProjects.add(id)
    renamedProjects.delete(id)
    if (String(currentProjectId.value) === id) {
      clearCurrent()
      currentProjectId.value = null
      listRevision++
      listLoading.value = false
      listError.value = ''
    }
    conversations.value = conversations.value.filter((item) => String(item.projectId) !== id)
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
    if (removedProjects.has(String(projectId))) return []
    const id = activateProject(projectId)
    const revision = ++listRevision
    const before = nameRevision
    listLoading.value = true
    listError.value = ''
    try {
      const result = await getConversations(id)
      if (id !== currentProjectId.value || revision !== listRevision) return []
      conversations.value = normalizePageResult(result.data)
        .items.filter((item) => !isRemoved(item))
        .map((item) => retainNames(item, before))
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
    if (removedProjects.has(String(projectId)) || removedConversations.has(String(conversationId)))
      return null
    const activeProjectId = activateProject(projectId)
    const id = Number(conversationId)
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('INVALID_CONVERSATION_ID')
    if (String(currentConversation.value?.id) !== String(id)) clearCurrent()
    requestController?.abort()
    const controller = new AbortController()
    requestController = controller
    const revision = ++openRevision
    const before = nameRevision
    restoring = true
    openingConversationId = id
    deferredFrames = []
    deferredBytes = 0
    restoreOverflow = false
    deltaBuffer.clear()
    olderController?.abort()
    detailError.value = ''
    olderMessagesError.value = ''
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
      currentConversation.value = conversationResult?.data
        ? retainNames(conversationResult.data, before)
        : null
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
      const previousTurn = currentTurn.value
      const latestConversation = currentConversation.value
      const persistedTurn: Turn | null =
        latestConversation?.latestTurnId != null && latestConversation.latestTurnStatus
          ? {
              id: Number(latestConversation.latestTurnId),
              status: latestConversation.latestTurnStatus,
            }
          : null
      const restoredTurn = turnResult?.data || persistedTurn
      // Older servers only expose active Turns. Keep a terminal event when that endpoint returns null.
      currentTurn.value =
        previousTurn &&
        ((!restoredTurn && TERMINAL_TURN_STATUSES.includes(previousTurn.status)) ||
          (restoredTurn && !canAdvanceTurn(previousTurn, restoredTurn)))
          ? previousTurn
          : restoredTurn
      if (currentTurn.value?.status === 'FAILED') {
        if (String(currentTurn.value.id) === String(latestConversation?.latestTurnId))
          turnError.value =
            latestConversation?.latestTurnFailureMessage || turnError.value || 'Agent 执行失败'
      } else if (latestConversation?.status !== 'FAILED') turnError.value = ''
      upsertConversation(currentConversation.value)
      if (currentConversation.value)
        navigation.upsert(currentConversation.value, { promote: !options.silent })
      if (currentTurn.value) navigation.recordTurn(id, currentTurn.value)
      const latestTurnId =
        currentTurn.value?.id ?? currentConversation.value?.latestTurnId ?? snapshot.turnId
      const latestTurnStatus =
        currentTurn.value?.status ?? currentConversation.value?.latestTurnStatus
      const incomplete =
        latestTurnStatus !== 'INTERRUPTED' &&
        latestTurnId != null &&
        snapshot.messages.some(
          (message) =>
            String(message.turnId) === String(latestTurnId) &&
            message.role === 'ASSISTANT' &&
            message.status === 'INCOMPLETE',
        )
      if (snapshot.degraded || incomplete)
        navigation.markIssue(
          id,
          streamWarning.value || '最新回复内容不完整，请刷新重试',
          'message',
          latestTurnId ?? null,
        )
      else navigation.clearIssue(id, 'message', latestTurnId ?? null)
      restoring = false
      const frames = deferredFrames
      deferredFrames = []
      deferredBytes = 0
      for (const frame of frames) applyRealtimeEvent(frame)
      if (restoreOverflow) scheduleRealtimeRefresh()
      return currentConversation.value
    } catch (error) {
      if (controller.signal.aborted || revision !== openRevision || isAborted(error)) return null
      detailError.value = error instanceof Error ? error.message : '会话加载失败'
      navigation.markIssue(id, detailError.value, 'message')
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
    const isCurrent = operationGuard()
    sending.value = true
    const conversation = currentConversation.value!
    const conversationId = conversation.id
    const projectId = currentProjectId.value!
    navigation.upsert(conversation)
    navigation.clearIssue(conversationId, 'send')
    turnError.value = ''
    try {
      const result = await startTurn(projectId, conversationId, input)
      if (!isCurrent()) return null
      if (result?.data) navigation.recordTurn(conversationId, result.data)
      if (currentConversation.value?.id !== conversationId || currentProjectId.value !== projectId)
        return null
      currentTurn.value = result?.data || null
      await refreshCurrent({ silent: true }).catch(() => undefined)
      return result?.data || null
    } catch (error) {
      if (isCurrent() && !isAborted(error))
        navigation.markIssue(
          conversationId,
          error instanceof Error ? error.message : '消息发送失败',
          'send',
        )
      if (isCurrent() && !isAborted(error) && currentConversation.value?.id === conversationId)
        turnError.value = error instanceof Error ? error.message : '消息发送失败'
      throw error
    } finally {
      if (isCurrent()) sending.value = false
    }
  }

  async function interruptCurrentTurn() {
    if (!currentConversation.value || !canInterrupt.value || interrupting.value) return
    const isCurrent = operationGuard()
    interrupting.value = true
    try {
      await interruptTurn(
        currentProjectId.value!,
        currentConversation.value.id,
        currentTurn.value!.id,
      )
      if (isCurrent()) await refreshCurrent({ silent: true })
    } finally {
      if (isCurrent()) interrupting.value = false
    }
  }

  async function decideApproval(approval: Approval, decision: Decision) {
    if (!approval || resolvingId.value) return
    const isCurrent = operationGuard()
    resolvingId.value = approval.id
    try {
      await resolveApproval(approval.id, decision)
      if (isCurrent()) await refreshCurrent({ silent: true })
    } finally {
      if (isCurrent()) resolvingId.value = null
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

  async function loadOlderMessages(): Promise<boolean> {
    if (
      !currentConversation.value ||
      !hasMoreMessages.value ||
      !messages.value.length ||
      loadingOlder.value ||
      restoring
    )
      return false
    const revision = openRevision
    const controller = new AbortController()
    olderController = controller
    olderMessagesError.value = ''
    loadingOlder.value = true
    try {
      const before = Math.min(...messages.value.map((m) => m.sequenceNo))
      const result = await getConversationMessageState(
        currentProjectId.value!,
        currentConversation.value.id,
        controller.signal,
        before,
      )
      if (revision !== openRevision || controller.signal.aborted) return false
      const ids = new Set(messages.value.map((m) => String(m.id)))
      const older = result.data.messages.filter((message) => !ids.has(String(message.id)))
      messages.value = [...older, ...messages.value].sort((a, b) => a.sequenceNo - b.sequenceNo)
      hasMoreMessages.value = result.data.hasMore
      return older.length > 0
    } catch (error) {
      if (!controller.signal.aborted && revision === openRevision && !isAborted(error)) {
        olderMessagesError.value = error instanceof Error ? error.message : '历史消息加载失败'
      }
      return false
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
      event.type === 'WORKSPACE_FILES_CHANGED' &&
      String(event.payload?.projectId) === String(currentConversation.value?.projectId) &&
      mutationKind(String(event.payload?.kind))
    ) {
      void refreshAttachmentLocations()
      return
    }
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
      turnError.value = ''
    } else if (turnId && event.type === 'APPROVAL_REQUIRED') {
      currentTurn.value = { ...currentTurn.value, id: Number(turnId), status: 'WAITING_APPROVAL' }
    } else if (turnId && TERMINAL_EVENT_STATUSES[event.type]) {
      currentTurn.value = {
        ...currentTurn.value,
        id: Number(turnId),
        status: TERMINAL_EVENT_STATUSES[event.type],
      }
      turnError.value =
        event.type === 'TURN_FAILED'
          ? event.payload?.reason || event.payload?.message || 'Agent 执行失败'
          : ''
    } else if (event.type === 'ERROR' && event.payload?.commandType === 'START_TURN') {
      currentTurn.value = {
        ...currentTurn.value,
        id: Number(event.correlationId),
        status: 'FAILED',
        preparationPhase: null,
      }
      turnError.value = event.payload.message || 'Agent 启动执行失败'
    } else if (event.type === 'ERROR' && event.payload?.commandType === 'START_THREAD') {
      currentConversation.value = { ...currentConversation.value!, status: 'FAILED' }
      turnError.value = event.payload.message || 'Agent 初始化会话失败'
    } else if (event.type === 'DEVICE_OFFLINE' && isTurnActive.value && currentTurn.value) {
      currentTurn.value = { ...currentTurn.value, status: 'FAILED' }
      turnError.value = 'Agent 已离线，无法继续回复'
    }
    scheduleRealtimeRefresh()
  }

  async function refreshAttachmentLocations() {
    const conversation = currentConversation.value
    if (!conversation) return
    attachmentController?.abort()
    const controller = (attachmentController = new AbortController())
    const revision = openRevision
    try {
      const { data } = await getConversationMessages(
        conversation.projectId,
        conversation.id,
        controller.signal,
      )
      if (controller.signal.aborted || revision !== openRevision) return
      const fresh = new Map(data.map((message) => [String(message.id), message.attachments]))
      messages.value = messages.value.map((message) =>
        fresh.has(String(message.id))
          ? { ...message, attachments: fresh.get(String(message.id)) }
          : message,
      )
    } catch (cause) {
      if (!controller.signal.aborted && revision === openRevision)
        streamWarning.value =
          cause instanceof Error ? cause.message : '附件位置刷新失败，请刷新会话'
    } finally {
      if (attachmentController === controller) attachmentController = null
    }
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
    olderMessagesError,
    loadOlderMessages,
    streamWarning,
    detailError,
    turnError,
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
    renameConversation,
    renameProject,
    removeConversation,
    removeProject,
    activateProject,
    loadConversations,
    openConversation,
    refreshCurrent,
    startNewTurn,
    interruptCurrentTurn,
    decideApproval,
  }
})
