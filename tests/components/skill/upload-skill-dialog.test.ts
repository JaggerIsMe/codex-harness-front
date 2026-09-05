import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import UploadSkillDialog from '@/components/skill/UploadSkillDialog.vue'
import { createSkill, uploadSkillVersion } from '@/api/skill'
import type { Skill } from '@/types/domain'

vi.mock('@/api/skill', () => ({ createSkill: vi.fn(), uploadSkillVersion: vi.fn() }))

const skill: Skill = {
  id: 42,
  skillName: 'code-review',
  description: '',
  status: 'ENABLED',
  versionCount: 1,
  createdAt: '',
  updatedAt: '',
  versions: [],
}
let wrapper: VueWrapper

afterEach(() => wrapper?.unmount())

function mountDialog(selectedSkill: Skill | null) {
  wrapper = mount(UploadSkillDialog, {
    props: { modelValue: false, skill: selectedSkill },
    global: {
      stubs: {
        AppDialog: { template: '<div><slot /><slot name="footer" /></div>' },
      },
    },
  })
  return wrapper.setProps({ modelValue: true })
}

async function fillVersion() {
  await wrapper.get('input[placeholder="例如 1.0.0"]').setValue('1.1.0')
  const file = new File(['skill archive'], 'skill.zip', { type: 'application/zip' })
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  return file
}

async function submit() {
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '上传并启用')!
    .trigger('click')
  await flushPromises()
}

it('publishes a new Skill Version without requesting a hidden Skill name', async () => {
  vi.mocked(uploadSkillVersion).mockResolvedValue({
    status: 'success',
    code: 200,
    info: '请求成功',
    data: {
      id: 7,
      skillId: 42,
      version: '1.1.0',
      sha256: '',
      fileSize: 13,
      status: 'ENABLED',
      createdAt: '',
    },
  })
  await mountDialog(skill)
  const file = await fillVersion()
  await submit()

  expect(wrapper.text()).not.toContain('请输入 Skill 名称')
  expect(uploadSkillVersion).toHaveBeenCalledOnce()
  const [skillId, data] = vi.mocked(uploadSkillVersion).mock.calls[0]!
  expect(skillId).toBe(42)
  expect(data.get('version')).toBe('1.1.0')
  expect(data.get('file')).toBe(file)
  expect(data.has('skillName')).toBe(false)
  expect(createSkill).not.toHaveBeenCalled()
  expect(wrapper.emitted('uploaded')).toHaveLength(1)
  expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
})

it('still requires a valid name when reopening to create a Skill', async () => {
  vi.mocked(createSkill).mockResolvedValue({
    status: 'success',
    code: 200,
    info: '请求成功',
    data: skill,
  })
  await mountDialog(skill)
  await wrapper.setProps({ modelValue: false })
  await wrapper.setProps({ modelValue: true, skill: null })
  await fillVersion()
  await submit()
  expect(wrapper.text()).toContain('请输入 Skill 名称')
  expect(createSkill).not.toHaveBeenCalled()

  await wrapper.get('input[placeholder="例如 code-review"]').setValue('invalid/name')
  await submit()
  expect(wrapper.text()).toContain('只能包含字母、数字、点、下划线和连字符')
  expect(createSkill).not.toHaveBeenCalled()

  await wrapper.get('input[placeholder="例如 code-review"]').setValue('code-review')
  await wrapper.get('textarea').setValue('Review changes')
  await submit()
  expect(createSkill).toHaveBeenCalledOnce()
  const data = vi.mocked(createSkill).mock.calls[0]![0]
  expect(data.get('skillName')).toBe('code-review')
  expect(data.get('description')).toBe('Review changes')
  expect(uploadSkillVersion).not.toHaveBeenCalled()
})

it('still validates the version and ZIP when publishing a Skill Version', async () => {
  await mountDialog(skill)
  await submit()
  expect(wrapper.text()).toContain('请输入版本号')
  expect(wrapper.text()).toContain('请选择 Skill ZIP')
  expect(uploadSkillVersion).not.toHaveBeenCalled()

  await fillVersion()
  await wrapper.get('input[placeholder="例如 1.0.0"]').setValue('invalid/version')
  await submit()
  expect(wrapper.text()).toContain('版本号格式不正确')
  expect(uploadSkillVersion).not.toHaveBeenCalled()
})
