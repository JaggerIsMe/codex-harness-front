import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { getProject, getProjects } from '@/api/project'
import { useProjectStore } from '@/stores/project'
import type { ApiResponse, PageResult, Project } from '@/types/domain'
vi.mock('@/api/project', () => ({ getProjects: vi.fn(), getProject: vi.fn() }))
const project = (id: number, name = `Project ${id}`): Project => ({
  id,
  projectName: name,
  status: 'ACTIVE',
  provisioningStatus: 'READY',
  deviceId: 1,
  workspaceId: id,
  isolationMode: '',
  deviceCode: '',
  deviceName: '',
  deviceStatus: 'ONLINE',
  workspaceName: '',
  workspaceStatus: 'ENABLED',
  rootPath: '/work',
  conversationCount: 0,
  createdAt: '',
})
const response = (items: Project[], page = 1, total = 45): ApiResponse<PageResult<Project>> => ({
  status: 'success',
  code: 200,
  info: '',
  data: { items, page, size: 20, total },
})
const activeProject = (id: number, second: number): Project => ({
  ...project(id),
  createdAt: '2026-09-10T08:00:00',
  lastActivityAt: `2026-09-10T08:00:${String(second).padStart(2, '0')}`,
})
let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  vi.resetAllMocks()
  pinia = createPinia()
  setActivePinia(pinia)
})
afterEach(() => {
  disposePinia(pinia)
  vi.restoreAllMocks()
})

it('loads only requested pages, deduplicates and preserves later pages on refresh', async () => {
  vi.mocked(getProjects)
    .mockResolvedValueOnce(response([project(1), project(2)]))
    .mockResolvedValueOnce(response([project(2), project(3)], 2))
    .mockResolvedValueOnce(response([project(4), project(1)]))
  const store = useProjectStore()
  await store.loadProjects()
  expect(getProjects).toHaveBeenCalledTimes(1)
  await store.loadMore()
  expect(store.visibleProjects.map((p) => p.id)).toEqual([1, 2, 3])
  await store.loadProjects()
  expect(store.visibleProjects.map((p) => p.id)).toEqual([4, 1, 2, 3])
  expect(store.page).toBe(2)
  expect(store.hasMore).toBe(true)
  expect(store.projectCount).toBe(45)
})

it('does not advance a failed page or allow duplicate in-flight load-more requests', async () => {
  vi.mocked(getProjects).mockResolvedValueOnce(response([project(1)]))
  const store = useProjectStore()
  await store.loadProjects()
  let reject!: (cause: Error) => void
  vi.mocked(getProjects).mockReturnValueOnce(
    new Promise((_resolve, fail) => {
      reject = fail
    }),
  )
  const pending = store.loadMore()
  await store.loadMore()
  expect(getProjects).toHaveBeenCalledTimes(2)
  reject(new Error('offline'))
  await pending
  expect(store.page).toBe(1)
  expect(store.moreError).toBe('offline')
  vi.mocked(getProjects).mockResolvedValueOnce(response([project(2)], 2, 21))
  await store.loadMore()
  expect(getProjects).toHaveBeenLastCalledWith(expect.any(AbortSignal), {
    page: 2,
    size: 20,
    keyword: '',
  })
  expect(store.hasMore).toBe(false)
})

it('isolates server searches from old responses and keeps the open Project cached', async () => {
  const store = useProjectStore()
  vi.mocked(getProject).mockResolvedValue({
    status: 'success',
    code: 200,
    info: '',
    data: project(99),
  })
  await store.loadProject(99)
  let resolve!: (value: ApiResponse<PageResult<Project>>) => void
  vi.mocked(getProjects).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const old = store.setKeyword('old')
  vi.mocked(getProjects).mockResolvedValueOnce(response([project(2, 'new')], 1, 1))
  await store.setKeyword('new')
  resolve(response([project(1, 'old')]))
  await old
  expect(store.visibleProjects.map((p) => p.id)).toEqual([2])
  expect(store.currentProject?.id).toBe(99)
  expect(store.projects.map((p) => p.id)).toContain(99)
})

it('keeps a direct-link Project visible without consuming a page and cancels on reset', async () => {
  const store = useProjectStore()
  vi.mocked(getProjects).mockResolvedValueOnce(response([project(1)]))
  await store.loadProjects()
  store.upsertProject(project(99))
  expect(store.visibleProjects.map((p) => p.id)).toEqual([99, 1])
  expect(store.page).toBe(1)
  let resolve!: (value: ApiResponse<PageResult<Project>>) => void
  vi.mocked(getProjects).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const pending = store.loadMore()
  const signal = vi.mocked(getProjects).mock.calls.at(-1)![0]!
  store.reset()
  expect(signal.aborted).toBe(true)
  resolve(response([project(2)], 2))
  await pending
  expect(store.visibleProjects).toEqual([])
})

it('reorders loaded pages by Conversation activity and rejects older snapshots without losing pagination', async () => {
  vi.mocked(getProjects)
    .mockResolvedValueOnce(response([activeProject(1, 30), activeProject(2, 20)]))
    .mockResolvedValueOnce(response([activeProject(3, 10)], 2))
    .mockResolvedValueOnce(response([activeProject(1, 30), activeProject(3, 10)]))
    .mockResolvedValueOnce(response([activeProject(4, 5)], 3))
  const store = useProjectStore()
  await store.loadProjects()
  await store.loadMore()
  store.updateConversationActivity(3, activeProject(3, 40).lastActivityAt)
  expect(store.visibleProjects.map((p) => p.id)).toEqual([3, 1, 2])
  store.updateConversationActivity(3, activeProject(3, 5).lastActivityAt)
  await store.loadProjects()
  expect(store.visibleProjects.map((p) => p.id)).toEqual([3, 1, 2])
  expect(store.page).toBe(2)
  await store.loadMore()
  expect(store.visibleProjects.map((p) => p.id)).toEqual([3, 1, 2, 4])
  expect(getProjects).toHaveBeenLastCalledWith(expect.any(AbortSignal), {
    page: 3,
    size: 20,
    keyword: '',
  })
})

it('promotes a user-selected Project but lets later server activity move ahead without browser clock bias', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2100-01-01T00:00:00Z'))
  vi.mocked(getProjects).mockResolvedValueOnce(
    response([activeProject(1, 30), activeProject(2, 20)]),
  )
  const store = useProjectStore()
  await store.loadProjects()
  store.promoteProject(2)
  expect(store.visibleProjects.map((p) => p.id)).toEqual([2, 1])
  store.updateConversationActivity(1, activeProject(1, 30).lastActivityAt)
  store.upsertProject({ ...activeProject(1, 30), deviceStatus: 'OFFLINE' })
  expect(store.visibleProjects.map((p) => p.id)).toEqual([2, 1])
  store.updateConversationActivity(1, activeProject(1, 40).lastActivityAt)
  expect(store.visibleProjects.map((p) => p.id)).toEqual([1, 2])
})

it('does not re-promote the current Project when its metadata is refreshed', async () => {
  vi.mocked(getProjects).mockResolvedValueOnce(
    response([activeProject(1, 30), activeProject(2, 20)]),
  )
  vi.mocked(getProject).mockResolvedValue({
    status: 'success',
    code: 200,
    info: '',
    data: activeProject(2, 20),
  })
  const store = useProjectStore()
  await store.loadProjects()
  await store.loadProject(2)
  store.promoteProject(1)
  await store.loadProject(2)
  expect(store.visibleProjects.map((p) => p.id)).toEqual([1, 2])
  expect(store.currentProject?.id).toBe(2)
})

it('keeps a promotion made while an earlier project list is in flight', async () => {
  vi.mocked(getProjects).mockResolvedValueOnce(
    response([activeProject(1, 30), activeProject(2, 20)]),
  )
  const store = useProjectStore()
  await store.loadProjects()
  let resolve!: (value: ApiResponse<PageResult<Project>>) => void
  vi.mocked(getProjects).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const loading = store.loadProjects()
  store.promoteProject(2)
  resolve(response([activeProject(3, 40), activeProject(1, 30)]))
  await loading
  expect(store.visibleProjects.map((p) => p.id)).toEqual([2, 3, 1])
})

it('keeps off-search activity outside search results while retaining its order after search is cleared', async () => {
  vi.mocked(getProjects)
    .mockResolvedValueOnce(response([activeProject(1, 30), activeProject(2, 20)]))
    .mockResolvedValueOnce(response([activeProject(1, 30)], 1, 1))
    .mockResolvedValueOnce(response([activeProject(1, 30), activeProject(2, 20)]))
  const store = useProjectStore()
  await store.loadProjects()
  await store.setKeyword('Project 1')
  store.updateConversationActivity(2, activeProject(2, 40).lastActivityAt)
  store.promoteProject(2)
  expect(store.visibleProjects.map((p) => p.id)).toEqual([1])
  await store.setKeyword('')
  expect(store.visibleProjects.map((p) => p.id)).toEqual([2, 1])
})

it('cancels metadata discovery for an active unloaded Project on reset', async () => {
  let resolve!: (value: ApiResponse<Project>) => void
  vi.mocked(getProject).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const store = useProjectStore()
  store.promoteProject(99)
  store.promoteProject(99)
  expect(getProject).toHaveBeenCalledTimes(1)
  const signal = vi.mocked(getProject).mock.calls[0]![1]!
  store.reset()
  expect(signal.aborted).toBe(true)
  resolve({ status: 'success', code: 200, info: '', data: activeProject(99, 50) })
  await Promise.resolve()
  expect(store.visibleProjects).toEqual([])
  expect(store.currentProject).toBeNull()
})
