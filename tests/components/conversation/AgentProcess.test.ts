import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AgentProcess from '@/components/conversation/AgentProcess.vue'

it.each([
  ['harness_view_image', '查看图片'],
  ['harness_generate_image', '生成图片'],
  ['harness_apply_patch', '应用文件补丁'],
  ['harness_run_command', '执行命令'],
])('shows the recovered tool name and result: %s', (tool, label) => {
  const wrapper = mount(AgentProcess, {
    props: {
      items: [
        {
          key: tool,
          messageType: 'ACTIVITY',
          content: JSON.stringify({
            type: 'dynamicToolCall',
            tool,
            message: 'Workspace result: demo.png',
          }),
          streaming: false,
        },
      ],
    },
  })
  expect(wrapper.text()).toContain('demo.png')
  expect(wrapper.text()).toContain(label)
  expect(wrapper.text()).not.toContain('dynamicToolCall')
  expect(wrapper.html()).not.toContain('data:image')
  wrapper.unmount()
})

it('keeps policy denials visible in collapsed history and identifies the platform as decision maker', () => {
  const content = JSON.stringify({
    type: 'approvalBlocked',
    approvalType: 'COMMAND_EXECUTION',
    message: '平台策略拦截，并非用户拒绝',
    guidance: '使用执行前确认，权限保持不变',
    operation: { command: 'Get-Content example.txt', cwd: 'D:/project' },
  })
  const wrapper = mount(AgentProcess, {
    props: { items: [{ key: 'denied', messageType: 'ERROR', content, streaming: false }] },
  })
  expect(wrapper.get('[aria-label="平台策略拦截"]').isVisible()).toBe(true)
  expect(wrapper.get('[aria-label="平台策略拦截"]').text()).toContain('并非用户拒绝')
  expect(wrapper.get('[aria-label="平台策略拦截"]').text()).toContain('Get-Content example.txt')
  expect(wrapper.get('[aria-label="平台策略拦截"]').find('button').exists()).toBe(false)
  wrapper.unmount()
})

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
