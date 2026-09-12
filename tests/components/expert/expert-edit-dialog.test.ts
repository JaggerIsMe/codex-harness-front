import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ExpertEditDialog from '@/components/expert/ExpertEditDialog.vue'
import { getSkillOptions } from '@/api/skill'
import { saveExpert } from '@/api/expert'
import { listSelectableMcpVersions } from '@/api/mcp'
import type { Expert } from '@/types/expert'

vi.mock('@/api/skill', () => ({ getSkillOptions: vi.fn() }))
vi.mock('@/api/expert', () => ({ saveExpert: vi.fn() }))
vi.mock('@/api/mcp', () => ({ listSelectableMcpVersions: vi.fn() }))

let wrapper: VueWrapper
afterEach(() => wrapper?.unmount())

it('upgrades existing Skill and MCP bindings to their latest active versions', async () => {
  vi.mocked(getSkillOptions).mockResolvedValue({
    status: 'success',
    code: 200,
    info: '',
    data: [
      {
        id: 7,
        skillName: 'code-review',
        description: '',
        status: 'ENABLED',
        versionCount: 2,
        createdAt: '',
        updatedAt: '',
        versions: [
          {
            id: 51,
            skillId: 7,
            version: '2.0.0',
            status: 'ACTIVE',
            sha256: '',
            fileSize: 1,
            createdAt: '',
          },
          {
            id: 50,
            skillId: 7,
            version: '1.0.0',
            status: 'DISABLED',
            sha256: '',
            fileSize: 1,
            createdAt: '',
          },
        ],
      },
    ],
  })
  vi.mocked(saveExpert).mockResolvedValue({
    status: 'success',
    code: 200,
    info: '',
    data: {} as Expert,
  })
  vi.mocked(listSelectableMcpVersions).mockResolvedValue({
    status: 'success',
    code: 200,
    info: '',
    data: [
      {
        configurationId: 7,
        versionId: 71,
        versionNo: 2,
        serverCode: 'github',
        name: 'GitHub MCP',
        transportType: 'STDIO',
        configDigest: 'a'.repeat(64),
        previousVersionIds: [70],
      },
    ],
  })
  const expert: Expert = {
    id: 10,
    name: 'Java 专家',
    description: '',
    status: 'PUBLISHED',
    publishedVersionId: 100,
    revision: 3,
    systemPrompt: 'Review Java',
    skillVersionIds: [50],
    mcpBindings: [70],
    skillUpdates: [],
    mcpUpdates: [],
  }
  wrapper = mount(ExpertEditDialog, {
    props: { modelValue: false, expert },
    global: { stubs: { AppDialog: { template: '<div><slot /><slot name="footer" /></div>' } } },
  })

  await wrapper.setProps({ modelValue: true })
  await flushPromises()

  expect(wrapper.text()).toContain('code-review · 2.0.0')
  expect(wrapper.text()).not.toContain('code-review · 1.0.0')
  expect(wrapper.text()).toContain('GitHub MCP · v2 · github · STDIO')
  expect(wrapper.text()).not.toContain('不可用 MCP 配置版本 #70')
  expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
  expect(wrapper.findAll('li')).toHaveLength(2)
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '保存草稿')!
    .trigger('click')
  await flushPromises()
  expect(saveExpert).toHaveBeenCalledWith(
    10,
    expect.objectContaining({ skillVersionIds: [51], mcpBindings: [71], revision: 3 }),
  )
})

it('retains unavailable MCP bindings for explicit removal when there is no replacement', async () => {
  vi.mocked(getSkillOptions).mockResolvedValue({ status: 'success', code: 200, info: '', data: [] })
  vi.mocked(listSelectableMcpVersions).mockResolvedValue({
    status: 'success',
    code: 200,
    info: '',
    data: [
      {
        configurationId: 8,
        versionId: 80,
        versionNo: 1,
        serverCode: 'other',
        name: 'Other MCP',
        transportType: 'STDIO',
        configDigest: '',
        previousVersionIds: [],
      },
    ],
  })
  const expert: Expert = {
    id: 10,
    name: 'Java 专家',
    description: '',
    status: 'DRAFT',
    publishedVersionId: null,
    revision: 1,
    systemPrompt: 'Review Java',
    skillVersionIds: [],
    mcpBindings: [70],
    skillUpdates: [],
    mcpUpdates: [],
  }
  wrapper = mount(ExpertEditDialog, {
    props: { modelValue: false, expert },
    global: { stubs: { AppDialog: { template: '<div><slot /><slot name="footer" /></div>' } } },
  })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  expect(wrapper.text()).toContain('不可用 MCP 配置版本 #70（保存前需移除）')
  expect(wrapper.text()).not.toContain('Other MCP')
  expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
  await wrapper
    .get('button[aria-label="移除 不可用 MCP 配置版本 #70（保存前需移除）"]')
    .trigger('click')
  expect(wrapper.text()).not.toContain('不可用 MCP 配置版本 #70')
})
