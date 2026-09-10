import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useConversationScroll } from '@/composables/useConversationScroll'
import type { Id } from '@/types/domain'

const observers: MockResizeObserver[] = []

class MockResizeObserver {
  private boxes = new Map<Element, ResizeObserverBoxOptions>()
  observe = vi.fn((target: Element, options?: ResizeObserverOptions) => {
    this.boxes.set(target, options?.box ?? 'content-box')
  })
  disconnect = vi.fn()

  constructor(private callback: ResizeObserverCallback) {
    observers.push(this)
  }

  resize() {
    this.callback([], this as unknown as ResizeObserver)
  }

  resizePadding(target: Element) {
    if (this.boxes.get(target) === 'border-box') this.resize()
  }
}

const wrappers: ReturnType<typeof mount>[] = []

async function create(
  options: {
    history?: Parameters<typeof useConversationScroll>[3]
    metrics?: Partial<{ scrollHeight: number; clientHeight: number; scrollTop: number }>
    rowTops?: number[]
  } = {},
) {
  const panel = ref<HTMLElement | null>(null)
  const content = ref<HTMLElement | null>(null)
  const conversationId = ref<Id | undefined>(1)
  const metrics = { scrollHeight: 1200, clientHeight: 400, scrollTop: 0, ...options.metrics }
  let state!: ReturnType<typeof useConversationScroll>
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useConversationScroll(panel, content, conversationId, options.history)
        return () => h('div')
      },
    }),
  )
  wrappers.push(wrapper)
  const element = document.createElement('section')
  Object.defineProperties(element, {
    scrollHeight: { get: () => metrics.scrollHeight },
    clientHeight: { get: () => metrics.clientHeight },
    scrollTop: {
      get: () => metrics.scrollTop,
      set: (top: number) => {
        metrics.scrollTop = Math.max(0, Math.min(top, metrics.scrollHeight - metrics.clientHeight))
      },
    },
  })
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 100, 500, metrics.clientHeight),
  )
  const messages = document.createElement('div')
  element.appendChild(messages)
  const rows = (options.rowTops || []).map((top, index) => {
    const row = { element: document.createElement('div'), top, height: 200 }
    row.element.className = 'message-row'
    row.element.dataset.messageId = String(index + 1)
    vi.spyOn(row.element, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, 100 + row.top - metrics.scrollTop, 500, row.height),
    )
    messages.appendChild(row.element)
    return row
  })
  panel.value = element
  content.value = messages
  await nextTick()
  const observer = observers.at(-1)!
  const scroll = (top: number) => {
    element.scrollTop = top
    state.handleScroll()
  }
  return { state, wrapper, metrics, scroll, panel, content, conversationId, observer, rows }
}

beforeEach(() => {
  observers.length = 0
  vi.stubGlobal('ResizeObserver', MockResizeObserver)
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})

it('opens at the latest Message and follows Message growth and viewport resizing', async () => {
  const { state, metrics, observer, panel, content } = await create()
  expect(observer.observe).toHaveBeenCalledWith(panel.value)
  expect(observer.observe).toHaveBeenCalledWith(content.value, { box: 'border-box' })
  expect(metrics.scrollTop).toBe(800)
  expect(state.isAtBottom.value).toBe(true)

  metrics.scrollHeight = 1600
  observer.resize()
  expect(metrics.scrollTop).toBe(1200)

  metrics.clientHeight = 300
  observer.resize()
  expect(metrics.scrollTop).toBe(1300)
  expect(state.isAtBottom.value).toBe(true)
})

it('keeps the reading position after upward scrolling and resumes after jumping to latest', async () => {
  const { state, metrics, observer, scroll } = await create()
  scroll(500)
  expect(state.isAtBottom.value).toBe(false)

  metrics.scrollHeight = 1600
  observer.resize()
  expect(metrics.scrollTop).toBe(500)
  expect(state.isAtBottom.value).toBe(false)

  state.jumpToBottom()
  expect(metrics.scrollTop).toBe(1200)
  expect(state.isAtBottom.value).toBe(true)
  state.handleScroll()
  metrics.scrollHeight = 1800
  observer.resize()
  expect(metrics.scrollTop).toBe(1400)
})

it('jumps inside the Message panel and keeps the selected history in place during streaming', async () => {
  const { state, metrics, observer, panel } = await create()
  const message = document.createElement('article')
  panel.value!.appendChild(message)
  vi.spyOn(panel.value!, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 500, 400))
  vi.spyOn(message, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 100 + 400 - metrics.scrollTop, 500, 200),
  )
  state.jumpToMessage(message)
  expect(metrics.scrollTop).toBe(384)
  expect(state.isAtBottom.value).toBe(false)
  state.handleScroll()
  metrics.scrollHeight = 1600
  observer.resize()
  expect(metrics.scrollTop).toBe(384)

  state.jumpToBottom()
  expect(metrics.scrollTop).toBe(1200)
})

it('does not resume following after a Message jump inside the near-bottom threshold', async () => {
  const { state, metrics, observer, panel } = await create()
  const message = document.createElement('article')
  panel.value!.appendChild(message)
  vi.spyOn(panel.value!, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 500, 400))
  vi.spyOn(message, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 100 + 810 - metrics.scrollTop, 500, 100),
  )
  state.jumpToMessage(message)
  expect(metrics.scrollTop).toBe(794)
  expect(state.isAtBottom.value).toBe(true)
  state.handleScroll()
  metrics.scrollHeight = 1400
  observer.resize()
  expect(metrics.scrollTop).toBe(794)
  expect(state.isAtBottom.value).toBe(false)
})

it('ignores a Message target outside the current panel', async () => {
  const { state, metrics, observer } = await create()
  state.jumpToMessage(document.createElement('article'))
  expect(metrics.scrollTop).toBe(800)
  metrics.scrollHeight = 1600
  observer.resize()
  expect(metrics.scrollTop).toBe(1200)
})

it('follows resized composer clearance at the bottom without taking over an earlier reading position', async () => {
  const { state, metrics, observer, content, scroll } = await create()
  // Only the bottom padding changes; the Message content-box stays the same height.
  metrics.scrollHeight += 240
  observer.resizePadding(content.value!)
  expect(metrics.scrollTop).toBe(1040)
  expect(state.isAtBottom.value).toBe(true)

  scroll(500)
  metrics.scrollHeight += 160
  observer.resizePadding(content.value!)
  expect(metrics.scrollTop).toBe(500)
  expect(state.isAtBottom.value).toBe(false)

  state.jumpToBottom()
  metrics.scrollHeight -= 240
  observer.resizePadding(content.value!)
  expect(metrics.scrollTop).toBe(960)
  expect(state.isAtBottom.value).toBe(true)
})

it('separates near-bottom visibility from upward scrolling intent', async () => {
  const { state, metrics, observer, scroll } = await create()
  scroll(780)
  expect(state.isAtBottom.value).toBe(true)

  metrics.scrollHeight = 1400
  observer.resize()
  expect(metrics.scrollTop).toBe(780)
  expect(state.isAtBottom.value).toBe(false)

  scroll(1000)
  metrics.scrollHeight = 1600
  observer.resize()
  expect(metrics.scrollTop).toBe(1200)
})

it('updates bottom visibility when Message content shrinks without moving the reader', async () => {
  const { state, metrics, observer, scroll } = await create()
  scroll(500)
  metrics.scrollHeight = 900
  observer.resize()
  expect(metrics.scrollTop).toBe(500)
  expect(state.isAtBottom.value).toBe(true)
})

it('resets to the latest Message when switching Conversations', async () => {
  const { state, metrics, observer, scroll, conversationId } = await create()
  scroll(300)
  conversationId.value = 2
  await nextTick()
  expect(metrics.scrollTop).toBe(800)
  expect(state.isAtBottom.value).toBe(true)

  metrics.scrollHeight = 1800
  observer.resize()
  expect(metrics.scrollTop).toBe(1400)
})

it('disconnects observers when elements change and on disposal', async () => {
  const { state, wrapper, metrics, content, observer } = await create()
  content.value = document.createElement('div')
  await nextTick()
  expect(observer.disconnect).toHaveBeenCalledOnce()
  const replacement = observers.at(-1)!
  wrapper.unmount()
  expect(replacement.disconnect).toHaveBeenCalledOnce()

  metrics.scrollHeight = 1800
  replacement.resize()
  state.jumpToBottom()
  expect(metrics.scrollTop).toBe(800)
})

function historyOptions() {
  return {
    hasMore: ref(true),
    loading: ref(false),
    loadOlder: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
  }
}

function pendingPage() {
  let resolve!: (appended: boolean) => void
  const promise = new Promise<boolean>((finish) => (resolve = finish))
  return { promise, resolve }
}

it('loads once near the top and restores the visible row independently of tail growth', async () => {
  const history = historyOptions()
  const page = pendingPage()
  history.loadOlder.mockReturnValue(page.promise)
  const { metrics, observer, scroll, rows } = await create({ history, rowTops: [0, 200, 400] })
  expect(history.loadOlder).not.toHaveBeenCalled()
  scroll(300)
  expect(history.loadOlder).not.toHaveBeenCalled()
  scroll(20)
  expect(history.loadOlder).toHaveBeenCalledOnce()
  scroll(0)
  scroll(0)
  expect(history.loadOlder).toHaveBeenCalledOnce()

  rows.forEach((row) => (row.top += 300))
  metrics.scrollHeight += 500 // 300px of history and 200px of new streamed output.
  observer.resize()
  expect(metrics.scrollTop).toBe(0)
  page.resolve(true)
  await flushPromises()
  expect(metrics.scrollTop).toBe(300)
  metrics.scrollHeight += 200
  observer.resize()
  expect(metrics.scrollTop).toBe(300)
})

it('does not double-apply browser scroll anchoring when history is prepended', async () => {
  const history = historyOptions()
  const page = pendingPage()
  history.loadOlder.mockReturnValue(page.promise)
  const { metrics, scroll, rows } = await create({ history, rowTops: [0, 200] })
  scroll(0)
  rows.forEach((row) => (row.top += 300))
  metrics.scrollHeight += 600
  metrics.scrollTop = 300 // The browser has already kept the reading row in place.
  page.resolve(true)
  await flushPromises()
  expect(metrics.scrollTop).toBe(300)
})

it('loads after a real upward scroll from a Message jump already inside the top threshold', async () => {
  const history = historyOptions()
  const { state, metrics, rows, scroll } = await create({ history, rowTops: [40, 200] })
  state.jumpToMessage(rows[0]!.element)
  expect(metrics.scrollTop).toBe(24)
  state.handleScroll()
  expect(history.loadOlder).not.toHaveBeenCalled()
  scroll(0)
  expect(history.loadOlder).toHaveBeenCalledOnce()
})

it('keeps a failed top visit disarmed until the reader leaves and returns', async () => {
  const history = historyOptions()
  const { scroll, state, observer } = await create({ history, rowTops: [0, 200] })
  scroll(0)
  await flushPromises()
  state.handleScroll()
  observer.resize()
  await flushPromises()
  expect(history.loadOlder).toHaveBeenCalledOnce()
  scroll(200)
  scroll(0)
  await flushPromises()
  expect(history.loadOlder).toHaveBeenCalledTimes(2)
})

it('waits for initial loading and stops filling short history once it can scroll', async () => {
  const history = historyOptions()
  history.loading.value = true
  const first = pendingPage()
  const second = pendingPage()
  history.loadOlder.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const { metrics, rows, observer } = await create({
    history,
    metrics: { scrollHeight: 200 },
    rowTops: [0],
  })
  observer.resize()
  expect(history.loadOlder).not.toHaveBeenCalled()
  history.loading.value = false
  await nextTick()
  expect(history.loadOlder).toHaveBeenCalledOnce()
  metrics.scrollHeight = 350
  rows[0]!.top += 150
  first.resolve(true)
  await flushPromises()
  expect(history.loadOlder).toHaveBeenCalledTimes(2)
  metrics.scrollHeight = 650
  rows[0]!.top += 300
  second.resolve(true)
  await flushPromises()
  observer.resize()
  expect(history.loadOlder).toHaveBeenCalledTimes(2)
  expect(metrics.scrollTop).toBe(250)
  metrics.scrollHeight += 200
  observer.resize()
  expect(metrics.scrollTop).toBe(450)
})

it('does not repeatedly refill a short page after a failed load', async () => {
  const history = historyOptions()
  const { observer, state } = await create({
    history,
    metrics: { scrollHeight: 200 },
    rowTops: [0],
  })
  await flushPromises()
  observer.resize()
  state.handleScroll()
  await flushPromises()
  expect(history.loadOlder).toHaveBeenCalledOnce()
})

it('allows an explicit retry after a failed short page without duplicating a pending request', async () => {
  const history = historyOptions()
  const { state, wrapper } = await create({
    history,
    metrics: { scrollHeight: 200 },
    rowTops: [0],
  })
  await flushPromises()
  expect(history.loadOlder).toHaveBeenCalledOnce()
  const page = pendingPage()
  history.loadOlder.mockReturnValue(page.promise)
  const retry = state.retryHistory()
  state.retryHistory()
  expect(history.loadOlder).toHaveBeenCalledTimes(2)
  page.resolve(false)
  await retry
  wrapper.unmount()
  state.retryHistory()
  expect(history.loadOlder).toHaveBeenCalledTimes(2)
})

it('does not fetch history when exhausted or another load is in progress', async () => {
  const history = historyOptions()
  history.hasMore.value = false
  const { scroll } = await create({ history, rowTops: [0, 200] })
  scroll(0)
  expect(history.loadOlder).not.toHaveBeenCalled()
  history.hasMore.value = true
  history.loading.value = true
  await nextTick()
  scroll(300)
  scroll(0)
  expect(history.loadOlder).not.toHaveBeenCalled()
  history.loading.value = false
  await nextTick()
  expect(history.loadOlder).not.toHaveBeenCalled()
  scroll(300)
  scroll(0)
  expect(history.loadOlder).toHaveBeenCalledOnce()
})

it.each(['conversation', 'bottom', 'message', 'unmount'] as const)(
  'invalidates history restoration after %s navigation',
  async (navigation) => {
    const history = historyOptions()
    const page = pendingPage()
    history.loadOlder.mockReturnValue(page.promise)
    const { state, metrics, scroll, rows, conversationId, wrapper, observer } = await create({
      history,
      rowTops: [0, 200, 400],
    })
    scroll(0)
    expect(history.loadOlder).toHaveBeenCalledOnce()
    if (navigation === 'conversation') {
      conversationId.value = 2
      await nextTick()
    } else if (navigation === 'bottom') state.jumpToBottom()
    else if (navigation === 'message') state.jumpToMessage(rows[2]!.element)
    else wrapper.unmount()
    const before = metrics.scrollTop
    rows.forEach((row) => (row.top += 300))
    metrics.scrollHeight += 300
    observer.resize()
    page.resolve(true)
    await flushPromises()
    expect(metrics.scrollTop).toBe(
      navigation === 'conversation' || navigation === 'bottom' ? 1100 : before,
    )
    expect(history.loadOlder).toHaveBeenCalledOnce()
  },
)
