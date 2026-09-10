import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import WorkspaceNavigation from '@/components/navigation/WorkspaceNavigation.vue'
import type { Conversation, Project } from '@/types/domain'

type Activity = { state: 'idle' | 'running' | 'completed' | 'error'; label: string }
const activities = reactive<Record<string, Activity>>({})
const projects = reactive({
  projects: [] as Project[],
  get visibleProjects(): Project[] {
    return this.projects
  },
  keyword: '',
  hasMore: false,
  loadingMore: false,
  moreError: '',
  setKeyword: vi.fn(),
  loadMore: vi.fn(),
  loading: false,
  error: '',
  loadProjects: vi.fn(),
})
const current = reactive({ currentConversation: null as Conversation | null })
const navigation = reactive({
  conversations: {} as Record<string, Conversation[]>,
  loading: {} as Record<string, boolean>,
  errors: {} as Record<string, string>,
  errorsMore: {} as Record<string, string>,
  loadingMore: {} as Record<string, boolean>,
  hasMore: vi.fn().mockReturnValue(false),
  loadMore: vi.fn(),
  setKeyword: vi.fn(),
  expanded: {} as Record<string, boolean>,
  load: vi.fn(),
  upsert: vi.fn(),
  activity: (conversation: Conversation): Activity =>
    activities[conversation.id] || { state: 'idle', label: '未开始' },
})

vi.mock('@/stores/project', () => ({ useProjectStore: () => projects }))
vi.mock('@/stores/conversation', () => ({ useConversationStore: () => current }))
vi.mock('@/stores/navigation', () => ({ useNavigationStore: () => navigation }))
vi.mock('@/components/project/ProjectActions.vue', () => ({
  default: { template: '<span />' },
}))
vi.mock('@/components/conversation/ConversationActions.vue', () => ({
  default: { template: '<span />' },
}))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { projectId: '3' }, query: {} }) }))

const conversation: Conversation = {
  id: 4,
  projectId: 3,
  projectName: 'Project',
  deviceId: 1,
  workspaceId: 2,
  title: 'Conversation with a long title',
  status: 'ACTIVE',
  codexThreadId: 'thread',
}
const project: Project = {
  id: 3,
  projectName: 'Project',
  provisioningStatus: 'READY',
  status: 'ACTIVE',
  isolationMode: 'WORKSPACE',
  deviceId: 1,
  deviceCode: 'device',
  deviceName: 'Device',
  deviceStatus: 'ONLINE',
  workspaceId: 2,
  workspaceName: 'Workspace',
  workspaceStatus: 'ACTIVE',
  rootPath: '/workspace',
  conversationCount: 1,
  createdAt: '',
}
let wrapper: VueWrapper | undefined

beforeEach(() => {
  for (const id of Object.keys(activities)) delete activities[id]
  projects.projects = [{ ...project }]
  navigation.conversations = { 3: [{ ...conversation }] }
  navigation.loading = {}
  navigation.errors = {}
  navigation.expanded = {}
  current.currentConversation = null
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

function render() {
  wrapper = mount(WorkspaceNavigation, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
  return wrapper
}

it.each<Activity>([
  { state: 'idle', label: '未开始' },
  { state: 'running', label: 'Codex 正在执行' },
  { state: 'completed', label: 'Turn 已完成' },
  { state: 'error', label: 'Turn 失败' },
])(
  'shows $state while preserving the Conversation link name and describing its activity',
  (activity) => {
    activities[4] = activity
    const view = render()
    const row = view.get('.workspace-conversation-row')
    const link = row.get('a.workspace-conversation')
    const indicator = row.find('.workspace-conversation__activity')
    const description = link.get('.sr-only')

    expect(link.attributes('aria-label')).toBe(conversation.title)
    expect(link.attributes('title')).toBe(`${conversation.title} · ${activity.label}`)
    expect(link.attributes('aria-describedby')).toBe(description.attributes('id'))
    expect(description.text()).toBe(activity.label)
    expect(indicator.exists()).toBe(activity.state !== 'idle')
    if (activity.state === 'idle') return
    expect(indicator.attributes('data-state')).toBe(activity.state)
    expect(indicator.find('.workspace-conversation__spinner').exists()).toBe(
      activity.state === 'running',
    )
    expect(indicator.find('.workspace-conversation__dot').exists()).toBe(
      activity.state === 'completed' || activity.state === 'error',
    )
    for (const mark of indicator.findAll('svg, .workspace-conversation__dot'))
      expect(mark.attributes('aria-hidden')).toBe('true')
  },
)

it('updates activity in place without replacing the Conversation link or title', async () => {
  activities[4] = { state: 'running', label: '正在准备专家 Skills' }
  const view = render()
  const row = view.get('.workspace-conversation-row')
  const link = row.get('a.workspace-conversation')
  const element = link.element
  const descriptionId = link.attributes('aria-describedby')

  for (const activity of [
    { state: 'completed', label: 'Turn 已完成' },
    { state: 'error', label: 'Device 离线' },
    { state: 'idle', label: '未开始' },
    { state: 'running', label: 'Codex 正在执行' },
  ] satisfies Activity[]) {
    activities[4] = activity
    await nextTick()
    expect(view.get('a.workspace-conversation').element).toBe(element)
    expect(link.get('.workspace-conversation__title').text()).toBe(conversation.title)
    const indicator = row.find('.workspace-conversation__activity')
    expect(indicator.exists()).toBe(activity.state !== 'idle')
    if (activity.state !== 'idle') expect(indicator.attributes('data-state')).toBe(activity.state)
    expect(link.get('.sr-only').text()).toBe(activity.label)
    expect(link.get('.sr-only').attributes('id')).toBe(descriptionId)
    expect(link.attributes('aria-describedby')).toBe(descriptionId)
  }
})

it('describes each Conversation separately and preserves the fallback link name', () => {
  navigation.conversations[3]!.push({ ...conversation, id: 5, title: '' })
  activities[4] = { state: 'running', label: '正在执行' }
  activities[5] = { state: 'completed', label: '已完成' }
  const rows = render().findAll('.workspace-conversation-row')
  const links = rows.map((row) => row.get('a.workspace-conversation'))

  expect(links[1]!.attributes('aria-label')).toBe('会话 #5')
  expect(links[0]!.attributes('aria-describedby')).not.toBe(
    links[1]!.attributes('aria-describedby'),
  )
  expect(links[0]!.get('.sr-only').text()).toBe('正在执行')
  expect(links[1]!.get('.sr-only').text()).toBe('已完成')
})
