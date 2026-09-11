import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AgentProcess from '@/components/conversation/AgentProcess.vue'

it('preserves the nested provider error instead of reducing it to type and empty action', () => {
  const message = "Invalid 'input[5].content': array too long. Expected maximum length 0, got 1."
  const content = JSON.stringify({
    type: 'error',
    error: { type: 'invalid_request_error', code: null, message, param: null },
    status: 400,
  })
  const wrapper = mount(AgentProcess, {
    props: { items: [{ key: 'warning', messageType: 'ERROR', content, streaming: false }] },
  })
  try {
    expect(wrapper.text()).toContain(message)
    expect(wrapper.text()).toContain('400')
    expect(wrapper.text()).not.toContain('"action": {}')
  } finally {
    wrapper.unmount()
  }
})

it.each([
  'Agent turn error',
  '{malformed error',
  '<script>alert("error")</script>',
  '{"message":"Request failed","status":503,"details":{"retryAfter":10}}',
])('renders warning details as safe plain text: %s', (content) => {
  const wrapper = mount(AgentProcess, {
    props: { items: [{ key: 'warning', messageType: 'ERROR', content, streaming: false }] },
  })
  try {
    let expected = content
    try {
      expected = JSON.stringify(JSON.parse(content), null, 2)
    } catch {
      // Non-JSON messages must remain unchanged.
    }
    expect(wrapper.get('pre').text()).toBe(expected)
    expect(wrapper.find('script').exists()).toBe(false)
  } finally {
    wrapper.unmount()
  }
})
