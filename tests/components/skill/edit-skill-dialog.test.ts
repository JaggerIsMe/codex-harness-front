import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import EditSkillDialog from '@/components/skill/EditSkillDialog.vue'
import { updateSkill } from '@/api/skill'
import type { Skill } from '@/types/domain'

vi.mock('@/api/skill', () => ({ updateSkill: vi.fn() }))
let wrapper: VueWrapper
afterEach(() => wrapper?.unmount())
it('loads an existing tag and saves an explicit empty string to clear it', async () => {
  const skill: Skill = {
    id: 1,
    skillName: 'review',
    description: '',
    tag: '团队常用',
    status: 'ENABLED',
    versionCount: 0,
    createdAt: '',
    updatedAt: '',
    versions: [],
  }
  vi.mocked(updateSkill).mockResolvedValue({
    status: 'success',
    code: 200,
    info: '',
    data: { ...skill, tag: '' },
  })
  wrapper = mount(EditSkillDialog, {
    props: { modelValue: false, skill },
    global: { stubs: { AppDialog: { template: '<div><slot /><slot name="footer" /></div>' } } },
  })
  await wrapper.setProps({ modelValue: true })
  const input = wrapper.get('input[aria-label="标签"]')
  expect((input.element as HTMLInputElement).value).toBe('团队常用')
  await input.setValue('')
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '保存')!
    .trigger('click')
  await flushPromises()
  expect(updateSkill).toHaveBeenCalledWith(1, expect.objectContaining({ tag: '' }))
  expect(wrapper.emitted('saved')).toHaveLength(1)
})
