import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import ChatWorkspace from '@/components/conversation/ChatWorkspace.vue'
import { useConversationStore } from '@/stores/conversation'
import { useNavigationStore } from '@/stores/navigation'
import type { Conversation, Message } from '@/types/domain'

vi.mock('@/api/expert', () => ({
  getTurnExperts: vi.fn().mockResolvedValue({ data: [] }),
  getProjectExperts: vi.fn().mockResolvedValue({ data: { experts: [] } }),
}))

let pinia: ReturnType<typeof createPinia>
let wrapper: VueWrapper | undefined
const observers: ReadVisibilityObserver[] = []

class ReadVisibilityObserver {
  observe = vi.fn()
  disconnect = vi.fn()

  constructor(private callback: IntersectionObserverCallback) {
    observers.push(this)
  }

  show() {
    this.callback(
      [{ isIntersecting: true, time: 0 } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
}
const conversation: Conversation = {
  id: 4,
  projectId: 3,
  projectName: 'Project',
  deviceId: 1,
  workspaceId: 2,
  title: 'Conversation',
  status: 'ACTIVE',
  codexThreadId: 'thread',
}

beforeEach(() => {
  observers.length = 0
  vi.stubGlobal('IntersectionObserver', ReadVisibilityObserver)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  pinia = createPinia()
  setActivePinia(pinia)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  disposePinia(pinia)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function mountWorkspace() {
  wrapper = shallowMount(ChatWorkspace, {
    global: {
      plugins: [pinia],
      renderStubDefaultSlot: true,
      stubs: {
        WorkspaceWorkbenchLayout: { template: '<div><slot name="chat" /></div>' },
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  })
  return wrapper
}

it('announces Conversation initialization beside its title and clears it when the Thread is ready', async () => {
  const store = useConversationStore()
  store.currentConversation = { ...conversation, codexThreadId: '' }
  const view = mountWorkspace()
  const state = view.get('.conversation-title [role="status"]')

  expect(state.text()).toBe('Agent 正在初始化 Thread')
  expect(state.attributes('aria-live')).toBe('polite')
  expect(state.attributes('aria-atomic')).toBe('true')
  expect(view.findAll('.conversation-header [role="status"]')).toHaveLength(1)
  expect(view.get('.conversation-header__actions').text()).not.toContain('初始化')

  store.currentConversation = { ...conversation }
  await nextTick()
  expect(state.text()).toBe('进行中')
})

it('shows preparation, execution and approval changes in the same Conversation status area', async () => {
  const store = useConversationStore()
  store.currentConversation = { ...conversation }
  const view = mountWorkspace()

  for (const [status, preparationPhase, label] of [
    ['CREATED', null, '任务正在下发'],
    ['CREATED', 'EXPERT_SKILLS', '正在准备专家 Skills'],
    ['CREATED', 'ATTACHMENTS', '正在准备附件'],
    ['RUNNING', null, 'Agent 正在执行'],
    ['WAITING_APPROVAL', null, '等待审批'],
  ] as const) {
    store.currentTurn = { id: 7, conversationId: 4, status, preparationPhase }
    await nextTick()
    expect(view.get('.conversation-title [role="status"]').text()).toBe(label)
    expect(view.get('.conversation-header__actions').text()).not.toContain(label)
    expect(view.findAll('.conversation-header [role="status"]')).toHaveLength(1)
  }
})

it.each(['COMPLETED', 'FAILED', 'INTERRUPTED'])(
  'restores the Conversation status after the Turn becomes %s',
  async (status) => {
    const store = useConversationStore()
    store.currentConversation = { ...conversation }
    store.currentTurn = { id: 7, status: 'RUNNING' }
    const view = mountWorkspace()
    expect(view.get('.conversation-title [role="status"]').text()).toBe('Agent 正在执行')

    store.currentTurn = { id: 7, status }
    await nextTick()
    expect(view.get('.conversation-title [role="status"]').text()).toBe(
      status === 'FAILED' ? '回复失败' : '进行中',
    )
  },
)

it('shows a Turn startup failure beside the title and displays its reason', () => {
  const store = useConversationStore()
  store.currentConversation = { ...conversation }
  store.currentTurn = { id: 18, status: 'FAILED', preparationPhase: 'EXPERT_SKILLS' }
  store.turnError = 'Agent method failed: thread/resume: thread already has an active writer'
  const view = mountWorkspace()
  expect(view.get('.conversation-title [role="status"]').text()).toBe('回复失败')
  expect(view.get('[role="alert"]').text()).toContain('already has an active writer')
  expect(view.text()).not.toContain('正在准备专家 Skills')
})

it.each([
  ['FAILED', '失败'],
  ['COMPLETED', '已完成'],
])('preserves terminal Conversation status %s instead of stale Turn activity', (status, label) => {
  const store = useConversationStore()
  store.currentConversation = { ...conversation, status }
  store.currentTurn = { id: 7, status: 'RUNNING' }
  const view = mountWorkspace()
  expect(view.get('.conversation-title [role="status"]').text()).toBe(label)
})

function completedAnswer(turnId: number): Message {
  return {
    id: turnId * 10,
    turnId,
    sequenceNo: turnId,
    role: 'ASSISTANT',
    messageType: 'TEXT',
    content: `Reply for Turn ${turnId}`,
    status: 'COMPLETED',
  }
}

async function showConversation() {
  const view = mountWorkspace()
  await nextTick()
  observers.at(-1)!.show()
  await nextTick()
  return view
}

it('keeps a newer completion unread until that Turn has finished and its answer is displayed', async () => {
  const store = useConversationStore()
  const navigation = useNavigationStore()
  const markRead = vi.spyOn(navigation, 'markRead')
  store.currentConversation = { ...conversation }
  store.currentTurn = { id: 7, status: 'COMPLETED' }
  store.messages = [completedAnswer(7)]
  navigation.upsert({
    ...conversation,
    latestTurnId: 8,
    latestTurnStatus: 'COMPLETED',
    latestTurnHasIncompleteMessage: false,
  })
  await showConversation()
  expect(navigation.unreadKey(4)).not.toBeNull()
  expect(markRead).not.toHaveBeenCalled()

  store.currentTurn = { id: 8, status: 'RUNNING' }
  store.messages = [completedAnswer(7), { ...completedAnswer(8), status: 'STREAMING' }]
  await nextTick()
  expect(markRead).not.toHaveBeenCalled()

  store.currentTurn = { id: 8, status: 'COMPLETED' }
  store.messages = [completedAnswer(7)]
  await nextTick()
  expect(markRead).not.toHaveBeenCalled()
  store.messages = [completedAnswer(7), completedAnswer(8)]
  await nextTick()
  expect(markRead).toHaveBeenCalledExactlyOnceWith(4, 8)
  expect(navigation.unreadKey(4)).toBeNull()
})

it('does not use an old Turn error to acknowledge a newer Turn failure', async () => {
  const store = useConversationStore()
  const navigation = useNavigationStore()
  const markRead = vi.spyOn(navigation, 'markRead')
  store.currentConversation = { ...conversation }
  store.currentTurn = { id: 7, status: 'FAILED' }
  store.turnError = 'Earlier Turn failed'
  navigation.upsert({ ...conversation, latestTurnId: 8, latestTurnStatus: 'FAILED' })
  const view = await showConversation()
  expect(view.get('[role="alert"]').text()).toBe('Earlier Turn failed')
  expect(markRead).not.toHaveBeenCalled()
  expect(navigation.unreadKey(4)).not.toBeNull()

  store.currentTurn = { id: 8, status: 'FAILED' }
  store.turnError = 'Current Turn failed'
  await nextTick()
  expect(markRead).toHaveBeenCalledExactlyOnceWith(4, 8)
  expect(navigation.unreadKey(4)).toBeNull()
})

it('acknowledges initialization failure only when the displayed Conversation has no Turn', async () => {
  const store = useConversationStore()
  const navigation = useNavigationStore()
  const markRead = vi.spyOn(navigation, 'markRead')
  const failed = { ...conversation, status: 'FAILED', codexThreadId: '' }
  store.currentConversation = failed
  navigation.upsert(failed)
  await showConversation()
  expect(markRead).toHaveBeenCalledExactlyOnceWith(4, null)
  expect(navigation.unreadKey(4)).toBeNull()
})

it('acknowledges a read error for the displayed running Turn at the bottom', async () => {
  const store = useConversationStore()
  const navigation = useNavigationStore()
  const markRead = vi.spyOn(navigation, 'markRead')
  store.currentConversation = { ...conversation }
  store.currentTurn = { id: 8, status: 'RUNNING' }
  navigation.upsert({ ...conversation, latestTurnId: 8, latestTurnStatus: 'RUNNING' })
  navigation.markIssue(4, 'Unable to refresh Messages', 'message', 8)
  await showConversation()
  expect(markRead).toHaveBeenCalledExactlyOnceWith(4, 8)
  expect(store.currentTurn.status).toBe('RUNNING')
  expect(navigation.unreadKey(4)).toBeNull()
})

async function mountHistoryWorkspace() {
  // A real scrollable viewport avoids treating jsdom's zero-size layout as an empty page.
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1200)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400)
  const view = mountWorkspace()
  await flushPromises()
  return { view, panel: view.get<HTMLElement>('.message-panel') }
}

it('loads older Messages only when scrolling to the top and exposes no manual pagination button', async () => {
  const store = useConversationStore()
  store.currentConversation = { ...conversation }
  store.messages = [completedAnswer(7)]
  store.hasMoreMessages = true
  const loadOlder = vi.spyOn(store, 'loadOlderMessages').mockResolvedValue(false)
  const { view, panel } = await mountHistoryWorkspace()

  expect(loadOlder).not.toHaveBeenCalled()
  expect(
    view
      .findAll('button, app-button-stub')
      .some((button) => button.text().includes('加载更早消息')),
  ).toBe(false)
  expect(view.find('[aria-label="在导航中加载更早消息"]').exists()).toBe(false)
  panel.element.scrollTop = 300
  await panel.trigger('scroll')
  expect(loadOlder).not.toHaveBeenCalled()

  panel.element.scrollTop = 0
  await panel.trigger('scroll')
  await flushPromises()
  expect(loadOlder).toHaveBeenCalledTimes(1)
})

it('announces older Message loading and avoids requesting a second page while one is pending', async () => {
  const store = useConversationStore()
  store.currentConversation = { ...conversation }
  store.messages = [completedAnswer(7)]
  store.hasMoreMessages = true
  let finish!: (loaded: boolean) => void
  const loadOlder = vi.spyOn(store, 'loadOlderMessages').mockImplementation(() => {
    store.loadingOlder = true
    return new Promise<boolean>((resolve) => (finish = resolve))
  })
  const { panel } = await mountHistoryWorkspace()
  panel.element.scrollTop = 0
  await panel.trigger('scroll')

  expect(loadOlder).toHaveBeenCalledTimes(1)
  expect(panel.attributes('aria-busy')).toBe('true')
  expect(panel.get('[role="status"]').text()).toBe('正在加载更早消息…')
  panel.element.scrollTop = 200
  await panel.trigger('scroll')
  panel.element.scrollTop = 0
  await panel.trigger('scroll')
  expect(loadOlder).toHaveBeenCalledTimes(1)

  store.loadingOlder = false
  finish(false)
  await flushPromises()
  expect(panel.attributes('aria-busy')).toBe('false')
  expect(panel.find('[role="status"]').exists()).toBe(false)
})

it('shows history loading failure separately and retries after scrolling away from and back to the top', async () => {
  const store = useConversationStore()
  store.currentConversation = { ...conversation }
  store.messages = [completedAnswer(7)]
  store.hasMoreMessages = true
  const loadOlder = vi
    .spyOn(store, 'loadOlderMessages')
    .mockImplementationOnce(async () => {
      store.olderMessagesError = '历史消息加载失败'
      return false
    })
    .mockImplementationOnce(async () => {
      store.olderMessagesError = ''
      store.hasMoreMessages = false
      return false
    })
  const { panel } = await mountHistoryWorkspace()
  panel.element.scrollTop = 0
  await panel.trigger('scroll')
  await flushPromises()

  const error = panel.get('[role="alert"]')
  expect(error.text()).toContain('历史消息加载失败')
  expect(error.text()).toContain('滚动')
  expect(error.text()).toContain('重试')
  expect(store.messages).toHaveLength(1)
  expect(store.detailError).toBe('')
  await panel.trigger('scroll')
  expect(loadOlder).toHaveBeenCalledTimes(1)

  panel.element.scrollTop = 200
  await panel.trigger('scroll')
  panel.element.scrollTop = 0
  await panel.trigger('scroll')
  await flushPromises()
  expect(loadOlder).toHaveBeenCalledTimes(2)
  expect(panel.find('[role="alert"]').exists()).toBe(false)
})

it.each(['loading', 'loadingOlder', 'exhausted'] as const)(
  'does not request older Messages at the top while history is %s',
  async (state) => {
    const store = useConversationStore()
    store.currentConversation = { ...conversation }
    store.messages = [completedAnswer(7)]
    store.hasMoreMessages = state !== 'exhausted'
    store.loading = state === 'loading'
    store.loadingOlder = state === 'loadingOlder'
    const loadOlder = vi.spyOn(store, 'loadOlderMessages').mockResolvedValue(false)
    const { panel } = await mountHistoryWorkspace()
    panel.element.scrollTop = 0
    await panel.trigger('scroll')
    await flushPromises()
    expect(loadOlder).not.toHaveBeenCalled()
  },
)
