import { ref, watch } from 'vue'
import { getTurnExperts } from '@/api/expert'
import type { Conversation, Turn } from '@/types/domain'
import type { TurnExpert } from '@/types/expert'

export function useTurnExperts(conversation: () => Conversation | null, turn: () => Turn | null) {
  const rows = ref<TurnExpert[]>([]),
    error = ref('')
  watch(
    () => [conversation()?.id, turn()?.id, turn()?.status],
    (_, __, cleanup) => {
      const current = conversation()
      rows.value = []
      error.value = ''
      if (!current) return
      const controller = new AbortController()
      cleanup(() => controller.abort())
      void getTurnExperts(current.projectId, current.id, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) rows.value = result.data
        })
        .catch((cause) => {
          if (!controller.signal.aborted)
            error.value = cause instanceof Error ? cause.message : '回答专家身份加载失败'
        })
    },
    { immediate: true },
  )
  return { rows, error }
}
