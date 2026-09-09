import { watch, toValue, type MaybeRefOrGetter, type Ref } from 'vue'
import { useDocumentVisibility, useElementVisibility, useWindowFocus } from '@vueuse/core'
import type { Id } from '@/types/domain'

interface ConversationReadOptions {
  conversationId: MaybeRefOrGetter<Id | null | undefined>
  ready: MaybeRefOrGetter<boolean>
  isAtBottom: MaybeRefOrGetter<boolean>
  errorVisible: MaybeRefOrGetter<boolean>
  unreadKey: MaybeRefOrGetter<string | null>
  surface: Ref<HTMLElement | null>
  markRead: (conversationId: Id) => void
}

export function useConversationRead(options: ConversationReadOptions) {
  const visibility = useDocumentVisibility()
  const focused = useWindowFocus()
  const surfaceVisible = useElementVisibility(options.surface)

  watch(
    [
      () => toValue(options.conversationId),
      () => toValue(options.ready),
      () => toValue(options.isAtBottom),
      () => toValue(options.errorVisible),
      () => toValue(options.unreadKey),
      visibility,
      focused,
      surfaceVisible,
    ],
    ([id, ready, atBottom, errorVisible, unreadKey, visible, hasFocus, surfaceInView]) => {
      if (
        id != null &&
        ready &&
        unreadKey &&
        visible === 'visible' &&
        hasFocus &&
        surfaceInView &&
        (atBottom || errorVisible)
      )
        options.markRead(id)
    },
    { immediate: true, flush: 'post' },
  )
}
