import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ExpertManagement from '@/views/expert/ExpertManagement.vue'
import { listExperts } from '@/api/expert'
import type { Expert } from '@/types/expert'

vi.mock('@/api/expert', () => ({ listExperts: vi.fn(), changeExpertStatus: vi.fn() }))
vi.mock('vue-sonner', () => ({ toast: { success: vi.fn() } }))

let wrapper: VueWrapper
afterEach(() => wrapper?.unmount())

it('shows changed Skill versions until the updated expert version is published', async () => {
  const expert: Expert = {
    id: 10,
    name: 'Java 专家',
    description: '',
    status: 'PUBLISHED',
    publishedVersionId: 100,
    revision: 3,
    systemPrompt: 'Review Java',
    skillVersionIds: [50],
    mcpBindings: [],
    mcpUpdates: [],
    skillUpdates: [
      {
        skillId: 7,
        skillName: 'code-review',
        currentVersionId: 50,
        currentVersion: '1.0.0',
        availableVersionId: 51,
        availableVersion: '2.0.0',
      },
    ],
  }
  const response = (data: Expert[]) => ({ status: 'success', code: 200, info: '', data })
  vi.mocked(listExperts).mockResolvedValue(response([expert]))
  wrapper = mount(ExpertManagement, {
    global: { stubs: { ExpertEditDialog: true, ExpertPublishDialog: true } },
  })
  await flushPromises()

  expect(wrapper.text()).toContain('Skill 已更新，需发布新专家版本')
  expect(wrapper.text()).toContain('code-review：1.0.0 → 2.0.0')
  expect(wrapper.text()).toContain('请先编辑草稿并保存最新 Skill 版本，再发布。')

  vi.mocked(listExperts).mockResolvedValue(
    response([{ ...expert, status: 'DRAFT', skillVersionIds: [51] }]),
  )
  wrapper.findComponent({ name: 'ExpertEditDialog' }).vm.$emit('saved')
  await flushPromises()
  expect(wrapper.text()).toContain('Skill 已更新，需发布新专家版本')
  expect(wrapper.text()).toContain('草稿已更新，请发布新版本。')

  vi.mocked(listExperts).mockResolvedValue(
    response([{ ...expert, publishedVersionId: 101, skillVersionIds: [51], skillUpdates: [] }]),
  )
  wrapper.findComponent({ name: 'ExpertPublishDialog' }).vm.$emit('published')
  await flushPromises()
  expect(wrapper.text()).not.toContain('Skill 已更新，需发布新专家版本')
})

it('keeps the MCP update notice until the updated expert is published', async () => {
  const expert: Expert = {
    id: 10,
    name: 'Java 专家',
    description: '',
    status: 'PUBLISHED',
    publishedVersionId: 100,
    revision: 3,
    systemPrompt: 'Review Java',
    skillVersionIds: [],
    skillUpdates: [],
    mcpBindings: [70],
    mcpUpdates: [
      {
        configurationId: 7,
        name: 'GitHub MCP',
        currentVersionId: 70,
        currentVersionNo: 1,
        availableVersionId: 71,
        availableVersionNo: 2,
      },
    ],
  }
  const response = (data: Expert[]) => ({ status: 'success', code: 200, info: '', data })
  vi.mocked(listExperts).mockResolvedValue(response([expert]))
  wrapper = mount(ExpertManagement, {
    global: { stubs: { ExpertEditDialog: true, ExpertPublishDialog: true } },
  })
  await flushPromises()
  expect(wrapper.text()).toContain('MCP 已更新，需发布新专家版本')
  expect(wrapper.text()).toContain('GitHub MCP：v1 → v2')
  expect(wrapper.text()).toContain('请先编辑草稿并保存最新 MCP 版本，再发布。')

  vi.mocked(listExperts).mockResolvedValue(
    response([{ ...expert, status: 'DRAFT', mcpBindings: [71] }]),
  )
  wrapper.findComponent({ name: 'ExpertEditDialog' }).vm.$emit('saved')
  await flushPromises()
  expect(wrapper.text()).toContain('MCP 已更新，需发布新专家版本')
  expect(wrapper.text()).toContain('草稿已更新，请发布新版本。')

  vi.mocked(listExperts).mockResolvedValue(
    response([{ ...expert, publishedVersionId: 101, mcpBindings: [71], mcpUpdates: [] }]),
  )
  wrapper.findComponent({ name: 'ExpertPublishDialog' }).vm.$emit('published')
  await flushPromises()
  expect(wrapper.text()).not.toContain('MCP 已更新，需发布新专家版本')
})
