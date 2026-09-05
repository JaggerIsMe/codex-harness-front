import { ref, watch } from 'vue'
import { getArtifacts } from '@/api/artifact'
import { useAgentStore } from '@/stores/agent'
import type { Conversation, ConversationArtifact } from '@/types/domain'

/** One list per open Conversation; reconnects and missed notifications recover from durable state. */
export function useConversationArtifacts(conversation: () => Conversation | null) {
  const rows = ref<ConversationArtifact[]>([])
  const loading = ref(false)
  const error = ref('')
  const agent = useAgentStore()
  let refresh: () => Promise<void> = async () => {}
  watch(
    () => {
      const value = conversation()
      return value ? `${value.projectId}:${value.id}` : ''
    },
    (_, __, onCleanup) => {
      const current = conversation()
      rows.value = []
      error.value = ''
      loading.value = Boolean(current)
      refresh = async () => {}
      if (!current) return
      const lifetime = new AbortController()
      let timer: ReturnType<typeof setTimeout> | undefined
      let running = false
      let queued = false
      const load = async () => {
        if (lifetime.signal.aborted) return
        if (running) {
          queued = true
          return
        }
        running = true
        clearTimeout(timer)
        try {
          const result = await getArtifacts(current.projectId, current.id, lifetime.signal)
          if (!lifetime.signal.aborted) {
            rows.value = result.data
            error.value = ''
          }
        } catch (cause) {
          if (!lifetime.signal.aborted) {
            rows.value = []
            error.value = cause instanceof Error ? cause.message : '交付文件加载失败'
          }
        } finally {
          running = false
          if (!lifetime.signal.aborted) {
            loading.value = false
            // Polling also discovers a first upload whose notification was missed.
            timer = setTimeout(() => void load(), queued ? 0 : 15000)
            queued = false
          }
        }
      }
      refresh = load
      const stopFrames = watch(
        () => agent.eventRevision,
        () => {
          const event = agent.lastEvent
          if (
            event?.type === 'ARTIFACT_CHANGED' &&
            String(event.payload?.conversationId) === String(current.id)
          )
            void load()
        },
        { flush: 'sync' },
      )
      const stopConnection = watch(
        () => agent.connectionState,
        (state) => {
          if (state === 'CONNECTED') void load()
        },
      )
      onCleanup(() => {
        lifetime.abort()
        clearTimeout(timer)
        stopFrames()
        stopConnection()
      })
      void load()
    },
    { immediate: true },
  )
  return { rows, loading, error, reload: () => refresh() }
}
