import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import WorkflowDataDialog from '@/components/orchestration/WorkflowDataDialog.vue'
import type { WorkflowNode } from '@/types/orchestration'
const node = (): WorkflowNode => ({
  id: 'a',
  kind: 'EXPERT',
  name: '检查',
  expertId: 8,
  objective: '用户原文',
  next: null,
  condition: null,
  x: 0,
  y: 0,
})
const mountDialog = () =>
  mount(WorkflowDataDialog, {
    props: { node: node(), upstream: [], projectId: 2 },
    global: { stubs: { AppDialog: { template: '<div><slot/><slot name="footer"/></div>' } } },
  })
it('keeps changes local until Apply and does not implicitly change user instructions', async () => {
  const wrapper = mountDialog()
  await wrapper.get('[aria-label="输入字段映射配置"] button').trigger('click')
  expect(wrapper.emitted('apply')).toBeUndefined()
  const apply = wrapper.findAll('button').find((b) => b.text() === '应用输入输出配置')!
  await apply.trigger('click')
  const updated = wrapper.emitted('apply')![0]![0] as WorkflowNode
  expect(updated.inputs).toHaveLength(1)
  expect(updated.objective).toBe('用户原文')
  expect(wrapper.props('node').inputs).toBeUndefined()
  wrapper.unmount()
})
it('inserts only a user-selected variable and blocks invalid references', async () => {
  const wrapper = mountDialog()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '插入全部输入')!
    .trigger('click')
  expect(
    (wrapper.get('[aria-label="配置中的职责与目标"]').element as HTMLTextAreaElement).value,
  ).toBe('用户原文{{inputs}}')
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '应用输入输出配置')!
    .trigger('click')
  expect((wrapper.emitted('apply')![0]![0] as WorkflowNode).inputs).toEqual([])
  await wrapper.get('[aria-label="配置中的职责与目标"]').setValue('{{input:missing}}')
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '应用输入输出配置')!
    .trigger('click')
  expect(wrapper.emitted('apply')).toHaveLength(1)
  expect(wrapper.get('[role="alert"]').text()).toContain('未配置')
  wrapper.unmount()
})

it('inserts at the saved caret, replaces a selection and keeps the draft local', async () => {
  const wrapper = mountDialog()
  const input = wrapper.get<HTMLTextAreaElement>('[aria-label="配置中的职责与目标"]')
  input.element.setSelectionRange(2, 2)
  await input.trigger('focusin')
  const insert = wrapper.findAll('button').find((button) => button.text() === '插入全部输入')!
  await input.trigger('blur')
  await insert.trigger('click')
  expect(input.element.value).toBe('用户{{inputs}}原文')
  input.element.setSelectionRange(0, 2)
  await insert.trigger('click')
  expect(input.element.value).toBe('{{inputs}}{{inputs}}原文')
  expect(wrapper.props('node').objective).toBe('用户原文')
  expect(wrapper.emitted('apply')).toBeUndefined()
  wrapper.unmount()
})
