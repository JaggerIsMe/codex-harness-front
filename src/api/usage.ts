import { request } from './request'
import type { Id } from '@/types/domain'
import type {
  UsagePrice,
  PriceInput,
  QuotaPolicy,
  PolicyInput,
  UsageSummary,
  UsagePage,
  UsageQuery,
  UsageResolution,
} from '@/types/usage'
export const getUsagePrices = (signal?: AbortSignal) =>
  request<UsagePrice[]>('get', '/usage/prices', undefined, { signal })
export const saveUsagePrice = (data: PriceInput) =>
  request<UsagePrice>('post', '/usage/prices', data)
export const getQuotaPolicy = (id: Id, signal?: AbortSignal) =>
  request<QuotaPolicy>('get', `/usage/users/${id}/policy`, undefined, { signal })
export const saveQuotaPolicy = (id: Id, data: PolicyInput) =>
  request<QuotaPolicy>('put', `/usage/users/${id}/policy`, data)
export const getUsageSummary = (userId?: Id, signal?: AbortSignal) =>
  request<UsageSummary>('get', '/usage/summary', undefined, { params: { userId }, signal })
export const getUsageRecords = (params: UsageQuery, signal?: AbortSignal) =>
  request<UsagePage>('get', '/usage/records', undefined, { params, signal })
export const resolveUsage = (id: string, data: UsageResolution) =>
  request<void>('post', `/usage/records/${id}/resolve`, data)
