import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { getProjectExperts } from '@/api/expert'
import type { Id } from '@/types/domain'

export function useProjectExpertUpgradeNotice(projectId: Ref<Id | null | undefined>) {
  const available = ref(false)
  let controller: AbortController | undefined

  watch(
    projectId,
    async (id) => {
      controller?.abort()
      available.value = false
      if (id == null) return
      const current = new AbortController()
      controller = current
      try {
        const response = await getProjectExperts(id, current.signal)
        if (!current.signal.aborted)
          available.value = response.data.experts.some((expert) => expert.upgradeAvailable)
      } catch {
        if (!current.signal.aborted) available.value = false
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => controller?.abort())
  return available
}
