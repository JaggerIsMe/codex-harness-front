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
let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  vi.resetAllMocks()
  pinia = createPinia()
  setActivePinia(pinia)
})
afterEach(() => disposePinia(pinia))

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
