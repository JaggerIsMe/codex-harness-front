import { computed, onScopeDispose, ref, watch } from 'vue'
import {
  getConversationMessageState,
  getConversationApprovals,
  resolveApproval,
} from '@/api/conversation'
import { useAgentStore } from '@/stores/agent'
import { buildConversationDisplayMessages } from '@/utils/conversationMessages'
import type { Approval, ApprovalAnswers, Decision, Id, Message } from '@/types/domain'

/** Scoped reader: never activates the ordinary chat store or creates a Turn. */
export function useStepConversation(projectId: Id, conversationId: Id) {
  const messages = ref<Message[]>([])
  const approvals = ref<Approval[]>([])
  const loading = ref(false),
    loadingOlder = ref(false),
    loaded = ref(false)
  const error = ref(''),
    decisionError = ref('')
  const hasMore = ref(false)
  const resolvingId = ref<Id | null>(null)
  const agent = useAgentStore()
  let disposed = false,
    pendingRefresh = false
  let controller: AbortController | null = null
  let eventTimer: ReturnType<typeof setTimeout> | null = null
  const resolvedApprovals = new Set<Id>()

  async function read(older = false) {
    if (disposed) return
    if (controller) {
      if (!older) pendingRefresh = true
      return
    }
    if (older && (!hasMore.value || !messages.value.length)) return
    const request = new AbortController()
    controller = request
    loading.value = !loaded.value
    loadingOlder.value = older
    try {
      const before = older ? Math.min(...messages.value.map((message) => message.sequenceNo)) : 0
      const [state, decisions] = await Promise.all([
        getConversationMessageState(projectId, conversationId, request.signal, before),
        getConversationApprovals(projectId, conversationId, request.signal),
      ])
      if (disposed || request.signal.aborted) return
      const merged = new Map(messages.value.map((message) => [String(message.id), message]))
      for (const message of state.data.messages) {
        const existing = merged.get(String(message.id))
        if (!older || !existing) merged.set(String(message.id), message)
      }
      messages.value = [...merged.values()].sort((a, b) => a.sequenceNo - b.sequenceNo)
      if (older || !loaded.value) hasMore.value = state.data.hasMore
      approvals.value = decisions.data.filter(
        (approval) => approval.status === 'PENDING' && !resolvedApprovals.has(approval.id),
      )
      loaded.value = true
      error.value = ''
    } catch (cause) {
      if (!disposed && !request.signal.aborted)
        error.value = cause instanceof Error ? cause.message : '步骤会话加载失败'
    } finally {
      if (controller === request) controller = null
      if (!disposed) {
        loading.value = loadingOlder.value = false
        if (pendingRefresh) {
          pendingRefresh = false
          scheduleRefresh()
        }
      }
    }
  }
  function scheduleRefresh() {
    if (disposed || eventTimer !== null) return
    eventTimer = setTimeout(() => {
      eventTimer = null
      void read()
    }, 400)
  }
  async function decide(approval: Approval, decision: Decision, answers?: ApprovalAnswers) {
    if (
      disposed ||
      resolvingId.value !== null ||
      !approvals.value.some((item) => item.id === approval.id)
    )
      return
    resolvingId.value = approval.id
    decisionError.value = ''
    try {
      await resolveApproval(approval.id, decision, answers)
      if (disposed) return
      resolvedApprovals.add(approval.id)
      approvals.value = approvals.value.filter((item) => item.id !== approval.id)
      await read()
    } catch (cause) {
      if (!disposed) decisionError.value = cause instanceof Error ? cause.message : '审批提交失败'
    } finally {
      if (!disposed) resolvingId.value = null
    }
  }
  watch(
    () => agent.eventRevision,
    () => {
      const event = agent.lastEvent
      if (
        String(event?.payload?.conversationId) === String(conversationId) ||
        event?.type === 'APPROVAL_RESOLVED' ||
        event?.type === 'REGISTER'
      )
        scheduleRefresh()
    },
  )
  watch(
    () => agent.connectionState,
    (state) => {
      if (state === 'CONNECTED') scheduleRefresh()
    },
  )
  const timer = setInterval(() => void read(), 10000)
  void read()
  onScopeDispose(() => {
    disposed = true
    controller?.abort()
    clearInterval(timer)
    if (eventTimer !== null) clearTimeout(eventTimer)
  })
  return {
    displayMessages: computed(() => buildConversationDisplayMessages(messages.value)),
    approvals,
    loading,
    loaded,
    loadingOlder,
    error,
    decisionError,
    hasMore,
    resolvingId,
    refresh: () => read(),
    loadOlder: () => read(true),
    decide,
  }
}
