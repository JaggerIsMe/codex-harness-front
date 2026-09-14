import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import WorkflowNodeInspector from '@/components/orchestration/WorkflowNodeInspector.vue'
import type { WorkflowNode } from '@/types/orchestration'

it('inserts a goal at the caret and resets the caret when switching nodes', async () => {
  const node: WorkflowNode = {
    id: 'a',
    kind: 'EXPERT',
    name: '任务',
    objective: '前文后文',
    expertId: 8,
    next: null,
    condition: null,
    x: 0,
    y: 0,
  }
  const wrapper = mount(WorkflowNodeInspector, {
    attachTo: document.body,
    props: {
      node,
      workflow: { schemaVersion: 4, startNodeId: 'a', nodes: [node] },
      experts: [],
      onChange: (updated: WorkflowNode) => {
        void wrapper.setProps({ node: updated })
      },
    },
    global: { stubs: { FormField: { template: '<div><slot /></div>' } } },
  })
  try {
    const input = wrapper.get<HTMLTextAreaElement>('[aria-label="职责与目标"]')
    input.element.focus()
    input.element.setSelectionRange(2, 2)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '插入工作流目标')!
      .trigger('click')
    const updated = wrapper.emitted('change')![0]![0] as WorkflowNode
    expect(updated.objective).toBe('前文{{goal}}后文')
    expect(document.activeElement).toBe(input.element)
    expect(input.element.selectionStart).toBe(10)
    await wrapper.setProps({ node: { ...node, id: 'b', objective: '其他节点' } })
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '插入工作流目标')!
      .trigger('click')
    expect((wrapper.emitted('change')!.at(-1)![0] as WorkflowNode).objective).toBe(
      '其他节点{{goal}}',
    )
  } finally {
    wrapper.unmount()
  }
})
