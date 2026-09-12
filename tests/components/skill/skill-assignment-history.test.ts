import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import SkillAssignmentHistory from '@/components/skill/SkillAssignmentHistory.vue'
import { getAssignment, listAssignments } from '@/api/skill-assignment'

vi.mock('@/api/skill-assignment', () => ({ getAssignment: vi.fn(), listAssignments: vi.fn() }))
const response = <T>(data: T) => ({ status: 'success' as const, code: 200, info: '', data })
const expertResults = {
  total: 3,
  successCount: 1,
  failedCount: 1,
  skippedCount: 0,
  pendingCount: 1,
}
const bindingResults = {
  total: 6,
  successCount: 1,
  failedCount: 2,
  skippedCount: 1,
  pendingCount: 2,
}
let wrapper: VueWrapper
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listAssignments).mockResolvedValue(
    response([
      {
        batchId: 'other-admin-batch',
        skillName: 'review',
        version: '2',
        createdAt: '2026-09-12',
        successCount: 1,
        failedCount: 1,
        skippedCount: 0,
        expertResults,
        bindingResults,
        ownerId: 902,
        ownerName: '另一位管理员',
        complete: false,
      },
    ]),
  )
  vi.mocked(getAssignment).mockResolvedValue(
    response({
      batchId: 'other-admin-batch',
      skillName: 'review',
      version: '2',
      started: true,
      complete: false,
      items: [],
      expertResults,
      bindingResults,
      ownerId: 902,
      ownerName: '另一位管理员',
      canResume: false,
    }),
  )
})
afterEach(() => wrapper?.unmount())
async function open() {
  wrapper = mount(SkillAssignmentHistory, {
    props: { revision: 0 },
    global: { stubs: { AppDialog: { template: '<div><slot/></div>' } } },
  })
  await flushPromises()
}
it('labels expert and Skill binding outcomes separately and includes unfinished work and the operator', async () => {
  await open()
  expect(wrapper.text()).toContain('全部管理员')
  expect(wrapper.text()).toContain('另一位管理员')
  expect(wrapper.text()).toContain('专家（3 位）：成功 1 / 失败 1 / 跳过 0 / 待处理 1')
  expect(wrapper.text()).toContain('Skill 绑定（6 项）：成功 1 / 失败 2 / 跳过 1 / 待处理 2')
  expect(wrapper.text()).toContain('未完成')
})
it('allows reading another operator’s result without prompting the viewer to resume it', async () => {
  await open()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '查看结果')!
    .trigger('click')
  await flushPromises()
  expect(getAssignment).toHaveBeenCalledWith('other-admin-batch', expect.any(AbortSignal))
  expect(wrapper.text()).toContain('尚未处理完成，请由原操作人恢复提交')
  expect(wrapper.text()).not.toContain('可回到分配弹窗恢复提交')
})
