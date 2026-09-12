import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getSkills } from '@/api/skill'
import { useSkillList } from '@/composables/useSkillList'
import type { Skill } from '@/types/domain'

vi.mock('@/api/skill', () => ({ getSkills: vi.fn() }))
const mounted: ReturnType<typeof mount>[] = []
function setup() {
  let list!: ReturnType<typeof useSkillList>
  mounted.push(
    mount(
      defineComponent({
        setup() {
          list = useSkillList()
          return () => null
        },
      }),
    ),
  )
  return list
}
function response(page = 1, total = 45, ids = [page], size = 20) {
  return {
    status: 'success',
    code: 200,
    info: '',
    data: {
      items: ids.map((id) => ({ id, skillName: `skill-${id}`, versions: [] }) as unknown as Skill),
      total,
      page,
      size,
    },
  }
}
beforeEach(() => vi.resetAllMocks())
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

it('requests pages from the backend and preserves selection when toggling another page', async () => {
  vi.mocked(getSkills)
    .mockResolvedValueOnce(response(1, 45, [45, 44]))
    .mockResolvedValueOnce(response(2, 45, [25, 24]))
  const list = setup()
  await list.loadSkills()
  expect(getSkills).toHaveBeenLastCalledWith(
    { keyword: '', status: '', page: 1, size: 20 },
    expect.any(AbortSignal),
  )
  list.selectPage(true)
  await list.loadSkills(2)
  expect(list.skills.value.map((skill) => skill.id)).toEqual([25, 24])
  expect(list.total.value).toBe(45)
  list.selectPage(true)
  expect(list.selectedSkillIds.value).toEqual([45, 44, 25, 24])
  list.selectPage(false)
  expect(list.selectedSkillIds.value).toEqual([45, 44])
})

it('search and reset return to page one and paging uses the submitted filters', async () => {
  vi.mocked(getSkills).mockResolvedValue(response())
  const list = setup()
  list.page.value = 3
  list.skillSearch.keyword = ' review '
  list.skillSearch.status = 'ENABLED'
  await list.searchSkills()
  expect(getSkills).toHaveBeenLastCalledWith(
    { keyword: 'review', status: 'ENABLED', page: 1, size: 20 },
    expect.any(AbortSignal),
  )
  list.skillSearch.keyword = 'not submitted'
  await list.loadSkills(2)
  expect(getSkills).toHaveBeenLastCalledWith(
    { keyword: 'review', status: 'ENABLED', page: 2, size: 20 },
    expect.any(AbortSignal),
  )
  await list.resetSkills()
  expect(getSkills).toHaveBeenLastCalledWith(
    { keyword: '', status: '', page: 1, size: 20 },
    expect.any(AbortSignal),
  )
})

it('recovers to the last page after a refresh shrinks the result set', async () => {
  vi.mocked(getSkills)
    .mockResolvedValueOnce(response(3, 21, []))
    .mockResolvedValueOnce(response(2, 21, [1]))
  const list = setup()
  await list.loadSkills(3)
  expect(list.page.value).toBe(2)
  expect(list.skills.value[0]?.id).toBe(1)
  expect(list.loadingSkills.value).toBe(false)
})

it('aborts previous requests and ignores late responses; unmount aborts the current request', async () => {
  let resolveFirst!: (value: ReturnType<typeof response>) => void
  vi.mocked(getSkills)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )
    .mockResolvedValueOnce(response(2))
  const list = setup()
  const first = list.loadSkills(1)
  const firstSignal = vi.mocked(getSkills).mock.calls[0]![1]!
  await list.loadSkills(2)
  expect(firstSignal.aborted).toBe(true)
  resolveFirst(response(1))
  await first
  expect(list.page.value).toBe(2)
  const latestSignal = vi.mocked(getSkills).mock.calls[1]![1]!
  mounted[0]!.unmount()
  expect(latestSignal.aborted).toBe(true)
})
