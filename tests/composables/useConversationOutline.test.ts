import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useConversationOutline } from '@/composables/useConversationOutline'
import type { Id } from '@/types/domain'

const observers: MockResizeObserver[] = []
const frames = new Map<number, FrameRequestCallback>()
let frameId = 0

class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()

  constructor(private callback: ResizeObserverCallback) {
    observers.push(this)
  }

  resize() {
    this.callback([], this as unknown as ResizeObserver)
  }
}

function flushFrame() {
  const pending = [...frames.values()]
  frames.clear()
  pending.forEach((callback) => callback(0))
}

const wrappers: ReturnType<typeof mount>[] = []

async function create() {
  const panel = ref<HTMLElement | null>(null)
  const content = ref<HTMLElement | null>(null)
  const conversationId = ref<Id | undefined>(4)
  const messageIds = ref<string[]>(['first', 'middle', 'last'])
  const positions = new Map<string, number>([
    ['first', 0],
    ['middle', 320],
    ['last', 800],
  ])
  const metrics = { scrollHeight: 1400, clientHeight: 400, scrollTop: 0 }
  let state!: ReturnType<typeof useConversationOutline>
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useConversationOutline(panel, content, conversationId, messageIds)
        return () => h('div')
      },
    }),
  )
  wrappers.push(wrapper)
  const element = document.createElement('section')
  const messages = document.createElement('div')
  element.appendChild(messages)
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
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 500, 400))
  const renderRows = (ids: string[]) => {
    messageIds.value = ids
    const rows = ids.map((id) => {
      const row = document.createElement('article')
      row.className = 'message-row'
      row.dataset.messageId = id
      vi.spyOn(row, 'getBoundingClientRect').mockImplementation(
        () => new DOMRect(0, 100 + (positions.get(id) || 0) - metrics.scrollTop, 500, 200),
      )
      return row
    })
    messages.replaceChildren(...rows)
    return rows
  }
  renderRows(messageIds.value)
  panel.value = element
  content.value = messages
  await nextTick()
  flushFrame()
  const scroll = (top: number) => {
    element.scrollTop = top
    element.dispatchEvent(new Event('scroll'))
  }
  return {
    state,
    wrapper,
    panel,
    content,
    metrics,
    positions,
    messageIds,
    conversationId,
    observer: observers.at(-1)!,
    renderRows,
    scroll,
  }
}

beforeEach(() => {
  observers.length = 0
  frames.clear()
  frameId = 0
  vi.stubGlobal('ResizeObserver', MockResizeObserver)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('tracks the Message crossing the reading line and highlights the final Message at the bottom', async () => {
  const { state, scroll } = await create()
  expect(state.activeId.value).toBe('first')
  scroll(300)
  flushFrame()
  expect(state.activeId.value).toBe('middle')
  scroll(760)
  flushFrame()
  expect(state.activeId.value).toBe('last')
  scroll(1000)
  flushFrame()
  expect(state.activeId.value).toBe('last')
})

it('preserves an explicitly selected Message when a short Conversation cannot scroll', async () => {
  const { state, metrics, positions, observer, scroll } = await create()
  metrics.scrollHeight = 300
  positions.set('middle', 80)
  positions.set('last', 160)
  observer.resize()
  flushFrame()
  expect(state.activeId.value).toBe('last')

  state.selectMessage('first')
  expect(state.activeId.value).toBe('first')
  scroll(0)
  observer.resize()
  flushFrame()
  expect(state.activeId.value).toBe('first')
  state.selectMessage('missing-message')
  expect(state.activeId.value).toBe('first')
})

it('keeps a near-bottom selection through layout changes until the reader scrolls away', async () => {
  const { state, positions, observer, scroll } = await create()
  positions.set('middle', 1000)
  positions.set('last', 1180)
  scroll(984)
  flushFrame()
  expect(state.activeId.value).toBe('last')

  state.selectMessage('middle')
  scroll(984)
  observer.resize()
  flushFrame()
  expect(state.activeId.value).toBe('middle')
  scroll(300)
  flushFrame()
  expect(state.activeId.value).toBe('first')
})

it('coalesces streamed layout changes without rebuilding observers or losing the reading position', async () => {
  const { state, scroll, positions, messageIds, observer } = await create()
  scroll(700)
  flushFrame()
  expect(state.activeId.value).toBe('middle')
  const observedTargets = observer.observe.mock.calls.length
  positions.set('middle', 800)
  positions.set('last', 1200)
  for (let index = 0; index < 300; index++) {
    observer.resize()
    scroll(700)
  }
  messageIds.value = [...messageIds.value]
  await nextTick()
  expect(frames.size).toBe(1)
  expect(observers).toHaveLength(1)
  expect(observer.observe).toHaveBeenCalledTimes(observedTargets)
  flushFrame()
  expect(state.activeId.value).toBe('first')
})

it('includes earlier Messages after pagination and releases removed row observations', async () => {
  const { state, content, renderRows, positions, observer } = await create()
  const previousFirst = content.value!.firstElementChild
  positions.set('earlier', 0)
  positions.set('first', 300)
  positions.set('middle', 620)
  positions.set('last', 1100)
  renderRows(['earlier', 'first', 'middle', 'last'])
  await nextTick()
  flushFrame()
  expect(state.activeId.value).toBe('earlier')
  expect(observer.unobserve).toHaveBeenCalledWith(previousFirst)
})

it('resets the active Message on Conversation changes and ignores the old row set', async () => {
  const { state, conversationId, renderRows, positions, scroll } = await create()
  scroll(300)
  flushFrame()
  expect(state.activeId.value).toBe('middle')
  state.selectMessage('middle')
  conversationId.value = 5
  positions.set('new-message', 0)
  renderRows(['new-message'])
  await nextTick()
  expect(state.activeId.value).toBeNull()
  flushFrame()
  expect(state.activeId.value).toBe('new-message')

  conversationId.value = undefined
  await nextTick()
  flushFrame()
  expect(state.activeId.value).toBeNull()
})

it('clears explicit selections when their row is removed or the content surface changes', async () => {
  const { state, panel, content, renderRows } = await create()
  state.selectMessage('middle')
  renderRows(['first', 'last'])
  await nextTick()
  flushFrame()
  expect(state.activeId.value).toBe('first')

  state.selectMessage('last')
  const replacement = document.createElement('div')
  replacement.append(...Array.from(content.value!.children))
  panel.value!.replaceChildren(replacement)
  content.value = replacement
  await nextTick()
  flushFrame()
  expect(state.activeId.value).toBe('first')
})

it('removes scroll listeners, observers and pending animation frames when unmounted', async () => {
  const { wrapper, panel, scroll, observer } = await create()
  const removeListener = vi.spyOn(panel.value!, 'removeEventListener')
  scroll(300)
  expect(frames.size).toBe(1)
  wrapper.unmount()
  expect(observer.disconnect).toHaveBeenCalledOnce()
  expect(removeListener).toHaveBeenCalledWith('scroll', expect.any(Function))
  expect(frames.size).toBe(0)
  scroll(400)
  observer.resize()
  expect(frames.size).toBe(0)
})
