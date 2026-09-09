import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useConversationRead } from '@/composables/useConversationRead'
import type { Id } from '@/types/domain'

const observers: MockIntersectionObserver[] = []

class MockIntersectionObserver {
  private target: Element | null = null
  observe = vi.fn((element: Element) => {
    this.target = element
  })
  disconnect = vi.fn()

  constructor(private callback: IntersectionObserverCallback) {
    observers.push(this)
  }

  show(isIntersecting: boolean) {
    this.callback(
      [{ target: this.target, isIntersecting, time: 0 } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
}

const wrappers: ReturnType<typeof mount>[] = []
let visibility: DocumentVisibilityState = 'visible'
let focused = true

async function create() {
  const conversationId = ref<Id | null>(4)
  const ready = ref(false)
  const isAtBottom = ref(true)
  const errorVisible = ref(false)
  const unreadKey = ref<string | null>('turn-7-completed')
  const surface = ref<HTMLElement | null>(null)
  const markRead = vi.fn(() => {
    unreadKey.value = null
  })
  const wrapper = mount(
    defineComponent({
      setup() {
        useConversationRead({
          conversationId,
          ready,
          isAtBottom,
          errorVisible,
          unreadKey,
          surface,
          markRead,
        })
        return () => h('section', { ref: surface })
      },
    }),
  )
  wrappers.push(wrapper)
  await nextTick()
  const observer = observers.at(-1)!
  observer.show(true)
  await nextTick()
  return { conversationId, ready, isAtBottom, errorVisible, unreadKey, markRead, wrapper, observer }
}

beforeEach(() => {
  observers.length = 0
  visibility = 'visible'
  focused = true
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused)
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('acknowledges the current Conversation after it has loaded at the visible bottom', async () => {
  const { ready, markRead, unreadKey } = await create()
  expect(markRead).not.toHaveBeenCalled()
  ready.value = true
  await nextTick()
  expect(markRead).toHaveBeenCalledExactlyOnceWith(4)
  expect(unreadKey.value).toBeNull()
  await nextTick()
  expect(markRead).toHaveBeenCalledTimes(1)
})

it('waits until the reader reaches the bottom before acknowledging completion', async () => {
  const { ready, isAtBottom, markRead } = await create()
  isAtBottom.value = false
  ready.value = true
  await nextTick()
  expect(markRead).not.toHaveBeenCalled()
  isAtBottom.value = true
  await nextTick()
  expect(markRead).toHaveBeenCalledExactlyOnceWith(4)
})

it('acknowledges an error displayed in the current Conversation without requiring bottom scrolling', async () => {
  const { ready, isAtBottom, errorVisible, unreadKey, markRead } = await create()
  isAtBottom.value = false
  unreadKey.value = 'turn-7-failed'
  ready.value = true
  await nextTick()
  expect(markRead).not.toHaveBeenCalled()
  errorVisible.value = true
  await nextTick()
  expect(markRead).toHaveBeenCalledExactlyOnceWith(4)
})

it('keeps background notifications unread until the page is visible and focused', async () => {
  visibility = 'hidden'
  focused = false
  const { ready, markRead } = await create()
  ready.value = true
  await nextTick()
  expect(markRead).not.toHaveBeenCalled()

  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  await nextTick()
  expect(markRead).not.toHaveBeenCalled()
  focused = true
  window.dispatchEvent(new Event('focus'))
  await nextTick()
  expect(markRead).toHaveBeenCalledExactlyOnceWith(4)
})

it('leaves notifications unread while the Conversation pane is hidden behind the preview', async () => {
  const { ready, observer, markRead } = await create()
  observer.show(false)
  ready.value = true
  await nextTick()
  expect(markRead).not.toHaveBeenCalled()
  observer.show(true)
  await nextTick()
  expect(markRead).toHaveBeenCalledExactlyOnceWith(4)
})

it('observes notification keys arriving after loading and repeated replies in the open Conversation', async () => {
  const { ready, unreadKey, markRead } = await create()
  unreadKey.value = null
  ready.value = true
  await nextTick()
  expect(markRead).not.toHaveBeenCalled()

  unreadKey.value = 'turn-7-completed'
  await nextTick()
  expect(markRead).toHaveBeenCalledExactlyOnceWith(4)
  unreadKey.value = 'turn-8-failed'
  await nextTick()
  expect(markRead).toHaveBeenCalledTimes(2)
})

it('acknowledges only the current Conversation after switching and its successful load', async () => {
  const { conversationId, ready, unreadKey, markRead } = await create()
  conversationId.value = null
  ready.value = true
  await nextTick()
  expect(markRead).not.toHaveBeenCalled()

  ready.value = false
  conversationId.value = 5
  unreadKey.value = 'conversation-5-turn-9-completed'
  await nextTick()
  expect(markRead).not.toHaveBeenCalled()
  ready.value = true
  await nextTick()
  expect(markRead).toHaveBeenCalledExactlyOnceWith(5)
})

it('releases visibility observers and does not acknowledge after unmounting', async () => {
  const { ready, wrapper, observer, markRead } = await create()
  wrapper.unmount()
  expect(observer.disconnect).toHaveBeenCalledOnce()
  ready.value = true
  observer.show(true)
  window.dispatchEvent(new Event('focus'))
  document.dispatchEvent(new Event('visibilitychange'))
  await nextTick()
  expect(markRead).not.toHaveBeenCalled()
})
