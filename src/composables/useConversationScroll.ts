import { onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import type { Id } from '@/types/domain'

const BOTTOM_THRESHOLD = 40

export function useConversationScroll(
  panel: Ref<HTMLElement | null>,
  content: Ref<HTMLElement | null>,
  conversationId: MaybeRefOrGetter<Id | undefined>,
) {
  const isAtBottom = ref(true)
  let followingBottom = true
  let previousScrollTop = 0
  let disposed = false

  function updatePosition(element: HTMLElement) {
    isAtBottom.value =
      element.scrollHeight - element.clientHeight - element.scrollTop <= BOTTOM_THRESHOLD
    previousScrollTop = element.scrollTop
  }

  function jumpToBottom() {
    if (disposed) return
    followingBottom = true
    const element = panel.value
    if (!element) return
    element.scrollTop = element.scrollHeight
    updatePosition(element)
  }

  function jumpToMessage(message: HTMLElement) {
    const element = panel.value
    if (disposed || !element || !element.contains(message)) return
    followingBottom = false
    const offset =
      message.getBoundingClientRect().top -
      element.getBoundingClientRect().top -
      element.clientTop -
      16
    element.scrollTop = Math.max(0, element.scrollTop + offset)
    updatePosition(element)
  }

  function handleScroll() {
    const element = panel.value
    if (disposed || !element) return
    const movement = element.scrollTop - previousScrollTop
    updatePosition(element)
    // Moving upward opts out even within the button's near-bottom threshold.
    if (movement < -1) followingBottom = false
    else if (movement > 1 && isAtBottom.value) followingBottom = true
  }

  function handleResize() {
    const element = panel.value
    if (disposed || !element) return
    if (followingBottom) jumpToBottom()
    else updatePosition(element)
  }

  watch(
    [panel, content],
    ([element, messages], _previous, onCleanup) => {
      if (!element) return
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(handleResize)
        observer.observe(element)
        if (messages) observer.observe(messages, { box: 'border-box' })
        onCleanup(() => observer.disconnect())
      }
      handleResize()
    },
    { immediate: true, flush: 'post' },
  )

  watch(() => toValue(conversationId), jumpToBottom, { flush: 'post' })

  onScopeDispose(() => {
    disposed = true
  })

  return { isAtBottom, handleScroll, jumpToBottom, jumpToMessage }
}
