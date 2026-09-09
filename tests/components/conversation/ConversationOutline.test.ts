import { afterEach, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ConversationOutline from '@/components/conversation/ConversationOutline.vue'
import type { DisplayMessage } from '@/types/domain'

const messages: DisplayMessage[] = [
  {
    id: 'user-1',
    turnId: 1,
    sequenceNo: 1,
    role: 'USER',
    messageType: 'TEXT',
    content: '# 第一条任务\n**检查** [这个页面](https://example.com)',
  },
  {
    id: 'assistant-1',
    turnId: 1,
    role: 'ASSISTANT',
    content: '',
    processItems: [
      { key: 'command', messageType: 'COMMAND', content: '{"command":"ls"}', streaming: false },
    ],
    sequenceStart: 2,
    sequenceEnd: 2,
    streaming: true,
    responseItemId: null,
  },
  {
    id: 'user-3',
    turnId: 2,
    sequenceNo: 3,
    role: 'USER',
    messageType: 'TEXT',
    content: '<script>alert(1)</script>第二条任务',
  },
]
let wrapper: VueWrapper | undefined
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})

function mountOutline() {
  wrapper = mount(ConversationOutline, {
    attachTo: document.body,
    props: { messages, activeId: 'assistant-1' },
  })
  return wrapper
}

it('previews the request and reply together and navigates to the Turn start', async () => {
  const view = mountOutline()
  const items = view.findAll('.conversation-outline__item')
  expect(items).toHaveLength(2)
  await items[0]!.trigger('mouseenter')
  expect(view.get('[role="tooltip"]').text()).toContain('第一条任务 检查 这个页面')
  expect(view.emitted('navigate')).toBeUndefined()
  await items[0]!.trigger('click')
  expect(view.emitted('navigate')).toEqual([['user-1']])
  expect(view.get('[role="tooltip"]').text()).toContain('包含 1 项执行过程')
  expect(view.get('[role="tooltip"]').text()).toContain('正在回复')
  await items[1]!.trigger('mouseenter')
  expect(view.get('[role="tooltip"]').find('script').exists()).toBe(false)
  await view.get('nav').trigger('mouseleave')
  expect(view.find('[role="tooltip"]').exists()).toBe(false)
})

it('supports a single tab stop, keyboard previews, Escape and current reading position', async () => {
  const view = mountOutline()
  const items = view.findAll<HTMLButtonElement>('.conversation-outline__item')
  expect(items.map((item) => item.attributes('tabindex'))).toEqual(['0', '-1'])
  expect(items[0]!.attributes('aria-current')).toBe('location')
  await view.setProps({ activeId: 'user-1' })
  expect(items[0]!.attributes('aria-current')).toBe('location')
  items[0]!.element.focus()
  await nextTick()
  await items[0]!.trigger('keydown', { key: 'ArrowDown' })
  expect(document.activeElement).toBe(items[1]!.element)
  expect(view.get('[role="tooltip"]').text()).toContain('第二条任务')
  expect(view.emitted('navigate')).toBeUndefined()
  await items[1]!.trigger('keydown', { key: 'Home' })
  expect(document.activeElement).toBe(items[0]!.element)
  await items[0]!.trigger('keydown', { key: 'End' })
  expect(document.activeElement).toBe(items[1]!.element)
  // Layout scrolling changes the element under a stationary pointer.
  await items[0]!.trigger('mouseenter')
  vi.spyOn(items[1]!.element, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 182.5, 52, 18),
  )
  vi.spyOn(
    view.get('.conversation-outline__track').element,
    'getBoundingClientRect',
  ).mockReturnValue(new DOMRect(0, 0, 52, 200))
  await view.get('.conversation-outline__track').trigger('scroll')
  expect(view.get('[role="tooltip"]').text()).toContain('第二条任务')
  await items[1]!.trigger('keydown', { key: 'Escape' })
  expect(view.find('[role="tooltip"]').exists()).toBe(false)
  await view.setProps({ activeId: 'user-3' })
  expect(items[1]!.attributes('aria-current')).toBe('location')
})

it('updates a live preview and exposes older history without adding fake message segments', async () => {
  const view = mountOutline()
  await view.setProps({ hasMore: true })
  await view.get('[aria-label="在导航中加载更早消息"]').trigger('click')
  expect(view.emitted('loadOlder')).toHaveLength(1)
  await view.findAll('.conversation-outline__item')[0]!.trigger('mouseenter')
  await view.setProps({
    messages: messages.map((message) =>
      message.id === 'assistant-1'
        ? { ...message, content: '回复已更新', streaming: false }
        : message,
    ),
  })
  expect(view.get('[role="tooltip"]').text()).toContain('回复已更新')
  expect(view.get('[role="tooltip"]').text()).not.toContain('正在回复')
  expect(view.findAll('.conversation-outline__item')).toHaveLength(2)
  await view.setProps({ messages: [] })
  expect(view.find('nav').exists()).toBe(false)
})
