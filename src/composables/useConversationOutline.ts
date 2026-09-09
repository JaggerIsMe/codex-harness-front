import { onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import type { Id } from '@/types/domain'

interface OutlineRow {
  id: string
  element: HTMLElement
}

export function useConversationOutline(
  panel: Ref<HTMLElement | null>,
  content: Ref<HTMLElement | null>,
  conversationId: MaybeRefOrGetter<Id | undefined>,
  messageIds: MaybeRefOrGetter<string[]>,
) {
  const activeId = ref<string | null>(null)
  let rows: OutlineRow[] = []
  let observer: ResizeObserver | undefined
  let frame: number | null = null
  let disposed = false
  let selected: { row: OutlineRow; scrollTop: number } | null = null

  function updatePosition() {
    const element = panel.value
    if (disposed || !element || toValue(conversationId) === undefined || !rows.length) {
      selected = null
      activeId.value = null
      return
    }
    const selection = selected
    if (selection) {
      if (
        rows.some((row) => row.id === selection.row.id && row.element === selection.row.element) &&
        Math.abs(element.scrollTop - selection.scrollTop) <= 1
      ) {
        activeId.value = selection.row.id
        return
      }
      selected = null
    }
    if (element.scrollHeight - element.clientHeight - element.scrollTop <= 40) {
      activeId.value = rows.at(-1)!.id
      return
    }
    const readingTop = element.getBoundingClientRect().top + element.clientTop + 60
    let current = rows[0]!.id
    for (const row of rows) {
      if (row.element.getBoundingClientRect().top > readingTop) break
      current = row.id
    }
    activeId.value = current
  }

  function selectMessage(id: string) {
    const element = panel.value
    const row = rows.find((row) => row.id === id)
    if (disposed || !element || !row || toValue(conversationId) === undefined) return
    selected = { row, scrollTop: element.scrollTop }
    activeId.value = id
  }

  function scheduleUpdate() {
    if (disposed || frame !== null) return
    frame = window.requestAnimationFrame(() => {
      frame = null
      updatePosition()
    })
  }

  function cancelUpdate() {
    if (frame !== null) window.cancelAnimationFrame(frame)
    frame = null
  }

  function refreshRows() {
    const elements = new Map(
      Array.from(
        content.value?.querySelectorAll<HTMLElement>('.message-row[data-message-id]') || [],
      ).map((element) => [element.dataset.messageId!, element] as const),
    )
    const next = toValue(messageIds).flatMap((id) => {
      const element = elements.get(id)
      return element ? [{ id, element }] : []
    })
    const previousElements = new Set(rows.map((row) => row.element))
    const nextElements = new Set(next.map((row) => row.element))
    for (const element of previousElements) {
      if (!nextElements.has(element)) observer?.unobserve(element)
    }
    for (const element of nextElements) {
      if (!previousElements.has(element)) observer?.observe(element, { box: 'border-box' })
    }
    const selectedRow = selected?.row
    if (
      selectedRow &&
      !next.some((row) => row.id === selectedRow.id && row.element === selectedRow.element)
    )
      selected = null
    rows = next
    scheduleUpdate()
  }

  watch(
    [panel, content],
    ([element, messages], _previous, cleanup) => {
      selected = null
      activeId.value = null
      rows = []
      if (!element) return
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(scheduleUpdate)
        observer.observe(element, { box: 'border-box' })
        if (messages) observer.observe(messages, { box: 'border-box' })
      }
      element.addEventListener('scroll', scheduleUpdate, { passive: true })
      refreshRows()
      cleanup(() => {
        element.removeEventListener('scroll', scheduleUpdate)
        observer?.disconnect()
        observer = undefined
        cancelUpdate()
      })
    },
    { immediate: true, flush: 'post' },
  )

  watch(() => JSON.stringify(toValue(messageIds)), refreshRows, { flush: 'post' })
  watch(
    () => toValue(conversationId),
    () => {
      selected = null
      activeId.value = null
      refreshRows()
    },
    { flush: 'post' },
  )

  onScopeDispose(() => {
    disposed = true
    cancelUpdate()
  })

  return { activeId, selectMessage }
}
