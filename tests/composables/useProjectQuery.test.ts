import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { effectScope } from 'vue'
import { getProjects } from '@/api/project'
import { useProjectQuery } from '@/composables/useProjectQuery'
import { useProjectStore } from '@/stores/project'
import type { ApiResponse, PageResult, Project } from '@/types/domain'
vi.mock('@/api/project', () => ({ getProjects: vi.fn() }))
const scopes: ReturnType<typeof effectScope>[] = []
let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  disposePinia(pinia)
  vi.resetAllMocks()
})
function create() {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(useProjectQuery)!
}
function response(ids: number[], page = 1, total = 25): ApiResponse<PageResult<Project>> {
  return {
    status: 'success',
    code: 200,
    info: '',
    data: {
      items: ids.map((id) => ({ id, projectName: `Project ${id}` }) as Project),
      page,
      size: 20,
      total,
    },
  }
}
it('keeps picker searches independent and retries the failed page without skipping it', async () => {
  const a = create(),
    b = create()
  vi.mocked(getProjects)
    .mockResolvedValueOnce(response([1]))
    .mockResolvedValueOnce(response([3]))
  await a.search('alpha')
  await b.search('beta')
  vi.mocked(getProjects).mockRejectedValueOnce(new Error('offline'))
  await a.loadMore()
  expect(a.page.value).toBe(1)
  expect(a.error.value).toBe('offline')
  vi.mocked(getProjects).mockResolvedValueOnce(response([2], 2))
  await a.retry()
  expect(getProjects).toHaveBeenLastCalledWith(expect.any(AbortSignal), {
    page: 2,
    size: 20,
    keyword: 'alpha',
  })
  expect(a.items.value.map((item) => item.id)).toEqual([1, 2])
  expect(b.items.value.map((item) => item.id)).toEqual([3])
})
it('refreshes metadata without dropping loaded pages and retries failed first-page refreshes', async () => {
  const query = create()
  vi.mocked(getProjects)
    .mockResolvedValueOnce(response([1]))
    .mockResolvedValueOnce(response([2], 2))
  await query.search()
  await query.loadMore()
  vi.mocked(getProjects).mockRejectedValueOnce(new Error('refresh failed'))
  await query.refresh()
  const updated = response([1])
  updated.data.items[0]!.projectName = 'Updated'
  vi.mocked(getProjects).mockResolvedValueOnce(updated)
  await query.retry()
  expect(getProjects).toHaveBeenLastCalledWith(expect.any(AbortSignal), {
    page: 1,
    size: 20,
    keyword: '',
  })
  expect(query.items.value.map((item) => item.projectName)).toEqual(['Updated', 'Project 2'])
})
it('cancels obsolete searches and requests when the picker scope closes', async () => {
  const query = create()
  let resolve!: (value: ApiResponse<PageResult<Project>>) => void
  vi.mocked(getProjects).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const old = query.search('old')
  const oldSignal = vi.mocked(getProjects).mock.calls[0]![0]!
  vi.mocked(getProjects).mockResolvedValueOnce(response([2], 1, 1))
  await query.search('new')
  expect(oldSignal.aborted).toBe(true)
  resolve(response([1]))
  await old
  expect(query.items.value.map((item) => item.id)).toEqual([2])
  vi.mocked(getProjects).mockReturnValueOnce(new Promise(() => {}))
  void query.refresh()
  const signal = vi.mocked(getProjects).mock.calls.at(-1)![0]!
  scopes[0]!.stop()
  expect(signal.aborted).toBe(true)
})

it('refreshes the existing search and removes deleted Projects from previously loaded pages', async () => {
  const query = create()
  vi.mocked(getProjects)
    .mockResolvedValueOnce(response([1]))
    .mockResolvedValueOnce(response([2], 2))
  await query.search('matching')
  await query.loadMore()
  vi.mocked(getProjects).mockResolvedValueOnce(response([1], 1, 1))

  useProjectStore().removeProject(2)
  await flushPromises()

  expect(getProjects).toHaveBeenLastCalledWith(expect.any(AbortSignal), {
    page: 1,
    size: 20,
    keyword: 'matching',
  })
  expect(query.items.value.map((item) => item.id)).toEqual([1])
  expect(query.page.value).toBe(1)
  expect(query.hasMore.value).toBe(false)
})
