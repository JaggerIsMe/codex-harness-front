import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
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

async function create() {
  const panel = ref<HTMLElement | null>(null)
  const content = ref<HTMLElement | null>(null)
  const conversationId = ref<Id | undefined>(1)
  const metrics = { scrollHeight: 1200, clientHeight: 400, scrollTop: 0 }
  let state!: ReturnType<typeof useConversationScroll>
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useConversationScroll(panel, content, conversationId)
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
  panel.value = element
  content.value = document.createElement('div')
  await nextTick()
  const observer = observers.at(-1)!
  const scroll = (top: number) => {
    element.scrollTop = top
    state.handleScroll()
  }
  return { state, wrapper, metrics, scroll, panel, content, conversationId, observer }
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
