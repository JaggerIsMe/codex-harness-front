import { ref, watch, onScopeDispose, type Ref } from 'vue'
import type { Id } from '@/types/domain'
import type { Orchestration } from '@/types/orchestration'
import { getOrchestration, listOrchestrations, orchestrationAvailable } from '@/api/orchestration'
import { useAgentStore } from '@/stores/agent'

/** HTTP snapshots are authoritative; shared socket events only invalidate them. */
export function useOrchestration(projectId: Ref<number>, selectedId: Ref<string>) {
  const items = ref<Orchestration[]>([])
  const current = ref<Orchestration | null>(null)
  const keyword = ref('')
  const enabled = ref(false)
  const loading = ref(false)
  const error = ref('')
  const agent = useAgentStore()
  let request: AbortController | null = null
  let disposed = false
  let running = false
  let rerun = false
  let revision = 0
  async function refresh() {
    if (disposed) return
    if (running) {
      rerun = true
      return
    }
    running = true
    loading.value = true
    const controller = new AbortController()
    request = controller
    const version = revision,
      pid = projectId.value,
      id = selectedId.value
    try {
      const available = await orchestrationAvailable(pid, controller.signal)
      if (disposed || version !== revision) return
      enabled.value = available.data
      if (!available.data) {
        items.value = []
        current.value = null
        error.value = ''
        return
      }
      const [list, detail] = await Promise.all([
        listOrchestrations(pid, keyword.value, controller.signal),
        id ? getOrchestration(pid, id as Id, controller.signal) : Promise.resolve(null),
      ])
      if (disposed || version !== revision) return
      items.value = list.data
      current.value = detail?.data ?? null
      error.value = ''
    } catch (cause) {
      if (!disposed && version === revision && !controller.signal.aborted)
        error.value = cause instanceof Error ? cause.message : '编排加载失败'
    } finally {
      running = false
      if (!disposed) loading.value = false
      if (request === controller) request = null
      if (rerun && !disposed) {
        rerun = false
        void refresh()
      }
    }
  }
  watch(
    [projectId, selectedId],
    () => {
      revision++
      request?.abort()
      current.value = null
      items.value = []
      error.value = ''
      void refresh()
    },
    { immediate: true },
  )
  watch(
    () => agent.eventRevision,
    () => {
      const event = agent.lastEvent
      if (
        String(event?.payload?.projectId) === String(projectId.value) &&
        event?.type === 'ORCHESTRATION_UPDATED'
      )
        void refresh()
    },
  )
  const timer = setInterval(() => void refresh(), 10000)
  onScopeDispose(() => {
    disposed = true
    revision++
    request?.abort()
    clearInterval(timer)
  })
  return { items, current, keyword, enabled, loading, error, refresh }
}
