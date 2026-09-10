import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { getProject, getProjects } from '@/api/project'
import { useProjectStore } from '@/stores/project'
import type { ApiResponse, PageResult, Project } from '@/types/domain'

vi.mock('@/api/project', () => ({ getProject: vi.fn(), getProjects: vi.fn() }))

function project(id: number, projectName = `Project ${id}`): Project {
  return {
    id,
    projectName,
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

function result<T>(data: T): ApiResponse<T> {
  return { status: 'success', code: 200, info: '', data }
}

function page(items: Project[]): ApiResponse<PageResult<Project>> {
  return result({ items, total: items.length, page: 1, size: 20 })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  vi.resetAllMocks()
  pinia = createPinia()
  setActivePinia(pinia)
  vi.mocked(getProject).mockImplementation(async (id) => result(project(Number(id))))
  vi.mocked(getProjects).mockResolvedValue(page([project(1), project(2)]))
})
afterEach(() => disposePinia(pinia))

it('retains a renamed Project when earlier list and detail requests finish', async () => {
  const store = useProjectStore()
  await store.loadProjects()
  await store.loadProject(1)
  const oldList = deferred<ApiResponse<PageResult<Project>>>()
  const oldDetail = deferred<ApiResponse<Project>>()
  vi.mocked(getProjects).mockReturnValueOnce(oldList.promise)
  vi.mocked(getProject).mockReturnValueOnce(oldDetail.promise)
  const loadingList = store.loadProjects()
  const loadingDetail = store.loadProject(1)

  store.updateProjectName(project(1, 'Renamed Project'))
  oldList.resolve(page([project(1), project(2)]))
  oldDetail.resolve(result(project(1)))
  await Promise.all([loadingList, loadingDetail])

  expect(store.currentProject?.projectName).toBe('Renamed Project')
  expect(store.visibleProjects.find((value) => value.id === 1)?.projectName).toBe('Renamed Project')
  expect(store.currentProject?.rootPath).toBe('/work/1')
})

it('keeps a deleted Project out of cached and visible rows after old responses arrive', async () => {
  const store = useProjectStore()
  await store.loadProjects()
  await store.loadProject(1)
  const oldList = deferred<ApiResponse<PageResult<Project>>>()
  const oldDetail = deferred<ApiResponse<Project>>()
  vi.mocked(getProjects).mockReturnValueOnce(oldList.promise)
  vi.mocked(getProject).mockReturnValueOnce(oldDetail.promise)
  const loadingList = store.loadProjects()
  const loadingDetail = store.loadProject(1)

  store.removeProject('1')
  expect(store.currentProject).toBeNull()
  oldList.resolve(page([project(1), project(2)]))
  oldDetail.resolve(result(project(1)))
  await Promise.all([loadingList, loadingDetail])
  store.upsertProject(project(1))

  expect(store.projects.map((value) => value.id)).toEqual([2])
  expect(store.visibleProjects.map((value) => value.id)).toEqual([2])
  expect(store.currentProject).toBeNull()
})

it('deletes another Project without clearing the current Project or double-counting removal', async () => {
  const store = useProjectStore()
  await store.loadProjects()
  await store.loadProject(1)
  store.removeProject(2)
  store.removeProject('2')

  expect(store.currentProject?.id).toBe(1)
  expect(store.projectCount).toBe(1)
  expect(store.visibleProjects.map((value) => value.id)).toEqual([1])
})

it('cancels activity metadata discovery when its Project is removed', async () => {
  const metadata = deferred<ApiResponse<Project>>()
  vi.mocked(getProject).mockReturnValueOnce(metadata.promise)
  const store = useProjectStore()
  store.promoteProject(99)
  const signal = vi.mocked(getProject).mock.calls[0]![1]!
  store.removeProject(99)
  expect(signal.aborted).toBe(true)
  metadata.resolve(result(project(99)))
  await metadata.promise
  await Promise.resolve()

  expect(store.projects).toEqual([])
  expect(store.visibleProjects).toEqual([])
})
