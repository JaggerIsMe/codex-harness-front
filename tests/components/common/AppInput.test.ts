import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AppInput from '@/components/common/AppInput.vue'

it('replaces the selected text, restores the caret and respects maxlength', async () => {
  const wrapper = mount(AppInput, {
    attachTo: document.body,
    props: { modelValue: '前文后文', type: 'textarea' },
    attrs: { maxlength: 20 },
  })
  try {
    const input = wrapper.get('textarea').element
    input.focus()
    input.setSelectionRange(0, 2)
    expect(wrapper.vm.insertAtCursor('{{goal}}')).toBe(true)
    await wrapper.setProps({ modelValue: wrapper.emitted('update:modelValue')![0]![0] as string })
    expect(input.value).toBe('{{goal}}后文')
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(8)
    expect(input.selectionEnd).toBe(8)
    expect(wrapper.vm.insertAtCursor('x'.repeat(20))).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  } finally {
    wrapper.unmount()
  }
})
