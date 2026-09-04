import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AppForm from '@/components/common/AppForm.vue'
import MessageContent from '@/components/conversation/MessageContent.vue'

it('rejects required and malformed values and allows corrected form submission', async () => {
  const wrapper = mount(AppForm, {
    props: {
      model: { name: '' },
      rules: {
        name: [
          { required: true, message: '必填' },
          { pattern: /^[a-z]+$/, message: '仅小写字母' },
        ],
      },
    },
  })
  expect(await wrapper.vm.validate()).toBe(false)
  await wrapper.setProps({ model: { name: '123' } })
  expect(await wrapper.vm.validate()).toBe(false)
  await wrapper.setProps({ model: { name: 'valid' } })
  expect(await wrapper.vm.validate()).toBe(true)
  wrapper.unmount()
})

it('sanitizes unsafe HTML while preserving Markdown code blocks', () => {
  const wrapper = mount(MessageContent, {
    props: {
      content:
        '<img src="x" onerror="alert(1)"><script>alert(1)</script>\n\n[恶意链接](javascript:alert(1))\n\n```ts\nconst safe = true\n```',
    },
  })
  expect(wrapper.find('script').exists()).toBe(false)
  expect(wrapper.html()).not.toMatch(/onerror|href="javascript:/)
  expect(wrapper.find('pre code').text()).toContain('const safe = true')
  wrapper.unmount()
})
