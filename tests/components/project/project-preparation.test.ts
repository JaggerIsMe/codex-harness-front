import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import ConversationList from '@/views/conversation/ConversationList.vue'
import WorkspaceNavigation from '@/components/navigation/WorkspaceNavigation.vue'
import { useProjectStore } from '@/stores/project'
import { getProject, getProjects } from '@/api/project'
import { getConversations } from '@/api/conversation'
import type { ApiResponse, Project } from '@/types/domain'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { projectId: '9' }, query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/api/project', () => ({
  getProject: vi.fn(),
  getProjects: vi.fn(),
  retryProjectPreparation: vi.fn(),
}))
vi.mock('@/api/conversation', () => ({ getConversations: vi.fn() }))
vi.mock('@/stores/agent', () => ({ useAgentStore: vi.fn() }))
vi.mock('@/stores/conversation', () => ({
  useConversationStore: () => ({
    currentConversation: null,
    activateProject: vi.fn(),
    loadConversations: vi.fn(),
    clearCurrent: vi.fn(),
    startListening: vi.fn(),
    stopListening: vi.fn(),
  }),
}))
vi.mock('@/components/conversation/ChatWorkspace.vue', () => ({
  default: { template: '<section aria-label="会话工作区">会话工作区</section>' },
}))
vi.mock('@/components/conversation/CreateConversationDialog.vue', () => ({
  default: { template: '<div />' },
}))
vi.mock('@/components/project/ProjectActions.vue', () => ({
  default: { template: '<span />' },
}))
vi.mock('@/components/conversation/ConversationActions.vue', () => ({
  default: { template: '<span />' },
}))

const preparing: Project = {
  id: 9,
  projectName: '新建 Project',
  status: 'ACTIVE',
  provisioningStatus: 'PREPARING',
  isolationMode: 'WINDOWS_PROJECT_PROFILE',
  deviceId: 1,
  deviceCode: 'device-1',
  deviceName: '机器 1',
  deviceStatus: 'ONLINE',
  workspaceId: 19,
  workspaceName: 'Workspace',
  rootPath: '',
  workspaceStatus: 'CREATING',
  conversationCount: 0,
  createdAt: '',
}
const ready: Project = {
  ...preparing,
  provisioningStatus: 'READY',
  workspaceStatus: 'ENABLED',
  rootPath: 'D:/projects/u2-unique',
}
const result = <T>(data: T): ApiResponse<T> => ({
  status: 'success',
  code: 200,
  info: '',
  data,
})
let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  setActivePinia(createPinia())
  vi.mocked(getConversations).mockResolvedValue(result([]))
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
})

function mountWorkspace() {
  wrapper = mount(
    defineComponent({
      components: { ConversationList, WorkspaceNavigation },
      template: '<WorkspaceNavigation /><ConversationList />',
    }),
    { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } },
  )
  return wrapper
}

it('clears the new Project directory preparation hint when the first detail fetch is READY', async () => {
  useProjectStore().upsertProject(preparing)
  vi.mocked(getProject).mockResolvedValue(result(ready))
  const workspace = mountWorkspace()

  expect(workspace.text()).toContain('目录准备中…')
  await flushPromises()
  await vi.advanceTimersByTimeAsync(5000)

  expect(workspace.find('[aria-label="会话工作区"]').exists()).toBe(true)
  expect(workspace.text()).not.toContain('目录准备中…')
  expect(
    workspace.get('[aria-label="在 新建 Project 新建会话"]').attributes('disabled'),
  ).toBeUndefined()
  expect(getConversations).toHaveBeenCalledWith(9, expect.any(AbortSignal), {
    page: 1,
    size: 10,
    keyword: '',
  })
})

it('keeps the Project ready when an older pending list response arrives after the detail fetch', async () => {
  const store = useProjectStore()
  store.upsertProject(preparing)
  let resolveList!: (value: ApiResponse<Project[]>) => void
  vi.mocked(getProjects).mockReturnValue(new Promise((resolve) => (resolveList = resolve)))
  const loading = store.loadProjects()
  vi.mocked(getProject).mockResolvedValue(result(ready))
  const workspace = mountWorkspace()
  await flushPromises()

  resolveList(result([preparing]))
  await loading
  await flushPromises()

  expect(workspace.find('[aria-label="会话工作区"]').exists()).toBe(true)
  expect(workspace.text()).not.toContain('目录准备中…')
  expect(store.projects[0]?.provisioningStatus).toBe('READY')
})

it('updates the Project navigation when preparation finishes during polling', async () => {
  useProjectStore().upsertProject(preparing)
  vi.mocked(getProject).mockResolvedValueOnce(result(preparing)).mockResolvedValue(result(ready))
  const workspace = mountWorkspace()
  await flushPromises()
  expect(workspace.text()).toContain('目录准备中…')

  await vi.advanceTimersByTimeAsync(2500)
  await flushPromises()

  expect(workspace.find('[aria-label="会话工作区"]').exists()).toBe(true)
  expect(workspace.text()).not.toContain('目录准备中…')
  expect(
    workspace.get('[aria-label="在 新建 Project 新建会话"]').attributes('disabled'),
  ).toBeUndefined()
  await vi.advanceTimersByTimeAsync(5000)
  expect(getProject).toHaveBeenCalledTimes(2)
})
