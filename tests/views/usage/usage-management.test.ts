import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import UsageManagement from '@/views/usage/UsageManagement.vue'
import QuotaEditDialog from '@/components/usage/QuotaEditDialog.vue'
import PriceEditDialog from '@/components/usage/PriceEditDialog.vue'
import {
  getUsageRecords,
  getUsageSummary,
  getQuotaPolicy,
  saveQuotaPolicy,
  saveUsagePrice,
} from '@/api/usage'
import type { UsagePage, UsageSummary, QuotaPolicy } from '@/types/usage'
const permissions = vi.hoisted(() => ({ admin: false }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ can: (p: string) => permissions.admin && p === 'system:user:manage' }),
}))
vi.mock('@/api/usage', () => ({
  getUsageRecords: vi.fn(),
  getUsageSummary: vi.fn(),
  getUsagePrices: vi.fn(),
  getQuotaPolicy: vi.fn(),
  saveQuotaPolicy: vi.fn(),
  saveUsagePrice: vi.fn(),
  resolveUsage: vi.fn(),
}))
vi.mock('@/api/user', () => ({ getUsers: vi.fn().mockResolvedValue({ data: { items: [] } }) }))
vi.mock('@/api/model', () => ({ listSelectableModelVersions: vi.fn() }))
let wrapper: VueWrapper | undefined
const response = <T>(data: T) => ({ status: 'success', code: 200, info: '', data })
const page: UsagePage = {
  records: [],
  total: 31,
  page: 1,
  pageSize: 30,
  daily: [
    {
      dimension: '2026-09-14',
      requests: 31,
      inputTokens: 4000,
      cachedTokens: 3000,
      outputTokens: 1000,
      pending: 1,
      cost: '0.0086',
    },
  ],
}
const summary: UsageSummary = {
  policy: { userId: 1, dailyBudget: '1', monthlyBudget: '10', maxConcurrentTurns: 2 },
  buckets: [
    {
      period: '2026-09',
      budget: '10',
      spent: '8',
      reserved: '0.1',
      remaining: '1.9',
      alert: 'WARNING',
    },
  ],
}
beforeEach(() => {
  permissions.admin = false
  vi.mocked(getUsageRecords).mockResolvedValue(response(page))
  vi.mocked(getUsageSummary).mockResolvedValue(response(summary))
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})
it('shows complete filtered totals and budget warning without exposing management actions', async () => {
  wrapper = mount(UsageManagement, {
    global: { stubs: { PriceEditDialog: true, QuotaEditDialog: true, UsageResolveDialog: true } },
  })
  await flushPromises()
  expect(wrapper.text()).toContain('0.0086')
  expect(wrapper.text()).toContain('已达到 80%')
  expect(wrapper.text()).not.toContain('设置用户预算')
  expect(wrapper.text()).not.toContain('设置模型价格')
  expect(getUsageRecords).toHaveBeenCalledWith(
    expect.objectContaining({ allUsers: false }),
    expect.any(AbortSignal),
  )
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(getUsageRecords).toHaveBeenLastCalledWith(
    expect.objectContaining({ page: 1 }),
    expect.any(AbortSignal),
  )
})
it('aborts outstanding requests on unmount', async () => {
  wrapper = mount(UsageManagement, {
    global: { stubs: { PriceEditDialog: true, QuotaEditDialog: true, UsageResolveDialog: true } },
  })
  await flushPromises()
  const signal = vi.mocked(getUsageRecords).mock.calls.at(-1)?.[1]
  wrapper.unmount()
  wrapper = undefined
  expect(signal?.aborted).toBe(true)
})
it('keeps zero budget distinct from unlimited when editing a user policy', async () => {
  const policy: QuotaPolicy = {
    userId: 5,
    dailyBudget: '0',
    monthlyBudget: null,
    maxConcurrentTurns: 2,
  }
  vi.mocked(getQuotaPolicy).mockResolvedValue(response(policy))
  vi.mocked(saveQuotaPolicy).mockResolvedValue(response(policy))
  wrapper = mount(QuotaEditDialog, {
    props: { modelValue: false, userId: 5, userLabel: 'Test user' },
    global: { stubs: { AppDialog: { template: '<div><slot/><slot name="footer"/></div>' } } },
  })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  const inputs = wrapper.findAll('input')
  expect((inputs[0]?.element as HTMLInputElement).value).toBe('0')
  expect((inputs[1]?.element as HTMLInputElement).value).toBe('')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(saveQuotaPolicy).toHaveBeenCalledWith(5, {
    dailyBudget: '0',
    monthlyBudget: null,
    maxConcurrentTurns: 2,
  })
})
it('saves a large model output limit without the former browser cap', async () => {
  wrapper = mount(PriceEditDialog, {
    props: {
      modelValue: true,
      prices: [],
      versions: [
        {
          configurationId: 1,
          versionId: 2,
          versionNo: 1,
          configurationCode: 'large-model',
          name: 'Large model',
          providerName: 'provider',
          modelId: 'large-model',
          inputModalities: ['text'],
          configDigest: 'fixture',
        },
      ],
    },
    global: { stubs: { AppDialog: { template: '<div><slot/><slot name="footer"/></div>' } } },
  })
  await wrapper.find('select').setValue('2')
  const inputs = wrapper.findAll('input')
  for (const input of inputs.slice(0, 3)) await input.setValue('1')
  const output = inputs[3]!
  await output.setValue('393216')
  expect((output.element as HTMLInputElement).checkValidity()).toBe(true)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(saveUsagePrice).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 393216 }))
  await output.setValue('0')
  expect((output.element as HTMLInputElement).checkValidity()).toBe(false)
})
