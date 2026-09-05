import { ref, onMounted, onScopeDispose } from 'vue'
import { getExpertSelection } from '@/api/expert'
import type { Id } from '@/types/domain'
import type { ExpertSelection } from '@/types/expert'

export function useConversationExpert(projectId: Id, conversationId: Id) {
  const selection = ref<ExpertSelection | null>(null)
  const loading = ref(true),
    error = ref('')
  const lifetime = new AbortController()
  let revision = 0
  async function load() {
    if (lifetime.signal.aborted) return
    const current = ++revision
    loading.value = true
    try {
      const response = await getExpertSelection(projectId, conversationId, lifetime.signal)
      if (current === revision && !lifetime.signal.aborted) {
        selection.value = response.data
        error.value = ''
      }
    } catch (cause) {
      if (!lifetime.signal.aborted && current === revision)
        error.value = cause instanceof Error ? cause.message : '专家选择加载失败'
    } finally {
      if (!lifetime.signal.aborted && current === revision) loading.value = false
    }
  }
  onMounted(load)
  onScopeDispose(() => {
    ++revision
    lifetime.abort()
  })
  return { selection, loading, error, load }
}
