import { defineStore } from 'pinia'
import { onScopeDispose, ref, watch } from 'vue'
import { getConversations, getConversationStatuses } from '@/api/conversation'
import { normalizePageResult } from '@/utils/pagination'
import { useAgentStore } from '@/stores/agent'
import { useProjectStore } from '@/stores/project'
import type { Conversation, Id, RealtimeEvent, Turn } from '@/types/domain'
import {
  activityNotificationKey,
  canAdvanceTurn,
  describeActivity,
  isActivityRunning,
  sameId,
  snapshotOf,
  type ActivityIssueKind,
  type ActivitySnapshot,
} from '@/utils/conversationActivity'

const TERMINAL_EVENTS: Record<string, string> = {
  TURN_COMPLETED: 'COMPLETED',
  TURN_FAILED: 'FAILED',
  TURN_INTERRUPTED: 'INTERRUPTED',
}
const RECONCILE_INTERVAL = 15000
const PAGE_SIZE = 10
const READ_STORAGE_PREFIX = 'harness.conversation-read.v1:'

/** Browsing the sidebar never activates or clears the conversation being read. */
export const useNavigationStore = defineStore('navigation', () => {
  const conversations = ref<Record<string, Conversation[]>>({})
  const loading = ref<Record<string, boolean>>({})
  const errors = ref<Record<string, string>>({})
  const loadingMore = ref<Record<string, boolean>>({})
  const errorsMore = ref<Record<string, string>>({})
  const keyword = ref('')
  const pagination = ref<Record<string, { page: number; total: number; size: number }>>({})
  const expanded = ref<Record<string, boolean>>({})
  const controllers = new Map<string, AbortController>()
  const statusControllers = new Map<string, AbortController>()
  const reloadAgain = new Set<string>()
  const pendingStatusIds = new Map<string, Set<Id>>()
  const queryResultIds = new Map<string, Set<string>>()
  let queryGeneration = 0
  const pendingUpdates = new Map<string, Map<Id, Conversation>>()
  const activities = ref<Record<string, ActivitySnapshot>>({})
  const pendingIssues = new Map<string, Partial<Record<ActivityIssueKind, string>>>()
  const disconnected = ref(false)
  const readReceipts = ref<Record<string, string[]>>({})
  let receiptOwner: string | null = null
  const refreshTimers = new Map<string, number>()
  const refreshAgain = new Set<string>()
  let revision = 0
  let stopListening: (() => void) | null = null

  function acceptSnapshot(value: Conversation, before = revision) {
    const previous = activities.value[value.id]
    if (previous && previous.revision > before) return
    const next = snapshotOf(value)
    next.issues = pendingIssues.get(String(value.id)) || {}
    pendingIssues.delete(String(value.id))
    if (previous) {
      const newerTurn = Number(next.turn?.id || 0) > Number(previous.turn?.id || 0)
      if (!canAdvanceTurn(previous.turn, next.turn)) {
        next.turn = previous.turn
        next.failureMessage = previous.failureMessage
        next.incomplete = previous.incomplete
      }
      next.issues = newerTurn ? {} : { ...previous.issues, sync: undefined }
      if (!previous.incomplete && next.incomplete) invalidateRead(value.id, 'incomplete')
      // A persisted complete reply proves recovery even after its view was closed.
      if (
        sameId(previous.turn?.id, value.latestTurnId) &&
        value.latestTurnStatus === 'COMPLETED' &&
        value.latestTurnHasIncompleteMessage === false
      )
        delete next.issues.message
    }
    next.revision = ++revision
    activities.value[value.id] = next
    useProjectStore().updateConversationActivity(value.projectId, value.lastActivityAt)
  }

  function activity(value: Conversation) {
    const snapshot = activities.value[value.id] || snapshotOf(value)
    const result = describeActivity(snapshot, disconnected.value)
    const key = activityNotificationKey(snapshot, disconnected.value)
    return key && readReceipts.value[value.id]?.includes(key)
      ? { ...result, state: 'idle' as const }
      : result
  }

  function unreadKey(conversationId: Id) {
    const snapshot = activities.value[conversationId]
    if (!snapshot) return null
    const key = activityNotificationKey(snapshot, disconnected.value)
    return key && !readReceipts.value[conversationId]?.includes(key) ? key : null
  }

  function notificationTurnId(conversationId: Id) {
    return activities.value[conversationId]?.turn?.id ?? null
  }

  function saveReadReceipts() {
    if (receiptOwner === null) return
    try {
      localStorage.setItem(READ_STORAGE_PREFIX + receiptOwner, JSON.stringify(readReceipts.value))
    } catch {
      // Reading remains usable when the browser blocks persistent storage.
    }
  }

  function loadReadReceipts() {
    if (receiptOwner === null) return
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(READ_STORAGE_PREFIX + receiptOwner) || '{}',
      )
      const restored: Record<string, string[]> = {}
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [id, keys] of Object.entries(value)) {
          if (!/^\d+$/.test(id)) continue
          const candidates: unknown[] = Array.isArray(keys) ? keys : [keys]
          restored[id] = candidates
            .filter((key): key is string => typeof key === 'string')
            .slice(-16)
        }
      }
      readReceipts.value = restored
    } catch {
      readReceipts.value = {}
    }
  }

  function markRead(conversationId: Id, observedTurnId?: Id | null) {
    if (
      observedTurnId !== undefined &&
      String(notificationTurnId(conversationId)) !== String(observedTurnId)
    )
      return
    const key = unreadKey(conversationId)
    if (!key) return
    readReceipts.value[conversationId] = [...(readReceipts.value[conversationId] || []), key].slice(
      -16,
    )
    saveReadReceipts()
  }

  function invalidateRead(
    conversationId: Id,
    reason: ActivityIssueKind | 'incomplete' | 'disconnected',
  ) {
    const previous = readReceipts.value[conversationId]
    if (!previous) return
    const remaining = previous.filter((key) => !key.endsWith(`${JSON.stringify(reason)}]`))
    if (previous.length === remaining.length) return
    readReceipts.value[conversationId] = remaining
    saveReadReceipts()
  }

  function recordTurn(conversationId: Id, turn: Turn) {
    const current = activities.value[conversationId]
    if (!current || !canAdvanceTurn(current.turn, turn)) return false
    const newerTurn = !sameId(current.turn?.id, turn.id)
    if (newerTurn) {
      current.issues = {}
      current.incomplete = false
      current.failureMessage = ''
    }
    if (current.turn?.status !== turn.status || newerTurn) {
      current.turn = turn
      current.revision = ++revision
      return true
    }
    return false
  }

  function markIssue(
    conversationId: Id,
    message: string,
    kind: ActivityIssueKind = 'message',
    turnId?: Id | null,
  ) {
    const current = activities.value[conversationId]
    if (
      turnId !== undefined &&
      (!current || (turnId === null ? current.turn !== null : !sameId(current.turn?.id, turnId)))
    )
      return
    if (!current) {
      pendingIssues.set(String(conversationId), {
        ...pendingIssues.get(String(conversationId)),
        [kind]: message,
      })
      return
    }
    if (current.issues[kind] === message) return
    if (!current.issues[kind]) invalidateRead(conversationId, kind)
    current.issues[kind] = message
    current.revision = ++revision
  }

  function clearIssue(conversationId: Id, kind: ActivityIssueKind, turnId?: Id | null) {
    const current = activities.value[conversationId]
    if (
      turnId !== undefined &&
      (!current || (turnId === null ? current.turn !== null : !sameId(current.turn?.id, turnId)))
    )
      return
    const pending = pendingIssues.get(String(conversationId))
    if (pending) delete pending[kind]
    if (!current?.issues[kind]) return
    delete current.issues[kind]
    current.revision = ++revision
  }

  function matchesKeyword(value: Conversation) {
    const query = keyword.value.toLocaleLowerCase()
    if (!query || queryResultIds.get(String(value.projectId))?.has(String(value.id))) return true
    const project = useProjectStore().projects.find((item) => sameId(item.id, value.projectId))
    return [
      value.title,
      value.projectName,
      project?.projectName,
      project?.deviceName,
      project?.deviceCode,
      project?.workspaceName,
      project?.rootPath,
    ].some((field) => field?.toLocaleLowerCase().includes(query))
  }

  function mergeRows(first: Conversation[], second: Conversation[]) {
    const seen = new Set<string>()
    return [...first, ...second].filter((value) => {
      const id = String(value.id)
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
  }

  function hasMore(projectId: Id) {
    const page = pagination.value[String(projectId)]
    return !!page && page.page * page.size < page.total
  }

  async function requestPage(
    projectId: Id,
    requestedPage: number,
    append: boolean,
    silent: boolean,
  ) {
    const key = String(projectId)
    if (controllers.has(key)) return
    const controller = new AbortController()
    const before = revision
    const generation = queryGeneration
    const query = keyword.value
    controllers.set(key, controller)
    if (append) {
      loadingMore.value[key] = true
      errorsMore.value[key] = ''
    } else {
      if (!silent || !pagination.value[key]) loading.value[key] = true
      errors.value[key] = ''
    }
    try {
      const result = await getConversations(projectId, controller.signal, {
        page: requestedPage,
        size: PAGE_SIZE,
        keyword: query,
      })
      if (!controller.signal.aborted && generation === queryGeneration) {
        const page = normalizePageResult(result.data, requestedPage, PAGE_SIZE)
        for (const value of page.items) acceptSnapshot(value, before)
        // The server also searches project, device and workspace metadata.
        const resultIds = queryResultIds.get(key) || new Set<string>()
        page.items.forEach((value) => resultIds.add(String(value.id)))
        queryResultIds.set(key, resultIds)
        const updates = [...(pendingUpdates.get(key)?.values() || [])]
        const previous = conversations.value[key] || []
        const combined = append ? mergeRows(previous, page.items) : mergeRows(page.items, previous)
        conversations.value[key] = mergeRows(updates, combined).filter(matchesKeyword)
        pagination.value[key] = {
          page: Math.max(pagination.value[key]?.page || 0, page.page),
          size: page.size,
          total: page.total,
        }
        pendingUpdates.delete(key)
      }
    } catch (error) {
      if (!controller.signal.aborted && generation === queryGeneration) {
        const message = error instanceof Error ? error.message : '会话加载失败'
        if (append) errorsMore.value[key] = message
        else errors.value[key] = message
        for (const current of Object.values(activities.value)) {
          if (sameId(current.conversation.projectId, projectId) && isActivityRunning(current))
            markIssue(current.conversation.id, '无法同步会话状态', 'sync')
        }
      }
    } finally {
      if (controllers.get(key) === controller) {
        controllers.delete(key)
        loading.value[key] = false
        loadingMore.value[key] = false
        if (reloadAgain.delete(key)) void load(projectId, true, true)
      }
    }
  }

  async function load(projectId: Id, force = false, silent = false) {
    const key = String(projectId)
    if (controllers.has(key)) {
      if (force) reloadAgain.add(key)
      return
    }
    if (!force && pagination.value[key]) return
    await requestPage(projectId, 1, false, silent)
  }

  async function loadMore(projectId: Id) {
    const key = String(projectId)
    if (controllers.has(key)) return
    const page = pagination.value[key]
    if (!page) return load(projectId)
    if (hasMore(projectId)) await requestPage(projectId, page.page + 1, true, true)
  }

  function setKeyword(value: string) {
    const next = value.trim()
    keyword.value = next
    queryGeneration++
    controllers.forEach((controller) => controller.abort())
    controllers.clear()
    reloadAgain.clear()
    pendingUpdates.clear()
    queryResultIds.clear()
    conversations.value = {}
    pagination.value = {}
    loading.value = {}
    errors.value = {}
    loadingMore.value = {}
    errorsMore.value = {}
    for (const project of useProjectStore().visibleProjects) {
      if (project.provisioningStatus === 'READY') void load(project.id)
    }
  }

  function upsert(value: Conversation, options: { promote?: boolean } = {}) {
    acceptSnapshot(value)
    if (options.promote !== false) useProjectStore().promoteProject(value.projectId)
    const key = String(value.projectId)
    const matching = matchesKeyword(value)
    if (controllers.has(key)) {
      const updates = pendingUpdates.get(key) || new Map<Id, Conversation>()
      updates.set(value.id, value)
      pendingUpdates.set(key, updates)
    }
    const previous = (conversations.value[key] || []).filter((item) => !sameId(item.id, value.id))
    if (matching) conversations.value[key] = [value, ...previous]
    else if (conversations.value[key]) conversations.value[key] = previous
    if (expanded.value[key] === undefined) expanded.value[key] = true
  }

  async function syncStatuses(projectId: Id) {
    const key = String(projectId)
    if (statusControllers.has(key)) {
      refreshAgain.add(key)
      return
    }
    const ids = new Map<string, Id>(
      [...(pendingStatusIds.get(key) || [])].map((id) => [String(id), id]),
    )
    pendingStatusIds.delete(key)
    for (const current of Object.values(activities.value)) {
      if (sameId(current.conversation.projectId, projectId))
        ids.set(String(current.conversation.id), current.conversation.id)
    }
    if (!ids.size) return
    const controller = new AbortController()
    statusControllers.set(key, controller)
    const knownIds = [...ids.values()]
    try {
      for (let start = 0; start < knownIds.length; start += 100) {
        const before = revision
        const result = await getConversationStatuses(
          projectId,
          knownIds.slice(start, start + 100),
          controller.signal,
        )
        if (controller.signal.aborted) return
        for (const value of result.data || []) acceptSnapshot(value, before)
        const updated = new Map(
          (result.data || []).map((value) => [
            String(value.id),
            activities.value[value.id]?.conversation || value,
          ]),
        )
        if (conversations.value[key])
          conversations.value[key] = conversations.value[key]!.map(
            (value) => updated.get(String(value.id)) || value,
          ).filter(matchesKeyword)
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        for (const current of Object.values(activities.value)) {
          if (sameId(current.conversation.projectId, projectId) && isActivityRunning(current))
            markIssue(current.conversation.id, '无法同步会话状态', 'sync')
        }
      }
    } finally {
      if (statusControllers.get(key) === controller) {
        statusControllers.delete(key)
        if (refreshAgain.delete(key)) scheduleRefresh(projectId)
      }
    }
  }

  function scheduleRefresh(projectId: Id, conversationId?: Id) {
    const key = String(projectId)
    if (conversationId != null) {
      const ids = pendingStatusIds.get(key) || new Set<Id>()
      ids.add(conversationId)
      pendingStatusIds.set(key, ids)
    }
    if (!stopListening || refreshTimers.has(key)) return
    refreshTimers.set(
      key,
      window.setTimeout(() => {
        refreshTimers.delete(key)
        void syncStatuses(projectId)
      }, 200),
    )
  }

  function refreshAll() {
    const ids = new Set(
      Object.values(activities.value).map((current) => String(current.conversation.projectId)),
    )
    ids.forEach((id) => scheduleRefresh(id))
  }

  function recordRealtimeTurn(current: ActivitySnapshot, turn: Turn) {
    if (!recordTurn(current.conversation.id, turn)) return false
    useProjectStore().promoteProject(current.conversation.projectId)
    return true
  }

  function applyRealtimeEvent(event: RealtimeEvent | null) {
    if (!event) return
    const payload = event.payload
    if (event.type === 'DEVICE_OFFLINE') {
      for (const current of Object.values(activities.value)) {
        if (!sameId(current.conversation.deviceId, event.deviceId)) continue
        if (isActivityRunning(current)) {
          if (current.turn) recordRealtimeTurn(current, { ...current.turn, status: 'FAILED' })
          markIssue(current.conversation.id, 'Agent 已离线，无法继续回复')
        }
        scheduleRefresh(current.conversation.projectId)
      }
      return
    }
    if (['REGISTER', 'APPROVAL_RESOLVED'].includes(event.type)) {
      refreshAll()
      return
    }
    let conversationId = payload?.conversationId
    if (event.type === 'ERROR') {
      if (payload?.commandType === 'START_THREAD') conversationId = event.correlationId
      else if (payload?.commandType === 'START_TURN')
        conversationId = Object.values(activities.value).find((current) =>
          sameId(current.turn?.id, event.correlationId),
        )?.conversation.id
      else return
    }
    const current = conversationId != null ? activities.value[conversationId] : undefined
    if (!current) {
      // Events can arrive before the first sidebar response or from another browser.
      if (payload?.projectId) scheduleRefresh(payload.projectId, conversationId)
      else if (conversationId != null || event.type === 'ERROR') refreshAll()
      return
    }
    const turnId = payload?.turnId
    if (event.type === 'MESSAGE_UPDATED') {
      if (turnId != null && recordRealtimeTurn(current, { id: Number(turnId), status: 'RUNNING' }))
        scheduleRefresh(current.conversation.projectId)
      return
    }
    if (turnId != null) {
      const status =
        TERMINAL_EVENTS[event.type] ||
        (event.type === 'TURN_STARTED'
          ? 'RUNNING'
          : event.type === 'APPROVAL_REQUIRED'
            ? 'WAITING_APPROVAL'
            : null)
      if (status) recordRealtimeTurn(current, { id: Number(turnId), status })
      if (event.type === 'TURN_FAILED' && sameId(current.turn?.id, turnId))
        current.failureMessage = payload?.reason || payload?.message || 'Agent 执行失败'
    }
    if (event.type === 'ERROR') {
      current.failureMessage = payload?.message || 'Agent 执行失败'
      if (payload?.commandType === 'START_TURN' && current.turn)
        recordRealtimeTurn(current, { ...current.turn, status: 'FAILED' })
      else if (current.conversation.status !== 'FAILED') {
        current.conversation = { ...current.conversation, status: 'FAILED' }
        current.revision = ++revision
        useProjectStore().promoteProject(current.conversation.projectId)
      }
    }
    if (
      TERMINAL_EVENTS[event.type] ||
      ['ERROR', 'THREAD_STARTED', 'TURN_STARTED', 'APPROVAL_REQUIRED'].includes(event.type)
    )
      scheduleRefresh(current.conversation.projectId)
  }

  /** Lives with the authenticated shell, including when no conversation view is mounted. */
  function startListening(userId: Id | null = null) {
    if (stopListening) return
    receiptOwner = userId === null ? null : String(userId)
    loadReadReceipts()
    const agent = useAgentStore()
    const stopFrames = watch(
      () => agent.eventRevision,
      () => applyRealtimeEvent(agent.lastEvent),
      { flush: 'sync' },
    )
    const stopConnection = watch(
      () => agent.connectionState,
      (state) => {
        if (state === 'DISCONNECTED') {
          if (!disconnected.value)
            Object.values(activities.value)
              .filter(isActivityRunning)
              .forEach((current) => invalidateRead(current.conversation.id, 'disconnected'))
          disconnected.value = true
        }
        if (state === 'CONNECTED') {
          disconnected.value = false
          refreshAll()
        }
      },
      { flush: 'sync' },
    )
    const stopProjects = watch(
      () =>
        useProjectStore()
          .visibleProjects.filter((p) => p.provisioningStatus === 'READY')
          .map((p) => p.id),
      (ids) => ids.forEach((id) => void load(id)),
      { immediate: true },
    )
    const timer = window.setInterval(refreshAll, RECONCILE_INTERVAL)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshAll()
    }
    document.addEventListener('visibilitychange', onVisible)
    const onStorage = (event: StorageEvent) => {
      if (
        receiptOwner !== null &&
        (event.key === READ_STORAGE_PREFIX + receiptOwner || event.key === null)
      )
        loadReadReceipts()
    }
    window.addEventListener('storage', onStorage)
    stopListening = () => {
      stopFrames()
      stopConnection()
      stopProjects()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('storage', onStorage)
    }
  }

  function reset() {
    stopListening?.()
    stopListening = null
    refreshTimers.forEach((timer) => window.clearTimeout(timer))
    refreshTimers.clear()
    refreshAgain.clear()
    controllers.forEach((controller) => controller.abort())
    controllers.clear()
    statusControllers.forEach((controller) => controller.abort())
    statusControllers.clear()
    pendingStatusIds.clear()
    reloadAgain.clear()
    queryGeneration++
    pendingUpdates.clear()
    queryResultIds.clear()
    conversations.value = {}
    loading.value = {}
    errors.value = {}
    loadingMore.value = {}
    errorsMore.value = {}
    pagination.value = {}
    keyword.value = ''
    expanded.value = {}
    activities.value = {}
    pendingIssues.clear()
    disconnected.value = false
    readReceipts.value = {}
    receiptOwner = null
    revision += 1
  }
  onScopeDispose(reset)
  return {
    conversations,
    loading,
    errors,
    loadingMore,
    errorsMore,
    keyword,
    expanded,
    load,
    loadMore,
    hasMore,
    setKeyword,
    upsert,
    reset,
    activity,
    unreadKey,
    notificationTurnId,
    markRead,
    recordTurn,
    markIssue,
    clearIssue,
    startListening,
  }
})
