import { expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import OrchestrationStepContinuation from '@/components/orchestration/OrchestrationStepContinuation.vue'
import { continueOrchestrationStep } from '@/api/orchestration'
vi.mock('@/api/orchestration', () => ({ continueOrchestrationStep: vi.fn() }))

it('uses the actual question and generic copy, with a separate correction mode', async () => {
  const wrapper = mount(OrchestrationStepContinuation, {
    props: { projectId: 3, executionId: 7, stepId: 24, turnId: 47, reason: '请提供目标代码仓库' },
  })
  try {
    expect(wrapper.text()).toContain('请提供目标代码仓库')
    expect(wrapper.get('textarea').attributes('placeholder')).toBe('请输入你的回答或补充说明')
    expect(wrapper.text()).not.toContain('店铺')
    await wrapper.setProps({ validationFailed: true, reason: '输出 result.json 缺少字段' })
    expect(wrapper.text()).toContain('输出 result.json 缺少字段')
    expect(wrapper.get('textarea').attributes('placeholder')).toBe('请输入需要修正的内容或要求')
  } finally {
    wrapper.unmount()
  }
})

it('keeps the exact user message and idempotency key after an uncertain response', async () => {
  const call = vi.mocked(continueOrchestrationStep)
  call
    .mockReset()
    .mockRejectedValueOnce(new Error('网络中断'))
    .mockResolvedValueOnce({} as Awaited<ReturnType<typeof continueOrchestrationStep>>)
  const wrapper = mount(OrchestrationStepContinuation, {
    props: { projectId: 3, executionId: 5, stepId: 16, turnId: 42 },
  })
  try {
    await wrapper.get('textarea').setValue('  仅 Vantrue 美国主店\n保留 ASIN 区分  ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('网络中断')
    const sent = call.mock.calls[0]![3]
    expect(sent).toMatchObject({
      expectedTurnId: 42,
      message: '  仅 Vantrue 美国主店\n保留 ASIN 区分  ',
    })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(call.mock.calls[1]![3]).toEqual(sent)
    expect(wrapper.emitted('continued')).toHaveLength(1)
    expect(wrapper.get('textarea').element.value).toBe('')
  } finally {
    wrapper.unmount()
  }
})

it('blocks concurrent submissions and does not emit after unmount', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof continueOrchestrationStep>>) => void
  vi.mocked(continueOrchestrationStep)
    .mockReset()
    .mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
  const wrapper = mount(OrchestrationStepContinuation, {
    props: { projectId: 3, executionId: 5, stepId: 16, turnId: 42 },
  })
  await wrapper.get('textarea').setValue('美国主店')
  await wrapper.get('form').trigger('submit')
  await wrapper.get('form').trigger('submit')
  expect(continueOrchestrationStep).toHaveBeenCalledTimes(1)
  expect(wrapper.get('textarea').attributes('disabled')).toBeDefined()
  wrapper.unmount()
  resolve({} as Awaited<ReturnType<typeof continueOrchestrationStep>>)
  await flushPromises()
  expect(wrapper.emitted('continued')).toBeUndefined()
})
