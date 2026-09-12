import { afterEach, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import SkillFilePicker from '@/components/skill/SkillFilePicker.vue'

let wrapper: VueWrapper
afterEach(() => wrapper?.unmount())
it('opens the chooser from its button, supports selecting the same file again and ignores cancellation', async () => {
  wrapper = mount(SkillFilePicker, {
    props: { label: '选择 ZIP 文件', inputLabel: '选择多个 Skill ZIP', multiple: true },
  })
  const input = wrapper.get('input')
  const click = vi.spyOn(input.element as HTMLInputElement, 'click')
  await wrapper.get('button').trigger('click')
  expect(click).toHaveBeenCalledOnce()
  const file = new File(['zip'], 'review.zip')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await input.trigger('change')
  expect(wrapper.emitted('selected')).toEqual([[[file]], [[file]]])
  Object.defineProperty(input.element, 'files', { value: [], configurable: true })
  await input.trigger('change')
  expect(wrapper.emitted('selected')).toHaveLength(2)
  await wrapper.setProps({ disabled: true })
  expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  expect(input.attributes('disabled')).toBeDefined()
})
