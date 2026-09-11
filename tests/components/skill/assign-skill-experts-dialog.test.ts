import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import AssignSkillExpertsDialog from '@/components/skill/AssignSkillExpertsDialog.vue'
import {
  getAssignmentCandidates,
  previewAssignment,
  commitAssignment,
  getAssignment,
  getBatchAssignmentCandidates,
  previewBatchAssignment,
} from '@/api/skill-assignment'
import type { Skill } from '@/types/domain'
import type { AssignmentCandidate } from '@/types/skill-assignment'
vi.mock('@/api/skill-assignment', () => ({
  getAssignmentCandidates: vi.fn(),
  previewAssignment: vi.fn(),
  commitAssignment: vi.fn(),
  getAssignment: vi.fn(),
  getBatchAssignmentCandidates: vi.fn(),
  previewBatchAssignment: vi.fn(),
}))
vi.mock('@/utils/auth', () => ({ captureAuthSession: () => ({ sessionId: 'fixture' }) }))
const skill: Skill = {
  id: 1,
  skillName: 'review',
  description: '',
  status: 'ENABLED',
  versionCount: 1,
  createdAt: '',
  updatedAt: '',
  versions: [
    { id: 2, skillId: 1, version: '2', status: 'ACTIVE', sha256: '', fileSize: 1, createdAt: '' },
  ],
}
const candidate: AssignmentCandidate = {
  expertId: 10,
  name: '审查专家',
  status: 'PUBLISHED',
  revision: 2,
  draftVersionId: 1,
  draftVersion: '1',
  publishedVersion: '1',
  action: 'REPLACE',
  reason: '',
}
const response = <T>(data: T) => ({ status: 'success' as const, code: 200, info: '', data })
let wrapper: VueWrapper
beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  vi.mocked(getAssignmentCandidates).mockResolvedValue(
    response({ items: [candidate], total: 1, page: 1, size: 20 }),
  )
  vi.mocked(previewAssignment).mockResolvedValue(
    response({
      batchId: 'batch-1',
      skillName: 'review',
      version: '2',
      items: [candidate],
      expiresAt: '2099-01-01',
    }),
  )
  vi.mocked(getAssignment).mockResolvedValue(
    response({
      batchId: 'batch-1',
      skillName: 'review',
      version: '2',
      started: false,
      complete: false,
      items: [],
    }),
  )
  vi.mocked(commitAssignment).mockResolvedValue(
    response({
      batchId: 'batch-1',
      skillName: 'review',
      version: '2',
      started: true,
      complete: true,
      items: [
        {
          expertId: 10,
          name: '审查专家',
          action: 'REPLACE',
          previousVersionId: 1,
          versionId: 2,
          status: 'SUCCESS',
          message: '已更新草稿，发布后生效',
          revision: 3,
        },
      ],
    }),
  )
})
afterEach(() => wrapper?.unmount())
async function open() {
  wrapper = mount(AssignSkillExpertsDialog, {
    props: { modelValue: true, skills: [skill], initialVersionId: 2 },
    global: { stubs: { AppDialog: { template: '<div><slot/><slot name="footer"/></div>' } } },
  })
  await flushPromises()
}
function button(text: string) {
  return wrapper.findAll('button').find((b) => b.text() === text)!
}
async function preview() {
  await wrapper.get('input[aria-label="选择 审查专家"]').setValue(true)
  await button('预览分配').trigger('click')
  await flushPromises()
}
it('requires explicit confirmation of replacement and only submits the preview identifier', async () => {
  await open()
  await preview()
  expect(wrapper.text()).toContain('1 → 2')
  expect(button('确认分配').attributes('disabled')).toBeDefined()
  await wrapper.get('.skill-import__notice input[type="checkbox"]').setValue(true)
  await button('确认分配').trigger('click')
  await flushPromises()
  expect(commitAssignment).toHaveBeenCalledWith('batch-1', expect.any(AbortSignal))
  expect(wrapper.text()).toContain('已更新草稿，发布后生效')
  expect(wrapper.emitted('completed')).toHaveLength(1)
})
it('invalidates confirmed preview when selection changes', async () => {
  await open()
  await preview()
  await wrapper.get('.skill-import__notice input[type="checkbox"]').setValue(true)
  await wrapper.get('input[aria-label="选择 审查专家"]').setValue(false)
  expect(wrapper.text()).not.toContain('确认分配 review')
  expect(button('确认分配').attributes('disabled')).toBeDefined()
  expect(commitAssignment).not.toHaveBeenCalled()
})
it('preserves selected experts across candidate pages and supports enter search', async () => {
  vi.mocked(getAssignmentCandidates)
    .mockResolvedValueOnce(response({ items: [candidate], total: 21, page: 1, size: 20 }))
    .mockResolvedValue(
      response({
        items: [{ ...candidate, expertId: 11, name: '第二专家' }],
        total: 21,
        page: 2,
        size: 20,
      }),
    )
  await open()
  await wrapper.get('input[aria-label="选择 审查专家"]').setValue(true)
  await button('下一页').trigger('click')
  await flushPromises()
  await wrapper.get('input[aria-label="选择 第二专家"]').setValue(true)
  expect(wrapper.text()).toContain('已选 2 位')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(getAssignmentCandidates).toHaveBeenLastCalledWith(1, 2, '', 1, expect.any(AbortSignal))
})
it('restores the original batch after a timeout and reopening', async () => {
  vi.mocked(commitAssignment).mockRejectedValueOnce(new Error('timeout'))
  await open()
  await preview()
  await wrapper.get('.skill-import__notice input[type="checkbox"]').setValue(true)
  await button('确认分配').trigger('click')
  await flushPromises()
  expect(sessionStorage.getItem('harness.skill-assignment.fixture')).toBe('batch-1')
  await wrapper.setProps({ modelValue: false })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  await button('恢复提交结果').trigger('click')
  await flushPromises()
  expect(commitAssignment).toHaveBeenCalledTimes(2)
  expect(sessionStorage.getItem('harness.skill-assignment.fixture')).toBeNull()
})

const secondSkill: Skill = {
  ...skill,
  id: 3,
  skillName: 'research',
  versions: [{ ...skill.versions[0]!, id: 4, skillId: 3, version: '1' }],
}
const targets = [
  { skillId: 1, versionId: 2, skillName: 'review', version: '2' },
  { skillId: 3, versionId: 4, skillName: 'research', version: '1' },
]
const batchCandidate: AssignmentCandidate = {
  ...candidate,
  changes: [
    {
      ...targets[0]!,
      draftVersionId: 1,
      draftVersion: '1',
      publishedVersion: '1',
      action: 'REPLACE',
    },
    {
      ...targets[1]!,
      draftVersionId: null,
      draftVersion: null,
      publishedVersion: null,
      action: 'ADD',
    },
  ],
}
async function openBatch() {
  vi.mocked(getBatchAssignmentCandidates).mockResolvedValue(
    response({ items: [batchCandidate], total: 1, page: 1, size: 20 }),
  )
  vi.mocked(previewBatchAssignment).mockResolvedValue(
    response({
      batchId: 'batch-many',
      skillName: 'review',
      version: '2',
      items: [batchCandidate],
      targets,
      expiresAt: '2099-01-01',
    }),
  )
  wrapper = mount(AssignSkillExpertsDialog, {
    props: {
      modelValue: true,
      skills: [skill, secondSkill],
      initialVersionId: null,
      initialVersionIds: [2, 4],
    },
    global: { stubs: { AppDialog: { template: '<div><slot/><slot name="footer"/></div>' } } },
  })
  await flushPromises()
}
it('previews every Skill change and commits one confirmed batch for all targets', async () => {
  await openBatch()
  expect(getBatchAssignmentCandidates).toHaveBeenCalledWith(
    [
      { skillId: 1, versionId: 2 },
      { skillId: 3, versionId: 4 },
    ],
    '',
    1,
    expect.any(AbortSignal),
  )
  await preview()
  expect(previewBatchAssignment).toHaveBeenCalledWith(
    [
      { skillId: 1, versionId: 2 },
      { skillId: 3, versionId: 4 },
    ],
    [10],
    expect.any(AbortSignal),
  )
  expect(wrapper.text()).toContain('review：1 → 2（替换版本）')
  expect(wrapper.text()).toContain('research：未绑定 → 1（新增绑定）')
  expect(button('确认分配').attributes('disabled')).toBeDefined()
  await wrapper.get('.skill-import__notice input[type="checkbox"]').setValue(true)
  await button('确认分配').trigger('click')
  await flushPromises()
  expect(commitAssignment).toHaveBeenCalledExactlyOnceWith('batch-many', expect.any(AbortSignal))
  expect(previewAssignment).not.toHaveBeenCalled()
})
it('shows only external selections as read-only and resets the preview when reopened with a new selection', async () => {
  await openBatch()
  await wrapper.setProps({
    skills: [
      skill,
      secondSkill,
      {
        ...skill,
        id: 5,
        skillName: 'unselected-skill',
        versions: [{ ...skill.versions[0]!, id: 6, skillId: 5 }],
      },
    ],
  })
  const summary = wrapper.get('ul[aria-label="本次分配的 Skill"]')
  expect(summary.findAll('li')).toHaveLength(2)
  expect(summary.text()).toContain('review · 2')
  expect(summary.text()).toContain('research · 1')
  expect(wrapper.text()).not.toContain('unselected-skill')
  expect(wrapper.findAll('select')).toHaveLength(0)
  expect(summary.findAll('input, button')).toHaveLength(0)
  await preview()
  await wrapper.get('.skill-import__notice input[type="checkbox"]').setValue(true)
  await wrapper.setProps({ modelValue: false })
  await wrapper.setProps({ initialVersionIds: [2], modelValue: true })
  await flushPromises()
  expect(wrapper.text()).toContain('已选 1 个 Skill')
  expect(wrapper.text()).toContain('已选 0 位')
  expect(wrapper.text()).not.toContain('确认批量分配')
  expect(wrapper.get('ul[aria-label="本次分配的 Skill"]').findAll('li')).toHaveLength(1)
  expect(button('确认分配').attributes('disabled')).toBeDefined()
  expect(getBatchAssignmentCandidates).toHaveBeenLastCalledWith(
    [{ skillId: 1, versionId: 2 }],
    '',
    1,
    expect.any(AbortSignal),
  )
})
it('blocks the complete expert assignment when the combined Skill limit is exceeded', async () => {
  await openBatch()
  vi.mocked(previewBatchAssignment).mockResolvedValue(
    response({
      batchId: 'blocked',
      skillName: 'review',
      version: '2',
      targets,
      items: [{ ...batchCandidate, action: 'BLOCKED', reason: '专家最多绑定 30 个 Skill' }],
      expiresAt: '2099-01-01',
    }),
  )
  await preview()
  await wrapper.get('.skill-import__notice input[type="checkbox"]').setValue(true)
  expect(wrapper.text()).toContain('专家最多绑定 30 个 Skill')
  expect(button('确认分配').attributes('disabled')).toBeDefined()
  expect(commitAssignment).not.toHaveBeenCalled()
})
it('repreviews only failed experts while retaining every selected Skill', async () => {
  await openBatch()
  vi.mocked(commitAssignment).mockResolvedValue(
    response({
      batchId: 'batch-many',
      skillName: 'review',
      version: '2',
      targets,
      started: true,
      complete: true,
      items: [
        {
          expertId: 10,
          name: candidate.name,
          action: 'REPLACE',
          previousVersionId: 1,
          versionId: 2,
          status: 'FAILED',
          message: '专家配置已变化，请重新预览',
          revision: null,
          changes: batchCandidate.changes,
        },
      ],
    }),
  )
  await preview()
  await wrapper.get('.skill-import__notice input[type="checkbox"]').setValue(true)
  await button('确认分配').trigger('click')
  await flushPromises()
  await button('只重试失败项').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('已选 2 个 Skill')
  expect(button('确认分配').attributes('disabled')).toBeDefined()
  await button('预览分配').trigger('click')
  await flushPromises()
  expect(previewBatchAssignment).toHaveBeenLastCalledWith(
    [
      { skillId: 1, versionId: 2 },
      { skillId: 3, versionId: 4 },
    ],
    [10],
    expect.any(AbortSignal),
  )
})
