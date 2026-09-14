import { expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import OrchestrationStepRecheck from '@/components/orchestration/OrchestrationStepRecheck.vue'
import { recheckOrchestrationStep } from '@/api/orchestration'
vi.mock('@/api/orchestration', () => ({ recheckOrchestrationStep: vi.fn() }))

it('rechecks the expected Turn without a message and blocks duplicate submissions', async () => {
  let finish!: (value: Awaited<ReturnType<typeof recheckOrchestrationStep>>) => void
  vi.mocked(recheckOrchestrationStep).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const wrapper = mount(OrchestrationStepRecheck, {
    props: { projectId: 3, executionId: 7, stepId: 24, turnId: 47 },
  })
  expect(wrapper.find('textarea').exists()).toBe(false)
  await wrapper.get('button').trigger('click')
  await wrapper.get('button').trigger('click')
  expect(recheckOrchestrationStep).toHaveBeenCalledExactlyOnceWith(3, 7, 24, 47)
  wrapper.unmount()
  finish({} as Awaited<ReturnType<typeof recheckOrchestrationStep>>)
  await flushPromises()
  expect(wrapper.emitted('checked')).toBeUndefined()
})

it('surfaces failed verification without pretending the node advanced', async () => {
  vi.mocked(recheckOrchestrationStep).mockRejectedValue(new Error('缺少可信的回执'))
  const wrapper = mount(OrchestrationStepRecheck, {
    props: { projectId: 3, executionId: 7, stepId: 24, turnId: 47 },
  })
  try {
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('缺少可信的回执')
    expect(wrapper.emitted('checked')).toBeUndefined()
  } finally {
    wrapper.unmount()
  }
})
