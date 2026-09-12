import { beforeEach, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import ApprovalCard from '@/components/conversation/ApprovalCard.vue'
import type { Approval } from '@/types/domain'

beforeEach(() => setActivePinia(createPinia()))

it('requires an explicit answer for a method-selection question and submits its label', async () => {
  const wrapper = render({
    questions: [
      {
        id: 'method',
        header: '替代方案',
        question: '你希望采用哪种方式？',
        options: [
          { label: '手绘矢量插画 (Recommended)', description: '绘制 SVG' },
          { label: '只给绘图提示词', description: '输出提示词' },
        ],
      },
    ],
  })
  expect(wrapper.findAll('input[type="radio"]')).toHaveLength(2)
  const submit = () => wrapper.findAll('button').find((button) => button.text() === '提交选择')!
  expect(submit().attributes('disabled')).toBeDefined()
  await wrapper.findAll('input[type="radio"]')[1]!.setValue(true)
  await submit().trigger('click')
  expect(wrapper.emitted('decision')?.[0]).toEqual([
    'ACCEPT',
    { method: { answers: ['只给绘图提示词'] } },
  ])
  wrapper.unmount()
})

it('labels execution confirmation as one-time consent without additional permissions', () => {
  const wrapper = render({ question: '读取文件吗？' }, 'EXECUTION_CONFIRMATION')
  expect(wrapper.text()).toContain('执行前确认')
  expect(wrapper.text()).toContain('批准不会增加文件、网络或系统权限')
  expect(wrapper.text()).not.toContain('本会话批准')
  wrapper.unmount()
})

it('collects other and free-text answers per question and preserves editing across refreshes', async () => {
  const details = {
    questions: [
      {
        id: 'method',
        question: '选择方式',
        isOther: true,
        options: [{ label: 'SVG', description: '矢量图' }],
      },
      { id: 'note', question: '补充要求', options: [] },
    ],
  }
  const wrapper = render(details)
  await wrapper.get('input[value="other"]').setValue(true)
  await wrapper.findAll('textarea')[0]!.setValue('水彩效果')
  await wrapper.findAll('textarea')[1]!.setValue('白色背景')
  await wrapper.setProps({
    approval: { ...wrapper.props('approval'), details: JSON.parse(JSON.stringify(details)) },
  })
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '提交选择')!
    .trigger('click')
  expect(wrapper.emitted('decision')?.[0]).toEqual([
    'ACCEPT',
    { method: { answers: ['水彩效果'] }, note: { answers: ['白色背景'] } },
  ])
  wrapper.unmount()
})

function render(details: Approval['details'], approvalType = 'MCP_TOOL_CALL') {
  return mount(ApprovalCard, {
    props: {
      approval: { id: 11, conversationId: 4, turnId: 7, status: 'PENDING', approvalType, details },
    },
  })
}

it('renders native MCP questions and option descriptions without exposing protocol fields by default', () => {
  const wrapper = render({
    threadId: 'internal-thread',
    questions: [
      {
        id: 'approval',
        header: '工具访问',
        question: '允许查询订单吗？',
        options: [
          { label: 'Accept', description: '仅查询本次订单' },
          { label: 'Decline', description: '跳过查询' },
        ],
      },
    ],
  })
  expect(wrapper.get('.approval-question').text()).toContain('允许查询订单吗？')
  expect(wrapper.get('.approval-question__choices').text()).toContain('仅查询本次订单')
  expect(wrapper.find('.approval-fields').exists()).toBe(false)
  expect(wrapper.get('details').attributes('open')).toBeUndefined()
  expect(wrapper.get('pre').text()).toContain('internal-thread')
  wrapper.unmount()
})

it('shows commands, working directory and reason with readable labels, including serialized payloads', () => {
  const wrapper = render(
    JSON.stringify({
      command: 'npm run build\nnpm test',
      cwd: 'D:/project',
      reason: '验证本次修改',
    }),
    'COMMAND_EXECUTION',
  )
  expect(wrapper.get('.approval-card__summary').text()).toBe('验证本次修改')
  expect(wrapper.get('.approval-fields').text()).toContain('执行命令')
  expect(wrapper.get('.approval-fields').text()).toContain('工作目录')
  expect(wrapper.findAll('code').map((node) => node.text())).toEqual([
    'npm run build\nnpm test',
    'D:/project',
  ])
  wrapper.unmount()
})

it('preserves file changes and unknown nested fields in the readable view', () => {
  const wrapper = render(
    {
      grantRoot: 'D:/project',
      changes: [{ path: 'src/app.ts', diff: '- old\n+ new' }],
      custom: { enabled: false, count: 0 },
    },
    'FILE_CHANGE',
  )
  const fields = wrapper.get('.approval-fields').text()
  expect(fields).toContain('授权目录')
  expect(fields).toContain('文件路径')
  expect(fields).toContain('- old\n+ new')
  expect(fields).toContain('custom / enabled否')
  expect(fields).toContain('custom / count0')
  wrapper.unmount()
})

it.each(['<script>alert(1)</script>', '{malformed JSON'])(
  'renders plain text safely: %s',
  (details) => {
    const wrapper = render(details)
    expect(wrapper.get('.approval-card__summary').text()).toBe(details)
    expect(wrapper.find('script').exists()).toBe(false)
    wrapper.unmount()
  },
)

it('shows a fallback for missing details and prevents decisions while submitting', async () => {
  const wrapper = render(null)
  expect(wrapper.text()).toContain('未提供具体操作说明')
  await wrapper.setProps({ loading: true })
  for (const button of wrapper.findAll('button')) {
    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')
  }
  expect(wrapper.emitted('decision')).toBeUndefined()
  wrapper.unmount()
})
