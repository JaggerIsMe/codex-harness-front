import { nextTick, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import type { Id } from '@/types/domain'

const BOTTOM_THRESHOLD = 40
const TOP_THRESHOLD = 80

interface ConversationHistory {
  hasMore: MaybeRefOrGetter<boolean>
  loading: MaybeRefOrGetter<boolean>
  loadOlder: () => Promise<boolean>
}

interface ReadingAnchor {
  row: HTMLElement
  offset: number
}

interface HistoryRequest {
  element: HTMLElement
  conversationId: Id | undefined
  revision: number
  anchor: ReadingAnchor | null
  followingBottom: boolean
}

export function useConversationScroll(
  panel: Ref<HTMLElement | null>,
  content: Ref<HTMLElement | null>,
  conversationId: MaybeRefOrGetter<Id | undefined>,
  history?: ConversationHistory,
) {
  const isAtBottom = ref(true)
  let followingBottom = true
  let previousScrollTop = 0
  let disposed = false
  let initialized = false
  let topArmed = true
  let revision = 0
  let pending: HistoryRequest | null = null

  function updatePosition(element: HTMLElement) {
    isAtBottom.value =
      element.scrollHeight - element.clientHeight - element.scrollTop <= BOTTOM_THRESHOLD
    previousScrollTop = element.scrollTop
  }

  function followBottom(element: HTMLElement) {
    element.scrollTop = element.scrollHeight
    updatePosition(element)
  }

  function jumpToBottom() {
    if (disposed) return
    revision += 1
    followingBottom = true
    topArmed = true
    const element = panel.value
    if (element) {
      followBottom(element)
    }
  }

  function jumpToMessage(message: HTMLElement) {
    const element = panel.value
    if (disposed || !element || !element.contains(message)) return
    revision += 1
    topArmed = true
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
    if (pending && pending.revision === revision && Math.abs(movement) > 1) {
      pending.anchor = readingAnchor(element)
      if (movement < -1) pending.followingBottom = false
    }
    if (element.scrollTop > TOP_THRESHOLD) topArmed = true
    else if (movement < -1) void loadHistory()
  }

  function handleResize() {
    const element = panel.value
    if (disposed || !element) return
    // Neither streaming growth nor the prepended page may take over the reader during a request.
    if (pending) {
      updatePosition(element)
      return
    }
    if (followingBottom) followBottom(element)
    else updatePosition(element)
    if (!history || !toValue(history.loading)) initialized = true
    fillShortHistory()
  }

  function readingAnchor(element: HTMLElement): ReadingAnchor | null {
    const viewportTop = element.getBoundingClientRect().top + element.clientTop
    const viewportBottom = viewportTop + element.clientHeight
    const rows = Array.from(element.querySelectorAll<HTMLElement>('.message-row[data-message-id]'))
    const row = rows.find((message) => {
      const bounds = message.getBoundingClientRect()
      return bounds.bottom > viewportTop && bounds.top < viewportBottom
    })
    return row ? { row, offset: row.getBoundingClientRect().top - viewportTop } : null
  }

  function fillShortHistory() {
    const element = panel.value
    if (
      element &&
      element.clientHeight > 0 &&
      element.scrollHeight <= element.clientHeight + 1 &&
      element.querySelector('.message-row[data-message-id]')
    )
      void loadHistory()
  }

  async function loadHistory() {
    const element = panel.value
    if (
      disposed ||
      !history ||
      !element ||
      !initialized ||
      !topArmed ||
      pending ||
      toValue(conversationId) === undefined ||
      toValue(history.loading) ||
      !toValue(history.hasMore)
    )
      return
    topArmed = false
    const request: HistoryRequest = {
      element,
      conversationId: toValue(conversationId),
      revision,
      anchor: readingAnchor(element),
      followingBottom,
    }
    pending = request
    let appended = false
    try {
      appended = await history.loadOlder()
      await nextTick()
      if (pending !== request || disposed || request.revision !== revision) return
      if (appended) {
        const anchor = request.anchor
        if (anchor && element.contains(anchor.row)) {
          const viewportTop = element.getBoundingClientRect().top + element.clientTop
          // The visible row ignores tail streaming growth and any browser scroll anchoring.
          element.scrollTop += anchor.row.getBoundingClientRect().top - viewportTop - anchor.offset
        }
        followingBottom = request.followingBottom
        topArmed = true
        updatePosition(element)
      }
    } catch {
      // The caller owns error presentation; leave this visit disarmed until the reader retries.
    } finally {
      if (pending === request) {
        pending = null
        if (
          !disposed &&
          panel.value === element &&
          toValue(conversationId) === request.conversationId
        ) {
          if (request.revision !== revision && followingBottom) followBottom(element)
          else if (appended && request.revision === revision) fillShortHistory()
        }
      }
    }
  }

  function retryHistory() {
    if (disposed || pending) return
    topArmed = true
    return loadHistory()
  }

  watch(
    [panel, content, () => toValue(conversationId)],
    ([element, messages, id], previous, onCleanup) => {
      revision += 1
      pending = null
      if (element !== previous?.[0] || id !== previous?.[2]) {
        initialized = false
        followingBottom = true
        topArmed = true
        previousScrollTop = 0
      }
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

  if (history)
    watch([() => toValue(history.loading), () => toValue(history.hasMore)], handleResize, {
      flush: 'post',
    })

  onScopeDispose(() => {
    disposed = true
    revision += 1
    pending = null
  })

  return { isAtBottom, handleScroll, jumpToBottom, jumpToMessage, retryHistory }
}
