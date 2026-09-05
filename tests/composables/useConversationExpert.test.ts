import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import * as api from '@/api/expert'
import { useConversationExpert } from '@/composables/useConversationExpert'
import type { ExpertSelection } from '@/types/expert'

vi.mock('@/api/expert', () => ({ getExpertSelection: vi.fn() }))
const initial: ExpertSelection = {
  expertId: 10,
  expertVersionId: 100,
  name: 'Java 专家',
  selectionRevision: 1,
  projectRevision: 2,
  available: true,
  unavailableReason: null,
}
const response = (value: ExpertSelection) => ({
  status: 'success' as const,
  code: 200,
  info: '',
  data: value,
})
const wrappers: ReturnType<typeof mount>[] = []

function create() {
  let state!: ReturnType<typeof useConversationExpert>
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useConversationExpert(1, 2)
        return () => h('div')
      },
    }),
  )
  wrappers.push(wrapper)
  return { state, wrapper }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.getExpertSelection).mockResolvedValue(response({ ...initial }))
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
})

it('loads the immutable conversation expert', async () => {
  const { state } = create()
  await flushPromises()
  expect(state.selection.value).toEqual(initial)
  expect('choose' in state).toBe(false)
})

it('keeps unavailable identity for disabled or revoked experts', async () => {
  vi.mocked(api.getExpertSelection).mockResolvedValue(
    response({ ...initial, available: false, unavailableReason: '专家已下架或禁用' }),
  )
  const { state } = create()
  await flushPromises()
  expect(state.selection.value?.expertId).toBe(10)
  expect(state.selection.value?.available).toBe(false)
})

it('aborts reads on disposal', async () => {
  const { state, wrapper } = create()
  await flushPromises()
  const signal = vi.mocked(api.getExpertSelection).mock.calls[0]![2]!
  wrapper.unmount()
  expect(signal.aborted).toBe(true)
  await state.load()
  expect(api.getExpertSelection).toHaveBeenCalledTimes(1)
})
