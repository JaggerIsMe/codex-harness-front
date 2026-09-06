import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ExpertEditDialog from '@/components/expert/ExpertEditDialog.vue'
import { getSkills } from '@/api/skill'
import { saveExpert } from '@/api/expert'
import { listSelectableMcpVersions } from '@/api/mcp'
import type { Expert } from '@/types/expert'

vi.mock('@/api/skill', () => ({ getSkills: vi.fn() }))
vi.mock('@/api/expert', () => ({ saveExpert: vi.fn() }))
vi.mock('@/api/mcp', () => ({ listSelectableMcpVersions: vi.fn() }))

let wrapper: VueWrapper
afterEach(() => wrapper?.unmount())

it('offers only the latest active Skill Version and upgrades an existing draft selection', async () => {
  vi.mocked(getSkills).mockResolvedValue({
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
            status: 'ACTIVE',
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
        versionId: 70,
        versionNo: 2,
        serverCode: 'github',
        name: 'GitHub MCP',
        transportType: 'STDIO',
        configDigest: 'a'.repeat(64),
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
  const checkboxes = wrapper.findAll('input[type="checkbox"]')
  expect((checkboxes[0].element as HTMLInputElement).checked).toBe(true)
  expect((checkboxes[1].element as HTMLInputElement).checked).toBe(true)
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '保存草稿')!
    .trigger('click')
  await flushPromises()
  expect(saveExpert).toHaveBeenCalledWith(
    10,
    expect.objectContaining({ skillVersionIds: [51], mcpBindings: [70], revision: 3 }),
  )
})
