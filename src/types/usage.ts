import type { Id } from './domain'
export type Amount = string | number
export interface UsagePrice {
  id: Id
  modelVersionId: Id
  modelName: string
  modelId: string
  currency: string
  rule: string
  inputRate: Amount
  cachedRate: Amount
  outputRate: Amount
  maxOutputTokens: number
}
export interface PriceInput {
  modelVersionId: Id
  inputRate: string
  cachedRate: string
  outputRate: string
  maxOutputTokens: number
}
export interface QuotaPolicy {
  userId: Id
  dailyBudget: Amount | null
  monthlyBudget: Amount | null
  maxConcurrentTurns: number
}
export interface PolicyInput {
  dailyBudget: string | null
  monthlyBudget: string | null
  maxConcurrentTurns: number
}
export interface UsageBucket {
  period: string
  budget: Amount | null
  spent: Amount
  reserved: Amount
  remaining: Amount | null
  alert: 'NONE' | 'WARNING' | 'EXHAUSTED'
}
export interface UsageSummary {
  policy: QuotaPolicy
  buckets: UsageBucket[]
}
export interface UsageRecord {
  requestId: string
  userId: Id
  displayName: string
  turnId: Id
  projectId: Id | null
  conversationId: Id | null
  expertVersionId: Id | null
  deviceId: Id
  modelVersionId: Id
  modelName: string
  state: 'RESERVED' | 'PENDING' | 'SETTLED' | 'RELEASED'
  inputTokens: number | null
  cachedTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null
  cost: Amount | null
  reservedAmount: Amount
  createdAt: string
  outcome: string | null
}
export interface UsageAggregate {
  dimension: string
  requests: number
  inputTokens: number
  cachedTokens: number
  outputTokens: number
  pending: number
  cost: Amount
}
export interface UsagePage {
  records: UsageRecord[]
  total: number
  page: number
  pageSize: number
  daily: UsageAggregate[]
}
export interface UsageQuery {
  allUsers: boolean
  userId?: Id
  modelVersionId?: Id
  turnId?: Id
  projectId?: Id
  start?: string
  end?: string
  state: string
  page: number
}
export interface UsageResolution {
  reason: string
  noCharge: boolean
  inputTokens: number | null
  cachedTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null
}
