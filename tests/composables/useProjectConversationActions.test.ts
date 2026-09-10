import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as projectApi from '@/api/project'
import * as conversationApi from '@/api/conversation'
import { useProjectConversationActions } from '@/composables/useProjectConversationActions'
import { useProjectStore } from '@/stores/project'
import { useConversationStore } from '@/stores/conversation'
import { useNavigationStore } from '@/stores/navigation'
import { useWorkspaceFileStore } from '@/stores/workspace-file'
import type { ApiResponse, Conversation, Project } from '@/types/domain'

vi.mock('@/api/project', () => ({
  getProjects: vi.fn(),
  getProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}))
vi.mock('@/api/conversation', () => ({
  getConversations: vi.fn(),
  getConversationStatuses: vi.fn(),
  getConversation: vi.fn(),
  getActiveTurn: vi.fn(),
  getConversationMessageState: vi.fn(),
  getConversationApprovals: vi.fn(),
  updateConversation: vi.fn(),
  deleteConversation: vi.fn(),
  interruptTurn: vi.fn(),
  resolveApproval: vi.fn(),
  startTurn: vi.fn(),
}))

function project(id = 3): Project {
  return {
    id,
    projectName: `Project ${id}`,
    status: 'ACTIVE',
    provisioningStatus: 'READY',
    deviceId: 1,
    workspaceId: id,
    isolationMode: '',
    deviceCode: 'device',
    deviceName: 'Device',
    deviceStatus: 'ONLINE',
    workspaceName: `Workspace ${id}`,
    workspaceStatus: 'ENABLED',
    rootPath: `/work/${id}`,
    conversationCount: 2,
    createdAt: '',
  }
}
function conversation(id = 4, projectId = 3): Conversation {
  return {
    id,
    projectId,
    projectName: `Project ${projectId}`,
    deviceId: 1,
    workspaceId: projectId,
    title: `Conversation ${id}`,
    status: 'ACTIVE',
    codexThreadId: `thread-${id}`,
  }
}
function result<T>(data: T): ApiResponse<T> {
  return { status: 'success', code: 200, info: '', data }
}
let pinia: ReturnType<typeof createPinia>
const wrappers: ReturnType<typeof mount>[] = []
beforeEach(() => {
  vi.resetAllMocks()
  pinia = createPinia()
  setActivePinia(pinia)
  vi.mocked(projectApi.getProjects).mockResolvedValue(
    result({ items: [], page: 1, size: 20, total: 0 }),
  )
  vi.mocked(conversationApi.getConversations).mockResolvedValue(
    result({ items: [], page: 1, size: 10, total: 0 }),
  )
  vi.mocked(conversationApi.getConversationStatuses).mockResolvedValue(result([]))
  vi.mocked(projectApi.getProject).mockImplementation(async (id) => result(project(Number(id))))
  vi.mocked(conversationApi.getConversation).mockResolvedValue(result(conversation()))
  vi.mocked(conversationApi.getConversationMessageState).mockResolvedValue(
    result({
      messages: [],
      turnId: null,
      cursor: 0,
      hasMore: false,
      degraded: false,
      resetRequired: false,
      updates: [],
    }),
  )
  vi.mocked(conversationApi.getConversationApprovals).mockResolvedValue(result([]))
  vi.mocked(conversationApi.getActiveTurn).mockResolvedValue(result(null))
  vi.mocked(projectApi.deleteProject).mockResolvedValue(result(null))
  vi.mocked(conversationApi.deleteConversation).mockResolvedValue(result(null))
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  disposePinia(pinia)
})

async function create() {
  const empty = defineComponent({ render: () => h('div') })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'projects', path: '/projects', component: empty },
      { name: 'project-detail', path: '/projects/:projectId', component: empty },
    ],
  })
  await router.push({
    name: 'project-detail',
    params: { projectId: '3' },
    query: { id: '4', tab: 'files' },
  })
  let actions!: ReturnType<typeof useProjectConversationActions>
  wrappers.push(
    mount(
      defineComponent({
        setup() {
          actions = useProjectConversationActions()
          return () => h('div')
        },
      }),
      { global: { plugins: [pinia, router] } },
    ),
  )
  const projects = useProjectStore()
  const conversations = useConversationStore()
  const navigation = useNavigationStore()
  const files = useWorkspaceFileStore()
  projects.upsertProject(project(8))
  await projects.loadProject(3)
  await conversations.openConversation(3, 4)
  conversations.upsertConversation(conversation(5))
  navigation.upsert(conversation(5))
  navigation.upsert(conversation(9, 8))
  files.directory(3, '')
  files.directory(8, '')
  files.toggle(3, 'src')
  files.toggle(8, 'docs')
  return { actions, router, projects, conversations, navigation, files }
}

it('propagates authoritative renamed names across the Project, Conversation and navigation stores', async () => {
  const { actions, projects, conversations, navigation } = await create()
  vi.mocked(projectApi.updateProject).mockResolvedValueOnce(
    result({ ...project(), projectName: 'Updated Project' }),
  )
  await actions.renameProject(project(), ' Updated Project ')
  expect(projectApi.updateProject).toHaveBeenCalledWith(3, { projectName: 'Updated Project' })
  expect(projects.currentProject?.projectName).toBe('Updated Project')
  expect(conversations.currentConversation?.projectName).toBe('Updated Project')
  expect(
    navigation.conversations[3]?.every((value) => value.projectName === 'Updated Project'),
  ).toBe(true)

  vi.mocked(conversationApi.updateConversation).mockResolvedValueOnce(
    result({ ...conversation(), title: 'Updated Conversation', projectName: 'Updated Project' }),
  )
  await actions.renameConversation(conversation(), ' Updated Conversation ')
  expect(conversationApi.updateConversation).toHaveBeenCalledWith(3, 4, {
    title: 'Updated Conversation',
  })
  expect(conversations.currentConversation?.title).toBe('Updated Conversation')
  expect(navigation.conversations[3]?.find((value) => value.id === 4)?.title).toBe(
    'Updated Conversation',
  )
})

it('deletes the current Conversation across stores and returns to its Project while preserving unrelated query state', async () => {
  const { actions, router, projects, conversations, navigation, files } = await create()
  await actions.removeConversation(conversation())

  expect(conversationApi.deleteConversation).toHaveBeenCalledWith(3, 4)
  expect(conversations.currentConversation).toBeNull()
  expect(conversations.conversations.map((value) => value.id)).toEqual([5])
  expect(navigation.conversations[3]?.map((value) => value.id)).toEqual([5])
  expect(projects.currentProject?.conversationCount).toBe(1)
  expect(router.currentRoute.value.name).toBe('project-detail')
  expect(router.currentRoute.value.params.projectId).toBe('3')
  expect(router.currentRoute.value.query).toEqual({ tab: 'files' })
  expect(files.projects[3]).toBeDefined()
})

it('deletes another Conversation without navigating away or clearing the current Conversation', async () => {
  const { actions, router, conversations, navigation } = await create()
  const location = router.currentRoute.value.fullPath
  await actions.removeConversation(conversation(5))

  expect(router.currentRoute.value.fullPath).toBe(location)
  expect(conversations.currentConversation?.id).toBe(4)
  expect(navigation.conversations[3]?.map((value) => value.id)).toEqual([4])
})

it('deletes the active Project, clears its Workspace cache and returns to the Project list', async () => {
  const { actions, router, projects, conversations, navigation, files } = await create()
  await actions.removeProject(project())

  expect(projectApi.deleteProject).toHaveBeenCalledWith(3)
  expect(projects.currentProject).toBeNull()
  expect(projects.projects.map((value) => value.id)).toEqual([8])
  expect(conversations.currentConversation).toBeNull()
  expect(navigation.conversations[3]).toBeUndefined()
  expect(files.projects[3]).toBeUndefined()
  expect(files.expanded[3]).toBeUndefined()
  expect(files.projects[8]).toBeDefined()
  expect(files.expanded[8]).toEqual(['docs'])
  expect(router.currentRoute.value.name).toBe('projects')
})

it('deletes another Project while retaining the current route and Workspace cache', async () => {
  const { actions, router, projects, conversations, files } = await create()
  const location = router.currentRoute.value.fullPath
  await actions.removeProject(project(8))

  expect(router.currentRoute.value.fullPath).toBe(location)
  expect(projects.currentProject?.id).toBe(3)
  expect(conversations.currentConversation?.id).toBe(4)
  expect(files.projects[3]).toBeDefined()
  expect(files.projects[8]).toBeUndefined()
})

it.each([21, 22])(
  'refills the first Project page after deletion and retains every remaining row from %i Projects',
  async (total) => {
    const { actions, projects } = await create()
    let rows = Array.from({ length: total }, (_, index) => project(index + 1))
    vi.mocked(projectApi.getProjects).mockImplementation(async (_signal, query = {}) => {
      const page = query.page || 1
      const size = query.size || 20
      return result({
        items: rows.slice((page - 1) * size, page * size),
        page,
        size,
        total: rows.length,
      })
    })
    vi.mocked(projectApi.deleteProject).mockImplementation(async (id) => {
      rows = rows.filter((value) => String(value.id) !== String(id))
      return result(null)
    })
    await projects.loadProjects()
    expect(projects.visibleProjects).toHaveLength(20)

    await actions.removeProject(project(1))
    await flushPromises()
    expect(projectApi.getProjects).toHaveBeenCalledTimes(2)
    expect(projectApi.getProjects).toHaveBeenLastCalledWith(expect.any(AbortSignal), {
      page: 1,
      size: 20,
      keyword: '',
    })
    await projects.loadMore()

    expect(projects.visibleProjects.map((value) => Number(value.id)).sort((a, b) => a - b)).toEqual(
      rows.map((value) => value.id),
    )
    expect(projects.hasMore).toBe(false)
  },
)

it.each([11, 12])(
  'refills the first Conversation page after deletion and retains every remaining row from %i Conversations',
  async (total) => {
    const { actions, navigation } = await create()
    let rows = Array.from({ length: total }, (_, index) => conversation(index + 1))
    vi.mocked(conversationApi.getConversations).mockImplementation(
      async (_projectId, _signal, query = {}) => {
        const page = query.page || 1
        const size = query.size || 10
        return result({
          items: rows.slice((page - 1) * size, page * size),
          page,
          size,
          total: rows.length,
        })
      },
    )
    vi.mocked(conversationApi.deleteConversation).mockImplementation(async (_projectId, id) => {
      rows = rows.filter((value) => String(value.id) !== String(id))
      return result(null)
    })
    await navigation.load(3)
    expect(navigation.conversations[3]).toHaveLength(10)

    await actions.removeConversation(conversation(1))
    await flushPromises()
    expect(conversationApi.getConversations).toHaveBeenCalledTimes(2)
    expect(conversationApi.getConversations).toHaveBeenLastCalledWith(3, expect.any(AbortSignal), {
      page: 1,
      size: 10,
      keyword: '',
    })
    await navigation.loadMore(3)

    expect(
      navigation.conversations[3]?.map((value) => Number(value.id)).sort((a, b) => a - b),
    ).toEqual(rows.map((value) => value.id))
    expect(navigation.hasMore(3)).toBe(false)
  },
)

it.each(['renameProject', 'removeProject', 'renameConversation', 'removeConversation'] as const)(
  'keeps state and route unchanged when %s fails',
  async (operation) => {
    const { actions, router, projects, conversations, navigation, files } = await create()
    const failure = new Error('Operation rejected')
    vi.mocked(projectApi.updateProject).mockRejectedValue(failure)
    vi.mocked(projectApi.deleteProject).mockRejectedValue(failure)
    vi.mocked(conversationApi.updateConversation).mockRejectedValue(failure)
    vi.mocked(conversationApi.deleteConversation).mockRejectedValue(failure)
    const location = router.currentRoute.value.fullPath
    const run = {
      renameProject: () => actions.renameProject(project(), 'Changed'),
      removeProject: () => actions.removeProject(project()),
      renameConversation: () => actions.renameConversation(conversation(), 'Changed'),
      removeConversation: () => actions.removeConversation(conversation()),
    }[operation]
    await expect(run()).rejects.toThrow('Operation rejected')

    expect(projects.currentProject).toMatchObject({
      id: 3,
      projectName: 'Project 3',
      conversationCount: 2,
    })
    expect(conversations.currentConversation).toMatchObject({ id: 4, title: 'Conversation 4' })
    expect(navigation.conversations[3]).toHaveLength(2)
    expect(files.projects[3]).toBeDefined()
    expect(router.currentRoute.value.fullPath).toBe(location)
  },
)
